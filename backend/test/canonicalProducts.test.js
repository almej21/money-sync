import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import ShoppingList from "../src/models/ShoppingList.js";
import Product from "../src/models/Product.js";
import { searchCatalog } from "../src/controllers/catalogController.js";
import { addShoppingItem } from "../src/controllers/shoppingListController.js";
import { compareBasket } from "../src/services/basketComparison.service.js";

const response = () => ({ statusCode: 200, status(n) { this.statusCode = n; return this; }, json(value) { this.body = value; return this; } });
const provider = { bestMatch: { products: [
  { itemCode: "111111", itemName: "דג פילה סלמון טרי", isWeighted: true },
  { itemCode: "222222", itemName: "פילה סלמון טרי  ארוז", isWeighted: true },
  { itemCode: "333333", itemName: "פילה סלמון טרי מעושן", isWeighted: true },
  { itemCode: "444444", itemName: "פילה סלמון טרי", isWeighted: false },
] }, allOthers: [] };

test("canonical search, selection, and city-filtered basket use only approved comparable names", async (t) => {
  t.mock.method(globalThis, "fetch", async () => ({ ok: true, json: async () => ({ success: true, data: provider }) }));
  const res = response();
  await searchCatalog({ query: { q: "פילה סלמון" } }, res, assert.fail);
  assert.deepEqual(res.body.data.products[0].barcodes, ["111111", "222222"]);
  assert.equal(res.body.data.products[0].excludedUnknown, 1);
  const owner = new mongoose.Types.ObjectId(), id = new mongoose.Types.ObjectId();
  const list = new ShoppingList({ _id: id, ownerId: owner, name: "List" });
  t.mock.method(ShoppingList, "findOne", async () => list);
  t.mock.method(ShoppingList.prototype, "save", async function () { await this.validate(); return this; });
  t.mock.method(ShoppingList.prototype, "populate", async function () { return this; });
  const stored = new Map();
  t.mock.method(Product, "findOneAndUpdate", async (filter, update) => { const p = { _id: new mongoose.Types.ObjectId(), ...update.$setOnInsert }; stored.set(String(p._id), p); return p; });
  const added = response();
  await addShoppingItem({ user: { _id: owner }, params: { id: String(id) }, body: { selectionType: "canonical", canonicalId: "fresh-salmon-fillet" } }, added);
  assert.equal(added.statusCode, 201);
  const item = list.items[0];
  const basket = { items: [{ _id: String(item._id), selectionType: "canonical", productIds: item.productIds.map((id) => stored.get(String(id))), quantity: 1 }] };
  const result = await compareBasket(basket, { city: "חיפה" }, async (barcode) => ({ product: { itemCode: barcode, isWeighted: true }, prices: [{ storeId: 1, city: "חיפה", price: barcode === "111111" ? "80.00" : "60.00" }, { storeId: 2, city: "ירושלים", price: "1.00" }] }));
  assert.equal(result.stores.length, 1);
  assert.equal(result.stores[0].totalPrice, null);
  assert.equal(result.stores[0].rank, null);
  assert.equal(result.stores[0].missingItems[0].reason, "incompatible_or_unknown_units");
  const duplicate = response();
  await addShoppingItem({ user: { _id: owner }, params: { id: String(id) }, body: { selectionType: "canonical", canonicalId: "fresh-salmon-fillet" } }, duplicate);
  assert.equal(duplicate.statusCode, 409);
});
