export const FALLBACK_EXPENSE_DESCRIPTION = "Expense with no name";

export function formatExpenseDescription(description, t) {
  const normalized = String(description || "").trim();
  if (!normalized || normalized === FALLBACK_EXPENSE_DESCRIPTION) {
    return typeof t === "function"
      ? t("expenseWithNoName")
      : FALLBACK_EXPENSE_DESCRIPTION;
  }
  return normalized;
}
