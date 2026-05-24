const CATEGORY_ALIASES = new Map([
  ["מזון ומשקאות", "סופרמרקט"],
  ["מזון וצריכה", "סופרמרקט"],
  ["עיצוב הבית", "ריהוט ובית"],
  ["מסעדות", "מסעדות, קפה וברים"],
]);

export function normalizeExpenseCategory(categoryValue, fallback = "") {
  const raw = String(categoryValue || "").trim();
  if (!raw) return fallback;
  return CATEGORY_ALIASES.get(raw) || raw;
}
