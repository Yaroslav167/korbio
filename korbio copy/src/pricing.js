export const SERVICE_FEE_CENTS = 10;

export function normalizeQuantity(value) {
  const quantity = Number(value);
  if (!Number.isFinite(quantity)) return 1;
  return Math.max(1, Math.min(99, Math.floor(quantity)));
}

export function getCartTotals(cart, products) {
  const productMap = new Map(products.map((product) => [product.id, product]));
  let itemCount = 0;
  let subtotalCents = 0;

  for (const entry of cart) {
    const product = productMap.get(entry.productId);
    if (!product) continue;
    const quantity = normalizeQuantity(entry.quantity);
    itemCount += quantity;
    subtotalCents += product.priceCents * quantity;
  }

  const serviceFeeCents = itemCount * SERVICE_FEE_CENTS;
  return {
    itemCount,
    subtotalCents,
    serviceFeeCents,
    totalCents: subtotalCents + serviceFeeCents
  };
}

export function formatEuro(cents) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR"
  }).format(cents / 100);
}

export function groupCartByShop(cart, products, shops) {
  const productMap = new Map(products.map((product) => [product.id, product]));
  const shopMap = new Map(shops.map((shop) => [shop.id, shop]));
  const groups = new Map();

  for (const entry of cart) {
    const product = productMap.get(entry.productId);
    if (!product) continue;
    if (!groups.has(product.shopId)) {
      groups.set(product.shopId, {
        shop: shopMap.get(product.shopId),
        items: []
      });
    }
    groups.get(product.shopId).items.push({
      product,
      quantity: normalizeQuantity(entry.quantity)
    });
  }

  return [...groups.values()];
}
