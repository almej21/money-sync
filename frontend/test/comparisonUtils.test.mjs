import test from "node:test";
import assert from "node:assert/strict";
import { searchDelay, itemName, selectionExists, validRank } from "../src/components/comparisonUtils.mjs";

test("search waits for at least three characters and debounces typing", () => {
  assert.equal(searchDelay("חל"), null);
  assert.equal(searchDelay("חלב"), 700);
  assert.equal(searchDelay("סלמון"), 700);
  assert.equal(searchDelay("סלמון טרי"), 700);
});

test("only trustworthy complete baskets can display a ranking", () => {
  assert.equal(validRank({ complete: true, rank: 1 }, { comparisonIncomplete: false }), true);
  assert.equal(validRank({ complete: false, rank: 1 }, { comparisonIncomplete: false }), false);
  assert.equal(validRank({ complete: true, rank: 1 }, { comparisonIncomplete: true }), false);
  assert.equal(validRank({ complete: true, rank: null }, { comparisonIncomplete: false }), false);
});

test("populated items are identified and duplicate selections ignore barcode order", () => {
  const items = [{ selectionType: "same_name", productIds: [{ barcode: "123", name: "Milk" }, { barcode: "456", name: "Milk" }] }];
  assert.equal(itemName(items[0], "Unknown"), "Milk");
  assert.equal(selectionExists(items, ["456", "123"]), true);
  assert.equal(selectionExists(items, ["123"]), false);
  assert.equal(itemName({}, "Unknown"), "Unknown");
});
