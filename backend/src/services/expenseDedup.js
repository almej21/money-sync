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
  return parsed.toISOString();
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

  if (normalizedDedupKey) {
    identityClauses.push({ dedupKey: normalizedDedupKey });
  }
  if (normalizedExternalId) {
    identityClauses.push({ externalId: normalizedExternalId });
  }

  const normalizedDate = normalizeDate(expense.date);
  const normalizedAmount = Number(expense.amount);
  const normalizedDescription = String(expense.description || "").trim();

  // Legacy fallback to converge old rows that were created before dedupKey existed.
  if (
    normalizedDate &&
    Number.isFinite(normalizedAmount) &&
    normalizedDescription
  ) {
    identityClauses.push({
      date: new Date(normalizedDate),
      amount: normalizedAmount,
      description: normalizedDescription,
      sourceCompanyId: String(expense.sourceCompanyId || "").trim(),
      sourceAccountId: String(expense.sourceAccountId || "").trim(),
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
