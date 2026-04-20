import process from "node:process";
import { createInterface } from "node:readline/promises";
import { setTimeout as wait } from "node:timers/promises";
import { createScraper, SCRAPERS } from "israeli-bank-scrapers";

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

function parseBoolean(value, defaultValue = false) {
  const normalized = String(value ?? "").trim().toLowerCase();
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
  const accounts = Array.isArray(scrapeResult?.accounts) ? scrapeResult.accounts : [];
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
    console.log(`  [${index}] ${accountLabel || "Unnamed account"} - txns: ${txns}`);
  }
}

function printFetchedItemsDetails(scrapeResult) {
  const accounts = Array.isArray(scrapeResult?.accounts) ? scrapeResult.accounts : [];
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

  for (const [index, attempt] of attempts.entries()) {
    const attemptNumber = index + 1;
    console.log(
      `\n[Attempt ${attemptNumber}/${attempts.length}] mode=${attempt.label}, showBrowser=${attempt.showBrowser}, additionalTransactionInformation=${attempt.additionalTransactionInformation}`,
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

      const scrapeResult = await scraper.scrape(credentials);
      if (scrapeResult?.success) {
        console.log(`[Attempt ${attemptNumber}] Success.`);
        return {
          success: true,
          scrapeMode: attempt.label,
          attemptsUsed: attemptNumber,
          scrapeResult,
        };
      }

      const reason = sanitizeErrorMessage(
        [scrapeResult?.errorType, scrapeResult?.errorMessage]
          .filter(Boolean)
          .join(": "),
      );
      lastError = reason;
      console.log(`[Attempt ${attemptNumber}] Failed: ${reason}`);

      if (
        (attempt.label === "full" || attempt.label === "reduced") &&
        isLikelyAutomationBlock(reason)
      ) {
        console.log("Detected likely automation block. Retrying fallback mode...");
        await wait(1500);
        continue;
      }

      return {
        success: false,
        scrapeMode: attempt.label,
        attemptsUsed: attemptNumber,
        error: reason,
      };
    } catch (error) {
      const message = sanitizeErrorMessage(error?.message);
      lastError = message;
      console.log(`[Attempt ${attemptNumber}] Exception: ${message}`);

      if (
        (attempt.label === "full" || attempt.label === "reduced") &&
        isLikelyAutomationBlock(message)
      ) {
        console.log("Detected likely automation block. Retrying fallback mode...");
        await wait(1500);
        continue;
      }

      return {
        success: false,
        scrapeMode: attempt.label,
        attemptsUsed: attemptNumber,
        error: message,
      };
    }
  }

  return {
    success: false,
    scrapeMode: "unknown",
    attemptsUsed: attempts.length,
    error: lastError,
  };
}

async function main() {
  const nodeMajor = Number(process.versions.node.split(".")[0] || 0);
  if (nodeMajor < 22) {
    throw new Error(
      `Node ${process.versions.node} is not supported by israeli-bank-scrapers. Use Node >= 22.12.0`,
    );
  }
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

    const missingFields = selected.requiredFields.filter((field) => !credentials[field]);
    if (missingFields.length > 0) {
      throw new Error(
        `Missing required credentials for ${selected.companyId}: ${missingFields.join(", ")}`,
      );
    }

    const verbose = parseBoolean(process.env.BANK_SCRAPER_VERBOSE, true);
    const showBrowser = parseBoolean(process.env.BANK_SCRAPER_SHOW_BROWSER, false);
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 1);

    console.log("\nRunning scrape with configuration:");
    console.log(`- companyId: ${selected.companyId}`);
    console.log(`- startDate: ${startDate.toISOString()}`);
    console.log(`- verbose: ${verbose}`);
    console.log(`- showBrowser: ${showBrowser}`);
    console.log(
      `- credentials fields provided: ${Object.keys(credentials).join(", ") || "none"}`,
    );

    const startedAt = Date.now();
    const result = await scrapeWithFallback({
      companyId: selected.companyId,
      credentials,
      verbose,
      showBrowser,
      startDate,
    });

    const durationMs = Date.now() - startedAt;
    console.log(`\nCompleted in ${durationMs}ms.`);
    console.log(
      `Mode used: ${result.scrapeMode}, attempts used: ${result.attemptsUsed}`,
    );

    if (!result.success) {
      console.error(`Scrape failed: ${result.error}`);
      process.exitCode = 1;
      return;
    }

    summarizeScrape(result.scrapeResult);
    printFetchedItemsDetails(result.scrapeResult);
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});
