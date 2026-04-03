import { createExpenseDedupKey } from "./expenseDedup.js";

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveTransactionAmount(transaction = {}) {
  const chargedAmount = toNumber(transaction.chargedAmount);
  if (chargedAmount != null && chargedAmount !== 0) {
    return chargedAmount;
  }

  const originalAmount = toNumber(transaction.originalAmount);
  if (originalAmount != null) {
    return originalAmount;
  }

  const directAmount = toNumber(transaction.amount);
  if (directAmount != null) {
    return directAmount;
  }

  return 0;
}

export function normalizeScrapedTransactions(scraped = []) {
  return scraped.map((t) => ({
    source: "israeli-bank-scrapers",
    externalId:
      t.identifier || t.id || `${t.date}-${t.description}-${t.chargedAmount}`,
    date: t.date,
    amount: resolveTransactionAmount(t),
    currency: "₪",
    description: t.description || t.memo || "Bank transaction",
    merchant: t.description || "",
    category:
      typeof t.category === "string" && t.category.trim()
        ? t.category.trim()
        : "Imported",
    tags: [],
    dedupKey: createExpenseDedupKey({
      date: t.date,
      amount: resolveTransactionAmount(t),
      currency: "₪",
      description: t.description || t.memo || "Bank transaction",
      merchant: t.description || "",
      sourceCompanyId: t.companyId || "",
      sourceAccountId: t.accountNumber || t.accountId || "",
      sourceAccountName: t.accountName || "",
    }),
  }));
}
