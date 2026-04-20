import Expense from "../models/Expense.js";
import Household from "../models/Household.js";
import { normalizeScrapedTransactions } from "../services/bankImporter.js";
import {
  buildExpenseUpsertFilter,
  createExpenseDedupKey,
} from "../services/expenseDedup.js";
import {
  getExpenseSyncState,
  triggerExpenseSyncForUser,
} from "../services/expenseSyncCoordinator.js";

function normalizeExpenseStatus(statusValue) {
  return String(statusValue || "").trim().toLowerCase() === "pending"
    ? "pending"
    : "posted";
}

function toIso(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function latestIso(...values) {
  const dates = values
    .map((value) => {
      const parsed = value ? new Date(value) : null;
      return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
    })
    .filter(Boolean);

  if (!dates.length) return null;
  const latest = dates.reduce((max, current) =>
    current.getTime() > max.getTime() ? current : max,
  );
  return latest.toISOString();
}

async function getGlobalSyncStateForHousehold(householdId) {
  if (!householdId) return null;

  const household = await Household.findById(householdId)
    .select(
      "bankSync.lockUntil bankSync.lockOwner bankSync.lastStartedAt bankSync.lastCompletedAt bankSync.lastReason",
    )
    .lean();
  if (!household?.bankSync) return null;

  const lockUntilDate = household.bankSync.lockUntil
    ? new Date(household.bankSync.lockUntil)
    : null;
  const hasActiveLock =
    Boolean(String(household.bankSync.lockOwner || "").trim()) &&
    Boolean(lockUntilDate) &&
    !Number.isNaN(lockUntilDate.getTime()) &&
    lockUntilDate.getTime() > Date.now();

  return {
    running: hasActiveLock,
    lastStartedAt: toIso(household.bankSync.lastStartedAt),
    lastCompletedAt: toIso(household.bankSync.lastCompletedAt),
    lastReason: String(household.bankSync.lastReason || "").trim() || null,
  };
}

async function getMergedSyncState(user) {
  const inMemory = getExpenseSyncState(user?._id);
  const global = await getGlobalSyncStateForHousehold(user?.householdId);

  const running = Boolean(inMemory?.running || global?.running);
  const lastStartedAt = latestIso(inMemory?.lastStartedAt, global?.lastStartedAt);
  const lastCompletedAt = latestIso(
    inMemory?.lastCompletedAt,
    global?.lastCompletedAt,
  );

  return {
    running,
    lastStartedAt,
    lastCompletedAt,
    lastError: inMemory?.lastError || null,
    lastResult:
      inMemory?.lastResult ||
      (global?.lastReason ? { reason: global.lastReason } : null),
    lastTriggerReason:
      inMemory?.lastTriggerReason || global?.lastReason || null,
  };
}

export async function listExpenses(req, res) {
  triggerExpenseSyncForUser(req.user, "list_expenses");
  const expenses = await Expense.find({
    householdId: req.user.householdId,
  }).sort({ date: -1, createdAt: -1 });

  res.json(expenses);
}

export async function listExpenseChanges(req, res) {
  triggerExpenseSyncForUser(req.user, "list_expense_changes");
  const sinceRaw = String(req.query?.since || "").trim();
  const sinceDate = sinceRaw ? new Date(sinceRaw) : null;

  if (!sinceDate || Number.isNaN(sinceDate.getTime())) {
    return res.status(400).json({ message: "Invalid since cursor" });
  }

  const items = await Expense.find({
    householdId: req.user.householdId,
    updatedAt: { $gt: sinceDate },
  }).sort({ updatedAt: 1, _id: 1 });

  const latestUpdatedAt =
    items.length > 0
      ? items[items.length - 1]?.updatedAt
      : sinceDate;

  res.json({
    items,
    cursor: latestUpdatedAt ? new Date(latestUpdatedAt).toISOString() : sinceRaw,
    serverTime: new Date().toISOString(),
  });
}

export async function syncStatus(req, res) {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");

  const stateBefore = await getMergedSyncState(req.user);
  if (
    !stateBefore.running &&
    !stateBefore.lastStartedAt &&
    !stateBefore.lastCompletedAt
  ) {
    await triggerExpenseSyncForUser(req.user, "sync_status", {
      awaitCompletion: true,
      timeoutMs: 12000,
    });
  }

  res.json({
    sync: await getMergedSyncState(req.user),
  });
}

export async function summary(req, res) {
  triggerExpenseSyncForUser(req.user, "summary");

  const rows = await Expense.aggregate([
    { $match: { householdId: req.user.householdId } },
    {
      $group: {
        _id: "$category",
        total: {
          $sum: {
            $cond: [
              {
                $eq: ["$transactionType", "return"],
              },
              { $multiply: [{ $abs: "$amount" }, -1] },
              "$amount",
            ],
          },
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { total: -1 } },
  ]);

  res.json(rows);
}

export async function createExpense(req, res) {
  const normalizedAmount = Math.abs(Number(req.body.amount || 0));
  const transactionType =
    String(req.body.transactionType || "").trim().toLowerCase() === "return"
      ? "return"
      : "expense";
  const status = normalizeExpenseStatus(req.body.status);
  const expense = await Expense.create({
    householdId: req.user.householdId,
    source: req.body.source || "manual",
    externalId: req.body.externalId,
    date: req.body.date,
    amount: normalizedAmount,
    transactionType,
    status,
    currency: req.body.currency || "₪",
    description: req.body.description,
    merchant: req.body.merchant || "",
    category: req.body.category || "General",
    notes: req.body.notes || "",
    tags: req.body.tags || [],
    createdBy: req.user._id,
    editedBy: req.user._id,
  });

  res.status(201).json(expense);
}

export async function updateExpense(req, res) {
  const expense = await Expense.findOne({
    _id: req.params.id,
    householdId: req.user.householdId,
  });

  if (!expense) {
    return res.status(404).json({ message: "Expense not found" });
  }

  const hasDescription = Object.hasOwn(req.body || {}, "description");
  const hasCategory = Object.hasOwn(req.body || {}, "category");
  if (!hasDescription && !hasCategory) {
    return res
      .status(400)
      .json({ message: "At least one of description or category is required" });
  }

  let hasChanged = false;

  if (hasDescription) {
    const nextDescription = String(req.body.description || "").trim();
    if (!nextDescription) {
      return res.status(400).json({ message: "Description is required" });
    }
    if (nextDescription !== expense.description) {
      hasChanged = true;
      expense.description = nextDescription;
    }
  }

  if (hasCategory) {
    const nextCategory =
      String(req.body.category || "").trim() || "Uncategorized";
    if (nextCategory !== expense.category) {
      hasChanged = true;
      expense.category = nextCategory;
    }
  }

  expense.editedBy = req.user._id;
  if (hasChanged) {
    expense.isUserAltered = true;
  }
  await expense.save();

  res.json(expense);
}

export async function deleteExpense(req, res) {
  const deleted = await Expense.findOneAndDelete({
    _id: req.params.id,
    householdId: req.user.householdId,
  });

  if (!deleted) {
    return res.status(404).json({ message: "Expense not found" });
  }

  res.json({ success: true });
}

export async function importExpenses(req, res) {
  const rawTransactions = Array.isArray(req.body?.transactions)
    ? req.body.transactions
    : [];

  const normalized = normalizeScrapedTransactions(rawTransactions).map((t) => {
    const normalizedAmount = Math.abs(Number(t.amount || 0));
    const transactionType =
      t.transactionType === "return" ? "return" : "expense";
    const status = normalizeExpenseStatus(t.status);
    return {
      ...t,
      amount: normalizedAmount,
      transactionType,
      status,
      dedupKey: createExpenseDedupKey({
        ...t,
        amount: normalizedAmount,
        transactionType,
      }),
      householdId: req.user.householdId,
      createdBy: req.user._id,
      editedBy: req.user._id,
    };
  });

  if (normalized.length === 0) {
    return res.json({ imported: 0, items: [] });
  }

  const ops = normalized.map((doc) => ({
    updateOne: {
      filter: buildExpenseUpsertFilter(doc),
      update: [
        {
          $set: {
            householdId: doc.householdId,
            source: doc.source,
            externalId: doc.externalId,
            sourceCompanyId: doc.sourceCompanyId,
            sourceConnectionKey: doc.sourceConnectionKey,
            sourceAccountId: doc.sourceAccountId,
            sourceAccountName: doc.sourceAccountName,
            dedupKey: doc.dedupKey,
            date: doc.date,
            amount: doc.amount,
            transactionType: doc.transactionType,
            status: doc.status,
            currency: doc.currency,
            merchant: doc.merchant,
            notes: doc.notes,
            tags: doc.tags,
            description: {
              $cond: [
                { $eq: ["$isUserAltered", true] },
                "$description",
                { $literal: doc.description },
              ],
            },
            category: {
              $cond: [
                { $eq: ["$isUserAltered", true] },
                "$category",
                { $literal: doc.category },
              ],
            },
            createdBy: { $ifNull: ["$createdBy", doc.createdBy] },
            editedBy: {
              $cond: [
                { $eq: ["$isUserAltered", true] },
                "$editedBy",
                doc.editedBy,
              ],
            },
          },
        },
      ],
      upsert: true,
    },
  }));

  const result = await Expense.bulkWrite(ops, { ordered: false });
  const imported = Number(result.upsertedCount || 0);
  const updated = Number(result.modifiedCount || 0);

  res.status(201).json({ imported, updated, total: normalized.length });
}
