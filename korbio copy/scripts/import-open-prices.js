import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const API_BASE = "https://prices.openfoodfacts.org/api/v1";
const USER_AGENT = "Korbio/0.3 (balanced catalog importer; local development)";
const DEFAULT_TARGET = 10_000;
const MINIMUM_CATALOG_SIZE = 6_000;
const EARLIEST_OBSERVATION = "2023-01-01";
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outputPath = join(root, "data", "open-prices-catalog.json");
const modulePath = join(root, "data", "open-prices-catalog.js");

const SHOP_PATTERNS = [
  ["rewe", /\brewe\b/i],
  ["lidl", /\blidl\b/i],
  ["aldi", /\baldi\b/i],
  ["edeka", /\bedeka\b|\be[ -]?center\b|\bmarktkauf\b/i],
  ["kaufland", /\bkaufland\b/i],
  ["penny", /\bpenny\b/i],
  ["netto", /\bnetto\b/i],
  ["rossmann", /\brossmann\b/i],
  ["dm", /(^|\s)dm($|\s)/i]
];

const SHOP_PRIORITY = ["penny", "dm", "rossmann", "lidl", "aldi", "kaufland", "rewe", "edeka", "netto"];

const CATEGORY_RULES = [
  ["Drogerie", /beauty|cosmetic|hygiene|body-care|hair-care|shampoo|tooth|skin-care|deodorant|baby-care/i],
  ["Haushalt", /cleaning|household|detergent|dishwash|laundry|paper-product|pet-food/i]
];

const CATEGORY_STYLE = {
  Lebensmittel: { emoji: "🛒", tone: "oat" },
  Drogerie: { emoji: "🧴", tone: "lavender" },
  Haushalt: { emoji: "🧽", tone: "mint" }
};

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchJson(path, attempt = 1) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { accept: "application/json", "user-agent": USER_AGENT }
  });
  if (response.ok) return response.json();
  if (attempt < 4 && (response.status === 429 || response.status >= 500)) {
    await sleep(500 * attempt);
    return fetchJson(path, attempt + 1);
  }
  throw new Error(`Open Prices antwortet mit HTTP ${response.status} für ${path}`);
}

export function shopIdForLocation(location = {}) {
  const label = `${location.osm_name || ""} ${location.osm_brand || ""}`.trim();
  return SHOP_PATTERNS.find(([, pattern]) => pattern.test(label))?.[0] || null;
}

function categoryForProduct(product = {}) {
  const searchable = `${product.product_name || ""} ${(product.categories_tags || []).join(" ")}`;
  return CATEGORY_RULES.find(([, pattern]) => pattern.test(searchable))?.[0] || "Lebensmittel";
}

function formatQuantity(product = {}) {
  if (product.quantity) return String(product.quantity).trim();
  if (!product.product_quantity || !product.product_quantity_unit) return "";
  return `${product.product_quantity} ${product.product_quantity_unit}`;
}

function formatGermanDate(date) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || "");
  return match ? `${match[3]}.${match[2]}.${match[1]}` : "ohne Datum";
}

function stableStyle(seed, category) {
  const style = CATEGORY_STYLE[category] || CATEGORY_STYLE.Lebensmittel;
  const foodEmojis = ["🥫", "🥛", "🍞", "🍎", "🥣", "🧃", "🍫", "🫙", "🌾", "🍪"];
  const tones = ["oat", "coffee", "grain", "cocoa", "sky", "banana", "tomato", "bread", "apple", "leaf"];
  let hash = 0;
  for (const character of String(seed)) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  const index = Math.abs(hash);
  return category === "Lebensmittel"
    ? { emoji: foodEmojis[index % foodEmojis.length], tone: tones[index % tones.length] }
    : style;
}

export function toCatalogProduct(record) {
  const product = record?.product || {};
  const location = record?.location || {};
  const shopId = shopIdForLocation(location);
  const name = String(product.product_name || "").trim();
  const priceCents = Math.round(Number(record?.price) * 100);
  const observedAt = String(record?.date || "");
  const barcode = String(record?.product_code || product.code || "").trim();
  const pricePer = String(record?.price_per || "").toUpperCase();
  if (!shopId || !name || !barcode || !/^\d{4}-\d{2}-\d{2}$/.test(observedAt)) return null;
  if (!Number.isInteger(priceCents) || priceCents < 5 || priceCents > 100_000) return null;
  if (record.currency !== "EUR" || (pricePer && pricePer !== "UNIT")) return null;
  if (record.price_is_discounted || record.discount_type) return null;

  const category = categoryForProduct(product);
  const style = stableStyle(barcode, category);
  const brand = String(product.brands || "").split(",")[0].trim();
  const quantity = formatQuantity(product);
  const city = String(location.osm_address_city || "Deutschland").trim();
  const locationName = String(location.osm_name || location.osm_brand || "Markt").trim();
  const subtitle = [brand, quantity, `${locationName}, ${city}`].filter(Boolean).join(" · ");
  const imageUrl = String(product.image_url || "").startsWith("https://") ? product.image_url : null;

  return {
    id: `open-price-${record.id}`,
    shopId,
    name,
    subtitle,
    category,
    priceCents,
    unit: `beobachtet in ${city}`,
    emoji: style.emoji,
    tone: style.tone,
    imageUrl,
    verified: true,
    priceStatus: "observed",
    checkoutEligible: false,
    checkedAt: formatGermanDate(observedAt),
    observedAt,
    sourceUrl: `${API_BASE}/prices/${record.id}`,
    sourceName: "Open Prices / Open Food Facts",
    proofType: record.proof?.type || null,
    locationLabel: `${locationName}, ${city}`,
    barcode
  };
}

async function loadGermanLocations() {
  const locations = [];
  let page = 1;
  let pages = 1;
  do {
    const query = new URLSearchParams({
      osm_address_country__like: "Deutschland",
      price_count__gte: "1",
      order_by: "-price_count",
      size: "100",
      page: String(page)
    });
    const result = await fetchJson(`/locations?${query}`);
    locations.push(...result.items);
    pages = result.pages;
    process.stdout.write(`\rStandorte: ${locations.length} von ${result.total}`);
    page += 1;
    await sleep(120);
  } while (page <= pages);
  process.stdout.write("\n");
  return locations
    .filter((location) => shopIdForLocation(location))
    .sort((a, b) => {
      const priority = SHOP_PRIORITY.indexOf(shopIdForLocation(a)) - SHOP_PRIORITY.indexOf(shopIdForLocation(b));
      return priority || b.price_count - a.price_count;
    });
}

function locationBatches(locations) {
  const batches = [];
  let current = [];
  let expectedPrices = 0;
  let currentShopId = null;
  for (const location of locations) {
    const shopId = shopIdForLocation(location);
    if (current.length && (shopId !== currentShopId || current.length >= 25 || expectedPrices + location.price_count > 1_800)) {
      batches.push(current);
      current = [];
      expectedPrices = 0;
    }
    currentShopId = shopId;
    current.push(location);
    expectedPrices += location.price_count;
  }
  if (current.length) batches.push(current);
  return batches;
}

async function importPrices(locations, target) {
  const byShopAndBarcode = new Map();
  const batches = locationBatches(locations);
  let pagesRead = 0;

  for (const batch of batches) {
    let page = 1;
    let pages = 1;
    do {
      const query = new URLSearchParams({
        currency: "EUR",
        type: "PRODUCT",
        location_id__in: batch.map((location) => location.id).join(","),
        date__gte: EARLIEST_OBSERVATION,
        duplicate_of__isnull: "true",
        order_by: "-date",
        size: "100",
        page: String(page)
      });
      const result = await fetchJson(`/prices?${query}`);
      pages = result.pages;
      for (const record of result.items) {
        const catalogProduct = toCatalogProduct(record);
        if (!catalogProduct) continue;
        const key = `${catalogProduct.shopId}:${catalogProduct.barcode}`;
        const current = byShopAndBarcode.get(key);
        if (!current || catalogProduct.observedAt > current.observedAt) {
          byShopAndBarcode.set(key, catalogProduct);
        }
      }
      pagesRead += 1;
      process.stdout.write(`\rPreisseiten: ${pagesRead} · eindeutige Produkte: ${byShopAndBarcode.size}`);
      page += 1;
      await sleep(120);
    } while (page <= pages);
    if (byShopAndBarcode.size >= target) break;
  }
  process.stdout.write("\n");
  return [...byShopAndBarcode.values()]
    .slice(0, target)
    .sort((a, b) => b.observedAt.localeCompare(a.observedAt) || a.name.localeCompare(b.name, "de"));
}

async function main() {
  const requestedTarget = Number.parseInt(process.env.CATALOG_LIMIT || "", 10);
  const target = Number.isInteger(requestedTarget) && requestedTarget >= MINIMUM_CATALOG_SIZE
    ? requestedTarget
    : DEFAULT_TARGET;
  console.log(`Open-Prices-Import startet (Ziel: ${target.toLocaleString("de-DE")} Produkte) …`);
  const locations = await loadGermanLocations();
  console.log(`${locations.length} passende Standorte bekannter Händler gefunden.`);
  const products = await importPrices(locations, target);
  if (products.length < MINIMUM_CATALOG_SIZE) {
    throw new Error(`Nur ${products.length} verwendbare Produkte gefunden; mindestens ${MINIMUM_CATALOG_SIZE} erwartet.`);
  }

  const dates = products.map((product) => product.observedAt).sort();
  const shopCounts = Object.fromEntries(SHOP_PRIORITY.map((shopId) => [
    shopId,
    products.filter((product) => product.shopId === shopId).length
  ]));
  const payload = {
    meta: {
      source: "Open Prices / Open Food Facts",
      sourceUrl: "https://prices.openfoodfacts.org/",
      license: "Open Database License (ODbL)",
      licenseUrl: "https://opendatacommons.org/licenses/odbl/1-0/",
      generatedAt: new Date().toISOString(),
      earliestObservation: dates[0],
      latestObservation: dates.at(-1),
      productCount: products.length,
      locationCount: locations.length,
      shopCounts,
      note: "Belegte Preisbeobachtungen. Der Preis kann je Markt und seit dem Beobachtungsdatum abweichen."
    },
    products
  };

  const serialized = JSON.stringify(payload);
  await mkdir(dirname(outputPath), { recursive: true });
  await Promise.all([
    writeFile(outputPath, `${serialized}\n`, "utf8"),
    writeFile(modulePath, `export default ${serialized};\n`, "utf8")
  ]);
  console.log(`Händlerverteilung: ${Object.entries(shopCounts).map(([shopId, count]) => `${shopId} ${count}`).join(" · ")}`);
  console.log(`${products.length.toLocaleString("de-DE")} Produkte als JSON und Direktstart-Modul geschrieben.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
