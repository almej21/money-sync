import Expense from "../models/Expense.js";
import { normalizeScrapedTransactions } from "./bankImporter.js";
import { decryptValue } from "./credentialCrypto.js";

function parseBoolean(value) {
  return String(value).toLowerCase() === "true";
}

function isNodeVersionSupported() {
  const major = Number(process.versions.node.split(".")[0] || 0);
  return major >= 22;
}

function getConfig() {
  return {
    enabled: parseBoolean(process.env.BANK_SCRAPER_ENABLED),
    companyId: process.env.BANK_COMPANY_ID,
    username: process.env.BANK_USERNAME,
    nationalID: process.env.BANK_NATIONAL_ID,
    password: process.env.BANK_PASSWORD,
  };
}

function getUserCredentials(user) {
  const creds = user?.bankCredentials;
  if (
    !creds?.companyId ||
    !creds?.usernameEnc ||
    !creds?.nationalIdEnc ||
    !creds?.passwordEnc
  ) {
    return null;
  }

  return {
    companyId: creds.companyId,
    username: decryptValue(creds.usernameEnc),
    nationalID: decryptValue(creds.nationalIdEnc),
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
  const activeCreds = userCreds || {
    companyId: envCfg.companyId,
    username: envCfg.username,
    nationalID: envCfg.nationalID,
    password: envCfg.password,
  };

  if (
    !activeCreds.companyId ||
    !activeCreds.username ||
    !activeCreds.nationalID ||
    !activeCreds.password
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
    showBrowser: false,
  });

  const scrapeResult = await scraper.scrape({
    username: activeCreds.username,
    nationalID: activeCreds.nationalID,
    password: activeCreds.password,
  });

  if (!scrapeResult?.success) {
    throw new Error(
      scrapeResult?.errorType || "Failed to scrape bank transactions",
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
