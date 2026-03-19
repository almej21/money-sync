import Expense from "../models/Expense.js";
import { normalizeScrapedTransactions } from "./bankImporter.js";
import { decryptValue } from "./credentialCrypto.js";

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

function sanitizeCredentials(creds) {
  return {
    companyId: String(creds.companyId || "").trim(),
    username: String(creds.username || "").trim(),
    nationalID: String(creds.nationalID || "").trim(),
    password: String(creds.password || "").trim(),
  };
}

function requiresNationalId(companyId = "") {
  return String(companyId).trim() === "yahav";
}

function getUserCredentials(user) {
  const creds = user?.bankCredentials;
  const companyId = String(creds?.companyId || "").trim();
  const needsNationalId = requiresNationalId(companyId);
  if (
    !companyId ||
    !creds?.usernameEnc ||
    !creds?.passwordEnc ||
    (needsNationalId && !creds?.nationalIdEnc)
  ) {
    return null;
  }

  return {
    companyId,
    username: decryptValue(creds.usernameEnc),
    nationalID: creds.nationalIdEnc ? decryptValue(creds.nationalIdEnc) : "",
    password: decryptValue(creds.passwordEnc),
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

export async function syncLastMonthExpensesForUser(user) {
  const envCfg = getConfig();
  if (!envCfg.enabled) {
    return { imported: 0, reason: "disabled" };
  }

  const userCreds = getUserCredentials(user);
  const rawCreds = userCreds || {
    companyId: envCfg.companyId,
    username: envCfg.username,
    nationalID: envCfg.nationalID,
    password: envCfg.password,
  };
  const activeCreds = sanitizeCredentials(rawCreds);
  const needsNationalId = requiresNationalId(activeCreds.companyId);

  if (
    !activeCreds.companyId ||
    !activeCreds.username ||
    !activeCreds.password ||
    (needsNationalId && !activeCreds.nationalID)
  ) {
    throw new Error("Missing bank credentials for this user");
  }

  if (!isNodeVersionSupported()) {
    throw new Error(
      `Node ${process.versions.node} is not supported by israeli-bank-scrapers. Use Node >= 22.12.0`,
    );
  }

  const { createScraper } = await import("israeli-bank-scrapers");
  const { startDate } = oneMonthWindow();
  const scraper = createScraper({
    companyId: activeCreds.companyId,
    startDate,
    showBrowser: envCfg.showBrowser,
    verbose: envCfg.verbose,
  });

  const scrapeCredentials = {
    username: activeCreds.username,
    password: activeCreds.password,
    ...(needsNationalId ? { nationalID: activeCreds.nationalID } : {}),
  };

  const scrapeResult = await scraper.scrape(scrapeCredentials);

  if (!scrapeResult?.success) {
    const reason = [scrapeResult?.errorType, scrapeResult?.errorMessage]
      .filter(Boolean)
      .join(": ");
    throw new Error(
      reason || "Failed to scrape bank transactions",
    );
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
