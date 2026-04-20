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

function resolveTransactionType(rawAmount) {
  return Number(rawAmount) > 0 ? "return" : "expense";
}

function normalizeExpenseStatus(statusValue) {
  return String(statusValue || "").trim().toLowerCase() === "pending"
    ? "pending"
    : "posted";
}

export function normalizeScrapedTransactions(scraped = []) {
  return scraped.map((t) => {
    const rawAmount = resolveTransactionAmount(t);
    const amount = Math.abs(Number(rawAmount) || 0);
    const transactionType = resolveTransactionType(rawAmount);

    return {
      source: "israeli-bank-scrapers",
      externalId:
        t.identifier || t.id || `${t.date}-${t.description}-${t.chargedAmount}`,
      date: t.date,
      amount,
      transactionType,
      status: normalizeExpenseStatus(t.status),
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
        amount,
        transactionType,
        currency: "₪",
        description: t.description || t.memo || "Bank transaction",
        merchant: t.description || "",
        sourceCompanyId: t.companyId || "",
        sourceAccountId: t.accountNumber || t.accountId || "",
        sourceAccountName: t.accountName || "",
      }),
    };
  });
}
