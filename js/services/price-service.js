/**
 * Estadísticas de precios: promedio, mínimo, máximo, último, variación
 * y comparación entre comercios.
 */
import { round } from '../utils/format.js';
import { state, purchasesOf } from '../state.js';

/** Calcula estadísticas a partir de una lista de compras (precio unitario). */
export function priceStats(purchases = []) {
  const valid = purchases.filter((p) => isFinite(Number(p.unitPrice)) && Number(p.unitPrice) > 0);
  if (!valid.length) {
    return { count: 0, avg: null, min: null, max: null, last: null, lastDate: null, first: null, variation: null, spend: 0 };
  }
  const ordered = [...valid].sort((a, b) => String(a.purchaseDate).localeCompare(String(b.purchaseDate)));
  const prices = ordered.map((p) => Number(p.unitPrice));
  const sum = prices.reduce((a, b) => a + b, 0);
  const avg = round(sum / prices.length, 2);
  const min = round(Math.min(...prices), 2);
  const max = round(Math.max(...prices), 2);
  const last = round(prices[prices.length - 1], 2);
  const first = round(prices[0], 2);
  const previous = prices.length > 1 ? prices[prices.length - 2] : null;
  const variation = previous ? round(((last - previous) / previous) * 100, 1) : null;
  const spend = round(ordered.reduce((a, p) => a + (Number(p.totalPrice) || 0), 0), 2);
  return {
    count: prices.length, avg, min, max, last, first, variation, spend,
    lastDate: ordered[ordered.length - 1].purchaseDate,
    vsAverage: avg ? round(((last - avg) / avg) * 100, 1) : null,
  };
}

/** Estadísticas de un producto usando el estado global. */
export function productPriceStats(productId) {
  return priceStats(purchasesOf(productId));
}

/** Comparación por comercio para un producto. */
export function statsByStoreFor(productId) {
  const purchases = purchasesOf(productId);
  const groups = new Map();
  for (const purchase of purchases) {
    const key = purchase.storeId || '__none__';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(purchase);
  }
  const rows = [...groups.entries()].map(([storeId, list]) => {
    const stats = priceStats(list);
    const store = state.storesById.get(storeId);
    return {
      storeId: storeId === '__none__' ? null : storeId,
      storeName: store?.name || list[0]?.storeName || 'Sin comercio',
      ...stats,
    };
  });
  rows.sort((a, b) => (a.avg ?? Infinity) - (b.avg ?? Infinity));
  if (rows.length) rows[0].isCheapest = rows.length > 1 && rows[0].avg != null;
  return rows;
}

/** Comercio con el precio promedio más bajo para un producto. */
export function bestStoreFor(productId) {
  const rows = statsByStoreFor(productId).filter((r) => r.storeId && r.avg != null);
  if (!rows.length) return null;
  const best = rows[0];
  const worst = rows[rows.length - 1];
  return {
    storeId: best.storeId,
    storeName: best.storeName,
    avg: best.avg,
    count: best.count,
    alternatives: rows.length,
    savingsPerUnit: rows.length > 1 ? round(worst.avg - best.avg, 2) : 0,
  };
}

/**
 * Precio unitario sugerido para un producto.
 * Prioriza el promedio en el comercio elegido; si no hay, usa el promedio general
 * y por último el último precio conocido.
 */
export function suggestedPrice(productId, storeId = null) {
  const purchases = purchasesOf(productId);
  if (!purchases.length) return null;
  if (storeId) {
    const inStore = purchases.filter((p) => p.storeId === storeId);
    if (inStore.length) return priceStats(inStore).avg;
  }
  const general = priceStats(purchases);
  return general.avg ?? general.last ?? null;
}

/** Serie temporal para la gráfica de evolución de precio. */
export function priceSeries(productId, limit = 24) {
  return purchasesOf(productId)
    .filter((p) => Number(p.unitPrice) > 0)
    .slice(-limit)
    .map((p) => ({
      date: p.purchaseDate,
      value: Number(p.unitPrice),
      label: p.storeName || state.storesById.get(p.storeId)?.name || '',
    }));
}
