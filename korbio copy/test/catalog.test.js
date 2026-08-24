import test from "node:test";
import assert from "node:assert/strict";
import { products, shops } from "../src/catalog.js";

test("bereitet die gewünschten bekannten Händler vor", () => {
  assert.equal(shops.length, 14);
  for (const retailer of ["rewe", "lidl", "aldi", "edeka", "dm", "amazon", "mediamarkt", "ikea", "zalando"]) {
    assert.ok(shops.some((shop) => shop.id === retailer), `${retailer} fehlt`);
  }
});

test("jeder bestätigte Preis hat Quelle und Prüfdatum", () => {
  const verified = products.filter((product) => product.verified);
  assert.ok(verified.length >= 6);
  for (const product of verified) {
    assert.match(product.sourceUrl, /^https:\/\//);
    assert.match(product.checkedAt, /^\d{2}\.\d{2}\.\d{4}$/);
    assert.ok(Number.isInteger(product.priceCents) && product.priceCents > 0);
  }
});

test("alle Produkte verweisen auf einen existierenden Händler", () => {
  const shopIds = new Set(shops.map((shop) => shop.id));
  for (const product of products) assert.ok(shopIds.has(product.shopId), product.id);
});
