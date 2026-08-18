/** Estadísticas de gasto por período, categoría, comercio y producto. */
import { state } from '../state.js';
import { round } from '../utils/format.js';
import { todayKey, startOfWeek, startOfMonth, startOfYear, monthKey, lastMonths, parseDate } from '../utils/date.js';

const key = (d) => todayKey(d);

/** Filtra compras por rango de fechas inclusive (claves YYYY-MM-DD). */
export function inRange(purchases, from, to) {
  return purchases.filter((p) => {
    const d = String(p.purchaseDate || '');
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  });
}

export function total(purchases) {
  return round(purchases.reduce((sum, p) => sum + (Number(p.totalPrice) || 0), 0), 2);
}

/** Resumen de gasto: día, semana, mes, año y promedio mensual. */
export function expenseSummary(purchases = state.purchases) {
  const today = todayKey();
  const week = key(startOfWeek());
  const month = key(startOfMonth());
  const year = key(startOfYear());
  const months = new Set(purchases.map((p) => monthKey(p.purchaseDate)));
  const grand = total(purchases);
  return {
    today: total(inRange(purchases, today, today)),
    week: total(inRange(purchases, week, null)),
    month: total(inRange(purchases, month, null)),
    year: total(inRange(purchases, year, null)),
    total: grand,
    monthsTracked: months.size,
    monthlyAverage: months.size ? round(grand / months.size, 2) : 0,
    count: purchases.length,
  };
}

/** Serie de gasto de los últimos n meses. */
export function monthlySeries(n = 12, purchases = state.purchases) {
  const buckets = new Map(lastMonths(n).map((m) => [m, 0]));
  for (const purchase of purchases) {
    const m = monthKey(purchase.purchaseDate);
    if (buckets.has(m)) buckets.set(m, round(buckets.get(m) + (Number(purchase.totalPrice) || 0), 2));
  }
  return [...buckets.entries()].map(([month, value]) => ({ key: month, value }));
}

/** Comparación del mes actual contra el anterior. */
export function monthComparison(purchases = state.purchases) {
  const series = monthlySeries(2, purchases);
  const previous = series[0]?.value || 0;
  const current = series[1]?.value || 0;
  const change = previous ? round(((current - previous) / previous) * 100, 1) : null;
  return { current, previous, change };
}

/** Gasto agrupado por categoría. */
export function byCategory(purchases = state.purchases) {
  const groups = new Map();
  for (const purchase of purchases) {
    const product = state.productsById.get(purchase.productId);
    const categoryId = product?.categoryId || purchase.categoryId || null;
    const name = state.categoriesById.get(categoryId)?.name || 'Sin categoría';
    const entry = groups.get(categoryId || '__none__') || { id: categoryId, name, value: 0, count: 0, color: state.categoriesById.get(categoryId)?.color };
    entry.value = round(entry.value + (Number(purchase.totalPrice) || 0), 2);
    entry.count += 1;
    groups.set(categoryId || '__none__', entry);
  }
  return [...groups.values()].sort((a, b) => b.value - a.value);
}

/** Gasto agrupado por comercio. */
export function byStore(purchases = state.purchases) {
  const groups = new Map();
  for (const purchase of purchases) {
    const id = purchase.storeId || '__none__';
    const name = state.storesById.get(purchase.storeId)?.name || purchase.storeName || 'Sin comercio';
    const entry = groups.get(id) || { id: purchase.storeId || null, name, value: 0, count: 0 };
    entry.value = round(entry.value + (Number(purchase.totalPrice) || 0), 2);
    entry.count += 1;
    groups.set(id, entry);
  }
  return [...groups.values()].sort((a, b) => b.value - a.value);
}

/** Productos con mayor gasto acumulado. */
export function topProducts(purchases = state.purchases, limit = 8) {
  const groups = new Map();
  for (const purchase of purchases) {
    const id = purchase.productId || purchase.productName;
    const name = state.productsById.get(purchase.productId)?.name || purchase.productName || 'Producto';
    const entry = groups.get(id) || { id: purchase.productId, name, value: 0, count: 0, quantity: 0 };
    entry.value = round(entry.value + (Number(purchase.totalPrice) || 0), 2);
    entry.quantity = round(entry.quantity + (Number(purchase.quantity) || 0), 2);
    entry.count += 1;
    groups.set(id, entry);
  }
  return [...groups.values()].sort((a, b) => b.value - a.value).slice(0, limit);
}

/** Rangos predefinidos para los filtros de estadísticas. */
export function presetRange(preset) {
  const now = new Date();
  switch (preset) {
    case 'month': return { from: key(startOfMonth(now)), to: todayKey(now), label: 'Este mes' };
    case 'last30': {
      const d = new Date(now); d.setDate(d.getDate() - 29);
      return { from: key(d), to: todayKey(now), label: 'Últimos 30 días' };
    }
    case 'year': return { from: key(startOfYear(now)), to: todayKey(now), label: 'Este año' };
    case 'all':
    default: return { from: '', to: '', label: 'Todo el historial' };
  }
}

export { parseDate };
