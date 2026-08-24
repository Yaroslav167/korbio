import test from "node:test";
import assert from "node:assert/strict";
import { IMPROVEMENT_STEPS, SHOP_INTEGRATIONS, parsePartnerCatalog } from "../src/support.js";

test("führt alle vier gewünschten Online-Shop-Anbindungen", () => {
  assert.deepEqual(SHOP_INTEGRATIONS.map((entry) => entry.shopId), ["amazon", "otto", "mediamarkt", "ikea"]);
  assert.ok(SHOP_INTEGRATIONS.every((entry) => entry.target >= 1_000));
  assert.ok(IMPROVEMENT_STEPS.length >= 8);
});

test("importiert einen autorisierten JSON-Katalog", () => {
  const result = parsePartnerCatalog(JSON.stringify([
    {
      id: "B012345",
      name: "Kabellose Kopfhörer",
      price: 49.99,
      url: "https://www.amazon.de/dp/B012345",
      image: "https://images.example.test/headphones.jpg",
      category: "Technik"
    }
  ]), "amazon", new Date("2026-08-14T12:00:00Z"));

  assert.equal(result.products.length, 1);
  assert.equal(result.products[0].priceCents, 4_999);
  assert.equal(result.products[0].shopId, "amazon");
  assert.equal(result.products[0].priceStatus, "partner-feed");
  assert.equal(result.products[0].checkoutEligible, false);
});

test("weist fremde oder unvollständige Produktlinks ab", () => {
  assert.throws(() => parsePartnerCatalog(JSON.stringify([
    { id: "1", name: "Falscher Link", price: 10, url: "https://example.com/product/1" }
  ]), "ikea"), /Kein gültiges Produkt/);
});

test("unterstützt CSV-Dateien mit deutschem Dezimalpreis", () => {
  const result = parsePartnerCatalog(
    "id;name;price;url;category\n123;Tischleuchte;19,99;https://www.ikea.com/de/de/p/tischleuchte-123;Wohnen",
    "ikea",
    new Date("2026-08-14T12:00:00Z")
  );
  assert.equal(result.products[0].priceCents, 1_999);
});
