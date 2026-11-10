import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import ShoppingList from "../src/models/ShoppingList.js";
import Product from "../src/models/Product.js";
import ProductGroup from "../src/models/ProductGroup.js";
import * as controller from "../src/controllers/shoppingListController.js";

const owner = new mongoose.Types.ObjectId();
const other = new mongoose.Types.ObjectId();
const product = new mongoose.Types.ObjectId();
const group = new mongoose.Types.ObjectId();
const id = new mongoose.Types.ObjectId();
const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
const req = (body = {}, user = owner) => ({ user: { _id: user }, params: { id: String(id) }, body });

test("same-name selection validates provider names and stores every selected barcode", async (t) => {
  const list = new ShoppingList({ _id: id, ownerId: owner, name: "Test" });
  const ids = new Map([["88776601", product], ["88776602", group], ["88776603", other]]);
  t.mock.method(ShoppingList, "findOne", async (filter) => String(filter.ownerId) === String(owner) ? list : null);
  t.mock.method(ShoppingList.prototype, "save", async function () { await this.validate(); return this; });
  t.mock.method(ShoppingList.prototype, "populate", async function () { return this; });
  t.mock.method(Product, "findOneAndUpdate", async (filter) => ({ _id: ids.get(filter.barcode) }));
  t.mock.method(globalThis, "fetch", async (url) => {
    const barcode = url.pathname.split("/").pop();
    return { ok: true, json: async () => ({ success: true, data: { itemCode: barcode, itemName: barcode === "88776603" ? "Different" : "Milk", isWeighted: true } }) };
  });
  let res = response();
  await controller.addShoppingItem(req({ selectionType: "same_name", barcodes: ["88776601", "88776603"] }), res);
  assert.equal(res.statusCode, 400);
  res = response();
  const body = { selectionType: "same_name", barcodes: ["88776601", "88776602"], quantity: 2 };
  await controller.addShoppingItem(req(body), res);
  assert.equal(res.statusCode, 201);
  assert.deepEqual(list.items[0].productIds.map(String).sort(), [String(product), String(group)].sort());
  res = response(); await controller.addShoppingItem(req(body), res); assert.equal(res.statusCode, 409);
});

test("adding a selected barcode verifies the owner, imports provider data, and rejects duplicates", async (t) => {
  const list = new ShoppingList({ _id: id, ownerId: owner, name: "Test" });
  let stored = null;
  let lookups = 0;
  t.mock.method(ShoppingList, "findOne", async (filter) => String(filter.ownerId) === String(owner) ? list : null);
  t.mock.method(ShoppingList.prototype, "save", async function () { await this.validate(); return this; });
  t.mock.method(ShoppingList.prototype, "populate", async function () { return this; });
  t.mock.method(Product, "findOne", async () => stored);
  t.mock.method(Product, "findOneAndUpdate", async (filter, update) => { stored = { _id: product, ...update.$setOnInsert }; return stored; });
  t.mock.method(globalThis, "fetch", async () => { lookups++; return { ok: true, json: async () => ({ success: true, data: { itemCode: "98765430", itemName: "Milk", manufacturerName: "Brand", quantity: "1", unitQty: "L" } }) }; });
  const body = { selectionType: "exact", barcode: "98765430", quantity: 2 };
  let res = response();
  await controller.addShoppingItem(req(body, other), res);
  assert.equal(res.statusCode, 404); assert.equal(lookups, 0);
  res = response(); await controller.addShoppingItem(req(body), res);
  assert.equal(res.statusCode, 201); assert.equal(stored.name, "Milk"); assert.equal(list.items[0].quantity, 2);
  res = response(); await controller.addShoppingItem(req(body), res);
  assert.equal(res.statusCode, 409); assert.equal(lookups, 1);
});

test("shopping list CRUD, selection validation, duplicate prevention and ownership", async (t) => {
  let list;
  t.mock.method(ShoppingList, "create", async (data) => { list = new ShoppingList({ ...data, _id: id }); return list; });
  t.mock.method(ShoppingList, "findOne", async (filter) => list && String(filter._id) === String(list._id) && String(filter.ownerId) === String(list.ownerId) ? list : null);
  t.mock.method(ShoppingList, "findOneAndDelete", async (filter) => {
    if (!list || String(filter._id) !== String(list._id) || String(filter.ownerId) !== String(list.ownerId)) return null;
    const deleted = list; list = null; return deleted;
  });
  t.mock.method(ShoppingList, "find", (filter) => ({ sort: () => ({ populate: async () => list && String(filter.ownerId) === String(list.ownerId) ? [list] : [] }) }));
  t.mock.method(ShoppingList.prototype, "save", async function () { await this.validate(); return this; });
  t.mock.method(ShoppingList.prototype, "populate", async function () { return this; });
  t.mock.method(Product, "exists", async (filter) => String(filter._id) === String(product));
  t.mock.method(ProductGroup, "exists", async (filter) => String(filter._id) === String(group));

  let res = response();
  await controller.createShoppingList(req({ name: " Weekly " }), res);
  assert.equal(res.statusCode, 201); assert.equal(list.name, "Weekly"); assert.equal(String(list.ownerId), String(owner));
  res = response(); await controller.listShoppingLists(req(), res); assert.equal(res.body.length, 1);
  res = response(); await controller.getShoppingList(req({}, other), res); assert.equal(res.statusCode, 404);
  res = response(); await controller.renameShoppingList(req({ name: "Other" }, other), res); assert.equal(res.statusCode, 404);
  res = response(); await controller.deleteShoppingList(req({}, other), res); assert.equal(res.statusCode, 404);
  res = response(); await controller.renameShoppingList(req({ name: "Food" }), res); assert.equal(res.body.name, "Food");
  res = response(); await controller.getShoppingList(req(), res); assert.equal(res.body.name, "Food");

  for (const body of [{ selectionType: "exact", productId: String(product), quantity: 0 }, { selectionType: "generic", groupId: String(group), quantity: 1.5 }, { selectionType: "exact", productId: String(product), groupId: String(group) }]) {
    res = response(); await controller.addShoppingItem(req(body), res); assert.equal(res.statusCode, 400);
  }
  res = response(); await controller.addShoppingItem(req({ selectionType: "exact", productId: String(other) }), res); assert.equal(res.statusCode, 404);
  res = response(); await controller.addShoppingItem(req({ selectionType: "exact", productId: String(product) }, other), res); assert.equal(res.statusCode, 404);
  res = response(); await controller.addShoppingItem(req({ selectionType: "exact", productId: String(product) }), res); assert.equal(res.statusCode, 201); assert.equal(list.items[0].quantity, 1);
  res = response(); await controller.addShoppingItem(req({ selectionType: "exact", productId: String(product) }), res); assert.equal(res.statusCode, 409);
  res = response(); await controller.addShoppingItem(req({ selectionType: "generic", groupId: String(group), quantity: 2 }), res); assert.equal(res.statusCode, 201);
  const itemId = String(list.items[0]._id);
  const itemReq = (body, user = owner) => ({ ...req(body, user), params: { id: String(id), itemId } });
  res = response(); await controller.updateShoppingItem(itemReq({ quantity: 3 }, other), res); assert.equal(res.statusCode, 404);
  res = response(); await controller.updateShoppingItem(itemReq({ selectionType: "generic", groupId: String(group) }), res); assert.equal(res.statusCode, 409);
  res = response(); await controller.updateShoppingItem(itemReq({ quantity: 3 }), res); assert.equal(list.items[0].quantity, 3);
  res = response(); await controller.deleteShoppingItem(itemReq({}, other), res); assert.equal(res.statusCode, 404);
  res = response(); await controller.deleteShoppingItem(itemReq({}), res); assert.equal(list.items.length, 1);
  res = response(); await controller.deleteShoppingList(req(), res); assert.equal(res.body.success, true);
  res = response(); await controller.getShoppingList(req(), res); assert.equal(res.statusCode, 404);
});

test("legacy household lists remain accessible and editable without exposing other households", async (t) => {
  const household = new mongoose.Types.ObjectId();
  const legacy = new ShoppingList({ _id: id, householdId: household, title: "Groceries", items: [{ description: "Milk", quantity: 1 }] });
  const user = { _id: owner, householdId: household };
  let query;
  t.mock.method(ShoppingList, "find", (filter) => { query = filter; return { sort: () => ({ populate: async () => [legacy] }) }; });
  t.mock.method(ShoppingList, "findOne", async (filter) => String(filter.householdId) === String(household) && String(filter._id) === String(id) ? legacy : null);
  t.mock.method(ShoppingList.prototype, "save", async function () { await this.validate(); return this; });
  let res = response();
  await controller.listShoppingLists({ user }, res);
  assert.equal(res.body[0].title, "Groceries");
  assert.equal(String(query.$or[1].householdId), String(household));
  const itemId = String(legacy.items[0]._id);
  res = response();
  await controller.toggleLegacyShoppingItem({ user, params: { id: String(id), itemId } }, res);
  assert.equal(res.body.items[0].completed, true);
  res = response();
  await controller.updateLegacyShoppingList({ user, params: { id: String(id) }, body: { title: "Food", items: [{ _id: itemId, description: "Milk", quantity: 2, completed: true }] } }, res);
  assert.equal(res.body.title, "Food");
  assert.equal(String(res.body.items[0]._id), itemId);
  assert.equal(res.body.items[0].quantity, 2);
  res = response();
  await controller.updateLegacyShoppingList({ user: { _id: other, householdId: other }, params: { id: String(id) }, body: { title: "Denied" } }, res);
  assert.equal(res.statusCode, 404);
});
