import Expense from "../models/Expense.js";
import { normalizeScrapedTransactions } from "../services/bankImporter.js";
import { syncLastMonthExpensesForUser } from "../services/bankSyncService.js";

export async function listExpenses(req, res) {
  const expenses = await Expense.find({
    householdId: req.user.householdId,
  }).sort({ date: -1, createdAt: -1 });

  res.json(expenses);
}

export async function summary(req, res) {
  try {
    const syncResult = await syncLastMonthExpensesForUser(req.user);
    if (syncResult.reason !== "disabled") {
      console.log(
        `[SUCCESS] Bank sync for user ${req.user._id}: imported=${syncResult.imported || 0} updated=${syncResult.updated || 0} total=${syncResult.total || 0}`,
      );
    }
  } catch (err) {
    console.error(
      `[ERROR] Bank sync failed for user ${req.user._id}: ${err.message}`,
    );
  }

  const rows = await Expense.aggregate([
    { $match: { householdId: req.user.householdId } },
    {
      $group: {
        _id: "$category",
        total: { $sum: "$amount" },
        count: { $sum: 1 },
      },
    },
    { $sort: { total: -1 } },
  ]);

  res.json(rows);
}

export async function createExpense(req, res) {
  const expense = await Expense.create({
    householdId: req.user.householdId,
    source: req.body.source || "manual",
    externalId: req.body.externalId,
    date: req.body.date,
    amount: req.body.amount,
    currency: req.body.currency || "ILS",
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
  const expense = await Expense.findOneAndUpdate(
    { _id: req.params.id, householdId: req.user.householdId },
    { ...req.body, editedBy: req.user._id },
    { new: true },
  );

  if (!expense) {
    return res.status(404).json({ message: "Expense not found" });
  }

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

  const normalized = normalizeScrapedTransactions(rawTransactions).map((t) => ({
    ...t,
    householdId: req.user.householdId,
    createdBy: req.user._id,
    editedBy: req.user._id,
  }));

  if (normalized.length === 0) {
    return res.json({ imported: 0, items: [] });
  }

  const inserted = await Expense.insertMany(normalized, { ordered: false });
  res.status(201).json({ imported: inserted.length, items: inserted });
}
