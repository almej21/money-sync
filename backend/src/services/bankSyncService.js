import Expense from "../models/Expense.js";
import { normalizeScrapedTransactions } from "./bankImporter.js";
import { decryptValue } from "./credentialCrypto.js";

const ONE_ZERO_REQUIRED_FIELDS = new Set(["email", "password", "otpLongTermToken"]);

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

function getDecryptedUserCredentials(user) {
  const bankCredentials = user?.bankCredentials;
  const companyId = String(bankCredentials?.companyId || "").trim();
  if (!companyId) return null;

  const encryptedFields = bankCredentials?.encryptedFields;
  const decrypted = {};

  if (encryptedFields && typeof encryptedFields.entries === "function") {
    for (const [field, encryptedValue] of encryptedFields.entries()) {
      if (!encryptedValue) continue;
      decrypted[field] = decryptValue(encryptedValue);
    }
  } else if (encryptedFields && typeof encryptedFields === "object") {
    for (const [field, encryptedValue] of Object.entries(encryptedFields)) {
      if (!encryptedValue) continue;
      decrypted[field] = decryptValue(encryptedValue);
    }
  }

  if (!decrypted.username && bankCredentials?.usernameEnc) {
    decrypted.username = decryptValue(bankCredentials.usernameEnc);
  }
  if (!decrypted.password && bankCredentials?.passwordEnc) {
    decrypted.password = decryptValue(bankCredentials.passwordEnc);
  }
  if (!decrypted.nationalID && bankCredentials?.nationalIdEnc) {
    decrypted.nationalID = decryptValue(bankCredentials.nationalIdEnc);
  }

  return {
    companyId,
    ...decrypted,
  };
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

  return accounts.flatMap((a) => (Array.isArray(a.txns) ? a.txns : []));
}

function getRequiredFields(companyId, scrapers) {
  const company = scrapers?.[companyId];
  if (!company) return null;

  const fields = company.loginFields.filter((field) => field !== "otpCodeRetriever");
  if (companyId !== "oneZero") return fields;

  return fields.filter((field) => ONE_ZERO_REQUIRED_FIELDS.has(field));
}

function buildScrapeCredentials(activeCreds) {
  return Object.fromEntries(
    Object.entries(activeCreds).filter(
      ([key, value]) => key !== "companyId" && typeof value === "string" && value,
    ),
  );
}

export async function syncLastMonthExpensesForUser(user) {
  const envCfg = getConfig();
  if (!envCfg.enabled) {
    return { imported: 0, reason: "disabled" };
  }

  const userCreds = getDecryptedUserCredentials(user);
  const rawCreds = userCreds || {
    companyId: envCfg.companyId,
    username: envCfg.username,
    nationalID: envCfg.nationalID,
    password: envCfg.password,
  };
  const activeCreds = sanitizeCredentials(rawCreds);

  if (!activeCreds.companyId) {
    throw new Error("Missing bank credentials for this user");
  }

  if (!isNodeVersionSupported()) {
    throw new Error(
      `Node ${process.versions.node} is not supported by israeli-bank-scrapers. Use Node >= 22.12.0`,
    );
  }

  const { createScraper, SCRAPERS } = await import("israeli-bank-scrapers");
  const requiredFields = getRequiredFields(activeCreds.companyId, SCRAPERS);
  if (!requiredFields) {
    throw new Error(`Unsupported companyId: ${activeCreds.companyId}`);
  }

  const missingFields = requiredFields.filter((field) => !activeCreds[field]);
  if (missingFields.length > 0) {
    throw new Error(
      `Missing bank credentials for this user: ${missingFields.join(", ")}`,
    );
  }

  const { startDate } = oneMonthWindow();
  const scraper = createScraper({
    companyId: activeCreds.companyId,
    startDate,
    showBrowser: envCfg.showBrowser,
    verbose: envCfg.verbose,
    additionalTransactionInformation: true,
  });

  const scrapeCredentials = buildScrapeCredentials(activeCreds);
  const scrapeResult = await scraper.scrape(scrapeCredentials);

  if (!scrapeResult?.success) {
    const reason = [scrapeResult?.errorType, scrapeResult?.errorMessage]
      .filter(Boolean)
      .join(": ");
    throw new Error(reason || "Failed to scrape bank transactions");
  }

  const rawTransactions = flattenTransactions(scrapeResult);
  const normalized = normalizeScrapedTransactions(rawTransactions);
  if (normalized.length === 0) {
    return { imported: 0, total: 0 };
  }

  const docs = normalized.map((t) => ({
    ...t,
    householdId: user.householdId,
    createdBy: user._id,
    editedBy: user._id,
  }));

  const bulkOps = docs.map((doc) => ({
    updateOne: {
      filter: {
        householdId: doc.householdId,
        source: doc.source,
        externalId: doc.externalId,
      },
      update: { $set: doc },
      upsert: true,
    },
  }));

  const result = await Expense.bulkWrite(bulkOps, { ordered: false });
  return {
    imported: result.upsertedCount || 0,
    updated: result.modifiedCount || 0,
    total: docs.length,
  };
}
