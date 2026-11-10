import { effectivePriceProducts, priceBasis } from "../utils/productPriceBasis.js";
import localities from "../data/israel-localities.json" with { type: "json" };
import * as priceil from "../services/priceil.service.js";
import { localityName, sameLocality } from "../utils/localityMatching.js";

export async function searchCatalog(req, res, next) {
  const q = req.query.q;
  if (typeof q !== "string" || [...q.trim()].length < 3 || [...q.trim()].length > 100) {
    return res.status(400).json({ message: "q must contain between 3 and 100 characters" });
  }
  const rawCities = req.query.cities;
  const cityValues = rawCities === undefined ? null : Array.isArray(rawCities) ? rawCities : [rawCities];
  if (cityValues && (cityValues.some((value) => typeof value !== "string") || cityValues.length > 50)) return res.status(400).json({ message: "Invalid cities" });
  const cities = cityValues?.flatMap((value) => value.split(",").map((city) => city.trim()));
  if (cities && (!cities.length || cities.length > 50 || cities.some((city) => !city || city.length > 100))) return res.status(400).json({ message: "Invalid cities" });
  try {
    const result = await priceil.searchProducts(q.trim());
    if (!result || !Array.isArray(result.allOthers) || !(result.bestMatch === null || typeof result.bestMatch === "object")) {
      const error = new Error("Invalid response from PriceIL"); error.status = 502; throw error;
    }
    const needle = q.trim().toLocaleLowerCase();
    const seen = new Set();
    const products = [result.bestMatch, ...result.allOthers].filter((item) => {
      if (!item || typeof item.itemCode !== "string" || !/^\d{1,20}$/.test(item.itemCode) || typeof item.itemName !== "string" || !item.itemName.toLocaleLowerCase().includes(needle) || seen.has(item.itemCode)) return false;
      seen.add(item.itemCode);
      return true;
    });
    const byName = new Map();
    for (const item of products) {
      if (!byName.has(item.itemName)) byName.set(item.itemName, []);
      byName.get(item.itemName).push(item);
    }
    const grouped = new Map();
    for (const items of byName.values()) {
      for (const item of effectivePriceProducts(items)) {
        const basis = priceBasis(item);
        const key = JSON.stringify([item.itemName, basis?.key || `unknown:${item.itemCode}`]);
        if (!grouped.has(key)) grouped.set(key, { name: item.itemName, barcodes: [], basis: basis?.type || "unknown", package: basis?.type === "package" ? { quantity: basis.quantity, unit: basis.unit, count: basis.count } : null });
        grouped.get(key).barcodes.push(item.itemCode);
      }
    }
    // Keep barcode strings for existing clients and attach branch details separately.
    const details = new Map();
    let nextBarcode = 0;
    async function loadStores() {
      while (nextBarcode < products.length) {
        const barcode = products[nextBarcode++].itemCode;
        try {
          const data = await priceil.getProductPrices(barcode);
          if (!data || !Array.isArray(data.prices) || data.product?.itemCode !== barcode) throw new Error("Invalid price response");
          const stores = data.prices.filter((entry) => !cities || cities.some((city) => sameLocality(localityName(entry?.city), localityName(city)))).map((entry) => ({ storeName: entry?.storeName ?? null, city: localityName(entry?.city), price: entry?.price ?? null }));
          details.set(barcode, { barcode, stores, status: "ok" });
        } catch (err) {
          console.warn("[CATALOG] store lookup failed", { barcode, error: err?.message || String(err) });
          details.set(barcode, { barcode, stores: [], status: "lookup_failed" });
        }
      }
    }
    await Promise.all([loadStores(), loadStores()]);
    for (const group of grouped.values()) group.barcodeDetails = group.barcodes.map((barcode) => details.get(barcode));
    const lookupFailures = cities ? products.map((item) => details.get(item.itemCode)).filter((detail) => detail.status === "lookup_failed").map((detail) => detail.barcode) : [];
    const results = [...grouped.values()].map((group) => {
      if (!cities) return group;
      const barcodeDetails = group.barcodeDetails.filter((detail) => detail.status === "ok" && detail.stores.length);
      return { ...group, barcodes: barcodeDetails.map((detail) => detail.barcode), barcodeDetails };
    }).filter((group) => group.barcodes.length);
    return res.json({ data: { products: results, coverage: "first_page_only", ...(cities ? { lookupFailures } : {}) } });
  } catch (err) { return next(err); }
}

export async function getCatalogGroup(req, res, next) {
  if (!/^[1-9]\d{0,14}$/.test(req.params.id)) {
    return res.status(400).json({ message: "Invalid group id" });
  }
  try { return res.json({ data: await priceil.getGroup(req.params.id) }); }
  catch (err) { return next(err); }
}

export async function getCatalogPrices(req, res, next) {
  if (!/^\d{1,20}$/.test(req.params.barcode)) {
    return res.status(400).json({ message: "Invalid barcode" });
  }
  const { city } = req.query;
  if (city !== undefined && (typeof city !== "string" || !city.trim() || city.trim().length > 100)) {
    return res.status(400).json({ message: "Invalid city" });
  }
  try {
    const data = await priceil.getProductPrices(req.params.barcode);
    if (!data || !Array.isArray(data.prices)) {
      const error = new Error("Invalid response from PriceIL"); error.status = 502; throw error;
    }
    const prices = city === undefined ? data.prices : data.prices.filter((entry) => sameLocality(entry?.city, city));
    return res.json({ data: { ...data, prices } });
  }
  catch (err) { return next(err); }
}

export function getLocalities(req, res) {
  return res.json({ data: localities.filter((locality) => locality.english) });
}
