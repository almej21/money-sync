const CATEGORY_ALIASES = new Map([
  ["מזון ומשקאות", "מזון וצריכה"],
  ["עיצוב הבית", "ריהוט ובית"],
  ["מסעדות", "מסעדות, קפה וברים"],
]);

export function normalizeExpenseCategory(categoryValue, fallback = "") {
  const raw = String(categoryValue || "").trim();
  if (!raw) return fallback;
  return CATEGORY_ALIASES.get(raw) || raw;
}
