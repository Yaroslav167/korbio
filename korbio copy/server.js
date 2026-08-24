import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { products as seedProducts } from "./src/catalog.js";
import { createFamilyStore } from "./src/family-store.js";
import { getCartTotals, normalizeQuantity } from "./src/pricing.js";
import { getTokenPackage, TOKEN_PACKAGES } from "./src/tokens.js";

const root = dirname(fileURLToPath(import.meta.url));
await loadLocalEnv();
const importedCatalog = await loadImportedCatalog();
const products = [...seedProducts, ...importedCatalog];
const familyStore = createFamilyStore(process.env.FAMILY_DB_PATH || join(root, "data", "family-wallet.sqlite"));

const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "127.0.0.1";
const sessions = new Map();
const loginAttempts = new Map();
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const mime = {
  ".css": "text/css; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json"
};

async function loadLocalEnv() {
  const file = await readFile(join(root, ".env"), "utf8").catch(() => "");
  for (const line of file.split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, "$2");
  }
}

async function loadImportedCatalog() {
  const raw = await readFile(join(root, "data", "open-prices-catalog.json"), "utf8").catch(() => "");
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.products) ? parsed.products : [];
  } catch {
    console.warn("Open-Prices-Katalog konnte nicht gelesen werden; Seed-Katalog bleibt aktiv.");
    return [];
  }
}

function familySettings() {
  const settings = {
    accessPassword: process.env.FAMILY_ACCESS_PASSWORD || "",
    adminPassword: process.env.FAMILY_ADMIN_PASSWORD || "",
    accessPasswordHash: process.env.FAMILY_ACCESS_PASSWORD_HASH || "",
    adminPasswordHash: process.env.FAMILY_ADMIN_PASSWORD_HASH || "",
    accountHolder: process.env.FAMILY_ACCOUNT_HOLDER || "",
    iban: String(process.env.FAMILY_IBAN || "").replace(/\s+/g, "").toUpperCase()
  };
  const missing = [];
  if (settings.accessPassword.length < 10 && !validPasswordHash(settings.accessPasswordHash)) missing.push("FAMILY_ACCESS_PASSWORD_HASH");
  if (settings.adminPassword.length < 12 && !validPasswordHash(settings.adminPasswordHash)) missing.push("FAMILY_ADMIN_PASSWORD_HASH");
  if (settings.iban && !/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(settings.iban)) missing.push("FAMILY_IBAN");
  if (settings.iban && !settings.accountHolder) missing.push("FAMILY_ACCOUNT_HOLDER");
  if (settings.accessPassword && settings.accessPassword === settings.adminPassword) missing.push("GETRENNTE_PASSWÖRTER");
  return { ...settings, configured: missing.length === 0, missing };
}

function validPasswordHash(value) {
  return /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{64}$/i.test(String(value || ""));
}

function sendJson(response, status, value, headers = {}) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    ...headers
  });
  response.end(JSON.stringify(value));
}

async function readBody(request, limit = 64_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error("Anfrage ist zu groß"), { statusCode: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function publicBaseUrl(request) {
  const candidate = process.env.APP_URL || `http://${request.headers.host}`;
  const url = new URL(candidate);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error("APP_URL ist ungültig");
  return url.origin;
}

function assertSameOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return;
  if (origin !== publicBaseUrl(request)) {
    throw Object.assign(new Error("Anfrage stammt nicht von Korbio"), { statusCode: 403 });
  }
}

function cleanText(value, maxLength) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function passwordMatches(input, expected, encodedHash) {
  if (validPasswordHash(encodedHash)) {
    const [, salt, expectedHex] = encodedHash.split("$");
    const actual = scryptSync(String(input), salt, 32);
    return timingSafeEqual(actual, Buffer.from(expectedHex, "hex"));
  }
  const left = createHash("sha256").update(String(input)).digest();
  const right = createHash("sha256").update(String(expected)).digest();
  return timingSafeEqual(left, right);
}

function sessionHash(token) {
  return createHash("sha256").update(token).digest("hex");
}

function parseCookies(request) {
  return Object.fromEntries(String(request.headers.cookie || "").split(";").map((part) => {
    const [key, ...rest] = part.trim().split("=");
    return [key, decodeURIComponent(rest.join("="))];
  }).filter(([key]) => key));
}

function currentSession(request) {
  const token = parseCookies(request).korbio_family_session;
  if (!token) return null;
  const session = sessions.get(sessionHash(token));
  if (!session || session.expiresAt <= Date.now()) {
    if (session) sessions.delete(sessionHash(token));
    return null;
  }
  return session;
}

function requireSession(request, role) {
  const session = currentSession(request);
  if (!session) throw Object.assign(new Error("Bitte zuerst bei der Familienkasse anmelden"), { statusCode: 401 });
  if (role === "admin" && session.role !== "admin") {
    throw Object.assign(new Error("Dafür wird das Adminpasswort benötigt"), { statusCode: 403 });
  }
  return session;
}

function sessionCookie(request, token, maxAge = SESSION_MAX_AGE_SECONDS) {
  const secure = publicBaseUrl(request).startsWith("https://") ? "; Secure" : "";
  return `korbio_family_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

function checkLoginRate(request) {
  const key = request.socket.remoteAddress || "local";
  const current = loginAttempts.get(key) || { count: 0, resetAt: Date.now() + 5 * 60_000 };
  if (current.resetAt <= Date.now()) Object.assign(current, { count: 0, resetAt: Date.now() + 5 * 60_000 });
  current.count += 1;
  loginAttempts.set(key, current);
  if (current.count > 10) throw Object.assign(new Error("Zu viele Anmeldeversuche. Bitte fünf Minuten warten."), { statusCode: 429 });
}

function walletPayload() {
  return familyStore.snapshot();
}

function bankPayload(settings = familySettings()) {
  return settings.iban ? { accountHolder: settings.accountHolder, iban: settings.iban } : null;
}

function authPayload(session) {
  const settings = familySettings();
  if (!session) return { authenticated: false, configured: settings.configured, missing: settings.missing };
  return {
    authenticated: true,
    configured: settings.configured,
    memberName: session.memberName,
    role: session.role,
    bank: bankPayload(settings),
    wallet: walletPayload(),
    orders: familyStore.listOrders()
  };
}

async function login(request, response) {
  assertSameOrigin(request);
  checkLoginRate(request);
  const settings = familySettings();
  if (!settings.configured) {
    return sendJson(response, 503, {
      code: "FAMILY_SETUP_REQUIRED",
      message: "Die private Familienkasse muss zuerst lokal eingerichtet werden.",
      missing: settings.missing
    });
  }
  const body = JSON.parse(await readBody(request));
  const memberName = cleanText(body.memberName, 50);
  if (memberName.length < 2) return sendJson(response, 400, { code: "INVALID_NAME", message: "Bitte einen Familiennamen eingeben." });
  const role = passwordMatches(body.password, settings.adminPassword, settings.adminPasswordHash)
    ? "admin"
    : passwordMatches(body.password, settings.accessPassword, settings.accessPasswordHash)
      ? "member"
      : null;
  if (!role) return sendJson(response, 401, { code: "LOGIN_FAILED", message: "Das Familienpasswort stimmt nicht." });

  const token = randomBytes(32).toString("base64url");
  sessions.set(sessionHash(token), {
    memberName,
    role,
    expiresAt: Date.now() + SESSION_MAX_AGE_SECONDS * 1000
  });
  return sendJson(response, 200, authPayload({ memberName, role }), { "set-cookie": sessionCookie(request, token) });
}

function logout(request, response) {
  assertSameOrigin(request);
  const token = parseCookies(request).korbio_family_session;
  if (token) sessions.delete(sessionHash(token));
  return sendJson(response, 200, { ok: true }, { "set-cookie": sessionCookie(request, "", 0) });
}

function validatedCart(items) {
  if (!Array.isArray(items) || items.length === 0 || items.length > 100) {
    throw Object.assign(new Error("Der Warenkorb ist leer oder ungültig"), { statusCode: 400 });
  }
  const seen = new Set();
  return items.map((entry) => {
    const product = products.find((candidate) => candidate.id === entry?.productId);
    if (!product || seen.has(product.id)) {
      throw Object.assign(new Error("Ein Produkt im Warenkorb ist ungültig"), { statusCode: 400 });
    }
    seen.add(product.id);
    return { productId: product.id, quantity: normalizeQuantity(entry.quantity), product };
  });
}

async function createTopup(request, response) {
  assertSameOrigin(request);
  const session = requireSession(request);
  const body = JSON.parse(await readBody(request));
  const tokenPackage = getTokenPackage(body.packageId);
  if (!tokenPackage) return sendJson(response, 400, { code: "INVALID_TOKEN_PACKAGE", message: "Dieses Paket gibt es nicht." });
  const topup = familyStore.createTopup({ memberName: session.memberName, tokenPackage });
  const settings = familySettings();
  return sendJson(response, 201, {
    topup,
    bank: bankPayload(settings),
    wallet: walletPayload()
  });
}

async function confirmTopup(request, response, topupId) {
  assertSameOrigin(request);
  requireSession(request, "admin");
  await readBody(request);
  return sendJson(response, 200, { wallet: familyStore.confirmTopup(topupId) });
}

async function createAdjustment(request, response) {
  assertSameOrigin(request);
  requireSession(request, "admin");
  const body = JSON.parse(await readBody(request));
  return sendJson(response, 200, { wallet: familyStore.adjust({ amountTokens: body.amountTokens, reason: body.reason }) });
}

async function createFamilyOrder(request, response) {
  assertSameOrigin(request);
  const session = requireSession(request);
  const body = JSON.parse(await readBody(request));
  const cart = validatedCart(body.items);
  const totals = getCartTotals(cart, products);
  const createdAt = new Date().toISOString();
  const orderId = `K-${Date.now().toString(36).toUpperCase()}-${randomBytes(2).toString("hex").toUpperCase()}`;
  const order = {
    id: orderId,
    createdAt,
    status: "open",
    paymentMode: "family",
    paymentMethod: "tokens",
    paymentStatus: "paid",
    paymentId: null,
    tokensSpent: totals.totalCents,
    createdBy: session.memberName,
    customer: {
      name: cleanText(body.customer?.name, 80),
      phone: cleanText(body.customer?.phone, 40),
      address: cleanText(body.customer?.address, 180),
      note: cleanText(body.customer?.note, 300)
    },
    totals,
    items: cart.map(({ product, quantity }, index) => ({
      lineId: `${orderId}-${index}`,
      productId: product.id,
      shopId: product.shopId,
      name: product.name,
      emoji: product.emoji,
      tone: product.tone,
      priceCents: product.priceCents,
      verified: product.verified,
      quantity,
      picked: false
    }))
  };
  if (!order.customer.name || !order.customer.phone || !order.customer.address) {
    return sendJson(response, 400, { code: "MISSING_CUSTOMER", message: "Name, Telefon und Adresse werden benötigt." });
  }
  const result = familyStore.createOrder(order);
  return sendJson(response, 201, result);
}

async function updateFamilyOrderItem(request, response, orderId, lineId) {
  assertSameOrigin(request);
  requireSession(request);
  const body = JSON.parse(await readBody(request));
  return sendJson(response, 200, { order: familyStore.updateOrderItem(orderId, lineId, body.picked) });
}

async function handleApi(request, response, pathname) {
  if (request.method === "GET" && pathname === "/api/config") {
    const settings = familySettings();
    return sendJson(response, 200, {
      mode: "family",
      configured: settings.configured,
      catalogProducts: products.length,
      tokenPackages: TOKEN_PACKAGES
    });
  }
  if (request.method === "GET" && pathname === "/api/health") {
    return sendJson(response, 200, { ok: true, mode: "family", configured: familySettings().configured, catalogProducts: products.length });
  }
  if (request.method === "GET" && pathname === "/api/family/session") return sendJson(response, 200, authPayload(currentSession(request)));
  if (request.method === "POST" && pathname === "/api/family/login") return login(request, response);
  if (request.method === "POST" && pathname === "/api/family/logout") return logout(request, response);
  if (request.method === "POST" && pathname === "/api/family/topups") return createTopup(request, response);
  if (request.method === "POST" && pathname === "/api/family/adjustments") return createAdjustment(request, response);
  if (request.method === "POST" && pathname === "/api/family/orders") return createFamilyOrder(request, response);

  const confirmMatch = pathname.match(/^\/api\/family\/topups\/([^/]+)\/confirm$/);
  if (request.method === "POST" && confirmMatch) return confirmTopup(request, response, confirmMatch[1]);
  const itemMatch = pathname.match(/^\/api\/family\/orders\/([^/]+)\/items\/([^/]+)$/);
  if (request.method === "PATCH" && itemMatch) return updateFamilyOrderItem(request, response, itemMatch[1], itemMatch[2]);
  return sendJson(response, 404, { code: "NOT_FOUND", message: "API-Endpunkt nicht gefunden." });
}

async function serveStatic(request, response, pathname) {
  const relativePath = normalize(pathname).replace(/^([/\\]|\.\.[/\\])+/, "");
  let filePath = join(root, relativePath || "index.html");
  const fileStat = await stat(filePath).catch(() => null);
  if (!fileStat || fileStat.isDirectory()) filePath = join(root, "index.html");
  const body = await readFile(filePath);
  response.writeHead(200, {
    "content-type": mime[extname(filePath)] || "application/octet-stream",
    "cache-control": extname(filePath) === ".html" ? "no-store" : "public, max-age=300",
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "x-frame-options": "DENY",
    "permissions-policy": "camera=(), microphone=(), geolocation=()"
  });
  response.end(request.method === "HEAD" ? undefined : body);
}

const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname);
    if (pathname.startsWith("/api/")) await handleApi(request, response, pathname);
    else await serveStatic(request, response, pathname);
  } catch (error) {
    if (response.headersSent) return response.end();
    const status = error.statusCode || (error instanceof SyntaxError || error instanceof TypeError ? 400 : 500);
    if (request.url?.startsWith("/api/")) {
      sendJson(response, status, {
        code: status === 500 ? "SERVER_ERROR" : "FAMILY_ERROR",
        message: status === 500 ? "Die Anfrage konnte nicht verarbeitet werden." : String(error.message).slice(0, 220)
      });
    } else {
      response.writeHead(status === 500 ? 404 : status, { "content-type": "text/plain; charset=utf-8" });
      response.end("Nicht gefunden");
    }
  }
});

server.listen(port, host, () => {
  const setup = familySettings().configured ? "bereit" : "Einrichtung erforderlich";
  console.log(`Korbio Familienkasse läuft auf http://localhost:${port} · ${products.length} Produkte · ${setup}`);
});

function shutdown() {
  server.close(() => {
    familyStore.close();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
