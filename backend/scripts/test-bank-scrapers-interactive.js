import { writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createInterface } from "node:readline/promises";
import { setTimeout as wait } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { assertSupportedNodeVersion } from "../src/utils/nodeVersion.js";

const ONE_ZERO_REQUIRED_FIELDS = new Set([
  "email",
  "password",
  "otpLongTermToken",
]);
const HIDDEN_COMPANY_IDS = new Set(["isracard"]);
const AUTOMATION_BLOCK_PATTERN =
  /(block automation|status:\s*429|too many requests|automation)/i;
const COMPANY_LABELS = {
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
let createScraper;
let SCRAPERS;
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

function createOutputCapture() {
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);
  const chunks = [];

  function appendChunk(chunk) {
    if (typeof chunk === "string") {
      chunks.push(chunk);
      return;
    }
    if (Buffer.isBuffer(chunk)) {
      chunks.push(chunk.toString("utf8"));
      return;
    }
    chunks.push(String(chunk));
  }

  function patchWrite(originalWrite) {
    return function patchedWrite(chunk, encoding, callback) {
      appendChunk(chunk);
      return originalWrite(chunk, encoding, callback);
    };
  }

  process.stdout.write = patchWrite(originalStdoutWrite);
  process.stderr.write = patchWrite(originalStderrWrite);

  return {
    getOutput() {
      return chunks.join("");
    },
    restore() {
      process.stdout.write = originalStdoutWrite;
      process.stderr.write = originalStderrWrite;
    },
  };
}

function parseBoolean(value, defaultValue = false) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!normalized) return defaultValue;
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

function isLikelyAutomationBlock(message) {
  return AUTOMATION_BLOCK_PATTERN.test(String(message || ""));
}

function sanitizeErrorMessage(message) {
  const normalized = String(message || "").trim();
  if (!normalized) return "Failed to scrape bank transactions";
  const [firstLine] = normalized.split("\n");
  return firstLine || normalized;
}

function formatLogValue(value) {
  if (value == null || value === "") return "-";
  return String(value);
}

function getRequiredFields(companyId) {
  const company = SCRAPERS?.[companyId];
  if (!company) return [];

  const loginFields = Array.isArray(company.loginFields)
    ? company.loginFields
    : [];
  const fields = loginFields.filter((field) => field !== "otpCodeRetriever");
  if (companyId !== "oneZero") return fields;
  return fields.filter((field) => ONE_ZERO_REQUIRED_FIELDS.has(field));
}

function formatFieldName(field) {
  return String(field || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isSensitiveField(field) {
  const normalized = String(field || "").toLowerCase();
  return (
    normalized.includes("password") ||
    normalized.includes("otp") ||
    normalized.includes("token")
  );
}

async function promptHidden(rl, label) {
  if (!process.stdin.isTTY) {
    throw new Error("Interactive mode requires a TTY");
  }

  rl.pause();
  process.stdout.write(label);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");
  process.stdin.setRawMode(true);

  let value = "";
  const shouldReplaceEchoedChars = process.platform === "win32";
  return new Promise((resolve, reject) => {
    function finish() {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener("data", onData);
      process.stdout.write("\n");
      rl.resume();
    }

    function onData(char) {
      if (char === "\u0003") {
        finish();
        reject(new Error("Input cancelled by user (Ctrl+C)"));
        return;
      }
      if (char === "\r" || char === "\n") {
        finish();
        resolve(value.trim());
        return;
      }
      if (char === "\u0008" || char === "\u007f") {
        if (value.length > 0) {
          value = value.slice(0, -1);
          process.stdout.write("\b \b");
        }
        return;
      }
      value += char;
      if (shouldReplaceEchoedChars) {
        // In some Windows terminals, typed chars are echoed even in raw mode.
        // Replace the echoed char with a mask char so only "*" is visible.
        process.stdout.write("\b*");
      } else {
        process.stdout.write("*");
      }
    }

    process.stdin.on("data", onData);
  });
}

async function promptField(rl, field) {
  const label = `${formatFieldName(field)}: `;
  if (field === "password" || isSensitiveField(field)) {
    return promptHidden(rl, label);
  }
  return (await rl.question(label)).trim();
}

async function promptProviderIndex(rl, providers) {
  while (true) {
    const answer = (await rl.question("\nSelect provider index: ")).trim();
    const index = Number(answer);
    if (!Number.isInteger(index)) {
      console.log("Please enter a valid integer index.");
      continue;
    }
    if (index < 0 || index >= providers.length) {
      console.log(`Index must be between 0 and ${providers.length - 1}.`);
      continue;
    }
    return index;
  }
}

function getProviderOptions() {
  return Object.keys(SCRAPERS)
    .filter((companyId) => !HIDDEN_COMPANY_IDS.has(companyId))
    .map((companyId) => ({
      companyId,
      label: COMPANY_LABELS[companyId] || companyId,
      requiredFields: getRequiredFields(companyId),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function summarizeScrape(scrapeResult) {
  const accounts = Array.isArray(scrapeResult?.accounts)
    ? scrapeResult.accounts
    : [];
  const totalTransactions = accounts.reduce((sum, account) => {
    const txns = Array.isArray(account?.txns) ? account.txns.length : 0;
    return sum + txns;
  }, 0);

  console.log("\nScrape summary:");
  console.log(`- Accounts: ${accounts.length}`);
  console.log(`- Total transactions: ${totalTransactions}`);

  for (const [index, account] of accounts.entries()) {
    const txns = Array.isArray(account?.txns) ? account.txns.length : 0;
    const accountLabel = [
      account?.accountName,
      account?.name,
      account?.accountNumber,
      account?.accountId,
      account?.cardNumber,
    ]
      .filter(Boolean)
      .join(" | ");
    console.log(
      `  [${index}] ${accountLabel || "Unnamed account"} - txns: ${txns}`,
    );
  }
}

function buildScrapeSummary(scrapeResult) {
  const accounts = Array.isArray(scrapeResult?.accounts)
    ? scrapeResult.accounts
    : [];
  const accountSummaries = accounts.map((account, index) => {
    const txns = Array.isArray(account?.txns) ? account.txns.length : 0;
    const accountLabel = [
      account?.accountName,
      account?.name,
      account?.accountNumber,
      account?.accountId,
      account?.cardNumber,
    ]
      .filter(Boolean)
      .join(" | ");
    return {
      accountIndex: index,
      accountLabel: accountLabel || "Unnamed account",
      transactions: txns,
    };
  });

  const totalTransactions = accountSummaries.reduce(
    (sum, account) => sum + account.transactions,
    0,
  );
  return {
    accounts: accountSummaries.length,
    totalTransactions,
    accountSummaries,
  };
}

function collectFetchedItems(scrapeResult) {
  const accounts = Array.isArray(scrapeResult?.accounts)
    ? scrapeResult.accounts
    : [];
  const items = [];

  for (const [accountIndex, account] of accounts.entries()) {
    const txns = Array.isArray(account?.txns) ? account.txns : [];
    const accountLabel = [
      account?.accountName,
      account?.name,
      account?.accountNumber,
      account?.accountId,
      account?.cardNumber,
    ]
      .filter(Boolean)
      .join(" | ");

    for (const txn of txns) {
      items.push({
        itemIndex: items.length + 1,
        accountIndex,
        accountLabel: accountLabel || "Unnamed account",
        transaction: txn,
      });
    }
  }

  return items;
}

function getTimestampForFilename() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function serializeError(error) {
  if (!error) return null;
  return {
    message: error?.message || String(error),
    stack: error?.stack || null,
  };
}

async function writeResultFile({
  selectedProvider,
  config,
  scrapeMeta,
  scrapeSummary,
  fetchedItems,
  runError,
  consoleOutput,
  startedAt,
}) {
  const filePath = path.join(
    SCRIPT_DIR,
    `test-bank-scrapers-interactive-result-${getTimestampForFilename()}.json`,
  );

  const payload = {
    generatedAt: new Date().toISOString(),
    startedAt,
    selectedProvider,
    config,
    scrapeMeta,
    scrapeSummary,
    fetchedItems,
    runError: serializeError(runError),
    consoleOutput,
  };

  await writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
  return filePath;
}

function printFetchedItemsDetails(scrapeResult) {
  const accounts = Array.isArray(scrapeResult?.accounts)
    ? scrapeResult.accounts
    : [];
  let itemCounter = 0;

  console.log("\nFetched items details:");

  for (const [accountIndex, account] of accounts.entries()) {
    const txns = Array.isArray(account?.txns) ? account.txns : [];
    const accountLabel = [
      account?.accountName,
      account?.name,
      account?.accountNumber,
      account?.accountId,
      account?.cardNumber,
    ]
      .filter(Boolean)
      .join(" | ");

    for (const txn of txns) {
      itemCounter += 1;
      console.log(
        `\n[Item ${itemCounter}] accountIndex=${accountIndex} account="${
          accountLabel || "Unnamed account"
        }"`,
      );
      console.log(JSON.stringify(txn, null, 2));
    }
  }

  if (itemCounter === 0) {
    console.log("- No fetched items.");
  } else {
    console.log(`\nTotal fetched items printed: ${itemCounter}`);
  }
}

async function scrapeWithFallback({
  companyId,
  credentials,
  verbose,
  showBrowser,
  startDate,
}) {
  const runStartedAtMs = Date.now();
  const attempts = [
    { label: "full", additionalTransactionInformation: true, showBrowser },
    { label: "reduced", additionalTransactionInformation: false, showBrowser },
  ];

  if (!showBrowser) {
    attempts.push({
      label: "reduced-browser",
      additionalTransactionInformation: false,
      showBrowser: true,
    });
  }

  let lastError = "Failed to scrape bank transactions";
  console.log(
    `[BANK SYNC ATTEMPT] configured companyId=${formatLogValue(
      companyId,
    )} startDate=${startDate instanceof Date ? startDate.toISOString() : formatLogValue(startDate)} attempts=${attempts
      .map((attempt) => attempt.label)
      .join("|")} showBrowserCfg=${showBrowser} verboseCfg=${verbose}`,
  );

  for (const [index, attempt] of attempts.entries()) {
    const attemptNumber = index + 1;
    const attemptStartedAtMs = Date.now();
    console.log(
      `[BANK SYNC ATTEMPT] start companyId=${formatLogValue(
        companyId,
      )} scrapeMode=${attempt.label} attemptNumber=${attemptNumber}/${attempts.length} showBrowser=${attempt.showBrowser} additionalInfo=${attempt.additionalTransactionInformation}`,
    );

    try {
      const scraper = createScraper({
        companyId,
        startDate,
        showBrowser: attempt.showBrowser,
        verbose,
        additionalTransactionInformation:
          attempt.additionalTransactionInformation,
      });
      if (typeof scraper.onProgress === "function") {
        scraper.onProgress((progressCompanyId, payload) => {
          const progressType = String(payload?.type || "-");
          console.log(
            `[BANK SYNC ATTEMPT] progress companyId=${formatLogValue(
              progressCompanyId || companyId,
            )} scrapeMode=${attempt.label} progressType=${progressType}`,
          );
        });
      }

      const scrapeResult = await scraper.scrape(credentials);
      if (scrapeResult?.success) {
        const accountsCount = Array.isArray(scrapeResult?.accounts)
          ? scrapeResult.accounts.length
          : 0;
        const totalDurationMs = Date.now() - runStartedAtMs;
        console.log(
          `[BANK SYNC ATTEMPT] success companyId=${formatLogValue(
            companyId,
          )} scrapeMode=${attempt.label} attemptNumber=${attemptNumber}/${attempts.length} durationMs=${Date.now() - attemptStartedAtMs} totalDurationMs=${totalDurationMs} accounts=${accountsCount}`,
        );
        return {
          success: true,
          scrapeMode: attempt.label,
          attemptsUsed: attemptNumber,
          totalDurationMs,
          scrapeResult,
        };
      }

      const reason = sanitizeErrorMessage(
        [scrapeResult?.errorType, scrapeResult?.errorMessage]
          .filter(Boolean)
          .join(": "),
      );
      lastError = reason;
      console.warn(
        `[BANK SYNC ATTEMPT] failed companyId=${formatLogValue(
          companyId,
        )} scrapeMode=${attempt.label} attemptNumber=${attemptNumber}/${attempts.length} durationMs=${Date.now() - attemptStartedAtMs} error="${reason}"`,
      );

      if (
        (attempt.label === "full" || attempt.label === "reduced") &&
        isLikelyAutomationBlock(reason)
      ) {
        console.warn(
          `[BANK SYNC ATTEMPT] fallback_triggered companyId=${formatLogValue(
            companyId,
          )} fromMode=${attempt.label} nextMode=${formatLogValue(
            attempts[index + 1]?.label,
          )} reason="${reason}"`,
        );
        await wait(1500);
        continue;
      }

      return {
        success: false,
        scrapeMode: attempt.label,
        attemptsUsed: attemptNumber,
        totalDurationMs: Date.now() - runStartedAtMs,
        error: reason,
      };
    } catch (error) {
      const message = sanitizeErrorMessage(error?.message);
      lastError = message;
      console.warn(
        `[BANK SYNC ATTEMPT] failed companyId=${formatLogValue(
          companyId,
        )} scrapeMode=${attempt.label} attemptNumber=${attemptNumber}/${attempts.length} durationMs=${Date.now() - attemptStartedAtMs} error="${message}"`,
      );

      if (
        (attempt.label === "full" || attempt.label === "reduced") &&
        isLikelyAutomationBlock(message)
      ) {
        console.warn(
          `[BANK SYNC ATTEMPT] fallback_triggered companyId=${formatLogValue(
            companyId,
          )} fromMode=${attempt.label} nextMode=${formatLogValue(
            attempts[index + 1]?.label,
          )} reason="${message}"`,
        );
        await wait(1500);
        continue;
      }

      return {
        success: false,
        scrapeMode: attempt.label,
        attemptsUsed: attemptNumber,
        totalDurationMs: Date.now() - runStartedAtMs,
        error: message,
      };
    }
  }

  const totalDurationMs = Date.now() - runStartedAtMs;
  console.warn(
    `[BANK SYNC ATTEMPT] exhausted companyId=${formatLogValue(
      companyId,
    )} attemptsUsed=${attempts.length} totalDurationMs=${totalDurationMs} lastError="${sanitizeErrorMessage(lastError)}"`,
  );
  return {
    success: false,
    scrapeMode: "unknown",
    attemptsUsed: attempts.length,
    totalDurationMs,
    error: lastError,
  };
}

async function main() {
  const outputCapture = createOutputCapture();
  const startedAt = new Date().toISOString();
  let selectedProvider = null;
  let config = null;
  let scrapeMeta = null;
  let scrapeSummary = null;
  let fetchedItems = [];
  let runError = null;

  try {
    assertSupportedNodeVersion();
    ({ createScraper, SCRAPERS } = await import("israeli-bank-scrapers"));
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      throw new Error("Interactive test requires a TTY terminal.");
    }

    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    try {
      const providers = getProviderOptions();
      if (providers.length === 0) {
        throw new Error("No providers found from israeli-bank-scrapers.");
      }

      console.log("=== Israeli Bank Scrapers Interactive Test ===");
      console.log("\nAvailable providers:");
      providers.forEach((provider, index) => {
        console.log(
          `[${index}] ${provider.label} (${provider.companyId}) - required fields: ${provider.requiredFields.join(", ") || "none"}`,
        );
      });

      const providerIndex = await promptProviderIndex(rl, providers);
      const selected = providers[providerIndex];
      selectedProvider = {
        providerIndex,
        companyId: selected.companyId,
        label: selected.label,
      };
      console.log(
        `\nSelected: ${selected.label} (${selected.companyId}) at index ${providerIndex}`,
      );

      const credentials = {};
      console.log("\nEnter credentials:");

      const username = (await rl.question("Username: ")).trim();
      if (username) credentials.username = username;

      const password = await promptHidden(rl, "Password: ");
      if (password) credentials.password = password;

      for (const field of selected.requiredFields) {
        if (field === "username" || field === "password") continue;
        const value = await promptField(rl, field);
        if (value) credentials[field] = value;
      }

      const missingFields = selected.requiredFields.filter(
        (field) => !credentials[field],
      );
      if (missingFields.length > 0) {
        throw new Error(
          `Missing required credentials for ${selected.companyId}: ${missingFields.join(", ")}`,
        );
      }

      const verbose = parseBoolean(process.env.BANK_SCRAPER_VERBOSE, true);
      const showBrowser = parseBoolean(
        process.env.BANK_SCRAPER_SHOW_BROWSER,
        false,
      );
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 1);

      config = {
        companyId: selected.companyId,
        startDate: startDate.toISOString(),
        verbose,
        showBrowser,
        credentialsFieldsProvided: Object.keys(credentials),
      };

      console.log("\nRunning scrape with configuration:");
      console.log(`- companyId: ${selected.companyId}`);
      console.log(`- startDate: ${startDate.toISOString()}`);
      console.log(`- verbose: ${verbose}`);
      console.log(`- showBrowser: ${showBrowser}`);
      console.log(
        `- credentials fields provided: ${Object.keys(credentials).join(", ") || "none"}`,
      );

      const result = await scrapeWithFallback({
        companyId: selected.companyId,
        credentials,
        verbose,
        showBrowser,
        startDate,
      });

      scrapeMeta = {
        success: Boolean(result?.success),
        scrapeMode: result?.scrapeMode || "unknown",
        attemptsUsed: Number(result?.attemptsUsed || 0),
        totalDurationMs: Number(result?.totalDurationMs || 0),
        error: result?.error || null,
      };

      const durationMs = Number(result?.totalDurationMs || 0);
      console.log(`\nCompleted in ${durationMs}ms total.`);
      console.log(
        `Mode used: ${result.scrapeMode}, attempts used: ${result.attemptsUsed}`,
      );

      if (!result.success) {
        console.error(`Scrape failed: ${result.error}`);
        process.exitCode = 1;
        return;
      }

      scrapeSummary = buildScrapeSummary(result.scrapeResult);
      fetchedItems = collectFetchedItems(result.scrapeResult);
      summarizeScrape(result.scrapeResult);
      printFetchedItemsDetails(result.scrapeResult);
    } finally {
      rl.close();
    }
  } catch (error) {
    runError = error;
    throw error;
  } finally {
    try {
      await writeResultFile({
        selectedProvider,
        config,
        scrapeMeta,
        scrapeSummary,
        fetchedItems,
        runError,
        consoleOutput: outputCapture.getOutput(),
        startedAt,
      });
    } catch (writeError) {
      console.error(
        `Failed to write interactive scrape result file: ${
          writeError?.stack || writeError?.message || String(writeError)
        }`,
      );
    } finally {
      outputCapture.restore();
    }
  }
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});
