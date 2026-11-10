import test from "node:test";
import assert from "node:assert/strict";
import * as priceil from "../src/services/priceil.service.js";
import { searchCatalog, getCatalogGroup, getCatalogPrices } from "../src/controllers/catalogController.js";

function response() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test("catalog validates query, group id and barcode before requests", async () => {
  for (const [handler, req] of [
    [searchCatalog, { query: { q: ["milk", "bread"] } }],
    [searchCatalog, { query: { q: "  " } }],
    [getCatalogGroup, { params: { id: "../1" } }],
    [getCatalogPrices, { params: { barcode: "12abc" } }],
  ]) {
    const res = response();
    await handler(req, res, assert.fail);
    assert.equal(res.statusCode, 400);
    assert.equal(typeof res.body.message, "string");
  }
});

test("search returns matching specific products without duplicates", async (t) => {
  t.mock.method(globalThis, "fetch", async (url) => ({ ok: true, json: async () => ({ success: true, data: url.pathname.endsWith('/prices') ? { product: { itemCode: url.pathname.split('/')[2] }, prices: [{ storeName: "Branch", city: "6600", price: "12.50" }, { storeName: "Other", city: "Haifa", price: "0.00" }, { storeName: "Unknown", city: "999999" }, { storeName: "Missing", city: null }] } : {
    bestMatch: { itemCode: "123", itemName: "חלב תנובה", manufacturerName: "תנובה", quantity: "1", unitQty: "ליטר" },
    allOthers: [{ itemCode: "123", itemName: "חלב תנובה" }, { itemCode: "456", itemName: "לחם" }, { itemCode: "789", itemName: "חלב תנובה" }],
  } }) }));
  const res = response();
  await searchCatalog({ query: { q: " חלב " } }, res, assert.fail);
  assert.deepEqual(res.body.data.products.map((product) => product.barcodes), [["123"], ["789"]]);
  assert.deepEqual(res.body.data.products[0].barcodeDetails, [{ barcode: "123", stores: [{ storeName: "Branch", city: "חולון", price: "12.50" }, { storeName: "Other", city: "Haifa", price: "0.00" }, { storeName: "Unknown", city: "999999", price: null }, { storeName: "Missing", city: null, price: null }], status: "ok" }]);
  assert.equal(res.body.data.coverage, "first_page_only");
  const filtered = response();
  await searchCatalog({ query: { q: "חלב", cities: "חולון, 4000" } }, filtered, assert.fail);
  assert.deepEqual(filtered.body.data.products[0].barcodeDetails[0].stores, [{ storeName: "Branch", city: "חולון", price: "12.50" }, { storeName: "Other", city: "Haifa", price: "0.00" }]);
  assert.deepEqual(filtered.body.data.lookupFailures, []);
  const noMatch = response();
  await searchCatalog({ query: { q: "חלב", cities: ["ירושלים", "תל אביב -יפו"] } }, noMatch, assert.fail);
  assert.deepEqual(noMatch.body.data.products, []);
  const invalidCities = response();
  await searchCatalog({ query: { q: "חלב", cities: "חולון," } }, invalidCities, assert.fail);
  assert.equal(invalidCities.statusCode, 400);
  const short = response();
  await searchCatalog({ query: { q: "ab" } }, short, assert.fail);
  assert.equal(short.statusCode, 400);
});

test("filtered search reports failed barcode lookups", async (t) => {
  t.mock.method(globalThis, "fetch", async (url) => url.pathname.endsWith("/prices")
    ? { ok: false, status: 503 }
    : { ok: true, json: async () => ({ success: true, data: { bestMatch: { itemCode: "112233", itemName: "Unique Bread" }, allOthers: [] } }) });
  const res = response();
  await searchCatalog({ query: { q: "Unique Bread", cities: "חולון" } }, res, assert.fail);
  assert.deepEqual(res.body.data.products, []);
  assert.deepEqual(res.body.data.lookupFailures, ["112233"]);
});

test("PriceIL requests use documented paths, cache successes and preserve data", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(url.toString());
    return { ok: true, json: async () => ({ success: true, data: { bestMatch: null, allOthers: [], total: 0 } }) };
  };
  try {
    const result = await priceil.searchProducts("test milk");
    assert.equal(result.total, 0);
    assert.equal(new URL(calls[0]).pathname, "/products");
    assert.equal(new URL(calls[0]).searchParams.get("q"), "test milk");
    await priceil.searchProducts("test milk");
    assert.equal(calls.length, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test("PriceIL errors are translated and failures are not cached", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return { ok: false, status: 429 }; };
  try {
    for (let i = 0; i < 2; i++) {
      await assert.rejects(priceil.getProductPrices("987654321"), { status: 503 });
    }
    assert.equal(calls, 2);
  } finally { globalThis.fetch = originalFetch; }
});

test("product prices filter city and reject invalid city input", async (t) => {
  t.mock.method(globalThis, "fetch", async () => ({ ok: true, json: async () => ({ success: true, data: { product: { itemCode: "999888" }, prices: [{ city: "Haifa", price: "2.00" }, { city: "Tel Aviv", price: "1.00" }, { city: null, price: "3.00" }, { city: "6600", price: "11.90" }, { city: "חולון", price: "12.00" }] } }) }));
  const res = response();
  await getCatalogPrices({ params: { barcode: "999888" }, query: { city: " haifa " } }, res, assert.fail);
  assert.deepEqual(res.body.data.prices, [{ city: "Haifa", price: "2.00" }]);
  const holon = response();
  await getCatalogPrices({ params: { barcode: "999888" }, query: { city: "חולון" } }, holon, assert.fail);
  assert.deepEqual(holon.body.data.prices.map((p) => p.city), ["6600", "חולון"]);
  const code = response();
  await getCatalogPrices({ params: { barcode: "999888" }, query: { city: "6600" } }, code, assert.fail);
  assert.deepEqual(code.body.data.prices.map((p) => p.city), ["6600", "חולון"]);
  const bad = response();
  await getCatalogPrices({ params: { barcode: "999888" }, query: { city: ["Haifa", "Other"] } }, bad, assert.fail);
  assert.equal(bad.statusCode, 400);
});

test("mixed weighted and unweighted exact-name search results form one selection", async (t) => {
  t.mock.method(globalThis, "fetch", async (url) => ({ ok: true, json: async () => ({ success: true, data: url.pathname.endsWith('/prices') ? { product: { itemCode: url.pathname.split('/')[2] }, prices: [] } : { bestMatch: { itemCode: "321", itemName: "Salmon", isWeighted: true, unitQty: "kg", quantity: "1" }, allOthers: [{ itemCode: "322", itemName: "Salmon", isWeighted: false, unitQty: null, quantity: null }] } }) }));
  const res = response();
  await searchCatalog({ query: { q: "Salmon" } }, res, assert.fail);
  assert.deepEqual(res.body.data.products.map((p) => [p.barcodes, p.basis]), [[["321", "322"], "kg"]]);
});
