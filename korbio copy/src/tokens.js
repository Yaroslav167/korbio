export const TOKEN_CENT_VALUE = 1;

export const TOKEN_PACKAGES = Object.freeze([
  Object.freeze({ id: "mini", tokens: 500, priceCents: 500, label: "Mini", accent: "mint" }),
  Object.freeze({ id: "alltag", tokens: 1_500, priceCents: 1_500, label: "Alltag", accent: "violet", recommended: true }),
  Object.freeze({ id: "vorrat", tokens: 5_000, priceCents: 5_000, label: "Vorrat", accent: "sun" })
]);

export function getTokenPackage(packageId) {
  return TOKEN_PACKAGES.find((entry) => entry.id === packageId) || null;
}

export function tokensForCents(cents) {
  const amount = Number(cents);
  if (!Number.isInteger(amount) || amount < 0) throw new TypeError("Ungültiger Cent-Betrag");
  return amount / TOKEN_CENT_VALUE;
}

export function tokenCheckoutState(balance, totalCents) {
  const safeBalance = Math.max(0, Math.floor(Number(balance) || 0));
  const required = tokensForCents(totalCents);
  return {
    balance: safeBalance,
    required,
    enough: safeBalance >= required,
    missing: Math.max(0, required - safeBalance),
    remaining: Math.max(0, safeBalance - required)
  };
}

export function normalizeWallet(value) {
  const balance = Math.max(0, Math.floor(Number(value?.balance) || 0));
  const transactions = Array.isArray(value?.transactions)
    ? value.transactions
      .filter((entry) => entry && typeof entry.id === "string" && Number.isInteger(entry.amount))
      .slice(0, 50)
    : [];
  return { balance, transactions };
}

export function applyTokenTransaction(wallet, transaction) {
  const current = normalizeWallet(wallet);
  if (!transaction || typeof transaction.id !== "string" || !Number.isInteger(transaction.amount)) {
    throw new TypeError("Ungültige Token-Buchung");
  }
  if (current.transactions.some((entry) => entry.id === transaction.id)) return current;
  const nextBalance = current.balance + transaction.amount;
  if (nextBalance < 0) throw new RangeError("Nicht genügend Token");
  return {
    balance: nextBalance,
    transactions: [{
      id: transaction.id,
      amount: transaction.amount,
      label: String(transaction.label || "Token-Buchung").slice(0, 80),
      createdAt: transaction.createdAt || new Date().toISOString(),
      paymentId: transaction.paymentId || null
    }, ...current.transactions].slice(0, 50)
  };
}
