import { createExpenseDedupKey } from "./expenseDedup.js";
import { normalizeExpenseCategory } from "../utils/categoryNormalization.js";

const SUPERMARKET_SOURCE_CATEGORIES = new Set([
  "מזון ומשקאות",
  "מזון וצריכה",
]);
const SUPERMARKET_TARGET_CATEGORY = "סופרמרקט";
const FALLBACK_DESCRIPTION = "Expense with no name";

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

function resolveImportedCategory({
  rawCategory,
  normalizedCategory,
}) {
  const raw = String(rawCategory || "").trim();
  const normalized = String(normalizedCategory || "").trim();
  if (
    SUPERMARKET_SOURCE_CATEGORIES.has(raw) ||
    SUPERMARKET_SOURCE_CATEGORIES.has(normalized)
  ) {
    return SUPERMARKET_TARGET_CATEGORY;
  }

  return normalizedCategory;
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

function resolveTransactionDescription(transaction = {}) {
  const description = String(transaction.description || "").trim();
  return description || FALLBACK_DESCRIPTION;
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
    const status = normalizeExpenseStatus(t.status);
    const sourceTransactionType = normalizeSourceTransactionType(t.type);
    const installments = normalizeInstallments(t.installments);
    const hasInstallmentsPlan =
      Number.isFinite(installments.number) &&
      installments.number > 0 &&
      Number.isFinite(installments.total) &&
      installments.total > 0;
    const isInstallmentCharged =
      sourceTransactionType === "installments" ? hasInstallmentsPlan : null;

    const normalizedCategory = normalizeExpenseCategory(t.category, "Imported");
    const description = resolveTransactionDescription(t);
    const merchant = String(t.description || "").trim();

    return {
      source: "israeli-bank-scrapers",
      externalId: resolveExternalId(t, installments),
      date: t.date,
      processedDate: t.processedDate || null,
      amount,
      transactionType,
      status,
      currency: "₪",
      description,
      merchant,
      sourceTransactionType,
      installmentNumber: installments.number,
      installmentTotal: installments.total,
      isInstallmentCharged,
      category: resolveImportedCategory({
        rawCategory: t.category,
        normalizedCategory,
      }),
      tags: [],
      dedupKey: createExpenseDedupKey({
        date: t.date,
        amount,
        transactionType,
        currency: "₪",
        description,
        merchant,
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
