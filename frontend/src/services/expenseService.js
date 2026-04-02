import { api } from "../api";

export async function getExpenses() {
  return api("/expenses");
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
