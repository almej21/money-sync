export const canonicalProducts = [{
  id: "fresh-salmon-fillet",
  name: "פילה סלמון טרי",
  aliases: ["פילה סלמון", "סלמון פילה", "פילה סלמון טרי"],
  productNames: ["דג פילה סלמון טרי", "מנות פילה סלמון טרי", "נתחי פילה סלמון טרי", "פילה סלמון טרי", "פילה סלמון טרי ארוז", "מנות פילה סלמון טרי ארוז"],
}];
const normalize = (s) => String(s || "").trim().replace(/\s+/g, " ").toLocaleLowerCase();
export const findCanonical = (query) => canonicalProducts.filter((p) => p.aliases.some((alias) => normalize(alias).includes(normalize(query))));
export const getCanonical = (id) => canonicalProducts.find((p) => p.id === id);
export function canonicalCandidates(mapping, result) {
  const names = new Set(mapping.productNames.map(normalize));
  const groups = [result?.bestMatch, ...(Array.isArray(result?.allOthers) ? result.allOthers : [])];
  const candidates = new Map();
  for (const group of groups) for (const product of group?.products || []) {
    if (typeof product?.itemCode === "string" && /^\d{1,20}$/.test(product.itemCode) && names.has(normalize(product.itemName))) candidates.set(product.itemCode, product);
  }
  return [...candidates.values()];
}
