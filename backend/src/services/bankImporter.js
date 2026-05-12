import { createExpenseDedupKey } from "./expenseDedup.js";
import { normalizeExpenseCategory } from "../utils/categoryNormalization.js";

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

function normalizeSourceTransactionType(typeValue) {
  const normalized = String(typeValue || "")
    .trim()
    .toLowerCase();
  return normalized || "normal";
}

function normalizeInstallments(installmentsValue) {
  if (!installmentsValue || typeof installmentsValue !== "object") {
    return { number: null, total: null };
  }

  const number = toNumber(installmentsValue.number);
  const total = toNumber(installmentsValue.total);
  const normalizedNumber = Number.isFinite(number) && number > 0 ? number : null;
  const normalizedTotal = Number.isFinite(total) && total > 0 ? total : null;
  if (normalizedNumber == null || normalizedTotal == null) {
    return { number: null, total: null };
  }

  return { number: normalizedNumber, total: normalizedTotal };
}

function resolveExternalId(transaction = {}, normalizedInstallments = {}) {
  const explicitId = String(transaction.identifier || transaction.id || "").trim();
  if (explicitId) return explicitId;

  const legacyFallback = `${transaction.date}-${transaction.description}-${transaction.chargedAmount}`;
  if (legacyFallback && !legacyFallback.includes("undefined")) {
    return legacyFallback;
  }
  return `${transaction.date}-${transaction.description}-${normalizedInstallments.number || ""}-${normalizedInstallments.total || ""}`;
}

export function normalizeScrapedTransactions(scraped = []) {
  return scraped.map((t) => {
    const rawAmount = resolveTransactionAmount(t);
    const amount = Math.abs(Number(rawAmount) || 0);
    const transactionType = resolveTransactionType(rawAmount);
    const sourceTransactionType = normalizeSourceTransactionType(t.type);
    const installments = normalizeInstallments(t.installments);
    const hasInstallmentsPlan =
      Number.isFinite(installments.number) &&
      installments.number > 0 &&
      Number.isFinite(installments.total) &&
      installments.total > 0;
    const isInstallmentCharged =
      sourceTransactionType === "installments" ? hasInstallmentsPlan : null;

    return {
      source: "israeli-bank-scrapers",
      externalId: resolveExternalId(t, installments),
      date: t.date,
      processedDate: t.processedDate || null,
      amount,
      transactionType,
      status: normalizeExpenseStatus(t.status),
      currency: "₪",
      description: t.description || t.memo || "Bank transaction",
      merchant: t.description || "",
      sourceTransactionType,
      installmentNumber: installments.number,
      installmentTotal: installments.total,
      isInstallmentCharged,
      category: normalizeExpenseCategory(t.category, "Imported"),
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
        sourceTransactionType,
        installmentNumber: installments.number,
        installmentTotal: installments.total,
        isInstallmentCharged,
      }),
    };
  });
}
