import { effectivePriceProducts, priceBasis } from "../utils/productPriceBasis.js";
import { getProductPrices } from "./priceil.service.js";
import { sameLocality } from "../utils/localityMatching.js";

const MAX_BARCODES = 100;
const money = (cents) => (cents / 100).toFixed(2);
function cents(value) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value));
  if (!match) return null;
  const result = Number(match[1]) * 100 + Number((match[2] || "").padEnd(2, "0"));
  return Number.isSafeInteger(result) ? result : null;
}
const normalize = (value) => value.trim().toLocaleLowerCase();
function matches(store, filters) {
  return (!filters.cities || filters.cities.some((city) => sameLocality(store.city, city))) &&
    (!filters.city || sameLocality(store.city, filters.city)) &&
    (!filters.chain || (typeof store.chain === "string" && normalize(store.chain) === normalize(filters.chain))) &&
    (!filters.storeIds || filters.storeIds.includes(String(store.storeId)));
}

// The caller supplies a populated, owner-checked list.
export async function compareBasket(list, filters = {}, lookup = getProductPrices, context = {}) {
  if (!list.items.length) { const error = new Error("Shopping list is empty"); error.status = 400; throw error; }
  const items = list.items.map((item) => {
    const products = item.selectionType === "exact" ? [item.productId] : (item.selectionType === "same_name" || item.selectionType === "canonical") ? item.productIds || [] : item.groupId?.products || [];
    const invalid = !Number.isSafeInteger(item.quantity) || item.quantity < 1 ||
      (item.selectionType !== "exact" && item.selectionType !== "generic" && item.selectionType !== "same_name" && item.selectionType !== "canonical") ||
      !products.length || products.some((p) => !p || typeof p.barcode !== "string" || !/^\d{1,20}$/.test(p.barcode));
    return { item, products: products.filter((p) => p && typeof p.barcode === "string" && /^\d{1,20}$/.test(p.barcode)), invalid };
  });
  const barcodes = [...new Set(items.flatMap(({ products }) => products.map((p) => p.barcode)))];
  if (barcodes.length > MAX_BARCODES) {
    const error = new Error(`Basket exceeds the limit of ${MAX_BARCODES} distinct barcodes`); error.status = 400; throw error;
  }
  const results = new Map();
  let next = 0;
  async function worker() {
    while (next < barcodes.length) {
      const barcode = barcodes[next++];
      try {
        const data = await lookup(barcode);
        if (!data || !data.product) throw new Error("Missing product in price response");
        if (data.product.itemCode !== barcode) throw new Error("Product barcode does not match request");
        if (!Array.isArray(data.prices)) throw new Error("Missing prices array");
        if (typeof data.product.isWeighted !== "boolean") throw new Error("Missing or invalid isWeighted flag");
        const prices = new Map();
        for (const entry of data.prices) {
          const storeId = String(entry?.storeId ?? "");
          const amount = cents(entry?.price);
          if (!/^[1-9]\d*$/.test(storeId)) throw new Error(`Invalid store ID: ${storeId}`);
          if (amount === null) throw new Error(`Invalid price for store ${storeId}: ${String(entry?.price)}`);
          if (prices.has(storeId)) throw new Error(`Duplicate price for store ${storeId}`);
          prices.set(storeId, { ...entry, storeId, amount });
        }
        results.set(barcode, { prices, product: data.product });
      } catch (err) {
        console.warn("[PRICE COMPARISON] price lookup failed", { ...context, barcode, status: err?.status, error: err?.message || String(err) });
        results.set(barcode, { error: "lookup_failed" });
      }
    }
  }
  await Promise.all([worker(), worker()]);
  const stores = new Map();
  for (const result of results.values()) {
    if (!result.prices) continue;
    for (const [id, price] of result.prices) if (!stores.has(id)) stores.set(id, price);
  }
  function effectiveSpecs(item, products) {
    const specs = products.map((p) => results.get(p.barcode)?.product);
    return item.selectionType === "same_name" && specs.every(Boolean) ? effectivePriceProducts(specs) : specs;
  }
  function unitError(item, products) {
    const specs = effectiveSpecs(item, products);
    // PriceIL documents a 100 g basis, while real prices can resemble per-kg
    // prices. Do not guess a conversion for any weighted selection.
    if (specs.some((spec) => spec?.isWeighted === true)) return true;
    if (item.selectionType === "canonical" && specs.some((spec) => spec && spec.isWeighted !== true)) return true;
    if (products.length < 2) return false;
    if (specs.some((s) => !s)) return false; // Lookup errors are reported separately.
    const first = priceBasis(specs[0]);
    return !first || specs.some((spec) => priceBasis(spec)?.key !== first.key);
  }
  const comparisonIncomplete = items.some(({ item, invalid, products }) => invalid || products.some((p) => results.get(p.barcode)?.error) || unitError(item, products));
  for (const { item, invalid, products } of items) {
    if (invalid) console.warn("[PRICE COMPARISON] invalid catalog reference", { ...context, itemId: String(item._id), selectionType: item.selectionType });
    if (unitError(item, products)) console.warn("[PRICE COMPARISON] incompatible or unknown units", { ...context, itemId: String(item._id), products: products.map((p) => { const spec = results.get(p.barcode)?.product; return { barcode: p.barcode, quantity: spec?.quantity, unitQty: spec?.unitQty, qtyInPackage: spec?.qtyInPackage }; }) });
  }
  const comparisons = [];
  for (const [storeId, store] of stores) {
    if (!matches(store, filters)) continue;
    const selectedProducts = [], missingItems = [];
    let total = 0;
    for (const { item, products, invalid } of items) {
      const itemId = String(item._id);
      const errors = products.map((p) => results.get(p.barcode)?.error).filter(Boolean);
      if (invalid || errors.length) {
        missingItems.push({ itemId, reason: invalid ? "invalid_catalog_reference" : errors.includes("lookup_failed") ? "lookup_failed" : "weighted_product" });
        continue;
      }
      if (unitError(item, products)) { missingItems.push({ itemId, reason: "incompatible_or_unknown_units" }); continue; }
      let best;
      for (const product of products) {
        const price = results.get(product.barcode).prices.get(storeId);
        if (price && (!best || price.amount < best.price.amount)) best = { product, price };
      }
      if (!best) { missingItems.push({ itemId, reason: "price_unavailable" }); continue; }
      const subtotal = best.price.amount * item.quantity;
      if (!Number.isSafeInteger(subtotal) || !Number.isSafeInteger(total + subtotal)) {
        const error = new Error("Basket total exceeds supported monetary range"); error.status = 400; throw error;
      }
      total += subtotal;
      const effective = effectiveSpecs(item, products)[products.indexOf(best.product)];
      selectedProducts.push({ itemId, selectionType: item.selectionType, product: { id: String(best.product._id), barcode: best.product.barcode, name: best.product.name }, quantity: item.quantity, unitPrice: money(best.price.amount), priceBasis: effective.isWeighted ? "kg" : "item", inferredWeighted: Boolean(effective.inferredWeighted), effectiveUnitQty: effective.unitQty ?? null, effectiveProductQuantity: effective.quantity ?? null, subtotal: money(subtotal), priceUpdateDate: best.price.priceUpdateDate || null, stockStatus: "unknown" });
    }
    const complete = missingItems.length === 0 && items.length > 0;
    comparisons.push({ store: { id: storeId, name: store.storeName ?? null, city: store.city ?? null, address: store.address ?? null, chain: store.chain ?? null }, complete, totalPrice: complete ? money(total) : null, knownSubtotal: money(total), selectedProducts, missingItems, rank: null, _total: total });
  }
  comparisons.sort((a, b) => Number(b.complete) - Number(a.complete) || (a.complete ? a._total - b._total : 0) || a.store.id.localeCompare(b.store.id, undefined, { numeric: true }));
  let rank = 0;
  for (const comparison of comparisons) { if (comparison.complete && !comparisonIncomplete) comparison.rank = ++rank; delete comparison._total; }
  const lookupFailures = [...results].filter(([, result]) => result.error).map(([barcode, result]) => ({ barcode, reason: result.error }));
  const invalidItems = items.filter(({ invalid }) => invalid).map(({ item }) => String(item._id));
  return { comparedAt: new Date().toISOString(), currency: "ILS", priceCoverage: "priceil_price_without_verified_promotions", comparisonIncomplete, stockStatus: "unknown", lookupFailures, invalidItems, stores: comparisons };
}
