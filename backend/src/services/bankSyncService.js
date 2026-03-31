import Expense from "../models/Expense.js";
import { normalizeScrapedTransactions } from "./bankImporter.js";
import { decryptValue } from "./credentialCrypto.js";

const ONE_ZERO_REQUIRED_FIELDS = new Set([
  "email",
  "password",
  "otpLongTermToken",
]);
const AUTOMATION_BLOCK_PATTERN =
  /(block automation|status:\s*429|too many requests|automation)/i;
const FETCH_COOLDOWN_MS = 60 * 60 * 1000;
const BANK_COMPANY_LABELS = {
  hapoalim: "Bank Hapoalim",
  leumi: "Bank Leumi",
  mizrahi: "Mizrahi-Tefahot",
  discount: "Discount Bank",
  mercantile: "Mercantile Bank",
  otsarHahayal: "Otsar HaHayal",
  max: "MAX",
  visaCal: "CAL",
  isracard: "Isracard",
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

function isNodeVersionSupported() {
  const major = Number(process.versions.node.split(".")[0] || 0);
  return major >= 22;
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

function toStoredEncryptedFields(bankCredentials = {}) {
  const encryptedFields = bankCredentials?.encryptedFields;
  if (encryptedFields && typeof encryptedFields.entries === "function") {
    return Object.fromEntries(encryptedFields.entries());
  }
  if (encryptedFields && typeof encryptedFields === "object") {
    return { ...encryptedFields };
  }

  const legacy = {
    username: bankCredentials?.usernameEnc || "",
    nationalID: bankCredentials?.nationalIdEnc || "",
    password: bankCredentials?.passwordEnc || "",
  };
  return Object.fromEntries(
    Object.entries(legacy).filter(([, value]) => Boolean(value)),
  );
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

  return {
    connectionKey: String(connectionKey || "").trim(),
    companyId,
    lastBankFetchAt:
      bankCredentials?.lastBankFetchAt || fallbackLastBankFetchAt || null,
    ...decrypted,
  };
}

function getDecryptedUserConnections(user) {
  const errors = [];
  const modernConnections =
    Array.isArray(user?.bankConnections) && user.bankConnections.length > 0
      ? user.bankConnections
      : [];

  if (modernConnections.length > 0) {
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

  try {
    const legacyCredentials = getDecryptedConnectionCredentials(
      user?.bankCredentials,
      "legacy",
      user?.expenseSyncMeta?.lastBankFetchAt || null,
    );
    if (!legacyCredentials) {
      return { connections: [], errors };
    }
    return { connections: [sanitizeCredentials(legacyCredentials)], errors };
  } catch (error) {
    errors.push({
      connectionKey: "legacy",
      companyId: String(user?.bankCredentials?.companyId || "").trim(),
      total: 0,
      status: "error",
      error: error?.message || "Failed to decrypt connection credentials",
    });
    return { connections: [], errors };
  }
}

function oneMonthWindow() {
  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setMonth(startDate.getMonth() - 1);
  return { startDate, endDate };
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

function isLikelyAutomationBlock(message) {
  return AUTOMATION_BLOCK_PATTERN.test(String(message || ""));
}

function getBankName(companyId) {
  return BANK_COMPANY_LABELS[companyId] || companyId || "Unknown";
}

function formatLogValue(value) {
  if (value == null || value === "") return "-";
  return String(value);
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
}) {
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
  if (!envCfg.showBrowser) {
    attempts.push({
      label: "reduced-browser",
      additionalTransactionInformation: false,
      showBrowser: true,
    });
  }
  let lastErrorMessage = "";

  for (const attempt of attempts) {
    const attemptNumber = attempts.indexOf(attempt) + 1;
    try {
      const scraper = createScraper({
        companyId: activeCreds.companyId,
        startDate,
        showBrowser: attempt.showBrowser,
        verbose: envCfg.verbose,
        additionalTransactionInformation:
          attempt.additionalTransactionInformation,
      });

      const scrapeResult = await scraper.scrape(scrapeCredentials);
      if (scrapeResult?.success) {
        return {
          scrapeResult,
          usedFallback: attempt.label === "reduced",
          usedBrowserFallback: attempt.label === "reduced-browser",
          scrapeMode: attempt.label,
          attemptsUsed: attempts.indexOf(attempt) + 1,
        };
      }

      const reason =
        toScrapeFailureMessage(scrapeResult) ||
        "Failed to scrape bank transactions";
      lastErrorMessage = sanitizeErrorMessage(reason);

      if (
        (attempt.label === "full" || attempt.label === "reduced") &&
        isLikelyAutomationBlock(reason)
      ) {
        await wait(1500);
        continue;
      }

      const attemptError = new Error(lastErrorMessage);
      attemptError.scrapeMode = attempt.label;
      attemptError.attemptsUsed = attemptNumber;
      throw attemptError;
    } catch (error) {
      const message = sanitizeErrorMessage(
        error?.message || "Failed to scrape bank transactions",
      );
      lastErrorMessage = message;

      if (
        (attempt.label === "full" || attempt.label === "reduced") &&
        isLikelyAutomationBlock(message)
      ) {
        await wait(1500);
        continue;
      }

      const attemptError = new Error(message);
      attemptError.scrapeMode = attempt.label;
      attemptError.attemptsUsed = attemptNumber;
      throw attemptError;
    }
  }

  const terminalError = new Error(
    lastErrorMessage || "Failed to scrape bank transactions",
  );
  terminalError.scrapeMode = "unknown";
  terminalError.attemptsUsed = attempts.length;
  throw terminalError;
}

function buildUpsertFilter(doc) {
  const baseFilter = {
    householdId: doc.householdId,
    source: doc.source,
    externalId: doc.externalId,
  };

  if (!doc.sourceConnectionKey) return baseFilter;

  return {
    ...baseFilter,
    $or: [
      { sourceConnectionKey: doc.sourceConnectionKey },
      { sourceConnectionKey: { $exists: false } },
    ],
  };
}

export async function syncLastMonthExpensesForUser(user) {
  const envCfg = getConfig();
  if (!envCfg.enabled) {
    return { imported: 0, reason: "disabled" };
  }

  const { connections: userConnections, errors: connectionErrors } =
    getDecryptedUserConnections(user);
  const fallbackConnection = sanitizeCredentials({
    connectionKey: "env-default",
    companyId: envCfg.companyId,
    username: envCfg.username,
    nationalID: envCfg.nationalID,
    password: envCfg.password,
  });
  const activeConnections =
    userConnections.length > 0 ? userConnections : [fallbackConnection];

  if (!activeConnections.some((connection) => connection.companyId)) {
    throw new Error("Missing bank credentials for this user");
  }

  if (!isNodeVersionSupported()) {
    throw new Error(
      `Node ${process.versions.node} is not supported by israeli-bank-scrapers. Use Node >= 22.12.0`,
    );
  }

  const { createScraper, SCRAPERS } = await import("israeli-bank-scrapers");
  const { startDate } = oneMonthWindow();
  const connectionSummaries = [...connectionErrors];
  const docs = [];
  const attemptedConnectionKeys = new Set();
  const nowMs = Date.now();

  for (const activeCreds of activeConnections) {
    const fetchStartedAt = Date.now();
    const connectionId =
      String(activeCreds.connectionKey || "").trim() || activeCreds.companyId;
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
        windowStartDate: startDate.toISOString(),
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
        windowStartDate: startDate.toISOString(),
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
        windowStartDate: startDate.toISOString(),
      });
      continue;
    }

    try {
      attemptedConnectionKeys.add(connectionId);
      const scrapeCredentials = buildScrapeCredentials(activeCreds);
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
          startDate,
          envCfg,
          scrapeCredentials,
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

      for (let index = 0; index < normalized.length; index += 1) {
        const normalizedItem = normalized[index];
        const transactionMeta = rawTransactions[index] || {};
        docs.push({
          ...normalizedItem,
          sourceCompanyId: activeCreds.companyId,
          sourceConnectionKey: connectionId,
          sourceAccountId: transactionMeta.accountId || "",
          sourceAccountName: transactionMeta.accountName || "",
          householdId: user.householdId,
          createdBy: user._id,
          editedBy: user._id,
        });
      }

      connectionSummaries.push({
        connectionKey: connectionId,
        companyId: activeCreds.companyId,
        total: normalized.length,
        status: "success",
      });
      logConnectionResult({
        companyId: activeCreds.companyId,
        connectionId,
        status: "success",
        fetchedItems: normalized.length,
        durationMs: Date.now() - fetchStartedAt,
        scrapeMode,
        attemptsUsed,
        reason: "Fetch completed",
        windowStartDate: startDate.toISOString(),
      });
    } catch (error) {
      const errorMessage = sanitizeErrorMessage(
        error?.message || "Failed to scrape bank transactions",
      );
      const normalizedErrorMessage = isLikelyAutomationBlock(errorMessage)
        ? `Provider blocked automation request (HTTP 429). ${errorMessage}`
        : errorMessage;
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
        windowStartDate: startDate.toISOString(),
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

    return {
      imported: 0,
      updated: 0,
      total: 0,
      connections: connectionSummaries,
      attemptedConnectionKeys: Array.from(attemptedConnectionKeys),
      reason: allCooldown
        ? "all_connections_on_cooldown"
        : allFailed
          ? "all_connections_failed"
          : "no_transactions",
    };
  }

  const bulkOps = docs.map((doc) => ({
    updateOne: {
      filter: buildUpsertFilter(doc),
      update: { $set: doc },
      upsert: true,
    },
  }));

  const result = await Expense.bulkWrite(bulkOps, { ordered: false });
  return {
    imported: result.upsertedCount || 0,
    updated: result.modifiedCount || 0,
    total: docs.length,
    connections: connectionSummaries,
    attemptedConnectionKeys: Array.from(attemptedConnectionKeys),
  };
}
