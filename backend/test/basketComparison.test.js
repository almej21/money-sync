import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import ShoppingList from "../src/models/ShoppingList.js";
import { compareBasket } from "../src/services/basketComparison.service.js";
import { compareShoppingList } from "../src/controllers/shoppingListController.js";

const p = (barcode) => ({ _id: barcode, barcode, name: `Product ${barcode}` });
const entry = (storeId, price, city = "Haifa") => ({ storeId, price, storeName: `Store ${storeId}`, city, chain: "Chain", priceUpdateDate: "2026-01-01T00:00:00Z" });
const data = (barcode, prices, isWeighted = false) => ({ product: { itemCode: barcode, isWeighted }, prices });
const list = () => ({ items: [
  { _id: "a", selectionType: "exact", productId: p("111"), quantity: 2 },
  { _id: "b", selectionType: "generic", groupId: { products: [p("222"), p("333"), p("111")] }, quantity: 1 },
] });

test("deduplicates barcodes and ranks complete branch baskets with cheapest generic alternatives", async () => {
  const calls = [];
  const prices = {
    111: data("111", [entry(1, "2.10"), entry(2, "1.20"), entry(3, "1.00", "Tel Aviv")]),
    222: data("222", [entry(1, "1.01"), entry(2, "4.00")]),
    333: data("333", [entry(1, "1.50"), entry(2, "0.99")]),
  };
  for (const value of Object.values(prices)) Object.assign(value.product, { quantity: 1, unitQty: "unit", qtyInPackage: 1 });
  const result = await compareBasket(list(), { city: "haifa" }, async (barcode) => { calls.push(barcode); return prices[barcode]; });
  assert.equal(calls.length, 3);
  assert.deepEqual(result.stores.map((store) => [store.store.id, store.totalPrice, store.rank]), [["2", "3.39", 1], ["1", "5.21", 2]]);
  assert.equal(result.stores[0].selectedProducts[1].product.barcode, "333");
  assert.equal(result.stores[1].selectedProducts[1].product.barcode, "222");
  assert.equal(result.stores[0].selectedProducts[0].subtotal, "2.40");
  assert.equal(result.stores[0].selectedProducts[0].stockStatus, "unknown");
  assert.equal(result.stores[0].selectedProducts[0].priceUpdateDate, "2026-01-01T00:00:00Z");
  assert.equal(result.comparisonIncomplete, false);
  const filtered = await compareBasket(list(), { chain: "Chain", storeIds: ["1"] }, async (barcode) => prices[barcode]);
  assert.deepEqual(filtered.stores.map((s) => s.store.id), ["1"]);
});

test("separates missing prices and failures and never ranks uncertain baskets", async () => {
  const basic = { items: [
    { _id: "a", selectionType: "exact", productId: p("111"), quantity: 1 },
    { _id: "b", selectionType: "exact", productId: p("222"), quantity: 1 },
  ] };
  const lookup = async (barcode) => barcode === "111" ? data(barcode, [entry(1, "3.00"), entry(2, "1.00")]) : data(barcode, [entry(1, "2.00")]);
  const result = await compareBasket(basic, {}, lookup);
  assert.equal(result.stores[0].rank, 1);
  assert.equal(result.stores[1].complete, false);
  assert.equal(result.stores[1].totalPrice, null);
  assert.equal(result.stores[1].missingItems[0].reason, "price_unavailable");
  const failed = await compareBasket(basic, {}, async (barcode) => { if (barcode === "222") throw new Error("timeout"); return lookup(barcode); });
  assert.equal(failed.comparisonIncomplete, true);
  assert.equal(failed.stores[0].rank, null);
  assert.equal(failed.stores[0].missingItems[0].reason, "lookup_failed");
  assert.deepEqual(failed.lookupFailures, [{ barcode: "222", reason: "lookup_failed" }]);
  const weighted = await compareBasket(basic, {}, async (barcode) => barcode === "222" ? data(barcode, [], true) : lookup(barcode));
  assert.equal(weighted.lookupFailures.length, 0);
  assert.equal(weighted.stores[0].missingItems[0].reason, "price_unavailable");
  const malformed = await compareBasket(basic, {}, async (barcode) => barcode === "222" ? data(barcode, [entry(1, "0.001")]) : lookup(barcode));
  assert.equal(malformed.lookupFailures[0].reason, "lookup_failed");
});

test("basket city filter matches CBS locality codes and names", async () => {
  const basket = { items: [{ _id: "a", selectionType: "exact", productId: p("111"), quantity: 1 }] };
  const result = await compareBasket(basket, { city: "חולון" }, async () => data("111", [entry(1, "2.00", "6600"), entry(2, "3.00", "חולון"), entry(3, "1.00", "ירושלים")]));
  assert.deepEqual(result.stores.map((s) => s.store.id), ["1", "2"]);
});

test("multiple selected locality codes include matching branches only", async () => {
  const basket = { items: [{ _id: "a", selectionType: "exact", productId: p("111"), quantity: 1 }] };
  const result = await compareBasket(basket, { cities: ["6600", "3000"] }, async () => data("111", [entry(1, "2.00", "חולון"), entry(2, "3.00", "ירושלים"), entry(3, "1.00", "חיפה")]));
  assert.deepEqual(result.stores.map((s) => s.store.id), ["1", "2"]);
});

test("same-name selections choose the cheapest compatible barcode and reject unknown units", async () => {
  const basket = { items: [{ _id: "a", selectionType: "same_name", productIds: [p("111"), p("222")], quantity: 2 }] };
  const lookup = async (barcode) => ({ ...data(barcode, [entry(1, barcode === "111" ? "2.00" : "1.50")]), product: { itemCode: barcode, isWeighted: false, quantity: "1.000", unitQty: "יחידה", qtyInPackage: 1 } });
  const result = await compareBasket(basket, {}, lookup);
  assert.equal(result.stores[0].totalPrice, "3.00");
  assert.equal(result.stores[0].selectedProducts[0].product.barcode, "222");
  const unknown = await compareBasket(basket, {}, async (barcode) => data(barcode, [entry(1, "1.00")]));
  assert.equal(unknown.comparisonIncomplete, true);
  assert.equal(unknown.stores[0].missingItems[0].reason, "incompatible_or_unknown_units");
  assert.equal(unknown.stores[0].rank, null);
});

test("weighted products compare prices per kilogram, but mixed selections are rejected", async () => {
  const basket = { items: [{ _id: "a", selectionType: "same_name", productIds: [p("111"), p("222")], quantity: 2 }] };
  const lookup = async (barcode) => data(barcode, [entry(1, barcode === "111" ? "89.90" : "90.00")], true);
  const result = await compareBasket(basket, {}, lookup);
  assert.equal(result.stores[0].totalPrice, "179.80");
  assert.equal(result.stores[0].selectedProducts[0].priceBasis, "kg");
  assert.equal(result.stores[0].rank, 1);
  const mixed = await compareBasket(basket, {}, async (barcode) => data(barcode, [entry(1, "2.00")], barcode === "111"));
  assert.equal(mixed.comparisonIncomplete, true);
  assert.equal(mixed.stores[0].missingItems[0].reason, "incompatible_or_unknown_units");
});

test("mixed same-name selection uses inferred weighted basis and most common metadata", async () => {
  const basket = { items: [{ _id: "a", selectionType: "same_name", productIds: [p("111"), p("222"), p("333")], quantity: 2 }] };
  const result = await compareBasket(basket, {}, async (barcode) => ({ product: { itemCode: barcode, itemName: "Salmon", isWeighted: barcode === "111", unitQty: barcode === "333" ? null : "kg", quantity: barcode === "111" ? "1" : null }, prices: [entry(1, barcode === "222" ? "5.00" : "10.00")] }));
  assert.equal(result.stores[0].totalPrice, "10.00");
  assert.equal(result.stores[0].selectedProducts[0].product.barcode, "222");
  assert.equal(result.stores[0].selectedProducts[0].priceBasis, "kg");
  assert.equal(result.stores[0].selectedProducts[0].inferredWeighted, true);
  assert.equal(result.stores[0].selectedProducts[0].effectiveUnitQty, "kg");
  assert.equal(result.stores[0].selectedProducts[0].effectiveProductQuantity, "1");
});

test("comparison controller validates filters and scopes lookup to authenticated owner", async (t) => {
  const owner = new mongoose.Types.ObjectId();
  const id = new mongoose.Types.ObjectId();
  let calls = 0;
  t.mock.method(ShoppingList, "findOne", async (filter) => { calls++; assert.equal(String(filter.ownerId), String(owner)); return null; });
  const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
  let res = response();
  await compareShoppingList({ params: { id: String(id) }, user: { _id: owner }, body: { storeIds: [0] } }, res);
  assert.equal(res.statusCode, 400); assert.equal(calls, 0);
  res = response();
  await compareShoppingList({ params: { id: String(id) }, user: { _id: owner }, body: {} }, res);
  assert.equal(res.statusCode, 404); assert.equal(calls, 1);
});
