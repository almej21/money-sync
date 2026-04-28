import crypto from "crypto";

function normalizeText(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeAmount(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "0.00";
  return numeric.toFixed(2);
}

function normalizeDate(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(parsed);
}

function toDayRange(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  // Use UTC day boundaries so fallback matching is stable across server
  // timezone settings and provider timestamps that may land near midnight.
  const dayStart = new Date(parsed);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(parsed);
  dayEnd.setUTCHours(23, 59, 59, 999);
  return { dayStart, dayEnd };
}

function addUtcDays(value, days) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const next = new Date(parsed);
  next.setUTCDate(next.getUTCDate() + Number(days || 0));
  return next;
}

function connectionScope(connectionKey) {
  const normalizedConnectionKey = String(connectionKey || "").trim();
  if (!normalizedConnectionKey) {
    return {
      $or: [
        { sourceConnectionKey: "" },
        { sourceConnectionKey: { $exists: false } },
      ],
    };
  }

  return {
    $or: [
      { sourceConnectionKey: normalizedConnectionKey },
      { sourceConnectionKey: "" },
      { sourceConnectionKey: { $exists: false } },
    ],
  };
}

export function createExpenseDedupKey(expense = {}) {
  const raw = [
    normalizeDate(expense.date),
    normalizeAmount(expense.amount),
    normalizeText(expense.transactionType || "expense"),
    normalizeText(expense.currency),
    normalizeText(expense.description),
    normalizeText(expense.merchant),
    normalizeText(expense.sourceCompanyId),
    normalizeText(expense.sourceAccountId),
    normalizeText(expense.sourceAccountName),
    normalizeText(expense.installmentNumber),
    normalizeText(expense.installmentTotal),
    normalizeText(expense.isInstallmentCharged),
  ].join("|");

  return crypto.createHash("sha256").update(raw).digest("hex");
}

export function buildExpenseUpsertFilter(expense = {}) {
  const filter = {
    householdId: expense.householdId,
    source: expense.source,
  };

  const identityClauses = [];
  const normalizedDedupKey = String(expense.dedupKey || "").trim();
  const normalizedExternalId = String(expense.externalId || "").trim();
  const normalizedTransactionType = String(
    expense.transactionType || "expense",
  )
    .trim()
    .toLowerCase();
  const normalizedExpenseTransactionType =
    normalizedTransactionType === "return" ? "return" : "expense";

  if (normalizedDedupKey) {
    identityClauses.push({ dedupKey: normalizedDedupKey });
  }
  // Always include externalId as an alternative identity clause.
  // We also scope by transactionType to avoid collapsing provider rows
  // that may reuse the same externalId for opposite directions.
  if (normalizedExternalId) {
    identityClauses.push({
      externalId: normalizedExternalId,
      transactionType: normalizedExpenseTransactionType,
    });
  }

  const normalizedDate = normalizeDate(expense.date);
  const dayRange = toDayRange(expense.date);
  const fallbackStartDate = dayRange
    ? addUtcDays(dayRange.dayStart, -1)
    : null;
  const fallbackEndDate = dayRange ? addUtcDays(dayRange.dayEnd, 1) : null;
  const dayStartIso = fallbackStartDate ? fallbackStartDate.toISOString() : "";
  const dayEndIso = fallbackEndDate ? fallbackEndDate.toISOString() : "";
  const normalizedAmount = Number(expense.amount);
  const normalizedMerchant = String(expense.merchant || "").trim();
  const normalizedDescription = String(expense.description || "").trim();

  // Legacy fallback to converge old rows that were created before dedupKey existed.
  if (
    normalizedDate &&
    dayRange &&
    Number.isFinite(normalizedAmount)
  ) {
    identityClauses.push({
      amount: normalizedAmount,
      transactionType: normalizedExpenseTransactionType,
      sourceCompanyId: String(expense.sourceCompanyId || "").trim(),
      sourceAccountId: String(expense.sourceAccountId || "").trim(),
      $or: [
        { merchant: normalizedMerchant },
        { description: normalizedDescription },
      ],
      // Support both BSON Date and ISO string legacy `date` values without
      // using $expr (Mongo does not allow $expr in upsert predicates).
      $or: [
        {
          date: {
            $gte: fallbackStartDate,
            $lte: fallbackEndDate,
          },
        },
        {
          date: {
            $gte: dayStartIso,
            $lte: dayEndIso,
          },
        },
      ],
    });
  }

  const andClauses = [connectionScope(expense.sourceConnectionKey)];
  if (identityClauses.length > 0) {
    andClauses.push({ $or: identityClauses });
  }

  if (andClauses.length > 0) {
    filter.$and = andClauses;
  }

  return filter;
}
