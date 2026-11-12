import { getWizOffers } from "../services/wizstore.service.js";
import { resolveCity } from "./wizstoreController.js";
import { getCanonical, canonicalCandidates } from "../data/canonicalProducts.js";
import { searchGroups } from "../services/priceil.service.js";
import { effectivePriceProducts, priceBasis } from "../utils/productPriceBasis.js";
import { randomUUID } from "node:crypto";
import localities from "../data/israel-localities.json" with { type: "json" };
import mongoose from "mongoose";
import ShoppingList from "../models/ShoppingList.js";
import Product from "../models/Product.js";
import ProductGroup from "../models/ProductGroup.js";
import { compareBasket } from "../services/basketComparison.service.js";
import { getProduct as getPriceilProduct } from "../services/priceil.service.js";

const localityIds = new Set(localities.filter((locality) => locality.english).map((locality) => locality.id));
const validId = (id) => typeof id === "string" && /^[a-f\d]{24}$/i.test(id);
const allowedKeys = (body, keys) => body && typeof body === "object" && !Array.isArray(body) && Object.keys(body).every((key) => keys.includes(key));
const validName = (name) => typeof name === "string" && name.trim().length > 0 && name.trim().length <= 100;
const validQuantity = (quantity) => Number.isSafeInteger(quantity) && quantity > 0;
const notFound = (res) => res.status(404).json({ message: "Shopping list not found" });
const invalid = (res, message) => res.status(400).json({ message });
const population = [{ path: "items.productId" }, { path: "items.productIds", retainNullValues: true }, { path: "items.groupId", populate: { path: "products" } }];
const populate = (list) => list.populate(population);

async function findOwned(req, res) {
  if (!validId(req.params.id)) { invalid(res, "Invalid shopping list id"); return null; }
  const list = await ShoppingList.findOne({ _id: req.params.id, ownerId: req.user._id });
  if (!list) notFound(res);
  return list;
}
function parseSelection(body, current) {
  const changed = ["selectionType", "productId", "groupId"].some((key) => Object.hasOwn(body, key));
  if (!changed && current) return { selectionType: current.selectionType, productId: current.productId, groupId: current.groupId };
  const { selectionType, productId, groupId } = body;
  if (selectionType === "exact" && validId(productId) && groupId === undefined) return { selectionType, productId, groupId: undefined };
  if (selectionType === "generic" && validId(groupId) && productId === undefined) return { selectionType, groupId, productId: undefined };
  return null;
}
async function selectionExists(selection) {
  return selection.selectionType === "exact" ? Product.exists({ _id: selection.productId }) : ProductGroup.exists({ _id: selection.groupId });
}
function duplicate(items, selection, excludeId) {
  const key = selection.selectionType === "exact" ? "productId" : "groupId";
  return items.some((item) => String(item._id) !== String(excludeId) && item.selectionType === selection.selectionType && String(item[key]) === String(selection[key]));
}
export async function listShoppingLists(req, res) {
  const filter = req.user.householdId
    ? { $or: [{ ownerId: req.user._id }, { householdId: req.user.householdId, ownerId: { $exists: false } }] }
    : { ownerId: req.user._id };
  return res.json(await ShoppingList.find(filter).sort({ updatedAt: -1 }).populate(population));
}
export async function createShoppingList(req, res) {
  if (Object.hasOwn(req.body || {}, "title")) {
    if (!req.user.householdId || !validName(req.body.title) || !Array.isArray(req.body.items)) return invalid(res, "Invalid household list");
    const items = normalizeLegacyItems(req.body.items);
    const list = await ShoppingList.create({ householdId: req.user.householdId, title: req.body.title.trim(), createdBy: req.user._id, items });
    return res.status(201).json(list);
  }
  if (!allowedKeys(req.body, ["name"]) || !validName(req.body.name)) return invalid(res, "name must be a non-empty string of at most 100 characters");
  const list = await ShoppingList.create({ ownerId: req.user._id, name: req.body.name.trim() });
  return res.status(201).json(await populate(list));
}
export async function getShoppingList(req, res) {
  const list = await findOwned(req, res);
  if (list) return res.json(await populate(list));
}
export async function renameShoppingList(req, res) {
  if (!allowedKeys(req.body, ["name"]) || !validName(req.body.name)) return invalid(res, "name must be a non-empty string of at most 100 characters");
  const list = await findOwned(req, res);
  if (!list) return;
  list.name = req.body.name.trim();
  await list.save();
  return res.json(await populate(list));
}
export async function deleteShoppingList(req, res) {
  if (!validId(req.params.id)) return invalid(res, "Invalid shopping list id");
  const filter = req.user.householdId
    ? { _id: req.params.id, $or: [{ ownerId: req.user._id }, { householdId: req.user.householdId, ownerId: { $exists: false } }] }
    : { _id: req.params.id, ownerId: req.user._id };
  const deleted = await ShoppingList.findOneAndDelete(filter);
  if (!deleted) return notFound(res);
  return res.json({ success: true });
}
export async function updateSelectedCities(req, res) {
  if (!allowedKeys(req.body, ["cities"]) || !Array.isArray(req.body.cities) || req.body.cities.length > 10 || new Set(req.body.cities).size !== req.body.cities.length || req.body.cities.some((id) => typeof id !== "string" || !resolveCity(id))) return invalid(res, "Invalid cities");
  const list = await findOwned(req, res); if (!list) return;
  list.selectedCities = req.body.cities;
  await list.save(); return res.json(await populate(list));
}
async function lookupOffer(code, cityId, chainKey, storeId) {
  const city = resolveCity(cityId);
  if (!/^\d{6,14}$/.test(code || "") || !city || typeof chainKey !== "string" || !chainKey || typeof storeId !== "string" || !storeId) { const e = new Error("Invalid offer"); e.status = 400; throw e; }
  const result = await getWizOffers(code, city);
  const offer = result.offers.find((entry) => entry.chainKey === chainKey && entry.storeId === storeId);
  if (!offer) { const e = new Error("Offer is no longer in the available results; search again"); e.status = 409; throw e; }
  return { ...offer, cityId, fetchedAt: new Date().toISOString() };
}
export async function addSelectedOffer(req, res) {
  if (!allowedKeys(req.body, ["code", "cityId", "chainKey", "storeId"])) return invalid(res, "Invalid offer fields");
  const list = await findOwned(req, res); if (!list) return;
  if (!(list.selectedCities || []).includes(req.body.cityId)) return invalid(res, "Choose a store in a selected city");
  const offer = await lookupOffer(req.body.code, req.body.cityId, req.body.chainKey, req.body.storeId);
  if (list.items.some((item) => item.selectionType === "offer" && item.offer?.code === offer.code && item.offer?.cityId === offer.cityId && item.offer?.chainKey === offer.chainKey && item.offer?.storeId === offer.storeId)) return res.status(409).json({ message: "Offer already exists in this list" });
  list.items.push({ selectionType: "offer", description: offer.name, offer, quantity: 1 });
  await list.save(); return res.status(201).json(await populate(list));
}
export async function refreshSelectedOffer(req, res) {
  if (!validId(req.params.itemId)) return invalid(res, "Invalid item id");
  const list = await findOwned(req, res); if (!list) return;
  const item = list.items.id(req.params.itemId);
  if (!item || item.selectionType !== "offer" || !item.offer) return res.status(404).json({ message: "Offer not found" });
  item.offer = await lookupOffer(item.offer.code, item.offer.cityId, item.offer.chainKey, item.offer.storeId);
  item.markModified("offer"); await list.save(); return res.json(await populate(list));
}
export async function addShoppingItem(req, res) {
  if (!allowedKeys(req.body, ["selectionType", "productId", "groupId", "barcode", "barcodes", "quantity", "canonicalId"])) return invalid(res, "Invalid item fields");
  if (req.body.selectionType === "canonical") {
    if (!allowedKeys(req.body, ["selectionType", "canonicalId", "quantity"]) || !getCanonical(req.body.canonicalId) || (req.body.quantity !== undefined && !validQuantity(req.body.quantity))) return invalid(res, "Invalid canonical product or quantity");
    const list = await findOwned(req, res);
    if (!list) return;
    const mapping = getCanonical(req.body.canonicalId);
    if (list.items.some((item) => item.selectionType === "canonical" && item.canonicalId === mapping.id)) return res.status(409).json({ message: "Item already exists in this list" });
    const result = await searchGroups(mapping.name);
    const sources = canonicalCandidates(mapping, result).filter((item) => item.isWeighted === true);
    if (!sources.length) return res.status(404).json({ message: "No comparable products with a known weight basis found" });
    if (sources.length > 100) return res.status(400).json({ message: "Too many matching products to compare" });
    const products = [];
    for (const source of sources) {
      const barcode = source.itemCode;
      const packageSize = [source.quantity, source.unitQty].filter((part) => typeof part === "string" && part.trim()).join(" ");
      let product;
      try { product = await Product.findOneAndUpdate({ barcode }, { $setOnInsert: { barcode, name: source.itemName.trim(), brand: typeof source.manufacturerName === "string" ? source.manufacturerName.trim() : "", packageSize } }, { upsert: true, new: true, runValidators: true }); }
      catch (err) { if (err.code !== 11000) throw err; product = await Product.findOne({ barcode }); if (!product) throw err; }
      products.push(product);
    }
    list.items.push({ selectionType: "canonical", canonicalId: mapping.id, description: mapping.name, productIds: products.map((p) => p._id), quantity: req.body.quantity ?? 1 });
    await list.save();
    return res.status(201).json(await populate(list));
  }
  if (req.body.selectionType === "same_name") {
    const { barcodes, quantity } = req.body;
    if (!allowedKeys(req.body, ["selectionType", "barcodes", "quantity"]) || !Array.isArray(barcodes) || !barcodes.length || barcodes.length > 21 || new Set(barcodes).size !== barcodes.length || barcodes.some((code) => typeof code !== "string" || !/^\d{1,20}$/.test(code)) || (quantity !== undefined && !validQuantity(quantity))) return invalid(res, "Invalid barcodes or quantity");
    const list = await findOwned(req, res);
    if (!list) return;
    const sources = [];
    for (const barcode of barcodes) {
      const source = await getPriceilProduct(barcode);
      if (!source || source.itemCode !== barcode || typeof source.itemName !== "string" || !source.itemName.trim()) { const error = new Error("Invalid response from PriceIL"); error.status = 502; throw error; }
      sources.push(source);
    }
    if (sources.some((source) => source.itemName !== sources[0].itemName)) return invalid(res, "Products must have the same exact name");
    const effectiveSources = effectivePriceProducts(sources);
    if (effectiveSources.length > 1 && (!priceBasis(effectiveSources[0]) || effectiveSources.some((source) => priceBasis(source)?.key !== priceBasis(effectiveSources[0]).key))) return invalid(res, "Products must have the same known price basis");
    const products = [];
    for (const source of sources) {
      const barcode = source.itemCode;
      const packageSize = [source.quantity, source.unitQty].filter((part) => typeof part === "string" && part.trim()).join(" ");
      let product;
      try { product = await Product.findOneAndUpdate({ barcode }, { $setOnInsert: { barcode, name: source.itemName.trim(), brand: typeof source.manufacturerName === "string" ? source.manufacturerName.trim() : "", packageSize } }, { upsert: true, new: true, runValidators: true }); }
      catch (err) { if (err.code !== 11000) throw err; product = await Product.findOne({ barcode }); if (!product) throw err; }
      products.push(product);
    }
    const ids = products.map((p) => String(p._id)).sort();
    if (list.items.some((item) => item.selectionType === "same_name" && item.productIds.map(String).sort().join(",") === ids.join(","))) return res.status(409).json({ message: "Item already exists in this list" });
    list.items.push({ selectionType: "same_name", productIds: ids, quantity: quantity ?? 1 });
    await list.save();
    return res.status(201).json(await populate(list));
  }
  if (Object.hasOwn(req.body, "barcode")) {
    const { barcode, selectionType, quantity } = req.body;
    if (selectionType !== "exact" || typeof barcode !== "string" || !/^\d{1,20}$/.test(barcode) || Object.hasOwn(req.body, "productId") || Object.hasOwn(req.body, "groupId") || (Object.hasOwn(req.body, "quantity") && !validQuantity(quantity))) return invalid(res, "Invalid selection or quantity");
    const list = await findOwned(req, res);
    if (!list) return;
    let product = await Product.findOne({ barcode });
    if (product && duplicate(list.items, { selectionType: "exact", productId: product._id })) return res.status(409).json({ message: "Item already exists in this list" });
    if (!product) {
      const source = await getPriceilProduct(barcode);
      if (!source || source.itemCode !== barcode || typeof source.itemName !== "string" || !source.itemName.trim()) {
        const error = new Error("Invalid response from PriceIL"); error.status = 502; throw error;
      }
      const packageSize = [source.quantity, source.unitQty].filter((part) => typeof part === "string" && part.trim()).join(" ");
      try {
        product = await Product.findOneAndUpdate({ barcode }, { $setOnInsert: { barcode, name: source.itemName.trim(), brand: typeof source.manufacturerName === "string" ? source.manufacturerName.trim() : "", packageSize } }, { upsert: true, new: true, runValidators: true });
      } catch (err) {
        if (err.code !== 11000) throw err;
        product = await Product.findOne({ barcode });
        if (!product) throw err;
      }
    }
    if (duplicate(list.items, { selectionType: "exact", productId: product._id })) return res.status(409).json({ message: "Item already exists in this list" });
    list.items.push({ selectionType: "exact", productId: product._id, quantity: quantity ?? 1 });
    await list.save();
    return res.status(201).json(await populate(list));
  }
  const selection = parseSelection(req.body);
  if (!selection || (Object.hasOwn(req.body, "quantity") && !validQuantity(req.body.quantity))) return invalid(res, "Invalid selection or quantity");
  const list = await findOwned(req, res);
  if (!list) return;
  if (!(await selectionExists(selection))) return res.status(404).json({ message: "Product or group not found" });
  if (duplicate(list.items, selection)) return res.status(409).json({ message: "Item already exists in this list" });
  list.items.push({ ...selection, quantity: req.body.quantity ?? 1 });
  await list.save();
  return res.status(201).json(await populate(list));
}
export async function updateShoppingItem(req, res) {
  if (!validId(req.params.itemId)) return invalid(res, "Invalid item id");
  if (!allowedKeys(req.body, ["selectionType", "productId", "groupId", "quantity"]) || !Object.keys(req.body).length) return invalid(res, "Invalid item fields");
  if (Object.hasOwn(req.body, "quantity") && !validQuantity(req.body.quantity)) return invalid(res, "Invalid quantity");
  const list = await findOwned(req, res);
  if (!list) return;
  const item = list.items.id(req.params.itemId);
  if (!item) return res.status(404).json({ message: "Item not found" });
  if ((item.selectionType === "same_name" || item.selectionType === "canonical") && Object.keys(req.body).every((key) => key === "quantity")) {
    item.quantity = req.body.quantity;
    await list.save();
    return res.json(await populate(list));
  }
  const selection = parseSelection(req.body, item);
  if (!selection) return invalid(res, "Invalid selection");
  if (!(await selectionExists(selection))) return res.status(404).json({ message: "Product or group not found" });
  if (duplicate(list.items, selection, item._id)) return res.status(409).json({ message: "Item already exists in this list" });
  item.set(selection);
  item.productIds = [];
  if (Object.hasOwn(req.body, "quantity")) item.quantity = req.body.quantity;
  await list.save();
  return res.json(await populate(list));
}
export async function deleteShoppingItem(req, res) {
  if (!validId(req.params.itemId)) return invalid(res, "Invalid item id");
  const list = await findOwned(req, res);
  if (!list) return;
  const item = list.items.id(req.params.itemId);
  if (!item) return res.status(404).json({ message: "Item not found" });
  item.deleteOne();
  await list.save();
  return res.json(await populate(list));
}
export async function compareShoppingList(req, res) {
  if (!validId(req.params.id)) return invalid(res, "Invalid shopping list id");
  const body = req.body ?? {};
  if (!allowedKeys(body, ["city", "cities", "chain", "storeIds"])) return invalid(res, "Invalid comparison filters");
  if (Object.hasOwn(body, "cities") && (!Array.isArray(body.cities) || !body.cities.length || body.cities.some((id) => typeof id !== "string" || !localityIds.has(id)))) return invalid(res, "Invalid cities");
  for (const key of ["city", "chain"]) {
    if (Object.hasOwn(body, key) && (typeof body[key] !== "string" || !body[key].trim() || body[key].trim().length > 100)) return invalid(res, `Invalid ${key}`);
  }
  if (Object.hasOwn(body, "storeIds") && (!Array.isArray(body.storeIds) || !body.storeIds.length || body.storeIds.length > 100 || body.storeIds.some((id) => !(typeof id === "string" || Number.isSafeInteger(id)) || !/^[1-9]\d{0,14}$/.test(String(id))))) return invalid(res, "Invalid storeIds");
  const list = await ShoppingList.findOne({ _id: req.params.id, ownerId: req.user._id });
  if (!list) return notFound(res);
  await list.populate([{ path: "items.productId" }, { path: "items.productIds", retainNullValues: true }, { path: "items.groupId", populate: { path: "products", retainNullValues: true } }]);
  const filters = { ...body, storeIds: body.storeIds?.map(String) };
  const comparisonId = randomUUID();
  const context = { comparisonId, listId: String(list._id) };
  const started = Date.now();
  console.log("[PRICE COMPARISON] started", { ...context, itemCount: list.items.length, cities: filters.cities });
  try {
    const result = await compareBasket(list, filters, undefined, context);
    console.log("[PRICE COMPARISON] completed", { ...context, durationMs: Date.now() - started, comparisonIncomplete: result.comparisonIncomplete, storeCount: result.stores.length, completeStoreCount: result.stores.filter((store) => store.complete).length, lookupFailures: result.lookupFailures, invalidItems: result.invalidItems });
    return res.json(result);
  } catch (err) {
    console.error("[PRICE COMPARISON] failed", { ...context, durationMs: Date.now() - started, status: err?.status, error: err?.message || String(err) });
    throw err;
  }
}

function normalizeLegacyItems(items, existing = []) {
  const byId = new Map(existing.map((item) => [String(item._id), item]));
  return items.map((item) => {
    const previous = byId.get(String(item._id));
    const completed = Boolean(item.completed);
    return {
      ...(previous ? { _id: previous._id } : {}),
      description: String(item.description || item.text || "").trim(),
      quantity: Number(item.quantity || 1), note: String(item.note || "").trim(), completed,
      completedAt: completed ? previous?.completedAt || new Date() : null,
      completedBy: completed ? previous?.completedBy : null,
    };
  }).filter((item) => item.description);
}
async function findHouseholdList(req, id) {
  if (!req.user.householdId || !validId(id)) return null;
  return ShoppingList.findOne({ _id: id, householdId: req.user.householdId, ownerId: { $exists: false } });
}
export async function updateLegacyShoppingList(req, res) {
  const list = await findHouseholdList(req, req.params.id);
  if (!list) return notFound(res);
  if (!allowedKeys(req.body, ["title", "items"]) || (Object.hasOwn(req.body, "title") && !validName(req.body.title)) || (Object.hasOwn(req.body, "items") && !Array.isArray(req.body.items))) return invalid(res, "Invalid list fields");
  if (Object.hasOwn(req.body, "title")) list.title = req.body.title.trim();
  if (Object.hasOwn(req.body, "items")) list.items = normalizeLegacyItems(req.body.items, list.items);
  await list.save();
  return res.json(list);
}
export async function toggleLegacyShoppingItem(req, res) {
  const list = await findHouseholdList(req, req.params.id);
  if (!list) return notFound(res);
  if (!validId(req.params.itemId)) return invalid(res, "Invalid item id");
  const item = list.items.id(req.params.itemId);
  if (!item) return res.status(404).json({ message: "Item not found" });
  item.completed = !item.completed;
  item.completedAt = item.completed ? new Date() : null;
  item.completedBy = item.completed ? req.user._id : null;
  await list.save();
  return res.json(list);
}

export function shoppingListErrorHandler(err, req, res, next) {
  if (err instanceof mongoose.Error.VersionError) return res.status(409).json({ message: "Shopping list changed; retry the request" });
  return next(err);
}
