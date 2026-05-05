import fs from "node:fs/promises";
import path from "node:path";
import { assertSupportedNodeVersion } from "../src/utils/nodeVersion.js";

const ONE_ZERO_REQUIRED_FIELDS = new Set([
  "email",
  "password",
  "otpLongTermToken",
]);
const AUTOMATION_BLOCK_PATTERN =
  /(block automation|status:\s*429|too many requests|automation)/i;

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
  return String(value || "")
    .trim()
    .toLowerCase() === "true";
}

function toEnvToken(value) {
  return String(value || "")
    .replace(/[^a-zA-Z0-9]/g, "_")
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toUpperCase();
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

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function getCredential(companyId, field) {
  const specificKey = `BANK_TEST_${toEnvToken(companyId)}_${toEnvToken(field)}`;
  const genericKey = `BANK_TEST_${toEnvToken(field)}`;
  return String(process.env[specificKey] || process.env[genericKey] || "").trim();
}

function buildCredentials(companyId, requiredFields) {
  const credentials = {};
  for (const field of requiredFields) {
    const value = getCredential(companyId, field);
    if (value) {
      credentials[field] = value;
    }
  }
  return credentials;
}

function buildCredentialsWithFallback({
  companyId,
  requiredFields,
  allowMissingCredentials,
  defaultCredentialValue,
}) {
  const credentials = buildCredentials(companyId, requiredFields);
  const missingFields = requiredFields.filter((field) => !credentials[field]);

  if (allowMissingCredentials && missingFields.length > 0) {
    for (const field of missingFields) {
      credentials[field] = defaultCredentialValue;
    }
  }

  return { credentials, missingFields };
}

async function scrapeWithFallback({ createScraper, companyId, credentials }) {
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - 1);
  const verbose = String(process.env.BANK_SCRAPER_VERBOSE || "")
    .trim()
    .toLowerCase() === "true";

  const attempts = [
    { label: "full", additionalTransactionInformation: true, showBrowser: false },
    {
      label: "reduced",
      additionalTransactionInformation: false,
      showBrowser: false,
    },
    {
      label: "reduced-browser",
      additionalTransactionInformation: false,
      showBrowser: true,
    },
  ];

  let lastErrorMessage = "";
  for (const [index, attempt] of attempts.entries()) {
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
        const accounts = Array.isArray(scrapeResult.accounts)
          ? scrapeResult.accounts
          : [];
        const totalTxns = accounts.reduce((sum, account) => {
          const txns = Array.isArray(account?.txns) ? account.txns.length : 0;
          return sum + txns;
        }, 0);

        return {
          success: true,
          scrapeMode: attempt.label,
          attemptsUsed: index + 1,
          totalTxns,
        };
      }

      const reason = sanitizeErrorMessage(
        [scrapeResult?.errorType, scrapeResult?.errorMessage]
          .filter(Boolean)
          .join(": "),
      );
      lastErrorMessage = reason;

      if (
        (attempt.label === "full" || attempt.label === "reduced") &&
        isLikelyAutomationBlock(reason)
      ) {
        await wait(1500);
        continue;
      }

      return {
        success: false,
        scrapeMode: attempt.label,
        attemptsUsed: index + 1,
        error: reason,
      };
    } catch (error) {
      const message = sanitizeErrorMessage(error?.message);
      lastErrorMessage = message;

      if (
        (attempt.label === "full" || attempt.label === "reduced") &&
        isLikelyAutomationBlock(message)
      ) {
        await wait(1500);
        continue;
      }

      return {
        success: false,
        scrapeMode: attempt.label,
        attemptsUsed: index + 1,
        error: message,
      };
    }
  }

  return {
    success: false,
    scrapeMode: "unknown",
    attemptsUsed: attempts.length,
    error: lastErrorMessage || "Failed to scrape bank transactions",
  };
}

function toMarkdownReport(results, startedAtIso, finishedAtIso) {
  const successes = results.filter((item) => item.status === "success");
  const failures = results.filter((item) => item.status === "failed");

  const lines = [];
  lines.push("# Bank Scraper Test Summary");
  lines.push("");
  lines.push(`Started: ${startedAtIso}`);
  lines.push(`Finished: ${finishedAtIso}`);
  lines.push(`Total banks: ${results.length}`);
  lines.push(`Succeeded: ${successes.length}`);
  lines.push(`Failed: ${failures.length}`);
  lines.push("");

  lines.push("## Succeeded");
  if (successes.length === 0) {
    lines.push("- None");
  } else {
    for (const row of successes) {
      lines.push(
        `- ${row.companyId} (${row.bankName}) - txns=${row.totalTxns}, mode=${row.scrapeMode}, attempts=${row.attemptsUsed}, durationMs=${row.durationMs}`,
      );
    }
  }
  lines.push("");

  lines.push("## Failed");
  if (failures.length === 0) {
    lines.push("- None");
  } else {
    for (const row of failures) {
      const reason = row.reason ? `, reason=${row.reason}` : "";
      const missing = Array.isArray(row.missingFields) && row.missingFields.length
        ? `, missing=${row.missingFields.join("|")}`
        : "";
      lines.push(
        `- ${row.companyId} (${row.bankName}) - mode=${row.scrapeMode || "-"}, attempts=${row.attemptsUsed || 0}, durationMs=${row.durationMs}${reason}${missing}`,
      );
    }
  }
  lines.push("");
  lines.push("## All Results (JSON)");
  lines.push("```json");
  lines.push(JSON.stringify(results, null, 2));
  lines.push("```");
  lines.push("");

  return lines.join("\n");
}

async function main() {
  assertSupportedNodeVersion();

  const startedAt = new Date();
  const startedAtIso = startedAt.toISOString();
  const allowMissingCredentials = parseBoolean(
    process.env.BANK_TEST_ALLOW_MISSING_CREDENTIALS,
  );
  const defaultCredentialValue =
    String(process.env.BANK_TEST_DEFAULT_CREDENTIAL_VALUE || "").trim() ||
    "test";
  const { createScraper, SCRAPERS } = await import("israeli-bank-scrapers");

  const results = [];
  for (const [companyId, bankName] of Object.entries(BANK_COMPANY_LABELS)) {
    const testStart = Date.now();
    const requiredFields = getRequiredFields(companyId, SCRAPERS);

    if (!requiredFields) {
      results.push({
        companyId,
        bankName,
        status: "failed",
        durationMs: Date.now() - testStart,
        reason: "Unsupported companyId",
      });
      continue;
    }

    const { credentials, missingFields } = buildCredentialsWithFallback({
      companyId,
      requiredFields,
      allowMissingCredentials,
      defaultCredentialValue,
    });

    if (missingFields.length > 0 && !allowMissingCredentials) {
      results.push({
        companyId,
        bankName,
        status: "failed",
        durationMs: Date.now() - testStart,
        reason: "Missing credentials",
        missingFields,
      });
      continue;
    }

    const scrape = await scrapeWithFallback({
      createScraper,
      companyId,
      credentials,
    });

    if (scrape.success) {
      results.push({
        companyId,
        bankName,
        status: "success",
        durationMs: Date.now() - testStart,
        scrapeMode: scrape.scrapeMode,
        attemptsUsed: scrape.attemptsUsed,
        totalTxns: scrape.totalTxns,
        missingFieldsUsedFallback: allowMissingCredentials
          ? missingFields
          : [],
      });
    } else {
      const normalizedError = isLikelyAutomationBlock(scrape.error)
        ? `Provider blocked automation request (HTTP 429). ${scrape.error}`
        : scrape.error;
      results.push({
        companyId,
        bankName,
        status: "failed",
        durationMs: Date.now() - testStart,
        scrapeMode: scrape.scrapeMode,
        attemptsUsed: scrape.attemptsUsed,
        reason: normalizedError,
        missingFieldsUsedFallback: allowMissingCredentials
          ? missingFields
          : [],
      });
    }
  }

  const finishedAtIso = new Date().toISOString();
  const reportsDir = path.resolve(process.cwd(), "reports");
  await fs.mkdir(reportsDir, { recursive: true });
  const timestamp = startedAtIso.replace(/[:.]/g, "-");
  const jsonPath = path.join(reportsDir, `bank-scraper-test-${timestamp}.json`);
  const mdPath = path.join(reportsDir, `bank-scraper-test-${timestamp}.md`);

  const payload = {
    startedAt: startedAtIso,
    finishedAt: finishedAtIso,
    total: results.length,
    succeeded: results.filter((item) => item.status === "success").length,
    failed: results.filter((item) => item.status === "failed").length,
    results,
  };

  await fs.writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await fs.writeFile(
    mdPath,
    `${toMarkdownReport(results, startedAtIso, finishedAtIso)}\n`,
    "utf8",
  );

  console.log(`Wrote JSON summary: ${jsonPath}`);
  console.log(`Wrote Markdown summary: ${mdPath}`);
  console.log(
    `Mode: ${
      allowMissingCredentials ? "allow-missing-credentials" : "require-credentials"
    }`,
  );
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});
