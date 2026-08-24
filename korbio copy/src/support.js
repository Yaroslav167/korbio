export const SHOP_INTEGRATIONS = [
  {
    shopId: "amazon",
    target: 1_000,
    title: "Amazon Creators API",
    requirement: "Amazon-PartnerNet beitreten, Creators API freischalten und Zugangsdaten erzeugen.",
    detail: "Amazon verlangt für den API-Zugriff ein Associates-Konto und die Freischaltung des Produktkatalogs.",
    actionLabel: "Amazon-Anleitung öffnen",
    actionUrl: "https://affiliate-program.amazon.com/creatorsapi/docs/"
  },
  {
    shopId: "otto",
    target: 1_000,
    title: "OTTO Market Partner-API",
    requirement: "Als Servicepartner registrieren, Sandbox prüfen lassen und eine Private App freischalten.",
    detail: "Der OTTO-Katalogzugang ist an registrierte Händler oder geprüfte Servicepartner gebunden.",
    actionLabel: "OTTO-Programm öffnen",
    actionUrl: "https://live.divae.developer.otto.market/de/funktionalitaeten/otto-market-apps-erstellen.html"
  },
  {
    shopId: "mediamarkt",
    target: 1_000,
    title: "MediaMarkt Produktfeed",
    requirement: "Eine Affiliate-/Kooperationsfreigabe und einen aktuellen Produktdatenfeed anfragen.",
    detail: "Für einen vollständigen aktuellen Katalog wird ein freigegebener Feed oder eine direkte Kooperation benötigt.",
    actionLabel: "MediaMarkt-Kontakt öffnen",
    actionUrl: "https://www.mediamarkt.de/de/about-us/affiliate/partnerprogramm"
  },
  {
    shopId: "ikea",
    target: 1_000,
    title: "IKEA Kooperation",
    requirement: "Bei IKEA eine Katalog-/Kooperationsfreigabe oder einen autorisierten Affiliate-Feed beantragen.",
    detail: "IKEA veröffentlicht keinen frei nutzbaren öffentlichen Vollkatalog für Drittanbieter-Apps.",
    actionLabel: "IKEA-Kooperation öffnen",
    actionUrl: "https://www.ikea.com/de/de/customer-service/knowledge/articles/c48cf8d0-3091-4f5e-9gfb-61e43e055665.html"
  }
];

export const IMPROVEMENT_STEPS = [
  { id: "catalog-access", priority: "Jetzt", title: "Händlerzugänge beantragen", detail: "Amazon, OTTO, MediaMarkt und IKEA für offizielle Katalogdaten kontaktieren." },
  { id: "catalog-test", priority: "Danach", title: "Je Händler einen Testfeed importieren", detail: "Mindestens 20 Produkte prüfen: Name, Preis, Bild, Produktlink und Aktualisierungsdatum." },
  { id: "catalog-automation", priority: "Danach", title: "Tägliche Preisaktualisierung aktivieren", detail: "Abgelaufene Produkte entfernen und Preisänderungen protokollieren." },
  { id: "family-backup", priority: "Wichtig", title: "Familienkasse sichern", detail: "Regelmäßig .env und data/family-wallet.sqlite verschlüsselt sichern und eine Wiederherstellung testen." },
  { id: "legal", priority: "Vor Veröffentlichung", title: "Impressum, Datenschutz und AGB ergänzen", detail: "Token-Guthaben, Widerruf, Erstattung, Lieferkosten und Verantwortlichkeiten rechtlich prüfen lassen." },
  { id: "hosting", priority: "Vor Veröffentlichung", title: "Korbio auf HTTPS veröffentlichen", detail: "Damit Installation, Webhooks und sichere Zahlungen auf iPhone und Browser funktionieren." },
  { id: "operations", priority: "Vor Bestellungen", title: "Auftragsbetrieb festlegen", detail: "Klären, wer einkauft, liefert, Ersatzartikel bestätigt und Rückerstattungen bearbeitet." },
  { id: "monitoring", priority: "Später", title: "Fehler- und Preisüberwachung ergänzen", detail: "Fehlgeschlagene Feeds, veraltete Preise und Zahlungsprobleme automatisch melden." }
];

const ALLOWED_HOSTS = {
  amazon: ["amazon.de", "www.amazon.de"],
  otto: ["otto.de", "www.otto.de"],
  mediamarkt: ["mediamarkt.de", "www.mediamarkt.de"],
  ikea: ["ikea.com", "www.ikea.com"]
};

const DEFAULT_CATEGORY = {
  amazon: "Haushalt",
  otto: "Wohnen",
  mediamarkt: "Technik",
  ikea: "Wohnen"
};

const SHOP_STYLE = {
  amazon: { emoji: "📦", tone: "graphite" },
  otto: { emoji: "🛍️", tone: "rose" },
  mediamarkt: { emoji: "🎧", tone: "sky" },
  ikea: { emoji: "🪑", tone: "banana" }
};

const DB_NAME = "korbio-partner-catalogs";
const STORE_NAME = "catalogs";
const DB_VERSION = 1;

function parsePrice(value, priceCents) {
  if (Number.isInteger(Number(priceCents)) && Number(priceCents) > 0) return Number(priceCents);
  if (typeof value === "number") return Math.round(value * 100);
  const normalized = String(value || "").trim().replace(/[€\s]/g, "");
  const decimal = normalized.includes(",")
    ? normalized.replace(/\./g, "").replace(",", ".")
    : normalized;
  const number = Number(decimal);
  return Number.isFinite(number) ? Math.round(number * 100) : 0;
}

function parseCsv(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  const delimiter = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ";" : ",";
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"' && quoted && text[index + 1] === '"') {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === delimiter && !quoted) {
      row.push(value);
      value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }
  row.push(value);
  if (row.some((cell) => cell.trim())) rows.push(row);
  if (rows.length < 2) return [];
  const headers = rows.shift().map((header) => header.trim().toLowerCase());
  return rows.map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index]?.trim() || ""])));
}

function isAllowedProductUrl(shopId, value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ALLOWED_HOSTS[shopId]?.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

function safeImageUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

export function parsePartnerCatalog(text, shopId, importedAt = new Date()) {
  if (!ALLOWED_HOSTS[shopId]) throw new Error("Dieser Händler wird nicht unterstützt.");
  if (String(text).length > 30_000_000) throw new Error("Die Katalogdatei ist größer als 30 MB.");
  let rawProducts;
  try {
    const parsed = JSON.parse(text);
    rawProducts = Array.isArray(parsed) ? parsed : parsed.products;
  } catch {
    rawProducts = parseCsv(String(text));
  }
  if (!Array.isArray(rawProducts) || rawProducts.length === 0) {
    throw new Error("Keine Produkte gefunden. Verwende JSON oder CSV mit Kopfzeile.");
  }
  if (rawProducts.length > 25_000) throw new Error("Maximal 25.000 Produkte pro Händlerdatei.");

  const date = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(importedAt);
  const style = SHOP_STYLE[shopId];
  const unique = new Map();
  let rejected = 0;
  for (const raw of rawProducts) {
    const externalId = String(raw.id || raw.sku || raw.asin || raw.ean || raw.gtin || "").trim();
    const name = String(raw.name || raw.title || raw.product_name || "").trim();
    const productUrl = String(raw.url || raw.link || raw.product_url || raw.deeplink || "").trim();
    const priceCents = parsePrice(raw.price, raw.priceCents || raw.price_cents);
    if (!externalId || !name || !isAllowedProductUrl(shopId, productUrl) || priceCents < 1 || priceCents > 10_000_000) {
      rejected += 1;
      continue;
    }
    const id = `partner-${shopId}-${externalId.toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 80)}`;
    unique.set(id, {
      id,
      shopId,
      name: name.slice(0, 180),
      subtitle: String(raw.subtitle || raw.brand || raw.description || "Autorisierter Händlerfeed").trim().slice(0, 220),
      category: ["Lebensmittel", "Drogerie", "Haushalt", "Technik", "Wohnen", "Mode"].includes(raw.category)
        ? raw.category
        : DEFAULT_CATEGORY[shopId],
      priceCents,
      unit: "Preis aus Händlerfeed",
      emoji: style.emoji,
      tone: style.tone,
      imageUrl: safeImageUrl(raw.imageUrl || raw.image || raw.image_url),
      verified: false,
      priceStatus: "partner-feed",
      checkoutEligible: false,
      checkedAt: date,
      sourceUrl: productUrl,
      sourceName: "Autorisierter Händlerfeed",
      sourceType: "partner-feed"
    });
  }
  if (unique.size === 0) throw new Error("Kein gültiges Produkt mit Preis und passendem Händlerlink gefunden.");
  return { products: [...unique.values()], rejected, importedAt: importedAt.toISOString() };
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: "shopId" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function savePartnerCatalog(shopId, catalog) {
  const database = await openDatabase();
  await new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put({ shopId, ...catalog });
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

export async function loadPartnerCatalogs() {
  if (!("indexedDB" in globalThis)) return [];
  const database = await openDatabase();
  const catalogs = await new Promise((resolve, reject) => {
    const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return catalogs;
}
