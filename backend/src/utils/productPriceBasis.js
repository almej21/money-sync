// PriceIL weighted prices are treated as the price for one kilogram.
export function priceBasis(product) {
  if (product?.isWeighted === true) return { key: "kg", type: "kg" };
  if (product?.isWeighted !== false) return null;
  const quantity = Number(product.quantity);
  const unit = typeof product.unitQty === "string" ? product.unitQty.trim() : "";
  const count = Number(product.qtyInPackage);
  if (!Number.isFinite(quantity) || quantity <= 0 || !unit || !Number.isSafeInteger(count) || count <= 0) return null;
  return { key: `package:${quantity}:${unit}:${count}`, type: "package", quantity, unit, count };
}

// Only infer within an exact-name selection, never across unrelated products.
function mostCommon(products, field) {
  const counts = new Map();
  for (const product of products) {
    const value = product[field];
    if (value == null || String(value).trim() === "") continue;
    const key = String(value).trim();
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const sorted = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "en"));
  return sorted[0]?.[0] ?? null;
}
export function effectivePriceProducts(products) {
  const names = products.map((p) => p?.itemName);
  const mixed = products.some((p) => p?.isWeighted === true) && products.some((p) => p?.isWeighted === false);
  if (!mixed || names.some((name) => typeof name !== "string" || !name.trim() || name !== names[0])) return products;
  const unitQty = mostCommon(products, "unitQty");
  const quantity = mostCommon(products, "quantity");
  return products.map((product) => ({ ...product, isWeighted: true, unitQty, quantity, inferredWeighted: true }));
}
