import localities from "../data/israel-localities.json" with { type: "json" };

// CBS locality dictionary, latest year available when imported (2024).
// Preserve exact name matching for locations absent from the dictionary.
const codesByValue = new Map();
const namesByCode = new Map(localities.map((locality) => [locality.id, locality.name]));
const normalize = (value) => String(value).trim().toLocaleLowerCase();
for (const locality of localities) {
  for (const value of [locality.id, locality.name, locality.english]) {
    if (typeof value !== "string" || !value.trim()) continue;
    const key = normalize(value);
    if (!codesByValue.has(key)) codesByValue.set(key, new Set());
    codesByValue.get(key).add(locality.id);
  }
}

export function localityName(value) {
  if (typeof value !== "string" || !/^\d+$/.test(value.trim())) return value ?? null;
  const code = value.trim().replace(/^0+(?=\d)/, "");
  return namesByCode.get(code) ?? value;
}

export function sameLocality(first, second) {
  if (typeof first !== "string" || typeof second !== "string") return false;
  const a = normalize(first), b = normalize(second);
  if (!a || !b) return false;
  if (a === b) return true;
  const aCodes = codesByValue.get(a), bCodes = codesByValue.get(b);
  if (!aCodes || !bCodes) return false;
  for (const code of aCodes) if (bCodes.has(code)) return true;
  return false;
}
