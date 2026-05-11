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

export async function createManualExpense(payload) {
  return api("/expenses/manual", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listManualExpenses(sourceConnectionKey, sourceAccountId) {
  const connection = encodeURIComponent(String(sourceConnectionKey || "").trim());
  const account = encodeURIComponent(String(sourceAccountId || "").trim());
  return api(
    `/expenses/manual?sourceConnectionKey=${connection}&sourceAccountId=${account}`,
  );
}

export async function updateManualExpense(expenseId, payload) {
  return api(`/expenses/manual/${expenseId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function deleteManualExpense(expenseId) {
  return api(`/expenses/manual/${expenseId}`, {
    method: "DELETE",
  });
}
