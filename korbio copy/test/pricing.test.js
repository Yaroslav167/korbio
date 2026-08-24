import test from "node:test";
import assert from "node:assert/strict";
import {
  SERVICE_FEE_CENTS,
  formatEuro,
  getCartTotals,
  groupCartByShop,
  normalizeQuantity
} from "../src/pricing.js";

const products = [
  { id: "milk", shopId: "rewe", priceCents: 129 },
  { id: "oats", shopId: "dm", priceCents: 85 }
];
const shops = [
  { id: "rewe", name: "REWE" },
  { id: "dm", name: "dm" }
];

test("berechnet zehn Cent Aufschlag pro Stück", () => {
  const totals = getCartTotals(
    [
      { productId: "milk", quantity: 2 },
      { productId: "oats", quantity: 1 }
    ],
    products
  );
  assert.equal(SERVICE_FEE_CENTS, 10);
  assert.deepEqual(totals, {
    itemCount: 3,
    subtotalCents: 343,
    serviceFeeCents: 30,
    totalCents: 373
  });
});

test("ignoriert unbekannte Produkte und begrenzt Mengen", () => {
  assert.equal(normalizeQuantity(0), 1);
  assert.equal(normalizeQuantity(150), 99);
  assert.equal(normalizeQuantity("3"), 3);
  assert.equal(getCartTotals([{ productId: "missing", quantity: 5 }], products).itemCount, 0);
});

test("gruppiert den Warenkorb nach Händler", () => {
  const groups = groupCartByShop(
    [
      { productId: "milk", quantity: 1 },
      { productId: "oats", quantity: 2 }
    ],
    products,
    shops
  );
  assert.equal(groups.length, 2);
  assert.equal(groups[1].shop.name, "dm");
  assert.equal(groups[1].items[0].quantity, 2);
});

test("formatiert Euro auf Deutsch", () => {
  assert.match(formatEuro(129), /1,29/);
});
