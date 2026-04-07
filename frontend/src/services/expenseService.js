import { api } from "../api";

export async function getExpenses() {
  return api("/expenses");
}

export async function getExpenseChanges(sinceCursor) {
  const encodedCursor = encodeURIComponent(String(sinceCursor || "").trim());
  return api(`/expenses/changes?since=${encodedCursor}`);
}

export async function getExpenseSyncStatus() {
  return api("/expenses/sync-status");
}

export async function updateExpense(expenseId, payload) {
  return api(`/expenses/${expenseId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}
