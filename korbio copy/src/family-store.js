import { randomBytes, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

function now() {
  return new Date().toISOString();
}

function cleanText(value, maxLength = 80) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

export function createFamilyStore(filename = ":memory:") {
  const database = new DatabaseSync(filename);
  database.exec("PRAGMA foreign_keys = ON");
  if (filename !== ":memory:") database.exec("PRAGMA journal_mode = WAL");
  database.exec(`
    CREATE TABLE IF NOT EXISTS wallet (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      balance_tokens INTEGER NOT NULL DEFAULT 0 CHECK (balance_tokens >= 0),
      updated_at TEXT NOT NULL
    );
    INSERT OR IGNORE INTO wallet (id, balance_tokens, updated_at) VALUES (1, 0, datetime('now'));

    CREATE TABLE IF NOT EXISTS token_transactions (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      amount_tokens INTEGER NOT NULL,
      balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
      label TEXT NOT NULL,
      reference TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS topup_requests (
      id TEXT PRIMARY KEY,
      reference TEXT NOT NULL UNIQUE,
      member_name TEXT NOT NULL,
      package_id TEXT NOT NULL,
      tokens INTEGER NOT NULL CHECK (tokens > 0),
      amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
      status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'canceled')),
      created_at TEXT NOT NULL,
      confirmed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS family_orders (
      id TEXT PRIMARY KEY,
      total_tokens INTEGER NOT NULL CHECK (total_tokens > 0),
      status TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  function transaction(callback) {
    database.exec("BEGIN IMMEDIATE");
    try {
      const result = callback();
      database.exec("COMMIT");
      return result;
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }

  function balance() {
    return Number(database.prepare("SELECT balance_tokens FROM wallet WHERE id = 1").get()?.balance_tokens || 0);
  }

  function snapshot() {
    return {
      balance: balance(),
      transactions: database.prepare(`
        SELECT id, kind, amount_tokens AS amount, balance_after AS balanceAfter,
               label, reference, created_at AS createdAt
        FROM token_transactions ORDER BY created_at DESC LIMIT 50
      `).all(),
      topups: database.prepare(`
        SELECT id, reference, member_name AS memberName, package_id AS packageId,
               tokens, amount_cents AS amountCents, status, created_at AS createdAt,
               confirmed_at AS confirmedAt
        FROM topup_requests ORDER BY created_at DESC LIMIT 50
      `).all()
    };
  }

  function createTopup({ memberName, tokenPackage }) {
    const name = cleanText(memberName, 50);
    if (!name || !tokenPackage?.id || tokenPackage.tokens !== tokenPackage.priceCents) {
      throw new TypeError("Ungültige Aufladungsanfrage");
    }
    const createdAt = now();
    const topup = {
      id: `topup-${randomUUID()}`,
      reference: `KORBIO-${randomBytes(4).toString("hex").toUpperCase()}`,
      memberName: name,
      packageId: tokenPackage.id,
      tokens: tokenPackage.tokens,
      amountCents: tokenPackage.priceCents,
      status: "pending",
      createdAt
    };
    database.prepare(`
      INSERT INTO topup_requests
        (id, reference, member_name, package_id, tokens, amount_cents, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
    `).run(topup.id, topup.reference, topup.memberName, topup.packageId, topup.tokens, topup.amountCents, createdAt);
    return topup;
  }

  function confirmTopup(id) {
    return transaction(() => {
      const topup = database.prepare("SELECT * FROM topup_requests WHERE id = ?").get(id);
      if (!topup) throw Object.assign(new Error("Aufladung wurde nicht gefunden"), { statusCode: 404 });
      if (topup.status === "confirmed") return snapshot();
      if (topup.status !== "pending") throw Object.assign(new Error("Aufladung kann nicht bestätigt werden"), { statusCode: 409 });
      const nextBalance = balance() + Number(topup.tokens);
      const createdAt = now();
      database.prepare("UPDATE wallet SET balance_tokens = ?, updated_at = ? WHERE id = 1").run(nextBalance, createdAt);
      database.prepare("UPDATE topup_requests SET status = 'confirmed', confirmed_at = ? WHERE id = ? AND status = 'pending'").run(createdAt, id);
      database.prepare(`
        INSERT INTO token_transactions
          (id, kind, amount_tokens, balance_after, label, reference, created_at)
        VALUES (?, 'topup', ?, ?, ?, ?, ?)
      `).run(`tx-${id}`, Number(topup.tokens), nextBalance, `${topup.member_name} · Familienbeitrag`, topup.reference, createdAt);
      return snapshot();
    });
  }

  function adjust({ amountTokens, reason }) {
    const amount = Number(amountTokens);
    const label = cleanText(reason, 100);
    if (!Number.isInteger(amount) || amount === 0 || !label) throw new TypeError("Ungültige Korrekturbuchung");
    return transaction(() => {
      const nextBalance = balance() + amount;
      if (nextBalance < 0) throw Object.assign(new Error("Das Guthaben reicht für diese Korrektur nicht aus"), { statusCode: 409 });
      const createdAt = now();
      const id = `adjustment-${randomUUID()}`;
      database.prepare("UPDATE wallet SET balance_tokens = ?, updated_at = ? WHERE id = 1").run(nextBalance, createdAt);
      database.prepare(`
        INSERT INTO token_transactions
          (id, kind, amount_tokens, balance_after, label, reference, created_at)
        VALUES (?, 'adjustment', ?, ?, ?, NULL, ?)
      `).run(id, amount, nextBalance, label, createdAt);
      return snapshot();
    });
  }

  function createOrder(order) {
    if (!order?.id || !Number.isInteger(order.tokensSpent) || order.tokensSpent < 1) {
      throw new TypeError("Ungültiger Familienauftrag");
    }
    return transaction(() => {
      const existing = database.prepare("SELECT payload_json FROM family_orders WHERE id = ?").get(order.id);
      if (existing) return { order: JSON.parse(existing.payload_json), wallet: snapshot() };
      const currentBalance = balance();
      if (currentBalance < order.tokensSpent) {
        throw Object.assign(new Error(`Es fehlen ${order.tokensSpent - currentBalance} Token`), { statusCode: 409 });
      }
      const nextBalance = currentBalance - order.tokensSpent;
      const createdAt = order.createdAt || now();
      database.prepare("UPDATE wallet SET balance_tokens = ?, updated_at = ? WHERE id = 1").run(nextBalance, createdAt);
      database.prepare(`
        INSERT INTO token_transactions
          (id, kind, amount_tokens, balance_after, label, reference, created_at)
        VALUES (?, 'order', ?, ?, ?, ?, ?)
      `).run(`tx-${order.id}`, -order.tokensSpent, nextBalance, `Auftrag ${order.id}`, order.id, createdAt);
      database.prepare(`
        INSERT INTO family_orders (id, total_tokens, status, payload_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(order.id, order.tokensSpent, order.status || "open", JSON.stringify(order), createdAt, createdAt);
      return { order, wallet: snapshot() };
    });
  }

  function listOrders() {
    return database.prepare("SELECT payload_json FROM family_orders ORDER BY created_at DESC LIMIT 200")
      .all()
      .map((row) => JSON.parse(row.payload_json));
  }

  function updateOrderItem(orderId, lineId, picked) {
    return transaction(() => {
      const row = database.prepare("SELECT payload_json FROM family_orders WHERE id = ?").get(orderId);
      if (!row) throw Object.assign(new Error("Auftrag wurde nicht gefunden"), { statusCode: 404 });
      const order = JSON.parse(row.payload_json);
      const item = order.items.find((entry) => entry.lineId === lineId);
      if (!item) throw Object.assign(new Error("Artikel wurde nicht gefunden"), { statusCode: 404 });
      item.picked = Boolean(picked);
      order.status = order.items.every((entry) => entry.picked) ? "done" : "open";
      const updatedAt = now();
      database.prepare("UPDATE family_orders SET status = ?, payload_json = ?, updated_at = ? WHERE id = ?")
        .run(order.status, JSON.stringify(order), updatedAt, orderId);
      return order;
    });
  }

  return {
    adjust,
    close: () => database.close(),
    confirmTopup,
    createOrder,
    createTopup,
    listOrders,
    snapshot,
    updateOrderItem
  };
}
