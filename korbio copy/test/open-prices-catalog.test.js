import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const catalog = JSON.parse(await readFile(new URL("../data/open-prices-catalog.json", import.meta.url), "utf8"));

test("enthält mehrere Tausend belegte Preisprodukte", () => {
  assert.ok(catalog.products.length >= 6_000);
  assert.equal(catalog.meta.productCount, catalog.products.length);
  assert.match(catalog.meta.license, /ODbL|Open Database License/);
});

test("jeder importierte Preis nennt Händler, Eurobetrag, Datum und Beleg", () => {
  for (const product of catalog.products) {
    assert.match(product.id, /^open-price-\d+$/);
    assert.ok(Number.isInteger(product.priceCents) && product.priceCents > 0);
    assert.match(product.checkedAt, /^\d{2}\.\d{2}\.\d{4}$/);
    assert.match(product.sourceUrl, /^https:\/\/prices\.openfoodfacts\.org\/api\/v1\/prices\/\d+$/);
    assert.equal(product.priceStatus, "observed");
    assert.equal(product.checkoutEligible, false);
  }
});

test("deckt mehrere bekannte deutsche Händler ab", () => {
  const shops = new Set(catalog.products.map((product) => product.shopId));
  for (const shopId of ["rewe", "lidl", "aldi", "edeka", "kaufland", "penny", "netto", "dm", "rossmann"]) {
    assert.ok(shops.has(shopId), `${shopId} fehlt`);
  }
  assert.ok(catalog.meta.shopCounts.penny >= 100, "PENNY-Sortiment ist zu klein");
  assert.ok(catalog.meta.shopCounts.lidl >= 500, "Lidl-Sortiment ist zu klein");
  assert.ok(catalog.meta.shopCounts.rewe >= 900, "REWE-Sortiment ist zu klein");
});
