import test from "node:test";
import assert from "node:assert/strict";
import { createFamilyStore } from "../src/family-store.js";

const mini = { id: "mini", tokens: 500, priceCents: 500 };

test("bestätigt einen Familienbeitrag genau einmal", () => {
  const store = createFamilyStore();
  const request = store.createTopup({ memberName: "Anna", tokenPackage: mini });
  assert.equal(store.snapshot().balance, 0);
  assert.equal(store.confirmTopup(request.id).balance, 500);
  assert.equal(store.confirmTopup(request.id).balance, 500);
  assert.equal(store.snapshot().transactions.length, 1);
  store.close();
});

test("zieht einen Auftrag atomar vom gemeinsamen Guthaben ab", () => {
  const store = createFamilyStore();
  const request = store.createTopup({ memberName: "Max", tokenPackage: mini });
  store.confirmTopup(request.id);
  const order = { id: "K-FAMILY1", tokensSpent: 125, status: "open", items: [{ lineId: "1", picked: false }] };
  assert.equal(store.createOrder(order).wallet.balance, 375);
  assert.equal(store.createOrder(order).wallet.balance, 375);
  assert.equal(store.listOrders().length, 1);
  store.close();
});

test("verhindert negative Guthaben und speichert den Abhakstatus", () => {
  const store = createFamilyStore();
  assert.throws(() => store.createOrder({ id: "K-NOPE", tokensSpent: 1, items: [] }), /fehlen/);
  const request = store.createTopup({ memberName: "Mia", tokenPackage: mini });
  store.confirmTopup(request.id);
  store.createOrder({ id: "K-FAMILY2", tokensSpent: 100, status: "open", items: [{ lineId: "line-1", picked: false }] });
  assert.equal(store.updateOrderItem("K-FAMILY2", "line-1", true).status, "done");
  assert.throws(() => store.adjust({ amountTokens: -1_000, reason: "Fehler" }), /reicht/);
  store.close();
});
