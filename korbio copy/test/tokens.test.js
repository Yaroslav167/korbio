import test from "node:test";
import assert from "node:assert/strict";
import {
  TOKEN_PACKAGES,
  applyTokenTransaction,
  getTokenPackage,
  tokenCheckoutState,
  tokensForCents
} from "../src/tokens.js";

test("ein Token entspricht genau einem Cent", () => {
  assert.equal(tokensForCents(1_579), 1_579);
  assert.throws(() => tokensForCents(1.5));
});

test("Token-Pakete enthalten keine Bonus- oder versteckte Umrechnung", () => {
  assert.equal(TOKEN_PACKAGES.length, 3);
  assert.ok(TOKEN_PACKAGES.every((entry) => entry.tokens === entry.priceCents));
  assert.equal(getTokenPackage("alltag").tokens, 1_500);
  assert.equal(getTokenPackage("unbekannt"), null);
});

test("zeigt fehlendes und verbleibendes Guthaben korrekt", () => {
  assert.deepEqual(tokenCheckoutState(1_000, 1_250), {
    balance: 1_000,
    required: 1_250,
    enough: false,
    missing: 250,
    remaining: 0
  });
  assert.equal(tokenCheckoutState(2_000, 1_250).remaining, 750);
});

test("Buchungen sind idempotent und ein Guthaben kann nicht negativ werden", () => {
  const toppedUp = applyTokenTransaction({ balance: 0, transactions: [] }, { id: "topup-1", amount: 500, label: "Aufladung" });
  assert.equal(toppedUp.balance, 500);
  assert.equal(applyTokenTransaction(toppedUp, { id: "topup-1", amount: 500 }).balance, 500);
  assert.throws(() => applyTokenTransaction(toppedUp, { id: "spend-1", amount: -501 }), /Nicht genügend/);
});
