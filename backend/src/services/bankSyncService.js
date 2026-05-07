import Expense from "../models/Expense.js";
import Household from "../models/Household.js";
import { normalizeScrapedTransactions } from "./bankImporter.js";
import { decryptValue } from "./credentialCrypto.js";
import {
  buildExpenseUpsertFilter,
  createExpenseDedupKey,
} from "./expenseDedup.js";
import {
  normalizeVisibilityScope,
  resolveConnectionVisibility,
  resolveExpenseVisibilityForConnection,
} from "./expenseVisibility.js";
import {
  ensureHouseholdBankConnections,
  toStoredEncryptedFields,
} from "./householdBankConnections.js";
import { assertSupportedNodeVersion } from "../utils/nodeVersion.js";

const ONE_ZERO_REQUIRED_FIELDS = new Set([
  "email",
  "password",
  "otpLongTermToken",
]);
const AUTOMATION_BLOCK_PATTERN =
  /(block automation|status:\s*429|too many requests|automation)/i;
const TIMEOUT_PATTERN = /(timed out|timeout)/i;
const FETCH_COOLDOWN_MS = 60 * 60 * 1000;
const DEFAULT_SCRAPE_ATTEMPT_TIMEOUT_MS = 30_000;
const DEFAULT_RETRY_DELAY_MS = 1_500;
const PENDING_REVISIT_BUFFER_DAYS = 2;
const MAX_PENDING_REVISIT_DAYS = 90;
const PENDING_POSTED_MAX_DATE_DIFF_MS = 10 * 24 * 60 * 60 * 1000;
const MATCH_TEXT_MIN_TOKEN_LENGTH = 2;
const BANK_COMPANY_LABELS = {
  hapoalim: "Bank Hapoalim",
  leumi: "Bank Leumi",
  mizrahi: "Mizrahi-Tefahot",
  discount: "Discount Bank",
  mercantile: "Mercantile Bank",
  otsarHahayal: "Otsar HaHayal",
  max: "MAX",
  visaCal: "CAL",
  amex: "American Express",
  union: "Union Bank",
  beinleumi: "First International",
  massad: "Massad",
  yahav: "Yahav",
  beyahadBishvilha: "Poalei Agudat Israel",
  oneZero: "ONE ZERO",
  behatsdaa: "BeHatsdaa",
  pagi: "Pagi",
};

function parseBoolean(value) {
  return String(value).trim().toLowerCase() === "true";
}

function toNonNegativeNumber(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

function getConfig() {
  return {
    enabled: parseBoolean(process.env.BANK_SCRAPER_ENABLED),
    showBrowser: parseBoolean(process.env.BANK_SCRAPER_SHOW_BROWSER),
    verbose: parseBoolean(process.env.BANK_SCRAPER_VERBOSE),
    companyId: process.env.BANK_COMPANY_ID,
    username: process.env.BANK_USERNAME,
    nationalID: process.env.BANK_NATIONAL_ID,
    password: process.env.BANK_PASSWORD,
  };
}

async function resolveBrowserLaunchOverrides() {
  const isLambdaRuntime = Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);
  if (!isLambdaRuntime) return {};

  try {
    const chromiumModule = await import("@sparticuz/chromium");
    const chromium = chromiumModule.default || chromiumModule;
    const executablePath =
      process.env.BANK_SCRAPER_EXECUTABLE_PATH ||
      (await chromium.executablePath());
    if (!executablePath) return {};

    return {
      executablePath,
      args: Array.isArray(chromium.args) ? chromium.args : undefined,
    };
  } catch (error) {
    console.warn(
      `[BANK SYNC] Failed to load Lambda Chromium overrides: ${sanitizeErrorMessage(
        error?.message,
      )}`,
    );
    return {};
  }
}

function sanitizeCredentials(creds = {}) {
  const output = {};
  for (const [key, value] of Object.entries(creds)) {
    const normalizedKey = String(key || "").trim();
    if (!normalizedKey) continue;
    output[normalizedKey] = typeof value === "string" ? value.trim() : value;
  }
  output.companyId = String(output.companyId || "").trim();
  return output;
}

function getDecryptedConnectionCredentials(
  bankCredentials,
  connectionKey = "",
  fallbackLastBankFetchAt = null,
) {
  const companyId = String(bankCredentials?.companyId || "").trim();
  if (!companyId) return null;

  const encryptedFields = toStoredEncryptedFields(bankCredentials);
  const decrypted = {};

  for (const [field, encryptedValue] of Object.entries(encryptedFields)) {
    if (!encryptedValue) continue;
    try {
      decrypted[field] = decryptValue(encryptedValue);
    } catch {
      throw new Error(`Failed to decrypt credential field: ${field}`);
    }
  }

  if (!decrypted.username && bankCredentials?.usernameEnc) {
    try {
      decrypted.username = decryptValue(bankCredentials.usernameEnc);
    } catch {
      throw new Error("Failed to decrypt credential field: username");
    }
  }
  if (!decrypted.password && bankCredentials?.passwordEnc) {
    try {
      decrypted.password = decryptValue(bankCredentials.passwordEnc);
    } catch {
      throw new Error("Failed to decrypt credential field: password");
    }
  }
  if (!decrypted.nationalID && bankCredentials?.nationalIdEnc) {
    try {
      decrypted.nationalID = decryptValue(bankCredentials.nationalIdEnc);
    } catch {
      throw new Error("Failed to decrypt credential field: nationalID");
    }
  }

  const resolvedVisibility = resolveConnectionVisibility({
    scope: bankCredentials?.visibilityScope,
    ownerUserId: bankCredentials?.ownerUserId,
  });
  const accountVisibilityRules = Array.isArray(
    bankCredentials?.accountVisibilityRules,
  )
    ? bankCredentials.accountVisibilityRules
        .map((rule) => {
          const sourceAccountId = String(rule?.sourceAccountId || "").trim();
          if (!sourceAccountId) return null;
          const resolvedRule = resolveConnectionVisibility({
            scope: rule?.visibilityScope,
            ownerUserId: rule?.ownerUserId,
            fallbackOwnerUserId: resolvedVisibility.ownerUserId,
          });
          return {
            sourceAccountId,
            visibilityScope: resolvedRule.visibilityScope,
            ownerUserId: resolvedRule.ownerUserId,
          };
        })
        .filter(Boolean)
    : [];

  return {
    connectionKey: String(connectionKey || "").trim(),
    companyId,
    visibilityScope: resolvedVisibility.visibilityScope,
    ownerUserId: resolvedVisibility.ownerUserId,
    accountVisibilityRules,
    lastBankFetchAt:
      bankCredentials?.lastBankFetchAt || fallbackLastBankFetchAt || null,
    ...decrypted,
  };
}

function getDecryptedHouseholdConnections(household) {
  const errors = [];
  const modernConnections =
    Array.isArray(household?.bankConnections) && household.bankConnections.length > 0
      ? household.bankConnections
      : [];

  const connections = [];
  for (const connection of modernConnections) {
    const connectionKey = String(connection?._id || "").trim();
    const companyId = String(connection?.companyId || "").trim();
    try {
      const decrypted = getDecryptedConnectionCredentials(
        connection,
        connectionKey,
      );
      if (decrypted) {
        connections.push(sanitizeCredentials(decrypted));
      }
    } catch (error) {
      errors.push({
        connectionKey: connectionKey || companyId || "unknown",
        companyId,
        total: 0,
        status: "error",
        error: error?.message || "Failed to decrypt connection credentials",
      });
    }
  }
  return { connections, errors };
}

function oneMonthWindow() {
  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setMonth(startDate.getMonth() - 1);
  return { startDate, endDate };
}

function getWindowStartDate(lastBankFetchAt, fallbackStartDate) {
  const parsedLastFetchAt = parseDate(lastBankFetchAt);
  if (parsedLastFetchAt) return parsedLastFetchAt;
  return new Date(fallbackStartDate);
}

function subtractUtcDays(value, days) {
  const parsed = parseDate(value);
  if (!parsed) return null;
  const next = new Date(parsed);
  next.setUTCDate(next.getUTCDate() - Math.max(0, Number(days || 0)));
  return next;
}

async function findOldestPendingDateForConnection({
  householdId,
  connectionId,
  companyId,
}) {
  const normalizedConnectionId = String(connectionId || "").trim();
  const normalizedCompanyId = String(companyId || "").trim();
  const clauses = [];
  if (normalizedConnectionId) {
    clauses.push({ sourceConnectionKey: normalizedConnectionId });
  }
  if (normalizedCompanyId) {
    clauses.push({
      sourceCompanyId: normalizedCompanyId,
      $or: [
        { sourceConnectionKey: { $exists: false } },
        { sourceConnectionKey: null },
        { sourceConnectionKey: "" },
      ],
    });
  }
  if (!clauses.length) return null;

  const oldestPending = await Expense.findOne({
    householdId,
    source: "israeli-bank-scrapers",
    status: "pending",
    $or: clauses,
  })
    .select({ date: 1 })
    .sort({ date: 1 })
    .lean();

  return parseDate(oldestPending?.date);
}

async function resolveWindowStartDateForConnection({
  householdId,
  connectionId,
  companyId,
  lastBankFetchAt,
  fallbackStartDate,
}) {
  const baseWindowStart = getWindowStartDate(lastBankFetchAt, fallbackStartDate);
  const oldestPendingDate = await findOldestPendingDateForConnection({
    householdId,
    connectionId,
    companyId,
  });
  if (!oldestPendingDate) return baseWindowStart;

  const pendingBackfillStart = subtractUtcDays(
    oldestPendingDate,
    PENDING_REVISIT_BUFFER_DAYS,
  );
  if (!pendingBackfillStart) return baseWindowStart;

  const maxLookbackStart = subtractUtcDays(new Date(), MAX_PENDING_REVISIT_DAYS);
  const boundedPendingStart =
    maxLookbackStart &&
    pendingBackfillStart.getTime() < maxLookbackStart.getTime()
      ? maxLookbackStart
      : pendingBackfillStart;

  return boundedPendingStart.getTime() < baseWindowStart.getTime()
    ? boundedPendingStart
    : baseWindowStart;
}

function flattenTransactions(scrapeResult) {
  const accounts = Array.isArray(scrapeResult?.accounts)
    ? scrapeResult.accounts
    : [];

  return accounts.flatMap((account, index) => {
    const accountTransactions = Array.isArray(account?.txns)
      ? account.txns
      : [];
    const accountId = String(
      account?.accountNumber ||
        account?.accountId ||
        account?.cardNumber ||
        account?.card6Digits ||
        account?.name ||
        `account-${index + 1}`,
    ).trim();
    const accountName = String(
      account?.accountName || account?.name || "",
    ).trim();

    return accountTransactions.map((txn) => ({
      txn,
      accountId,
      accountName,
    }));
  });
}

function getRequiredFields(companyId, scrapers) {
  const company = scrapers?.[companyId];
  if (!company) return null;

  const loginFields = Array.isArray(company.loginFields)
    ? company.loginFields
    : [];
  const fields = loginFields.filter((field) => field !== "otpCodeRetriever");
  if (companyId !== "oneZero") return fields;

  return fields.filter((field) => ONE_ZERO_REQUIRED_FIELDS.has(field));
}

function buildScrapeCredentials(activeCreds) {
  return Object.fromEntries(
    Object.entries(activeCreds).filter(
      ([key, value]) =>
        key !== "companyId" &&
        key !== "connectionKey" &&
        key !== "visibilityScope" &&
        key !== "ownerUserId" &&
        key !== "accountVisibilityRules" &&
        key !== "lastBankFetchAt" &&
        typeof value === "string" &&
        value,
    ),
  );
}

function toScrapeFailureMessage(scrapeResult) {
  return [scrapeResult?.errorType, scrapeResult?.errorMessage]
    .filter(Boolean)
    .join(": ");
}

function sanitizeErrorMessage(message) {
  const normalized = String(message || "").trim();
  if (!normalized) return "Failed to scrape bank transactions";
  const [firstLine] = normalized.split("\n");
  return firstLine || normalized;
}

function summarizeError(error) {
  const message = sanitizeErrorMessage(error?.message);
  const code = String(error?.code || "-");
  const stack = String(error?.stack || "")
    .split("\n")
    .slice(0, 2)
    .join(" | ")
    .trim();
  return { message, code, stack: stack || "-" };
}

function isLikelyAutomationBlock(message) {
  return AUTOMATION_BLOCK_PATTERN.test(String(message || ""));
}

function isLikelyTimeout(message) {
  return TIMEOUT_PATTERN.test(String(message || ""));
}

function getBankName(companyId) {
  return BANK_COMPANY_LABELS[companyId] || companyId || "Unknown";
}

function formatLogValue(value) {
  if (value == null || value === "") return "-";
  return String(value);
}

function sanitizeLogText(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTextForMatch(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function toMatchAmount(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "0.00";
  return Math.abs(parsed).toFixed(2);
}

function toDateOrNull(value) {
  const parsed = parseDate(value);
  return parsed || null;
}

function buildPendingPostedSignature(expense = {}) {
  return [
    String(expense.householdId || "").trim(),
    String(expense.sourceCompanyId || "").trim(),
    String(expense.sourceAccountId || "").trim(),
    String(expense.transactionType || "expense").trim().toLowerCase(),
    toMatchAmount(expense.amount),
  ].join("|");
}

function buildComparableTextValues(expense = {}) {
  const merchant = normalizeTextForMatch(expense.merchant);
  const description = normalizeTextForMatch(expense.description);
  return [merchant, description].filter(Boolean);
}

function tokenizeForMatch(value = "") {
  return normalizeTextForMatch(value)
    .split(/[^\p{L}\p{N}]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= MATCH_TEXT_MIN_TOKEN_LENGTH);
}

function hasTextAffinity(leftValue = "", rightValue = "") {
  const left = normalizeTextForMatch(leftValue);
  const right = normalizeTextForMatch(rightValue);
  if (!left || !right) return false;
  if (left === right || left.includes(right) || right.includes(left)) {
    return true;
  }

  const leftTokens = new Set(tokenizeForMatch(left));
  const rightTokens = tokenizeForMatch(right);
  if (!leftTokens.size || !rightTokens.length) return false;
  return rightTokens.some((token) => leftTokens.has(token));
}

function hasPendingPostedTextMatch(pending = {}, candidate = {}) {
  const pendingTextValues = buildComparableTextValues(pending);
  const candidateTextValues = buildComparableTextValues(candidate);
  if (!pendingTextValues.length || !candidateTextValues.length) {
    return false;
  }

  return pendingTextValues.some((pendingText) =>
    candidateTextValues.some((candidateText) =>
      hasTextAffinity(pendingText, candidateText),
    ),
  );
}

function toIdString(value) {
  return String(value || "").trim();
}

async function reconcilePendingWithPosted({
  householdId,
  connectionKeys = [],
  sinceDate,
}) {
  if (!householdId || !connectionKeys.length) {
    return { merged: 0, deleted: 0, matchedPairs: 0 };
  }

  const since = toDateOrNull(sinceDate) || subtractUtcDays(new Date(), 90);
  const sinceIso = since ? since.toISOString() : null;
  const dateClauses = [{ date: { $gte: since } }];
  if (sinceIso) {
    dateClauses.push({ date: { $gte: sinceIso } });
  }
  const rows = await Expense.find({
    householdId,
    source: "israeli-bank-scrapers",
    sourceConnectionKey: { $in: connectionKeys },
    $or: dateClauses,
  })
    .select({
      _id: 1,
      status: 1,
      householdId: 1,
      sourceCompanyId: 1,
      sourceAccountId: 1,
      transactionType: 1,
      amount: 1,
      merchant: 1,
      description: 1,
      category: 1,
      notes: 1,
      tags: 1,
      isUserAltered: 1,
      editedBy: 1,
      createdBy: 1,
      date: 1,
      updatedAt: 1,
      createdAt: 1,
    })
    .lean();

  const postedBySignature = new Map();
  const pendingRows = [];
  for (const row of rows) {
    const signature = buildPendingPostedSignature(row);
    if (!signature) continue;
    if (String(row.status || "").trim().toLowerCase() === "pending") {
      pendingRows.push({ ...row, __signature: signature });
      continue;
    }
    if (!postedBySignature.has(signature)) postedBySignature.set(signature, []);
    postedBySignature.get(signature).push(row);
  }

  let merged = 0;
  let deleted = 0;
  let matchedPairs = 0;
  for (const pending of pendingRows) {
    const candidates = postedBySignature.get(pending.__signature) || [];
    if (!candidates.length) continue;

    const pendingDate = toDateOrNull(pending.date);
    const match = candidates
      .map((candidate) => {
        const candidateDate = toDateOrNull(candidate.date);
        const diffMs =
          pendingDate && candidateDate
            ? Math.abs(candidateDate.getTime() - pendingDate.getTime())
            : Number.MAX_SAFE_INTEGER;
        return {
          candidate,
          diffMs,
          textMatched: hasPendingPostedTextMatch(pending, candidate),
        };
      })
      .filter((item) => {
        if (item.diffMs > PENDING_POSTED_MAX_DATE_DIFF_MS) return false;
        if (item.textMatched) return true;
        // Allow user-altered pending rows to reconcile even if text diverged.
        return Boolean(pending.isUserAltered);
      })
      .sort((a, b) => a.diffMs - b.diffMs)[0];

    if (!match) continue;
    matchedPairs += 1;

    const matchedCandidateId = toIdString(match.candidate?._id);
    if (matchedCandidateId) {
      const remaining = candidates.filter(
        (candidate) => toIdString(candidate?._id) !== matchedCandidateId,
      );
      if (remaining.length > 0) {
        postedBySignature.set(pending.__signature, remaining);
      } else {
        postedBySignature.delete(pending.__signature);
      }
    }

    if (pending.isUserAltered && !match.candidate.isUserAltered) {
      const nextTags = Array.isArray(pending.tags)
        ? pending.tags.filter((tag) => String(tag || "").trim())
        : [];
      const mergeSet = {
        isUserAltered: true,
        editedBy:
          pending.editedBy || match.candidate.editedBy || match.candidate.createdBy,
        updatedAt: new Date(),
      };
      if (String(pending.description || "").trim()) {
        mergeSet.description = String(pending.description || "").trim();
      }
      if (String(pending.category || "").trim()) {
        mergeSet.category = String(pending.category || "").trim();
      }
      if (String(pending.notes || "").trim()) {
        mergeSet.notes = String(pending.notes || "").trim();
      }
      if (nextTags.length > 0) {
        mergeSet.tags = nextTags;
      }
      // eslint-disable-next-line no-await-in-loop
      const mergeResult = await Expense.updateOne(
        { _id: match.candidate._id },
        { $set: mergeSet },
      );
      merged += Number(mergeResult.modifiedCount || 0);
    }

    // eslint-disable-next-line no-await-in-loop
    const deleteResult = await Expense.deleteOne({ _id: pending._id });
    deleted += Number(deleteResult.deletedCount || 0);
  }

  return { merged, deleted, matchedPairs };
}

function toIsoForLog(value) {
  const parsed = value ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return "-";
  return parsed.toISOString();
}

function serializeForLog(value, maxLength = 12_000) {
  try {
    const serialized = JSON.stringify(value);
    if (serialized.length <= maxLength) return serialized;
    return `${serialized.slice(0, maxLength)}...<truncated>`;
  } catch {
    return '"[unserializable]"';
  }
}

function normalizeExpenseStatus(statusValue) {
  return String(statusValue || "").trim().toLowerCase() === "pending"
    ? "pending"
    : "posted";
}

function logFetchedExpenseItems({
  companyId,
  connectionId,
  items = [],
}) {
  console.log(
    `[BANK SYNC ITEMS] companyId=${formatLogValue(
      companyId,
    )} connectionId=${formatLogValue(
      connectionId,
    )} status=success items=${items.length}`,
  );
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index] || {};
    console.log(
      `[BANK SYNC ITEM] sourceAccountId=${formatLogValue(
        item.sourceAccountId,
      )} date=${toIsoForLog(item.date)} amount=${formatLogValue(
        item.amount,
      )} description="${sanitizeLogText(
        item.description,
      )}" category="${sanitizeLogText(item.category)}"`,
    );
  }
}

function logConnectionSummaries({
  userId,
  householdId,
  status,
  connectionSummaries = [],
}) {
  const groupedCounts = connectionSummaries.reduce((acc, summary) => {
    const key = String(summary?.status || "unknown");
    acc[key] = Number(acc[key] || 0) + 1;
    return acc;
  }, {});
  console.log(
    `[BANK SYNC RUN] connection_summaries userId=${formatLogValue(
      userId,
    )} householdId=${formatLogValue(
      householdId,
    )} status=${formatLogValue(status)} counts=${serializeForLog(
      groupedCounts,
    )} details=${serializeForLog(connectionSummaries, 16_000)}`,
  );
}

function logConnectionResult({
  companyId,
  connectionId,
  status,
  fetchedItems = 0,
  durationMs = 0,
  scrapeMode = "none",
  attemptsUsed = 0,
  reason = "",
  lastFetchAt = "",
  nextFetchAt = "",
  windowStartDate = "",
}) {
  const bankName = getBankName(companyId);
  const level = status === "success" ? "log" : "warn";
  console[level](
    `[BANK SYNC] bank="${bankName}" companyId=${formatLogValue(
      companyId,
    )} connectionId=${formatLogValue(
      connectionId,
    )} status=${formatLogValue(status)} fetchedItems=${Number(
      fetchedItems || 0,
    )} durationMs=${Math.max(0, Number(durationMs || 0))} scrapeMode=${formatLogValue(
      scrapeMode,
    )} attempts=${Math.max(0, Number(attemptsUsed || 0))} windowStart=${formatLogValue(
      windowStartDate,
    )} lastFetchAt=${formatLogValue(lastFetchAt)} nextFetchAt=${formatLogValue(
      nextFetchAt,
    )} reason="${formatLogValue(reason)}"`,
  );
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runScrapeWithTimeout({
  scraper,
  scrapeCredentials,
  scrapeAttemptTimeoutMs,
  scrapeMode,
  attemptsUsed,
}) {
  let timer = null;
  try {
    return await Promise.race([
      scraper.scrape(scrapeCredentials),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const timeoutError = new Error(
            `Scrape attempt timed out after ${scrapeAttemptTimeoutMs}ms`,
          );
          timeoutError.isScrapeTimeout = true;
          timeoutError.scrapeMode = scrapeMode;
          timeoutError.attemptsUsed = attemptsUsed;
          reject(timeoutError);
        }, scrapeAttemptTimeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function terminateTimedOutScraper(scraper, context = {}) {
  if (!scraper || typeof scraper.terminate !== "function") return;
  const contextText = `companyId=${formatLogValue(context.companyId)} connectionId=${formatLogValue(context.connectionId)} scrapeMode=${formatLogValue(context.scrapeMode)} attempts=${Math.max(0, Number(context.attemptsUsed || 0))}`;
  console.warn(`[BANK SYNC ATTEMPT] timeout_cleanup_started ${contextText}`);
  try {
    await scraper.terminate(false);
    console.warn(`[BANK SYNC ATTEMPT] timeout_cleanup_completed ${contextText}`);
  } catch (error) {
    const errSummary = summarizeError(error);
    console.warn(
      `[BANK SYNC ATTEMPT] timeout_cleanup_failed ${contextText} error="${errSummary.message}" code=${errSummary.code} stack="${errSummary.stack}"`,
    );
  }
}

function parseDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function getCooldownInfo(lastBankFetchAt, nowMs) {
  const lastFetchDate = parseDate(lastBankFetchAt);
  if (!lastFetchDate) return null;

  const elapsedMs = nowMs - lastFetchDate.getTime();
  if (elapsedMs >= FETCH_COOLDOWN_MS) return null;

  return {
    lastFetchAt: lastFetchDate.toISOString(),
    nextFetchAt: new Date(
      lastFetchDate.getTime() + FETCH_COOLDOWN_MS,
    ).toISOString(),
  };
}

async function scrapeWithAutomationFallback({
  createScraper,
  activeCreds,
  startDate,
  envCfg,
  scrapeCredentials,
  browserLaunchOverrides,
}) {
  const scrapeAttemptTimeoutMs = toNonNegativeNumber(
    process.env.BANK_SCRAPE_ATTEMPT_TIMEOUT_MS,
    DEFAULT_SCRAPE_ATTEMPT_TIMEOUT_MS,
  );
  const effectiveAttemptTimeoutMs = Math.max(
    DEFAULT_SCRAPE_ATTEMPT_TIMEOUT_MS,
    scrapeAttemptTimeoutMs,
  );
  const retryDelayMs = toNonNegativeNumber(
    process.env.BANK_SCRAPER_RETRY_DELAY_MS,
    DEFAULT_RETRY_DELAY_MS,
  );
  const isLambdaRuntime = Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);
  const allowLambdaBrowserFallback = parseBoolean(
    process.env.BANK_SCRAPER_ALLOW_BROWSER_FALLBACK_IN_LAMBDA,
  );
  const connectionId =
    String(activeCreds.connectionKey || "").trim() || activeCreds.companyId;
  const attempts = [];
  attempts.push({
    label: "full",
    additionalTransactionInformation: true,
    showBrowser: envCfg.showBrowser,
  });
  attempts.push({
    label: "reduced",
    additionalTransactionInformation: false,
    showBrowser: envCfg.showBrowser,
  });
  if (
    !envCfg.showBrowser &&
    (!isLambdaRuntime || allowLambdaBrowserFallback)
  ) {
    attempts.push({
      label: "reduced-browser",
      additionalTransactionInformation: false,
      showBrowser: true,
    });
  }
  console.log(
    `[BANK SYNC ATTEMPT] configured companyId=${formatLogValue(
      activeCreds.companyId,
    )} connectionId=${formatLogValue(
      connectionId,
    )} startDate=${startDate instanceof Date ? startDate.toISOString() : formatLogValue(startDate)} attemptTimeoutMs=${effectiveAttemptTimeoutMs} retryDelayMs=${retryDelayMs} attempts=${attempts.map((attempt) => attempt.label).join("|")} lambdaRuntime=${isLambdaRuntime} showBrowserCfg=${envCfg.showBrowser} allowLambdaBrowserFallback=${allowLambdaBrowserFallback}`,
  );
  let lastErrorMessage = "";
  let attemptsUsed = 0;

  for (let attemptIndex = 0; attemptIndex < attempts.length; attemptIndex += 1) {
    const attempt = attempts[attemptIndex];
    const nextAttempt = attempts[attemptIndex + 1] || null;
    attemptsUsed += 1;
    let scraper = null;
    const attemptStartedAtMs = Date.now();
    try {
      console.log(
        `[BANK SYNC ATTEMPT] start companyId=${formatLogValue(
          activeCreds.companyId,
        )} connectionId=${formatLogValue(
          connectionId,
        )} scrapeMode=${attempt.label} attemptNumber=${attemptsUsed}/${attempts.length} showBrowser=${attempt.showBrowser} additionalInfo=${attempt.additionalTransactionInformation}`,
      );
      scraper = createScraper({
        companyId: activeCreds.companyId,
        startDate,
        showBrowser: attempt.showBrowser,
        verbose: envCfg.verbose,
        additionalTransactionInformation:
          attempt.additionalTransactionInformation,
        ...browserLaunchOverrides,
      });
      if (typeof scraper.onProgress === "function") {
        scraper.onProgress((companyId, payload) => {
          const progressType = String(payload?.type || "-");
          console.log(
            `[BANK SYNC ATTEMPT] progress companyId=${formatLogValue(
              companyId || activeCreds.companyId,
            )} connectionId=${formatLogValue(
              connectionId,
            )} scrapeMode=${attempt.label} progressType=${progressType}`,
          );
        });
      }

      const scrapeResult = await runScrapeWithTimeout({
        scraper,
        scrapeCredentials,
        scrapeAttemptTimeoutMs: effectiveAttemptTimeoutMs,
        scrapeMode: attempt.label,
        attemptsUsed,
      });
      if (scrapeResult?.success) {
        const accountsCount = Array.isArray(scrapeResult?.accounts)
          ? scrapeResult.accounts.length
          : 0;
        console.log(
          `[BANK SYNC ATTEMPT] success companyId=${formatLogValue(
            activeCreds.companyId,
          )} connectionId=${formatLogValue(
            connectionId,
          )} scrapeMode=${attempt.label} attemptNumber=${attemptsUsed}/${attempts.length} durationMs=${Date.now() - attemptStartedAtMs} accounts=${accountsCount}`,
        );
        return {
          scrapeResult,
          usedFallback: attempt.label === "reduced",
          usedBrowserFallback: attempt.label === "reduced-browser",
          scrapeMode: attempt.label,
          attemptsUsed,
        };
      }

      const reason =
        toScrapeFailureMessage(scrapeResult) ||
        "Failed to scrape bank transactions";
      lastErrorMessage = sanitizeErrorMessage(reason);
      const attemptError = new Error(lastErrorMessage);
      attemptError.scrapeMode = attempt.label;
      attemptError.attemptsUsed = attemptsUsed;
      throw attemptError;
    } catch (error) {
      const errSummary = summarizeError(error);
      const message = errSummary.message;
      lastErrorMessage = errSummary.message;
      const timedOut = Boolean(error?.isScrapeTimeout) || isLikelyTimeout(message);
      const automationBlocked = isLikelyAutomationBlock(message);
      console.warn(
        `[BANK SYNC ATTEMPT] failed companyId=${formatLogValue(
          activeCreds.companyId,
        )} connectionId=${formatLogValue(
          connectionId,
        )} scrapeMode=${attempt.label} attemptNumber=${attemptsUsed}/${attempts.length} durationMs=${Date.now() - attemptStartedAtMs} timedOut=${timedOut} automationBlocked=${automationBlocked} error="${message}" code=${errSummary.code} stack="${errSummary.stack}"`,
      );
      if (timedOut) {
        await terminateTimedOutScraper(scraper, {
          companyId: activeCreds.companyId,
          connectionId,
          scrapeMode: attempt.label,
          attemptsUsed,
        });
      }

      if (
        (attempt.label === "full" || attempt.label === "reduced") &&
        (automationBlocked || timedOut)
      ) {
        console.warn(
          `[BANK SYNC ATTEMPT] fallback_triggered companyId=${formatLogValue(
            activeCreds.companyId,
          )} connectionId=${formatLogValue(
            connectionId,
          )} fromMode=${attempt.label} nextMode=${formatLogValue(nextAttempt?.label)} reason="${message}"`,
        );
        if (retryDelayMs > 0) await wait(retryDelayMs);
        continue;
      }

      const attemptError = new Error(message);
      attemptError.scrapeMode = attempt.label;
      attemptError.attemptsUsed = attemptsUsed;
      throw attemptError;
    }
  }

  const terminalError = new Error(
    lastErrorMessage || "Failed to scrape bank transactions",
  );
  console.warn(
    `[BANK SYNC ATTEMPT] exhausted companyId=${formatLogValue(
      activeCreds.companyId,
    )} connectionId=${formatLogValue(
      connectionId,
    )} attemptsUsed=${attemptsUsed} lastError="${sanitizeErrorMessage(lastErrorMessage)}"`,
  );
  terminalError.scrapeMode = "unknown";
  terminalError.attemptsUsed = attemptsUsed || attempts.length;
  throw terminalError;
}

export async function syncLastMonthExpensesForUser(user, options = {}) {
  const envCfg = getConfig();
  if (!envCfg.enabled) {
    return { imported: 0, reason: "disabled" };
  }
  const requestedConnectionId = String(options?.connectionId || "").trim();
  const syncRunStartedAtMs = Date.now();
  const userId = String(user?._id || "").trim() || "-";
  const isLambdaRuntime = Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);
  console.log(
    `[BANK SYNC RUN] started userId=${userId} lambdaRuntime=${isLambdaRuntime} showBrowserCfg=${envCfg.showBrowser} verboseCfg=${envCfg.verbose}`,
  );

  const householdId = String(user?.householdId || "").trim();
  if (!householdId) {
    throw new Error("Missing household for this user");
  }

  const household = await Household.findById(householdId);
  if (!household) {
    throw new Error("Household not found for this user");
  }

  const { migrated } = await ensureHouseholdBankConnections(household, {
    preferredUserId: user?._id,
    loadUsers: true,
  });
  if (migrated) {
    await household.save();
  }

  const { connections: householdConnections, errors: connectionErrors } =
    getDecryptedHouseholdConnections(household);
  const fallbackConnection = sanitizeCredentials({
    connectionKey: "env-default",
    companyId: envCfg.companyId,
    visibilityScope: "shared",
    ownerUserId: null,
    accountVisibilityRules: [],
    username: envCfg.username,
    nationalID: envCfg.nationalID,
    password: envCfg.password,
  });
  const activeConnectionsBase =
    householdConnections.length > 0 ? householdConnections : [fallbackConnection];
  const activeConnections = requestedConnectionId
    ? activeConnectionsBase.filter(
        (connection) =>
          String(connection?.connectionKey || "").trim() === requestedConnectionId,
      )
    : activeConnectionsBase;
  console.log(
    `[BANK SYNC RUN] connections_loaded userId=${userId} householdId=${householdId} activeConnections=${activeConnections.length} decryptErrors=${connectionErrors.length} usingFallbackConnection=${householdConnections.length === 0} requestedConnectionId=${formatLogValue(
      requestedConnectionId || null,
    )}`,
  );

  if (requestedConnectionId && !activeConnections.length) {
    return {
      imported: 0,
      updated: 0,
      total: 0,
      connections: [],
      attemptedConnectionKeys: [],
      successfulConnectionKeys: [],
      reason: "connection_not_found",
      requestedConnectionId,
    };
  }

  if (!activeConnections.some((connection) => connection.companyId)) {
    throw new Error("Missing bank credentials for this user");
  }

  assertSupportedNodeVersion();

  const { createScraper, SCRAPERS } = await import("israeli-bank-scrapers");
  const browserLaunchOverrides = await resolveBrowserLaunchOverrides();
  const { startDate: defaultWindowStartDate } = oneMonthWindow();
  const connectionSummaries = [...connectionErrors];
  const docs = [];
  const attemptedConnectionKeys = new Set();
  const successfulConnectionKeys = new Set();
  const nowMs = Date.now();

  for (const activeCreds of activeConnections) {
    const fetchStartedAt = Date.now();
    const connectionId =
      String(activeCreds.connectionKey || "").trim() || activeCreds.companyId;
    const windowStartDate = await resolveWindowStartDateForConnection({
      householdId,
      connectionId,
      companyId: activeCreds.companyId,
      lastBankFetchAt: activeCreds.lastBankFetchAt,
      fallbackStartDate: defaultWindowStartDate,
    });
    console.log(
      `[BANK SYNC RUN] connection_started userId=${userId} householdId=${householdId} companyId=${formatLogValue(
        activeCreds.companyId,
      )} connectionId=${formatLogValue(
        connectionId,
      )} windowStart=${windowStartDate.toISOString()}`,
    );
    const cooldownInfo = getCooldownInfo(activeCreds.lastBankFetchAt, nowMs);
    if (cooldownInfo) {
      connectionSummaries.push({
        connectionKey: connectionId,
        companyId: activeCreds.companyId,
        total: 0,
        status: "cooldown",
        ...cooldownInfo,
      });
      logConnectionResult({
        companyId: activeCreds.companyId,
        connectionId,
        status: "cooldown",
        fetchedItems: 0,
        durationMs: Date.now() - fetchStartedAt,
        scrapeMode: "cooldown-skip",
        attemptsUsed: 0,
        reason: "Connection is on cooldown",
        lastFetchAt: cooldownInfo.lastFetchAt,
        nextFetchAt: cooldownInfo.nextFetchAt,
        windowStartDate: windowStartDate.toISOString(),
      });
      continue;
    }

    const requiredFields = getRequiredFields(activeCreds.companyId, SCRAPERS);

    if (!requiredFields) {
      const errorMessage = `Unsupported companyId: ${activeCreds.companyId}`;
      connectionSummaries.push({
        connectionKey: connectionId,
        companyId: activeCreds.companyId,
        total: 0,
        status: "error",
        error: errorMessage,
      });
      logConnectionResult({
        companyId: activeCreds.companyId,
        connectionId,
        status: "failed",
        fetchedItems: 0,
        durationMs: Date.now() - fetchStartedAt,
        scrapeMode: "validation",
        attemptsUsed: 0,
        reason: errorMessage,
        windowStartDate: windowStartDate.toISOString(),
      });
      continue;
    }

    const missingFields = requiredFields.filter((field) => !activeCreds[field]);
    if (missingFields.length > 0) {
      const errorMessage = `Missing credentials: ${missingFields.join(", ")}`;
      connectionSummaries.push({
        connectionKey: connectionId,
        companyId: activeCreds.companyId,
        total: 0,
        status: "error",
        error: errorMessage,
      });
      logConnectionResult({
        companyId: activeCreds.companyId,
        connectionId,
        status: "failed",
        fetchedItems: 0,
        durationMs: Date.now() - fetchStartedAt,
        scrapeMode: "validation",
        attemptsUsed: 0,
        reason: errorMessage,
        windowStartDate: windowStartDate.toISOString(),
      });
      continue;
    }

    try {
      attemptedConnectionKeys.add(connectionId);
      const scrapeCredentials = buildScrapeCredentials(activeCreds);
      console.log(
        `[BANK SYNC RUN] scrape_credentials_ready userId=${userId} householdId=${householdId} companyId=${formatLogValue(
          activeCreds.companyId,
        )} connectionId=${formatLogValue(
          connectionId,
        )} credentialFields=${Object.keys(scrapeCredentials).join("|") || "-"}`,
      );
      const {
        scrapeResult,
        usedFallback,
        usedBrowserFallback,
        scrapeMode,
        attemptsUsed,
      } =
        await scrapeWithAutomationFallback({
          createScraper,
          activeCreds,
          startDate: windowStartDate,
          envCfg,
          scrapeCredentials,
          browserLaunchOverrides,
        });
      if (usedFallback) {
        console.warn(
          `[BANK SYNC] ${activeCreds.companyId} (${connectionId}) retried with reduced details mode after automation block`,
        );
      }
      if (usedBrowserFallback) {
        console.warn(
          `[BANK SYNC] ${activeCreds.companyId} (${connectionId}) retried in browser mode after automation block`,
        );
      }

      const rawTransactions = flattenTransactions(scrapeResult);
      const normalized = normalizeScrapedTransactions(
        rawTransactions.map((entry) => entry.txn),
      );
      const fetchedItemsForConnection = [];

      for (let index = 0; index < normalized.length; index += 1) {
        const normalizedItem = normalized[index];
        const transactionMeta = rawTransactions[index] || {};
        const rawItem = transactionMeta.txn || null;
        const normalizedAmount = Number(normalizedItem.amount);
        const normalizedStatus = normalizeExpenseStatus(normalizedItem.status);
        const itemIndex = index + 1;
        const itemPosition = `${itemIndex}/${normalized.length}`;
        if (
          !Number.isFinite(normalizedAmount) ||
          (normalizedAmount === 0 && normalizedStatus !== "pending")
        ) {
          const skipReason = !Number.isFinite(normalizedAmount)
            ? "invalid_amount"
            : "zero_amount_non_pending";
          console.log(
            `[BANK SYNC ITEM] skipped companyId=${formatLogValue(
              activeCreds.companyId,
            )} connectionId=${formatLogValue(
              connectionId,
            )} item=${itemPosition} reason=${skipReason} normalized=${serializeForLog(
              normalizedItem,
            )} raw=${serializeForLog(rawItem)}`,
          );
          continue;
        }
        const normalizedTransactionType =
          normalizedItem.transactionType === "return" ? "return" : "expense";
        const normalizedDate = toDateOrNull(normalizedItem.date) || normalizedItem.date;
        const normalizedProcessedDate =
          toDateOrNull(normalizedItem.processedDate) ||
          normalizedItem.processedDate ||
          null;
        const preparedDoc = {
          ...normalizedItem,
          date: normalizedDate,
          processedDate: normalizedProcessedDate,
          amount: Math.abs(normalizedAmount),
          transactionType: normalizedTransactionType,
          status: normalizedStatus,
          sourceCompanyId: activeCreds.companyId,
          sourceConnectionKey: connectionId,
          sourceAccountId: transactionMeta.accountId || "",
          sourceAccountName: transactionMeta.accountName || "",
          ...resolveExpenseVisibilityForConnection({
            sourceConnectionKey: connectionId,
            sourceAccountId: transactionMeta.accountId || "",
            connectionVisibilityMap: new Map([
              [
                connectionId,
                {
                  visibilityScope: normalizeVisibilityScope(
                    activeCreds.visibilityScope,
                  ),
                  ownerUserId: activeCreds.ownerUserId || user?._id || null,
                  accountVisibilityRules: Array.isArray(
                    activeCreds.accountVisibilityRules,
                  )
                    ? activeCreds.accountVisibilityRules
                    : [],
                },
              ],
            ]),
            fallbackOwnerUserId: user?._id,
          }),
          dedupKey: createExpenseDedupKey({
            ...normalizedItem,
            amount: Math.abs(normalizedAmount),
            transactionType: normalizedTransactionType,
            sourceCompanyId: activeCreds.companyId,
            sourceAccountId: transactionMeta.accountId || "",
            sourceAccountName: transactionMeta.accountName || "",
          }),
          householdId: household._id,
          createdBy: user._id,
          editedBy: user._id,
        };
        docs.push(preparedDoc);
        fetchedItemsForConnection.push({
          sourceAccountId: preparedDoc.sourceAccountId || "",
          date: preparedDoc.date,
          amount: preparedDoc.amount,
          description: preparedDoc.description,
          category: preparedDoc.category,
        });
      }
      logFetchedExpenseItems({
        companyId: activeCreds.companyId,
        connectionId,
        items: fetchedItemsForConnection,
      });

      connectionSummaries.push({
        connectionKey: connectionId,
        companyId: activeCreds.companyId,
        total: normalized.length,
        status: "success",
      });
      successfulConnectionKeys.add(connectionId);
      logConnectionResult({
        companyId: activeCreds.companyId,
        connectionId,
        status: "success",
        fetchedItems: normalized.length,
        durationMs: Date.now() - fetchStartedAt,
        scrapeMode,
        attemptsUsed,
        reason: "Fetch completed",
        windowStartDate: windowStartDate.toISOString(),
      });
    } catch (error) {
      const errorMessage = sanitizeErrorMessage(
        error?.message || "Failed to scrape bank transactions",
      );
      const errSummary = summarizeError(error);
      const normalizedErrorMessage = isLikelyAutomationBlock(errorMessage)
        ? `Provider blocked automation request (HTTP 429). ${errorMessage}`
        : errorMessage;
      console.warn(
        `[BANK SYNC RUN] connection_failed userId=${userId} householdId=${householdId} companyId=${formatLogValue(
          activeCreds.companyId,
        )} connectionId=${formatLogValue(
          connectionId,
        )} scrapeMode=${formatLogValue(
          error?.scrapeMode || "scrape",
        )} attempts=${Math.max(0, Number(error?.attemptsUsed || 1))} durationMs=${Date.now() - fetchStartedAt} error="${normalizedErrorMessage}" code=${errSummary.code} stack="${errSummary.stack}"`,
      );
      connectionSummaries.push({
        connectionKey: connectionId,
        companyId: activeCreds.companyId,
        total: 0,
        status: "error",
        error: normalizedErrorMessage,
      });
      logConnectionResult({
        companyId: activeCreds.companyId,
        connectionId,
        status: "failed",
        fetchedItems: 0,
        durationMs: Date.now() - fetchStartedAt,
        scrapeMode: error?.scrapeMode || "scrape",
        attemptsUsed: Number(error?.attemptsUsed || 1),
        reason: normalizedErrorMessage,
        windowStartDate: windowStartDate.toISOString(),
      });
    }
  }

  if (docs.length === 0) {
    const allFailed =
      connectionSummaries.length > 0 &&
      connectionSummaries.every((summary) => summary.status === "error");
    const allCooldown =
      connectionSummaries.length > 0 &&
      connectionSummaries.every((summary) => summary.status === "cooldown");
    const resultReason = allCooldown
      ? "all_connections_on_cooldown"
      : allFailed
        ? "all_connections_failed"
        : "no_transactions";
    console.warn(
      `[BANK SYNC RUN] completed_no_docs userId=${userId} householdId=${householdId} reason=${resultReason} attemptedConnections=${attemptedConnectionKeys.size} successfulConnections=${successfulConnectionKeys.size} durationMs=${Date.now() - syncRunStartedAtMs}`,
    );
    logConnectionSummaries({
      userId,
      householdId,
      status: resultReason,
      connectionSummaries,
    });

    return {
      imported: 0,
      updated: 0,
      total: 0,
      connections: connectionSummaries,
      attemptedConnectionKeys: Array.from(attemptedConnectionKeys),
      successfulConnectionKeys: Array.from(successfulConnectionKeys),
      reason: resultReason,
    };
  }

  const bulkOps = docs.map((doc) => ({
    updateOne: {
      filter: buildExpenseUpsertFilter(doc),
      update: [
        {
          $set: {
            householdId: doc.householdId,
            source: doc.source,
            externalId: doc.externalId,
            sourceCompanyId: doc.sourceCompanyId,
            sourceConnectionKey: doc.sourceConnectionKey,
            sourceAccountId: doc.sourceAccountId,
            sourceAccountName: doc.sourceAccountName,
            sourceTransactionType: doc.sourceTransactionType,
            processedDate: doc.processedDate,
            installmentNumber: doc.installmentNumber,
            installmentTotal: doc.installmentTotal,
            isInstallmentCharged: doc.isInstallmentCharged,
            dedupKey: doc.dedupKey,
            visibilityScope: doc.visibilityScope,
            visibleToUserId: doc.visibleToUserId,
            date: doc.date,
            amount: doc.amount,
            transactionType: doc.transactionType,
            status: doc.status,
            currency: doc.currency,
            merchant: doc.merchant,
            notes: doc.notes,
            tags: doc.tags,
            description: {
              $cond: [
                { $eq: ["$isUserAltered", true] },
                "$description",
                { $literal: doc.description },
              ],
            },
            category: {
              $cond: [
                { $eq: ["$isUserAltered", true] },
                "$category",
                { $literal: doc.category },
              ],
            },
            createdBy: { $ifNull: ["$createdBy", doc.createdBy] },
            editedBy: {
              $cond: [
                { $eq: ["$isUserAltered", true] },
                "$editedBy",
                doc.editedBy,
              ],
            },
            createdAt: { $ifNull: ["$createdAt", "$$NOW"] },
            updatedAt: "$$NOW",
          },
        },
      ],
      upsert: true,
    },
  }));
  const result = await Expense.bulkWrite(bulkOps, { ordered: false });
  const minWindowStartDate = docs.reduce((minDate, doc) => {
    const parsed = toDateOrNull(doc?.date);
    if (!parsed) return minDate;
    if (!minDate || parsed.getTime() < minDate.getTime()) return parsed;
    return minDate;
  }, null);
  const reconcileResult = await reconcilePendingWithPosted({
    householdId,
    connectionKeys: Array.from(successfulConnectionKeys),
    sinceDate: subtractUtcDays(minWindowStartDate || new Date(), 2),
  });
  console.log(
    `[BANK SYNC RUN] completed userId=${userId} householdId=${householdId} imported=${Number(
      result.upsertedCount || 0,
    )} updated=${Number(result.modifiedCount || 0)} total=${docs.length} attemptedConnections=${attemptedConnectionKeys.size} successfulConnections=${successfulConnectionKeys.size} reconciledPairs=${Number(
      reconcileResult.matchedPairs || 0,
    )} reconciledDeletes=${Number(reconcileResult.deleted || 0)} durationMs=${Date.now() - syncRunStartedAtMs}`,
  );
  logConnectionSummaries({
    userId,
    householdId,
    status: "completed",
    connectionSummaries,
  });
  return {
    imported: result.upsertedCount || 0,
    updated: result.modifiedCount || 0,
    total: docs.length,
    connections: connectionSummaries,
    attemptedConnectionKeys: Array.from(attemptedConnectionKeys),
    successfulConnectionKeys: Array.from(successfulConnectionKeys),
  };
}
