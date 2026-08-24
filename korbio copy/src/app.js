import { categories, getShop, products, shops } from "./catalog.js";
import { formatEuro, getCartTotals, groupCartByShop, normalizeQuantity } from "./pricing.js";
import { TOKEN_PACKAGES, tokenCheckoutState } from "./tokens.js";
import {
  IMPROVEMENT_STEPS,
  SHOP_INTEGRATIONS,
  loadPartnerCatalogs,
  parsePartnerCatalog,
  savePartnerCatalog
} from "./support.js";
import openPricesCatalog from "../data/open-prices-catalog.js";

const knownProductIds = new Set(products.map((product) => product.id));
products.push(...openPricesCatalog.products.filter((product) => !knownProductIds.has(product.id)));

const STORAGE_KEYS = {
  cart: "korbio.cart.v1",
  location: "korbio.location.v1",
  notice: "korbio.notice.v1",
  supportDone: "korbio.support-done.v1"
};

const state = {
  view: "discover",
  shopId: "all",
  category: "Alle",
  query: "",
  sort: "featured",
  verifiedOnly: false,
  visibleLimit: 48,
  supportDone: readStorage(STORAGE_KEYS.supportDone, []),
  cart: readStorage(STORAGE_KEYS.cart, []),
  orders: [],
  wallet: { balance: 0, transactions: [], topups: [] },
  location: readStorage(STORAGE_KEYS.location, "Berlin 10115")
};

const familySession = {
  authenticated: false,
  configured: false,
  memberName: "",
  role: null,
  bank: null,
  preparedTopup: null
};

const elements = {
  shopRail: document.querySelector("#shop-rail"),
  categoryRail: document.querySelector("#category-rail"),
  productGrid: document.querySelector("#product-grid"),
  loadMore: document.querySelector("#load-more"),
  emptyState: document.querySelector("#empty-state"),
  resultsTitle: document.querySelector("#results-title"),
  resultsMeta: document.querySelector("#results-meta"),
  searchInput: document.querySelector("#search-input"),
  sortSelect: document.querySelector("#sort-select"),
  verifiedToggle: document.querySelector("#verified-toggle"),
  cartCount: document.querySelector("#cart-count"),
  tokenBalance: document.querySelector("#token-balance"),
  mobileCartCount: document.querySelector("#mobile-cart-count"),
  orderCount: document.querySelector("#order-count"),
  cartDrawer: document.querySelector("#cart-drawer"),
  drawerBackdrop: document.querySelector("#drawer-backdrop"),
  cartContent: document.querySelector("#cart-content"),
  cartSummary: document.querySelector("#cart-summary"),
  checkoutDialog: document.querySelector("#checkout-dialog"),
  checkoutForm: document.querySelector("#checkout-form"),
  checkoutSubmit: document.querySelector("#checkout-submit"),
  checkoutModeTitle: document.querySelector("#checkout-mode-title"),
  checkoutModeCopy: document.querySelector("#checkout-mode-copy"),
  checkoutTokenBalance: document.querySelector("#checkout-token-balance"),
  checkoutTokenStatus: document.querySelector("#checkout-token-status"),
  tokenPaymentCard: document.querySelector("#token-payment-card"),
  consentCopy: document.querySelector("#consent-copy"),
  dialogTotal: document.querySelector("#dialog-total"),
  orderList: document.querySelector("#order-list"),
  emptyOrders: document.querySelector("#empty-orders"),
  discoverView: document.querySelector("#discover-view"),
  ordersView: document.querySelector("#orders-view"),
  supportView: document.querySelector("#support-view"),
  integrationGrid: document.querySelector("#integration-grid"),
  improvementList: document.querySelector("#improvement-list"),
  supportProgress: document.querySelector("#support-progress"),
  supportProgressCopy: document.querySelector("#support-progress-copy"),
  supportNavProgress: document.querySelector("#support-nav-progress"),
  locationLabel: document.querySelector("#location-label"),
  payoutTitle: document.querySelector("#payout-title"),
  payoutDescription: document.querySelector("#payout-description"),
  tokenDialog: document.querySelector("#token-dialog"),
  tokenPackageGrid: document.querySelector("#token-package-grid"),
  walletBalance: document.querySelector("#wallet-balance"),
  walletValue: document.querySelector("#wallet-value"),
  walletMode: document.querySelector("#wallet-mode"),
  walletNotice: document.querySelector("#wallet-notice"),
  walletHistory: document.querySelector("#wallet-history"),
  familyUserButton: document.querySelector("#family-user-button"),
  familyUserName: document.querySelector("#family-user-name"),
  familyTransfer: document.querySelector("#family-transfer"),
  contributionTitle: document.querySelector("#contribution-title"),
  contributionInstructions: document.querySelector("#contribution-instructions"),
  transferAmount: document.querySelector("#transfer-amount"),
  transferHolder: document.querySelector("#transfer-holder"),
  transferIban: document.querySelector("#transfer-iban"),
  transferReference: document.querySelector("#transfer-reference"),
  familyAdminPanel: document.querySelector("#family-admin-panel"),
  pendingTopups: document.querySelector("#pending-topups"),
  familyAdjustmentForm: document.querySelector("#family-adjustment-form"),
  familyLoginDialog: document.querySelector("#family-login-dialog"),
  familyLoginForm: document.querySelector("#family-login-form"),
  familyLoginStatus: document.querySelector("#family-login-status"),
  familyLoginSubmit: document.querySelector("#family-login-submit"),
  infoDialog: document.querySelector("#info-dialog"),
  infoTitle: document.querySelector("#info-title"),
  infoContent: document.querySelector("#info-content"),
  toast: document.querySelector("#toast")
};

let deferredInstallPrompt = null;
let toastTimer = null;
let catalogMeta = openPricesCatalog.meta || { productCount: openPricesCatalog.products.length };

function readStorage(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    showToast("Lokales Speichern ist in diesem Browser deaktiviert.");
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatTokens(value) {
  return `${Math.max(0, Math.floor(Number(value) || 0)).toLocaleString("de-DE")} Token`;
}

function formatIban(value) {
  return String(value || "").replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim();
}

function shopVariables(shop) {
  return `--shop-color:${shop.color};--shop-soft:${shop.soft}`;
}

function renderShopRail() {
  const allActive = state.shopId === "all";
  const allCard = `
    <button class="shop-card ${allActive ? "is-active" : ""}" type="button" data-shop="all" role="listitem">
      <span class="shop-logo" style="--shop-color:#15382e;--shop-soft:#e9efe9">∞</span>
      <strong>Alle Shops</strong>
      <small>${shops.length} Händler</small>
    </button>`;

  elements.shopRail.innerHTML = allCard + shops.map((shop) => {
    const count = products.filter((product) => product.shopId === shop.id).length;
    return `
      <button class="shop-card ${state.shopId === shop.id ? "is-active" : ""}" type="button" data-shop="${shop.id}" role="listitem" style="${shopVariables(shop)}">
        <span class="shop-logo" style="${shopVariables(shop)}">${escapeHtml(shop.short)}</span>
        <strong>${escapeHtml(shop.name)}</strong>
        <small>${count ? `${count} Produkte` : "Anbindung bereit"}</small>
      </button>`;
  }).join("");
}

function renderCategories() {
  elements.categoryRail.innerHTML = categories.map((category) => `
    <button class="category-chip ${state.category === category ? "is-active" : ""}" type="button" data-category="${escapeHtml(category)}">
      ${escapeHtml(category)}
    </button>`).join("");
}

function getVisibleProducts() {
  const query = state.query.trim().toLocaleLowerCase("de");
  const visible = products.filter((product) => {
    const shop = getShop(product.shopId);
    const shopMatches = state.shopId === "all" || product.shopId === state.shopId;
    const categoryMatches = state.category === "Alle" || product.category === state.category;
    const verificationMatches = !state.verifiedOnly || product.verified;
    const queryMatches = !query || [product.name, product.subtitle, product.category, shop?.name]
      .some((value) => value?.toLocaleLowerCase("de").includes(query));
    return shopMatches && categoryMatches && verificationMatches && queryMatches;
  });

  return visible.sort((a, b) => {
    if (state.sort === "price-asc") return a.priceCents - b.priceCents;
    if (state.sort === "price-desc") return b.priceCents - a.priceCents;
    if (state.sort === "shop") return getShop(a.shopId).name.localeCompare(getShop(b.shopId).name, "de");
    if (a.verified !== b.verified) return Number(b.verified) - Number(a.verified);
    return Number(Boolean(b.highlight)) - Number(Boolean(a.highlight));
  });
}

function cartQuantity(productId) {
  return state.cart.find((entry) => entry.productId === productId)?.quantity || 0;
}

function productCard(product) {
  const shop = getShop(product.shopId);
  const quantity = cartQuantity(product.id);
  const sourceLine = product.priceStatus === "observed"
    ? `<a class="source-link" href="${escapeHtml(product.sourceUrl)}" target="_blank" rel="noreferrer" title="Öffentlichen Preisbeleg öffnen">↗ Preisbeleg · ${escapeHtml(product.locationLabel)} · ${escapeHtml(product.checkedAt)}</a>`
    : product.priceStatus === "partner-feed"
      ? `<a class="source-link" href="${escapeHtml(product.sourceUrl)}" target="_blank" rel="noreferrer" title="Produkt beim Händler öffnen">↗ Händlerprodukt · importiert ${escapeHtml(product.checkedAt)}</a>`
    : product.verified
    ? `<a class="source-link" href="${product.sourceUrl}" target="_blank" rel="noreferrer" title="Preisquelle bei ${escapeHtml(shop.name)} öffnen">↗ Händlerquelle · geprüft ${escapeHtml(product.checkedAt)}</a>`
    : product.sourceUrl
      ? `<a class="source-link" href="${product.sourceUrl}" target="_blank" rel="noreferrer">↗ Händlerseite · Standortpreis nötig</a>`
      : `<span class="source-link">○ Datenanbindung noch offen</span>`;

  return `
    <article class="product-card tone-${product.tone}" style="${shopVariables(shop)}">
      <div class="product-visual ${product.imageUrl ? "has-image" : ""}">
        <span class="product-shop-badge">${escapeHtml(shop.name)}</span>
        ${product.highlight ? `<span class="product-highlight">${escapeHtml(product.highlight)}</span>` : ""}
        <span class="product-emoji" aria-hidden="true">${escapeHtml(product.emoji)}</span>
        ${product.imageUrl ? `<img class="product-image" src="${escapeHtml(product.imageUrl)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" />` : ""}
      </div>
      <div class="product-copy">
        <span class="price-status ${product.priceStatus === "partner-feed" ? "partner" : product.verified ? "" : "demo"}">${product.priceStatus === "observed" ? "Echtpreis mit Beleg" : product.priceStatus === "partner-feed" ? "Importierter Händlerpreis" : product.verified ? "Händlerpreis geprüft" : "Demo-Preis"}</span>
        <h4 title="${escapeHtml(product.name)}">${escapeHtml(product.name)}</h4>
        <p class="product-subtitle">${escapeHtml(product.subtitle)}</p>
        <div class="product-price-row">
          <div class="product-price">
            <strong>${formatEuro(product.priceCents)}</strong>
            <small>${escapeHtml(product.unit)} · + 0,10 € Service</small>
          </div>
          <button class="add-button ${quantity ? "in-cart" : ""}" type="button" data-add="${product.id}" aria-label="${escapeHtml(product.name)} in den Warenkorb legen">
            ${quantity || "+"}
          </button>
        </div>
        ${sourceLine}
      </div>
    </article>`;
}

function renderProducts() {
  const matching = getVisibleProducts();
  const visible = matching.slice(0, state.visibleLimit);
  elements.productGrid.innerHTML = visible.map(productCard).join("");
  elements.productGrid.hidden = matching.length === 0;
  elements.emptyState.hidden = matching.length !== 0;
  elements.loadMore.hidden = visible.length >= matching.length || matching.length === 0;
  elements.loadMore.textContent = `Mehr laden (${Math.min(48, matching.length - visible.length)} von ${matching.length - visible.length})`;

  const shop = state.shopId === "all" ? null : getShop(state.shopId);
  elements.resultsTitle.textContent = shop ? `Produkte bei ${shop.name}` : "Für dich ausgewählt";
  const bits = [`${matching.length.toLocaleString("de-DE")} ${matching.length === 1 ? "Produkt" : "Produkte"}`];
  if (matching.length > visible.length) bits.push(`${visible.length} angezeigt`);
  if (state.category !== "Alle") bits.push(state.category);
  if (state.verifiedOnly) bits.push("nur belegte Preise");
  elements.resultsMeta.textContent = bits.join(" · ");
}

function renderCart() {
  const groups = groupCartByShop(state.cart, products, shops);
  const totals = getCartTotals(state.cart, products);
  elements.cartCount.textContent = totals.itemCount;
  elements.mobileCartCount.textContent = totals.itemCount;

  if (!groups.length) {
    elements.cartContent.innerHTML = `
      <div class="empty-cart">
        <span>🧺</span>
        <h3>Dein Korb ist noch leer</h3>
        <p>Füge Produkte aus einem oder mehreren Shops hinzu. Wir sortieren alles für dich.</p>
      </div>`;
  } else {
    elements.cartContent.innerHTML = groups.map(({ shop, items }) => `
      <section class="cart-shop-group" style="${shopVariables(shop)}">
        <div class="cart-shop-heading"><span>${escapeHtml(shop.short)}</span>${escapeHtml(shop.name)}</div>
        ${items.map(({ product, quantity }) => `
          <div class="cart-item tone-${product.tone}">
            <span class="cart-thumb">${product.emoji}</span>
            <div>
              <h4 title="${escapeHtml(product.name)}">${escapeHtml(product.name)}</h4>
              <div class="cart-item-price">${formatEuro(product.priceCents)} + 0,10 € Service</div>
              <div class="quantity-control" aria-label="Menge ändern">
                <button type="button" data-quantity="${product.id}" data-delta="-1" aria-label="Menge verringern">−</button>
                <span>${quantity}</span>
                <button type="button" data-quantity="${product.id}" data-delta="1" aria-label="Menge erhöhen">+</button>
              </div>
            </div>
            <button class="remove-item" type="button" data-remove="${product.id}" aria-label="${escapeHtml(product.name)} entfernen">×</button>
          </div>`).join("")}
      </section>`).join("");
  }

  elements.cartSummary.innerHTML = `
    <div class="summary-row"><span>Produkte (${totals.itemCount})</span><strong>${formatEuro(totals.subtotalCents)}</strong></div>
    <div class="summary-row"><span>Serviceaufschlag<small>0,10 € × ${totals.itemCount} Artikel</small></span><strong>${formatEuro(totals.serviceFeeCents)}</strong></div>
    <div class="summary-row"><span>Lieferung</span><strong>Im MVP offen</strong></div>
    <div class="summary-total"><span>Gesamt</span><strong>${formatEuro(totals.totalCents)}</strong></div>
    <button class="checkout-button" type="button" id="checkout-button" ${totals.itemCount ? "" : "disabled"}>Weiter zum Auftrag <span>→</span></button>`;

  elements.dialogTotal.innerHTML = `
    <div class="summary-row"><span>Produkte + Serviceaufschlag</span><strong>${formatEuro(totals.totalCents)}</strong></div>
    <div class="summary-total"><span>Token-Preis</span><strong>${formatTokens(totals.totalCents)}</strong></div>`;
  updateCheckoutTokenUi(totals);
  elements.orderCount.textContent = state.orders.length;
}

function updateCheckoutTokenUi(totals = getCartTotals(state.cart, products)) {
  const checkout = tokenCheckoutState(state.wallet.balance, totals.totalCents);
  elements.checkoutTokenBalance.textContent = formatTokens(checkout.balance);
  elements.tokenPaymentCard.classList.toggle("is-ready", checkout.enough);
  elements.tokenPaymentCard.classList.toggle("is-short", !checkout.enough);
  elements.checkoutTokenStatus.textContent = checkout.enough
    ? `${formatTokens(checkout.required)} werden abgezogen · danach bleiben ${formatTokens(checkout.remaining)}.`
    : `Es fehlen noch ${formatTokens(checkout.missing)}.`;
  elements.checkoutSubmit.disabled = !familySession.authenticated || !checkout.enough;
  elements.checkoutSubmit.querySelector(".submit-copy").textContent = checkout.enough
    ? `${formatTokens(checkout.required)} bezahlen`
    : "Erst Token nachladen";
}

function renderWallet() {
  elements.tokenBalance.textContent = state.wallet.balance.toLocaleString("de-DE");
  elements.walletBalance.textContent = state.wallet.balance.toLocaleString("de-DE");
  elements.walletValue.textContent = `entspricht ${formatEuro(state.wallet.balance)} Einkaufswert`;
  elements.payoutTitle.textContent = `${formatTokens(state.wallet.balance)} verfügbar`;

  elements.walletMode.textContent = familySession.role === "admin" ? "Admin" : "Familie";
  elements.walletNotice.textContent = "Nur tatsächlich erhaltene Familienbeiträge werden vom Admin gutgeschrieben.";
  elements.payoutDescription.textContent = familySession.authenticated
    ? `Gemeinsames Guthaben · angemeldet als ${familySession.memberName}.`
    : "Bitte bei eurer privaten Familienkasse anmelden.";
  elements.familyUserButton.hidden = !familySession.authenticated;
  elements.familyUserName.textContent = familySession.role === "admin"
    ? `${familySession.memberName} · Admin`
    : familySession.memberName || "Familie";

  elements.tokenPackageGrid.innerHTML = TOKEN_PACKAGES.map((tokenPackage) => `
    <button class="token-package ${tokenPackage.recommended ? "recommended" : ""}" type="button" data-token-package="${tokenPackage.id}" ${familySession.authenticated ? "" : "disabled"}>
      ${tokenPackage.recommended ? '<span class="package-badge">Beliebt</span>' : ""}
      <small>${escapeHtml(tokenPackage.label)}</small>
      <strong>${tokenPackage.tokens.toLocaleString("de-DE")} Token</strong>
      <span>${formatEuro(tokenPackage.priceCents)}</span>
      <b>${familySession.bank ? "Überweisung vorbereiten" : "Barbeitrag vormerken"}</b>
    </button>`).join("");

  const prepared = familySession.preparedTopup;
  elements.familyTransfer.hidden = !prepared;
  if (prepared) {
    const usesBank = Boolean(familySession.bank?.iban);
    elements.transferAmount.textContent = formatEuro(prepared.amountCents);
    elements.contributionTitle.textContent = usesBank ? "Überweisung vorbereitet" : "Barbeitrag vorgemerkt";
    elements.transferHolder.textContent = usesBank ? familySession.bank.accountHolder : "Familienadmin";
    elements.transferIban.textContent = usesBank ? formatIban(familySession.bank.iban) : "Keine IBAN nötig";
    elements.transferReference.textContent = prepared.reference;
    elements.contributionInstructions.textContent = usesBank
      ? "Überweise genau diesen Betrag mit dem angegebenen Verwendungszweck. Danach bestätigt der Familienadmin den Eingang."
      : "Gib diesen Betrag bar an den Familienadmin und nenne den Verwendungszweck. Danach bestätigt er den Erhalt.";
  }

  elements.familyAdminPanel.hidden = familySession.role !== "admin";
  if (familySession.role === "admin") {
    const pending = (state.wallet.topups || []).filter((entry) => entry.status === "pending");
    elements.pendingTopups.innerHTML = pending.length
      ? pending.map((entry) => `
        <div class="pending-topup">
          <span><strong>${escapeHtml(entry.memberName)}</strong><small>${formatEuro(entry.amountCents)} · ${escapeHtml(entry.reference)}</small></span>
          <button type="button" data-confirm-topup="${escapeHtml(entry.id)}">Eingang bestätigen</button>
        </div>`).join("")
      : '<p class="admin-empty">Keine offenen Familienbeiträge.</p>';
  }

  elements.walletHistory.innerHTML = state.wallet.transactions.length
    ? `<h3>Letzte Buchungen</h3>${state.wallet.transactions.map((entry) => {
      const date = new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short" }).format(new Date(entry.createdAt));
      return `<div class="wallet-transaction"><strong>${escapeHtml(entry.label)}</strong><span>${date}</span><b class="${entry.amount < 0 ? "is-spend" : ""}">${entry.amount > 0 ? "+" : ""}${entry.amount.toLocaleString("de-DE")}</b></div>`;
    }).join("")}`
    : '<div class="wallet-history-empty">Noch keine Buchung in der Familienkasse.</div>';

  updateCheckoutTokenUi();
}

function paymentStatusDetails(order) {
  if (order.paymentMethod === "tokens") return { label: "Mit Familien-Token bezahlt", className: "paid", ready: true };
  return { label: "Familienauftrag", className: "paid", ready: true };
}

function paymentMethodLabel(method) {
  return method === "tokens" ? "Familienguthaben" : "Familienkasse";
}

function renderOrders() {
  elements.orderCount.textContent = state.orders.length;
  elements.emptyOrders.hidden = state.orders.length > 0;
  elements.orderList.hidden = state.orders.length === 0;
  elements.orderList.innerHTML = state.orders.map((order) => {
    const payment = paymentStatusDetails(order);
    const picked = order.items.filter((item) => item.picked).length;
    const total = order.items.length;
    const done = total > 0 && picked === total;
    const progress = total ? Math.round((picked / total) * 100) : 0;
    const groups = new Map();
    for (const item of order.items) {
      if (!groups.has(item.shopId)) groups.set(item.shopId, []);
      groups.get(item.shopId).push(item);
    }

    const createdAt = new Intl.DateTimeFormat("de-DE", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(order.createdAt));

    return `
      <article class="order-card" data-order-card="${order.id}">
        <header class="order-card-header">
          <div>
            <div class="order-id-row"><h3>Auftrag ${escapeHtml(order.id)}</h3><span class="order-state ${done ? "done" : ""}">${done ? "Erledigt" : "Offen"}</span><span class="payment-badge ${payment.className}">${payment.label}</span></div>
            <p class="order-meta">${createdAt} · ${picked} von ${total} Positionen abgehakt</p>
          </div>
          <div class="order-total"><small>${formatTokens(order.tokensSpent || order.totals.totalCents)}</small><strong>${formatEuro(order.totals.totalCents)}</strong></div>
        </header>
        <div class="order-progress"><span style="width:${progress}%"></span></div>
        <div class="order-body">
          <div class="order-groups">
            ${[...groups.entries()].map(([shopId, items]) => {
              const shop = getShop(shopId);
              return `
                <section class="order-group" style="${shopVariables(shop)}">
                  <div class="order-group-title"><span>${escapeHtml(shop.short)}</span>${escapeHtml(shop.name)}</div>
                  ${items.map((item) => `
                    <label class="pick-row tone-${item.tone} ${item.picked ? "is-picked" : ""}">
                      <input type="checkbox" data-pick-order="${order.id}" data-pick-item="${item.lineId}" ${item.picked ? "checked" : ""} ${payment.ready ? "" : "disabled"} />
                      <span class="pick-row-emoji">${item.emoji}</span>
                      <span><strong>${escapeHtml(item.name)}</strong><small>${item.quantity} × ${formatEuro(item.priceCents)} + je 0,10 €</small></span>
                      <b>${formatEuro((item.priceCents + 10) * item.quantity)}</b>
                    </label>`).join("")}
                </section>`;
            }).join("")}
          </div>
          <aside class="order-side">
            <h4>Lieferdetails</h4>
            <div class="detail-line"><small>Kundin/Kunde</small><strong>${escapeHtml(order.customer.name)}</strong></div>
            <div class="detail-line"><small>Telefon</small><strong>${escapeHtml(order.customer.phone)}</strong></div>
            <div class="detail-line"><small>Adresse</small><strong>${escapeHtml(order.customer.address)}</strong></div>
            <div class="detail-line"><small>Zahlung</small><strong>${escapeHtml(paymentMethodLabel(order.paymentMethod))} · ${payment.label}</strong></div>
            ${order.tokensSpent ? `<div class="detail-line"><small>Token-Buchung</small><strong>− ${formatTokens(order.tokensSpent)}</strong></div>` : ""}
            ${order.paymentId ? `<div class="detail-line"><small>Zahlungsreferenz</small><strong>${escapeHtml(order.paymentId)}</strong></div>` : ""}
            ${order.customer.note ? `<div class="order-note">„${escapeHtml(order.customer.note)}“</div>` : ""}
          </aside>
        </div>
      </article>`;
  }).join("");
}

function shopProductCount(shopId) {
  return products.filter((product) => product.shopId === shopId).length;
}

function renderSupport() {
  const completed = new Set(state.supportDone);
  const progress = Math.round((completed.size / IMPROVEMENT_STEPS.length) * 100);
  elements.supportProgress.style.setProperty("--progress", `${progress * 3.6}deg`);
  elements.supportProgress.querySelector("strong").textContent = `${progress}%`;
  elements.supportProgressCopy.textContent = `${completed.size} von ${IMPROVEMENT_STEPS.length} Schritten erledigt`;
  elements.supportNavProgress.textContent = `${progress}%`;

  elements.integrationGrid.innerHTML = SHOP_INTEGRATIONS.map((integration) => {
    const shop = getShop(integration.shopId);
    const count = shopProductCount(integration.shopId);
    const percentage = Math.min(100, Math.round((count / integration.target) * 100));
    const ready = count >= integration.target;
    return `
      <article class="integration-card ${ready ? "is-ready" : ""}" style="${shopVariables(shop)}">
        <header>
          <span class="shop-logo" style="${shopVariables(shop)}">${escapeHtml(shop.short)}</span>
          <span class="integration-state">${ready ? "Ziel erreicht" : "Zugang erforderlich"}</span>
        </header>
        <h3>${escapeHtml(shop.name)}</h3>
        <p>${escapeHtml(integration.detail)}</p>
        <div class="integration-count"><strong>${count.toLocaleString("de-DE")}</strong><span>/ ${integration.target.toLocaleString("de-DE")} Produkte</span></div>
        <div class="integration-progress"><span style="width:${percentage}%"></span></div>
        <div class="integration-requirement"><b>Nächster Schritt</b>${escapeHtml(integration.requirement)}</div>
        <div class="integration-actions">
          <a href="${escapeHtml(integration.actionUrl)}" target="_blank" rel="noreferrer">${escapeHtml(integration.actionLabel)}</a>
          <label class="feed-upload">Katalogdatei importieren<input type="file" accept=".json,.csv,application/json,text/csv" data-feed-input="${integration.shopId}" /></label>
        </div>
      </article>`;
  }).join("");

  elements.improvementList.innerHTML = IMPROVEMENT_STEPS.map((step) => `
    <label class="improvement-step ${completed.has(step.id) ? "is-done" : ""}">
      <input type="checkbox" data-support-step="${step.id}" ${completed.has(step.id) ? "checked" : ""} />
      <span class="step-check">✓</span>
      <span><small>${escapeHtml(step.priority)}</small><strong>${escapeHtml(step.title)}</strong><p>${escapeHtml(step.detail)}</p></span>
    </label>`).join("");
}

function renderNavigation() {
  elements.discoverView.hidden = state.view !== "discover";
  elements.ordersView.hidden = state.view !== "orders";
  elements.supportView.hidden = state.view !== "support";
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === state.view);
  });
}

function renderAll() {
  elements.locationLabel.textContent = state.location;
  renderShopRail();
  renderCategories();
  renderProducts();
  renderCart();
  renderWallet();
  renderOrders();
  renderSupport();
  renderNavigation();
}

function addToCart(productId) {
  const entry = state.cart.find((item) => item.productId === productId);
  if (entry) entry.quantity = normalizeQuantity(entry.quantity + 1);
  else state.cart.push({ productId, quantity: 1 });
  writeStorage(STORAGE_KEYS.cart, state.cart);
  renderProducts();
  renderCart();
  const product = products.find((item) => item.id === productId);
  showToast(`${product.name} liegt im Korb.`);
}

function setQuantity(productId, delta) {
  const entry = state.cart.find((item) => item.productId === productId);
  if (!entry) return;
  const next = entry.quantity + Number(delta);
  if (next <= 0) state.cart = state.cart.filter((item) => item.productId !== productId);
  else entry.quantity = normalizeQuantity(next);
  writeStorage(STORAGE_KEYS.cart, state.cart);
  renderProducts();
  renderCart();
}

function removeFromCart(productId) {
  state.cart = state.cart.filter((entry) => entry.productId !== productId);
  writeStorage(STORAGE_KEYS.cart, state.cart);
  renderProducts();
  renderCart();
}

function openCart() {
  elements.drawerBackdrop.hidden = false;
  elements.cartDrawer.classList.add("is-open");
  elements.cartDrawer.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  setTimeout(() => elements.cartDrawer.querySelector(".drawer-close")?.focus(), 100);
}

function closeCart() {
  elements.cartDrawer.classList.remove("is-open");
  elements.cartDrawer.setAttribute("aria-hidden", "true");
  elements.drawerBackdrop.hidden = true;
  document.body.style.overflow = "";
}

function openCheckout() {
  if (!state.cart.length) return;
  if (!familySession.authenticated) {
    showFamilyLogin("Bitte melde dich an, bevor du einen Familienauftrag erstellst.");
    return;
  }
  closeCart();
  renderCart();
  elements.checkoutDialog.showModal();
}

function openTokenDialog() {
  if (!familySession.authenticated) {
    showFamilyLogin("Bitte melde dich an, um das Familienguthaben zu verwalten.");
    return;
  }
  renderWallet();
  if (!elements.tokenDialog.open) elements.tokenDialog.showModal();
}

function setView(view) {
  state.view = ["discover", "orders", "support"].includes(view) ? view : "discover";
  renderNavigation();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  toastTimer = setTimeout(() => elements.toast.classList.remove("is-visible"), 2400);
}

async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers: {
      accept: "application/json",
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.message || "Die Familienkasse ist gerade nicht erreichbar.");
    error.status = response.status;
    error.code = result.code;
    throw error;
  }
  return result;
}

function applySessionPayload(payload) {
  familySession.authenticated = Boolean(payload.authenticated);
  familySession.configured = Boolean(payload.configured);
  familySession.memberName = payload.memberName || "";
  familySession.role = payload.role || null;
  familySession.bank = payload.bank || null;
  if (payload.wallet) state.wallet = payload.wallet;
  if (Array.isArray(payload.orders)) state.orders = payload.orders;
  renderAll();
}

function showFamilyLogin(message = "Melde dich mit eurem gemeinsamen Familienpasswort an.") {
  elements.familyLoginStatus.textContent = message;
  if (!elements.familyLoginDialog.open) elements.familyLoginDialog.showModal();
}

async function loadFamilySession() {
  if (window.location.protocol === "file:") {
    elements.familyLoginSubmit.disabled = true;
    showFamilyLogin("Starte Korbio bitte über ‚Korbio starten.command‘. Direkt als Datei kann die sichere Familienkasse nicht arbeiten.");
    return;
  }
  try {
    const session = await apiRequest("./api/family/session");
    applySessionPayload(session);
    if (session.authenticated) {
      if (elements.familyLoginDialog.open) elements.familyLoginDialog.close();
    } else if (!session.configured) {
      showFamilyLogin("Die Familienkasse ist noch nicht eingerichtet. Starte zuerst ‚Korbio einrichten.command‘.");
    } else {
      showFamilyLogin();
    }
  } catch {
    showFamilyLogin("Der Korbio-Server ist nicht erreichbar. Starte bitte ‚Korbio starten.command‘.");
  }
}

async function beginCheckout(form) {
  const totals = getCartTotals(state.cart, products);
  const checkout = tokenCheckoutState(state.wallet.balance, totals.totalCents);
  if (!checkout.enough) {
    elements.checkoutDialog.close();
    openTokenDialog();
    showToast(`Dir fehlen ${formatTokens(checkout.missing)}.`);
    return;
  }
  const data = new FormData(form);
  elements.checkoutSubmit.disabled = true;
  try {
    const result = await apiRequest("./api/family/orders", {
      method: "POST",
      body: JSON.stringify({
        items: state.cart.map(({ productId, quantity }) => ({ productId, quantity })),
        customer: {
          name: data.get("name"),
          phone: data.get("phone"),
          address: data.get("address"),
          note: data.get("note")
        }
      })
    });
    state.wallet = result.wallet;
    state.orders = [result.order, ...state.orders.filter((order) => order.id !== result.order.id)];
    state.cart = [];
    writeStorage(STORAGE_KEYS.cart, state.cart);
    form.reset();
    elements.checkoutDialog.close();
    renderAll();
    setView("orders");
    showToast(`${formatTokens(result.order.tokensSpent)} bezahlt · Auftrag ${result.order.id} ist bereit.`);
  } catch (error) {
    if (error.status === 401) showFamilyLogin();
    showToast(error.message);
    renderWallet();
  }
}

async function beginTokenPurchase(packageId) {
  const tokenPackage = TOKEN_PACKAGES.find((entry) => entry.id === packageId);
  if (!tokenPackage) return;
  if (!familySession.authenticated) {
    showFamilyLogin();
    return;
  }
  elements.tokenPackageGrid.querySelectorAll("button").forEach((button) => { button.disabled = true; });
  try {
    const result = await apiRequest("./api/family/topups", {
      method: "POST",
      body: JSON.stringify({ packageId: tokenPackage.id })
    });
    state.wallet = result.wallet;
    familySession.bank = result.bank;
    familySession.preparedTopup = result.topup;
    renderWallet();
    showToast(`${familySession.bank ? "Überweisung" : "Barbeitrag"} über ${formatEuro(result.topup.amountCents)} ist vorbereitet.`);
  } catch (error) {
    if (error.status === 401) showFamilyLogin();
    showToast(error.message || "Der Familienbeitrag konnte nicht vorbereitet werden.");
    renderWallet();
  }
}

async function confirmTopup(topupId) {
  try {
    const result = await apiRequest(`./api/family/topups/${encodeURIComponent(topupId)}/confirm`, {
      method: "POST",
      body: JSON.stringify({})
    });
    state.wallet = result.wallet;
    renderWallet();
    showToast("Familienbeitrag bestätigt und gutgeschrieben.");
  } catch (error) {
    showToast(error.message);
  }
}

async function logoutFamily() {
  try {
    await apiRequest("./api/family/logout", { method: "POST", body: JSON.stringify({}) });
  } catch {
    // Die lokale Ansicht wird auch zurückgesetzt, wenn der Server gerade stoppt.
  }
  Object.assign(familySession, {
    authenticated: false,
    memberName: "",
    role: null,
    bank: null,
    preparedTopup: null
  });
  state.wallet = { balance: 0, transactions: [], topups: [] };
  state.orders = [];
  if (elements.tokenDialog.open) elements.tokenDialog.close();
  if (elements.checkoutDialog.open) elements.checkoutDialog.close();
  renderAll();
  showFamilyLogin("Du bist abgemeldet. Melde dich mit eurem Familienpasswort wieder an.");
}

async function togglePicked(orderId, lineId, picked) {
  try {
    const result = await apiRequest(`./api/family/orders/${encodeURIComponent(orderId)}/items/${encodeURIComponent(lineId)}`, {
      method: "PATCH",
      body: JSON.stringify({ picked })
    });
    state.orders = state.orders.map((order) => order.id === result.order.id ? result.order : order);
    renderOrders();
    if (result.order.status === "done") showToast(`Auftrag ${result.order.id} ist vollständig abgehakt.`);
  } catch (error) {
    renderOrders();
    showToast(error.message);
  }
}

function resetFilters() {
  state.shopId = "all";
  state.category = "Alle";
  state.query = "";
  state.verifiedOnly = false;
  state.visibleLimit = 48;
  elements.searchInput.value = "";
  elements.verifiedToggle.setAttribute("aria-pressed", "false");
  renderShopRail();
  renderCategories();
  renderProducts();
}

function showInfo(type) {
  const content = {
    privacy: {
      title: "Datenschutz der Familienkasse",
      body: `<p>Warenkorb und Anzeigeeinstellungen bleiben im Browser. Familienguthaben, Buchungsverlauf, Lieferdaten und Aufträge liegen in der lokalen Korbio-Datenbank auf eurem eigenen Rechner.</p><p>Passwörter werden nur zur Anmeldung an euren eigenen Server gesendet; die Sitzung verwendet ein geschütztes HttpOnly-Cookie. Bank- oder Kartenzugangsdaten werden nicht gespeichert. Eine IBAN ist optional und dient nur als sichtbares Überweisungsziel.</p>`
    },
    legal: {
      title: "Impressum & Betrieb",
      body: `<p>Korbio ist hier als private Familienkasse eingerichtet und nicht für den öffentlichen Verkauf von Guthaben bestimmt. Wenn du die App später fremden Personen anbietest oder daraus ein Geschäft machst, müssen Zahlungs-, Verbraucher-, Datenschutz- und E-Geld-Fragen neu professionell geprüft werden.</p>`
    },
    sources: {
      title: "Preisquellen",
      body: `<p><strong>${Number(catalogMeta?.productCount || 0).toLocaleString("de-DE")} Preise</strong> stammen aus Open Prices / Open Food Facts. Jeder Eintrag nennt Markt, Datum und einen direkten öffentlichen Beleg.</p><p>Das sind echte Preisbeobachtungen, aber keine Garantie für den heutigen Preis in jeder Filiale. Deshalb steht das jeweilige Beobachtungsdatum direkt am Produkt.</p><p><a href="https://prices.openfoodfacts.org/" target="_blank" rel="noreferrer">Open Prices öffnen</a> · <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noreferrer">ODbL-Lizenz</a></p>`
    },
    payout: {
      title: "Familienbeitrag einzahlen",
      body: `<ol><li>Öffne die Token-Verwaltung und wähle einen Betrag.</li><li>Gib den Betrag bar an den Familienadmin oder nutze optional die angezeigte Überweisung.</li><li>Der Familienadmin prüft den tatsächlichen Erhalt.</li><li>Erst danach werden die Token im gemeinsamen Buchungsjournal gutgeschrieben.</li></ol><p>Eine IBAN ist nicht erforderlich. Die App greift nicht auf ein Bankkonto zu und speichert keine Karten- oder Online-Banking-Daten.</p>`
    },
    tokens: {
      title: "So funktionieren Korbio Token",
      body: `<h3>Einfach und transparent</h3><p><strong>1 Token entspricht genau 0,01 €.</strong> Ein Warenkorb über 18,47 € kostet deshalb 1.847 Token. Der Aufschlag von 0,10 € je Artikel entspricht 10 Token.</p><ol><li>Familienbeitrag bar oder per Überweisung vorbereiten.</li><li>Der Admin bestätigt den echten Geldeingang.</li><li>Auftrag mit dem gemeinsamen Guthaben bezahlen.</li><li>Alle Familienmitglieder sehen denselben Stand und dieselben Aufträge.</li></ol><p>Das Guthaben ist eine private interne Familienabrechnung. Es ist nicht übertragbar, bringt keine Zinsen und wird nicht öffentlich verkauft.</p>`
    },
    payments: {
      title: "Familienbeitrag ohne App-Gebühr",
      body: `<p>Für die private Familienversion kann Korbio Barbeiträge oder optional eine normale Banküberweisung verwenden. Korbio selbst verlangt dafür keine Zahlungsgebühr.</p><p>Die App erstellt Betrag und eindeutigen Verwendungszweck. Der Familienadmin bestätigt den tatsächlichen Erhalt manuell.</p>`
    },
    cardsetup: {
      title: "Keine Kartendaten nötig",
      body: `<p>Für diese private Familienversion musst du weder Karte noch IBAN verbinden. Familienbeiträge können bar bestätigt werden. Optional kann eine IBAN nur als Überweisungsziel angezeigt werden.</p><p>Kartennummer, Ablaufdatum, CVC, PIN und Online-Banking-Zugangsdaten gehören niemals in <code>.env</code> oder andere App-Dateien.</p>`
    },
    catalogfile: {
      title: "Autorisierte Katalogdatei",
      body: `<h3>JSON oder CSV importieren</h3><p>Die Datei braucht mindestens <code>id</code>, <code>name</code>, <code>price</code> und <code>url</code>. Optional sind <code>image</code>, <code>brand</code>, <code>subtitle</code> und <code>category</code>.</p><pre><code>id,name,price,url,image,category<br>A-100,Kopfhörer,49.99,https://www.amazon.de/dp/…,https://…,Technik</code></pre><p><a href="./docs/partner-feed-template.csv" download>CSV-Vorlage herunterladen</a></p><p>Korbio akzeptiert nur HTTPS-Produktlinks des ausgewählten Händlers. Die Daten bleiben lokal auf diesem Gerät. Vor echten Token-Aufträgen muss derselbe Feed serverseitig angebunden und der Preis bei jeder Bestellung aktualisiert werden.</p>`
    },
    install: {
      title: "Korbio auf dem iPhone installieren",
      body: `<h3>In Safari</h3><ol><li>Öffne die veröffentlichte Korbio-Adresse in Safari.</li><li>Tippe unten auf das Teilen-Symbol.</li><li>Wähle „Zum Home-Bildschirm“ und bestätige mit „Hinzufügen“.</li></ol><p>Danach startet Korbio wie eine eigene App. Für diese PWA ist kein App-Store-Konto nötig.</p>`
    }
  }[type];
  if (!content) return;
  elements.infoTitle.textContent = content.title;
  elements.infoContent.innerHTML = content.body;
  elements.infoDialog.showModal();
}

document.addEventListener("click", (event) => {
  const viewButton = event.target.closest("[data-view]");
  if (viewButton) setView(viewButton.dataset.view);

  const shopButton = event.target.closest("[data-shop]");
  if (shopButton) {
    state.shopId = shopButton.dataset.shop;
    state.visibleLimit = 48;
    renderShopRail();
    renderProducts();
  }

  const categoryButton = event.target.closest("[data-category]");
  if (categoryButton) {
    state.category = categoryButton.dataset.category;
    state.visibleLimit = 48;
    renderCategories();
    renderProducts();
  }

  const addButton = event.target.closest("[data-add]");
  if (addButton) addToCart(addButton.dataset.add);

  const quantityButton = event.target.closest("[data-quantity]");
  if (quantityButton) setQuantity(quantityButton.dataset.quantity, quantityButton.dataset.delta);

  const removeButton = event.target.closest("[data-remove]");
  if (removeButton) removeFromCart(removeButton.dataset.remove);

  const infoButton = event.target.closest("[data-info]");
  if (infoButton) showInfo(infoButton.dataset.info);

  const tokenPackageButton = event.target.closest("[data-token-package]");
  if (tokenPackageButton) beginTokenPurchase(tokenPackageButton.dataset.tokenPackage);

  const confirmButton = event.target.closest("[data-confirm-topup]");
  if (confirmButton) confirmTopup(confirmButton.dataset.confirmTopup);

  if (event.target.closest("#cart-button") || event.target.closest("#mobile-cart")) openCart();
  if (event.target.closest("#token-button") || event.target.closest("#connect-payout")) openTokenDialog();
  if (event.target.closest("#family-user-button")) logoutFamily();
  if (event.target.closest("#cart-close") || event.target === elements.drawerBackdrop) closeCart();
  if (event.target.closest("#checkout-button")) openCheckout();
  if (event.target.closest("#checkout-topup")) {
    elements.checkoutDialog.close();
    openTokenDialog();
  }
  if (event.target.closest("[data-dialog-close]")) elements.checkoutDialog.close();
  if (event.target.closest("[data-token-close]")) elements.tokenDialog.close();
  if (event.target.closest("[data-info-close]")) elements.infoDialog.close();
  if (event.target.closest("#reset-filters")) resetFilters();
  if (event.target.closest("#load-more")) {
    state.visibleLimit += 48;
    renderProducts();
  }
  if (event.target.closest("[data-mobile-search]")) {
    setView("discover");
    elements.searchInput.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => elements.searchInput.focus(), 400);
  }
});

elements.searchInput.addEventListener("input", (event) => {
  state.query = event.target.value;
  state.visibleLimit = 48;
  renderProducts();
});

elements.sortSelect.addEventListener("change", (event) => {
  state.sort = event.target.value;
  state.visibleLimit = 48;
  renderProducts();
});

elements.verifiedToggle.addEventListener("click", () => {
  state.verifiedOnly = !state.verifiedOnly;
  state.visibleLimit = 48;
  elements.verifiedToggle.setAttribute("aria-pressed", String(state.verifiedOnly));
  renderProducts();
});

elements.checkoutForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!elements.checkoutForm.reportValidity()) return;
  beginCheckout(elements.checkoutForm);
});

elements.familyLoginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!elements.familyLoginForm.reportValidity()) return;
  const data = new FormData(elements.familyLoginForm);
  elements.familyLoginSubmit.disabled = true;
  elements.familyLoginStatus.textContent = "Familienkasse wird geöffnet …";
  try {
    const session = await apiRequest("./api/family/login", {
      method: "POST",
      body: JSON.stringify({ memberName: data.get("memberName"), password: data.get("password") })
    });
    applySessionPayload(session);
    elements.familyLoginForm.querySelector('[name="password"]').value = "";
    elements.familyLoginDialog.close();
    showToast(`Willkommen, ${session.memberName}.`);
  } catch (error) {
    elements.familyLoginStatus.textContent = error.message;
  } finally {
    elements.familyLoginSubmit.disabled = false;
  }
});

elements.familyAdjustmentForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!elements.familyAdjustmentForm.reportValidity()) return;
  const data = new FormData(elements.familyAdjustmentForm);
  const button = elements.familyAdjustmentForm.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const result = await apiRequest("./api/family/adjustments", {
      method: "POST",
      body: JSON.stringify({ amountTokens: Number(data.get("amountTokens")), reason: data.get("reason") })
    });
    state.wallet = result.wallet;
    elements.familyAdjustmentForm.reset();
    renderWallet();
    showToast("Korrekturbuchung wurde gespeichert.");
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
  }
});

elements.orderList.addEventListener("change", (event) => {
  const checkbox = event.target.closest("[data-pick-order]");
  if (checkbox) togglePicked(checkbox.dataset.pickOrder, checkbox.dataset.pickItem, checkbox.checked);
});

document.addEventListener("change", async (event) => {
  const supportStep = event.target.closest("[data-support-step]");
  if (supportStep) {
    const done = new Set(state.supportDone);
    if (supportStep.checked) done.add(supportStep.dataset.supportStep);
    else done.delete(supportStep.dataset.supportStep);
    state.supportDone = [...done];
    writeStorage(STORAGE_KEYS.supportDone, state.supportDone);
    renderSupport();
  }

  const feedInput = event.target.closest("[data-feed-input]");
  if (!feedInput?.files?.[0]) return;
  const shopId = feedInput.dataset.feedInput;
  try {
    const parsed = parsePartnerCatalog(await feedInput.files[0].text(), shopId);
    await savePartnerCatalog(shopId, parsed);
    for (let index = products.length - 1; index >= 0; index -= 1) {
      if (products[index].shopId === shopId && products[index].sourceType === "partner-feed") products.splice(index, 1);
    }
    products.push(...parsed.products);
    renderAll();
    showToast(`${parsed.products.length.toLocaleString("de-DE")} ${getShop(shopId).name}-Produkte importiert${parsed.rejected ? ` · ${parsed.rejected} übersprungen` : ""}.`);
  } catch (error) {
    showToast(error.message || "Die Katalogdatei konnte nicht gelesen werden.");
  } finally {
    feedInput.value = "";
  }
});

document.querySelector("#shop-prev").addEventListener("click", () => elements.shopRail.scrollBy({ left: -500, behavior: "smooth" }));
document.querySelector("#shop-next").addEventListener("click", () => elements.shopRail.scrollBy({ left: 500, behavior: "smooth" }));

document.querySelector("[data-scroll-catalog]").addEventListener("click", () => {
  document.querySelector("#shops-title").scrollIntoView({ behavior: "smooth", block: "start" });
});

document.querySelector("#notice-close").addEventListener("click", () => {
  document.querySelector("#data-notice").hidden = true;
  writeStorage(STORAGE_KEYS.notice, true);
});

document.querySelector("#location-button").addEventListener("click", () => {
  const next = window.prompt("Lieferort oder Postleitzahl", state.location);
  if (next?.trim()) {
    state.location = next.trim().slice(0, 40);
    writeStorage(STORAGE_KEYS.location, state.location);
    elements.locationLabel.textContent = state.location;
    showToast("Lieferort gespeichert. Regionale Live-Preise benötigen später die Händler-API.");
  }
});

document.querySelector("#install-button").addEventListener("click", async () => {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
  } else {
    showInfo("install");
  }
});

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
});

document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    setView("discover");
    elements.searchInput.focus();
  }
  if (event.key === "Escape" && elements.cartDrawer.classList.contains("is-open")) closeCart();
});

elements.checkoutDialog.addEventListener("click", (event) => {
  if (event.target === elements.checkoutDialog) elements.checkoutDialog.close();
});

elements.infoDialog.addEventListener("click", (event) => {
  if (event.target === elements.infoDialog) elements.infoDialog.close();
});

elements.tokenDialog.addEventListener("click", (event) => {
  if (event.target === elements.tokenDialog) elements.tokenDialog.close();
});

elements.productGrid.addEventListener("error", (event) => {
  if (event.target.matches(".product-image")) event.target.hidden = true;
}, true);

async function hydratePartnerCatalogs() {
  try {
    const catalogs = await loadPartnerCatalogs();
    for (const catalog of catalogs) products.push(...(catalog.products || []));
    if (catalogs.length) renderAll();
  } catch {
    showToast("Gespeicherte Händlerkataloge konnten nicht geladen werden.");
  }
}

document.querySelector("#verified-count").textContent = products.filter((product) => product.verified).length.toLocaleString("de-DE");
document.querySelector("#catalog-count").textContent = products.length.toLocaleString("de-DE");
document.querySelector("#data-notice").hidden = Boolean(readStorage(STORAGE_KEYS.notice, false));

if ("serviceWorker" in navigator && window.location.protocol.startsWith("http")) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}

renderAll();
hydratePartnerCatalogs();
loadFamilySession();
