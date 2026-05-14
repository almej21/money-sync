import Expense from "../models/Expense.js";
import Household from "../models/Household.js";
import {
  buildHouseholdConnectionVisibilityMap,
  resolveExpenseVisibilityForConnection,
} from "./expenseVisibility.js";
import { normalizeExpenseCategory } from "../utils/categoryNormalization.js";

const ENTRY_TYPE_SINGLE = "single";
const ENTRY_TYPE_STANDING = "standing";
const ENTRY_TYPE_PAYMENTS = "payments";
const ALLOWED_ENTRY_TYPES = new Set([
  ENTRY_TYPE_SINGLE,
  ENTRY_TYPE_STANDING,
  ENTRY_TYPE_PAYMENTS,
]);
const ALLOWED_AMOUNT_MODES = new Set(["total", "each"]);

function normalizeText(value) {
  return String(value || "").trim();
}

function parsePositiveAmount(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.abs(parsed);
}

function parseStrictDate(value) {
  const raw = normalizeText(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function normalizeDateOnly(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addMonths(date, monthsToAdd) {
  const d = new Date(date.getTime());
  d.setMonth(d.getMonth() + monthsToAdd);
  return d;
}

function buildMonthlyOccurrencesThroughCurrentMonth(firstDate, now = new Date()) {
  const start = normalizeDateOnly(firstDate);
  const current = normalizeDateOnly(now);
  const startMonthIndex = start.getFullYear() * 12 + start.getMonth();
  const currentMonthIndex = current.getFullYear() * 12 + current.getMonth();

  if (startMonthIndex > currentMonthIndex) {
    return [start];
  }

  const totalMonths = currentMonthIndex - startMonthIndex;
  const startDay = start.getDate();

  return Array.from({ length: totalMonths + 1 }, (_, index) => {
    const monthIndex = startMonthIndex + index;
    const year = Math.floor(monthIndex / 12);
    const month = monthIndex % 12;
    const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
    const day = Math.min(startDay, lastDayOfMonth);
    return new Date(year, month, day);
  });
}

function normalizeEntryType(value) {
  const normalized = normalizeText(value).toLowerCase();
  return ALLOWED_ENTRY_TYPES.has(normalized) ? normalized : "";
}

function resolveConnectionKey(body = {}) {
  const aliases = [
    "sourceConnectionKey",
    "connectionId",
    "bankConnectionId",
  ];
  for (const key of aliases) {
    const value = normalizeText(body?.[key]);
    if (value) return value;
  }
  return "";
}

function resolveEntryDate(body = {}, entryType = "") {
  const candidates =
    entryType === ENTRY_TYPE_SINGLE
      ? ["date", "expenseDate", "transactionDate"]
      : ["startDate", "firstDate", "date"];

  for (const key of candidates) {
    const parsed = parseStrictDate(body?.[key]);
    if (parsed) return parsed;
  }
  return null;
}

function resolvePaymentsCount(body = {}) {
  const raw = normalizeText(body?.paymentsCount || body?.numberOfPayments);
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 360) return null;
  return parsed;
}

function normalizeAmountMode(value) {
  const normalized = normalizeText(value).toLowerCase();
  return ALLOWED_AMOUNT_MODES.has(normalized) ? normalized : "";
}

function getEntryStatus(entryDate) {
  const today = normalizeDateOnly(new Date());
  const target = normalizeDateOnly(entryDate);
  return target.getTime() > today.getTime() ? "pending" : "posted";
}

function splitTotalAmount(totalAmount, paymentsCount) {
  const totalCents = Math.round(totalAmount * 100);
  const base = Math.floor(totalCents / paymentsCount);
  const remainder = totalCents - base * paymentsCount;
  return Array.from({ length: paymentsCount }, (_, index) => {
    const cents = index < remainder ? base + 1 : base;
    return cents / 100;
  });
}

function toValidationError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

export async function createManualExpensesForUser(user, payload = {}) {
  const householdId = user?.householdId;
  if (!householdId) {
    throw toValidationError("User is not linked to a household", 400);
  }

  const entryType = normalizeEntryType(payload?.entryType);
  if (!entryType) {
    throw toValidationError("entryType must be one of: single, standing, payments");
  }

  const sourceConnectionKey = resolveConnectionKey(payload);
  if (!sourceConnectionKey) {
    throw toValidationError("sourceConnectionKey is required");
  }

  const sourceAccountId = normalizeText(payload?.sourceAccountId);
  if (!sourceAccountId) {
    throw toValidationError("sourceAccountId is required");
  }

  const description = normalizeText(payload?.description);
  if (!description) {
    throw toValidationError("description is required");
  }

  const category = normalizeExpenseCategory(payload?.category, "Uncategorized");
  const amount = parsePositiveAmount(payload?.amount);
  if (!amount) {
    throw toValidationError("amount must be a positive number");
  }

  const entryDate = resolveEntryDate(payload, entryType);
  if (!entryDate) {
    if (entryType === ENTRY_TYPE_SINGLE) {
      throw toValidationError("date is required and must be a valid date");
    }
    throw toValidationError("startDate is required and must be a valid date");
  }

  const household = await Household.findById(householdId)
    .select("bankConnections")
    .lean();
  if (!household) {
    throw toValidationError("Household not found", 404);
  }

  const matchingConnection = (Array.isArray(household.bankConnections)
    ? household.bankConnections
    : []
  ).find((connection) => String(connection?._id || "") === sourceConnectionKey);
  if (!matchingConnection) {
    throw toValidationError("Bank connection not found", 404);
  }

  const connectionVisibilityMap = buildHouseholdConnectionVisibilityMap(household);
  const visibility = resolveExpenseVisibilityForConnection({
    sourceConnectionKey,
    sourceAccountId,
    connectionVisibilityMap,
    fallbackOwnerUserId: user?._id,
  });

  const base = {
    householdId,
    source: "manual",
    sourceCompanyId: normalizeText(matchingConnection?.companyId),
    sourceConnectionKey,
    sourceAccountId,
    sourceAccountName: "",
    visibilityScope: visibility.visibilityScope,
    visibleToUserId: visibility.visibleToUserId,
    currency: normalizeText(payload?.currency) || "₪",
    description,
    merchant: "",
    category,
    notes: normalizeText(payload?.notes || ""),
    tags: Array.isArray(payload?.tags) ? payload.tags : [],
    transactionType: "expense",
    createdBy: user?._id,
    editedBy: user?._id,
  };

  if (entryType === ENTRY_TYPE_SINGLE) {
    const status = getEntryStatus(entryDate);
    const created = await Expense.create({
      ...base,
      date: entryDate,
      amount,
      status,
      sourceTransactionType: "manual_single",
      processedDate: status === "posted" ? entryDate : null,
      installmentNumber: null,
      installmentTotal: null,
      isInstallmentCharged: null,
    });
    return {
      entryType,
      createdCount: 1,
      expenses: [created],
    };
  }

  const amountMode = normalizeAmountMode(payload?.amountMode);
  if (!amountMode) {
    throw toValidationError("amountMode must be one of: total, each");
  }

  if (entryType === ENTRY_TYPE_STANDING) {
    const standingDates = buildMonthlyOccurrencesThroughCurrentMonth(entryDate);
    const standingNotes = [base.notes, `standingAmountMode=${amountMode}`]
      .filter(Boolean)
      .join(" | ");

    const docs = standingDates.map((standingDate) => {
      const status = getEntryStatus(standingDate);
      return {
        ...base,
        date: standingDate,
        amount,
        status,
        sourceTransactionType: "standing_order",
        processedDate: status === "posted" ? standingDate : null,
        installmentNumber: null,
        installmentTotal: null,
        isInstallmentCharged: null,
        notes: standingNotes,
      };
    });
    const createdExpenses = await Expense.insertMany(docs, { ordered: true });

    return {
      entryType,
      createdCount: createdExpenses.length,
      expenses: createdExpenses,
    };
  }

  const paymentsCount = resolvePaymentsCount(payload);
  if (!paymentsCount) {
    throw toValidationError("numberOfPayments must be an integer between 1 and 360");
  }

  const installmentAmounts =
    amountMode === "total"
      ? splitTotalAmount(amount, paymentsCount)
      : Array.from({ length: paymentsCount }, () => amount);

  const docs = installmentAmounts.map((installmentAmount, index) => {
    const installmentDate = addMonths(entryDate, index);
    const status = getEntryStatus(installmentDate);
    return {
      ...base,
      date: installmentDate,
      amount: installmentAmount,
      status,
      sourceTransactionType: "installments",
      processedDate: status === "posted" ? installmentDate : null,
      installmentNumber: index + 1,
      installmentTotal: paymentsCount,
      isInstallmentCharged: status === "posted",
      notes: [base.notes, `paymentsAmountMode=${amountMode}`]
        .filter(Boolean)
        .join(" | "),
    };
  });

  const createdExpenses = await Expense.insertMany(docs, { ordered: true });
  return {
    entryType,
    createdCount: createdExpenses.length,
    expenses: createdExpenses,
  };
}

export async function listManualExpensesForUser(user, query = {}) {
  const householdId = user?.householdId;
  if (!householdId) {
    throw toValidationError("User is not linked to a household", 400);
  }

  const sourceConnectionKey = resolveConnectionKey(query);
  if (!sourceConnectionKey) {
    throw toValidationError("sourceConnectionKey is required");
  }
  const sourceAccountId = normalizeText(query?.sourceAccountId);

  const filter = {
    householdId,
    source: "manual",
    sourceConnectionKey,
  };
  if (sourceAccountId) {
    filter.sourceAccountId = sourceAccountId;
  }

  const expenses = await Expense.find(filter).sort({ date: -1, createdAt: -1 });
  return expenses;
}

export async function updateManualExpenseForUser(user, expenseId, payload = {}) {
  const householdId = user?.householdId;
  if (!householdId) {
    throw toValidationError("User is not linked to a household", 400);
  }

  const id = normalizeText(expenseId);
  if (!id) {
    throw toValidationError("Expense id is required");
  }

  const expense = await Expense.findOne({
    _id: id,
    householdId,
    source: "manual",
  });
  if (!expense) {
    throw toValidationError("Manual expense not found", 404);
  }

  let hasChanges = false;
  if (Object.hasOwn(payload, "description")) {
    const nextDescription = normalizeText(payload?.description);
    if (!nextDescription) {
      throw toValidationError("description is required");
    }
    if (nextDescription !== expense.description) {
      expense.description = nextDescription;
      hasChanges = true;
    }
  }

  if (Object.hasOwn(payload, "category")) {
    const nextCategory = normalizeExpenseCategory(
      payload?.category,
      "Uncategorized",
    );
    if (nextCategory !== expense.category) {
      expense.category = nextCategory;
      hasChanges = true;
    }
  }

  if (Object.hasOwn(payload, "amount")) {
    const nextAmount = parsePositiveAmount(payload?.amount);
    if (!nextAmount) {
      throw toValidationError("amount must be a positive number");
    }
    if (nextAmount !== Number(expense.amount || 0)) {
      expense.amount = nextAmount;
      hasChanges = true;
    }
  }

  if (Object.hasOwn(payload, "date")) {
    const nextDate = parseStrictDate(payload?.date);
    if (!nextDate) {
      throw toValidationError("date must be a valid date");
    }
    const currentDate = expense.date ? new Date(expense.date) : null;
    const currentTime = currentDate ? currentDate.getTime() : 0;
    if (!currentDate || Number.isNaN(currentTime) || currentTime !== nextDate.getTime()) {
      expense.date = nextDate;
      hasChanges = true;
    }
  }

  if (!hasChanges) return expense;

  expense.editedBy = user?._id || expense.editedBy;
  expense.isUserAltered = true;
  await expense.save();
  return expense;
}

export async function deleteManualExpenseForUser(user, expenseId) {
  const householdId = user?.householdId;
  if (!householdId) {
    throw toValidationError("User is not linked to a household", 400);
  }

  const id = normalizeText(expenseId);
  if (!id) {
    throw toValidationError("Expense id is required");
  }

  const deleted = await Expense.findOneAndDelete({
    _id: id,
    householdId,
    source: "manual",
  });
  if (!deleted) {
    throw toValidationError("Manual expense not found", 404);
  }

  return { success: true };
}
