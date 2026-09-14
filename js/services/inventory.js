/**
 * Reglas del inventario: existencia, vencimientos, filtros y resúmenes.
 * No habla con la red: recibe los productos ya cargados.
 */
import { state, warningDays } from '../state.js';
import { normalize } from '../utils/format.js';
import { todayKey, parseDate, formatDate } from '../utils/date.js';

export const EXPIRY = {
  NONE: 'none',       // el producto no maneja vencimiento
  UNSET: 'unset',     // lo maneja pero no tiene fecha
  OK: 'ok',
  SOON: 'soon',
  TODAY: 'today',
  EXPIRED: 'expired',
};

/** Días entre hoy y la fecha (negativo = ya pasó). */
export function daysUntil(dateString) {
  const target = parseDate(dateString);
  if (!target) return null;
  const today = new Date();
  const a = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const b = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.round((b - a) / 86400000);
}

/** Estado de vencimiento de un producto, listo para pintar. */
export function expiryInfo(product, days = warningDays()) {
  if (!product?.tracksExpiry) return { state: EXPIRY.NONE, label: '', tone: 'muted', days: null };
  if (!product.expiresOn) {
    return { state: EXPIRY.UNSET, label: 'Sin fecha', tone: 'muted', days: null };
  }
  const remaining = daysUntil(product.expiresOn);
  if (remaining < 0) {
    const ago = Math.abs(remaining);
    return {
      state: EXPIRY.EXPIRED,
      label: ago === 1 ? 'Venció ayer' : `Venció hace ${ago} días`,
      tone: 'danger',
      days: remaining,
    };
  }
  if (remaining === 0) return { state: EXPIRY.TODAY, label: 'Vence hoy', tone: 'danger', days: 0 };
  if (remaining <= days) {
    return {
      state: EXPIRY.SOON,
      label: remaining === 1 ? 'Vence mañana' : `Vence en ${remaining} días`,
      tone: 'warn',
      days: remaining,
    };
  }
  return { state: EXPIRY.OK, label: `Vence el ${formatDate(product.expiresOn)}`, tone: 'muted', days: remaining };
}

export const isExpired = (product, days) => expiryInfo(product, days).state === EXPIRY.EXPIRED;
export const isExpiringSoon = (product, days) => [EXPIRY.SOON, EXPIRY.TODAY].includes(expiryInfo(product, days).state);

/** Resumen para la pantalla de inicio. */
export function summary(products = state.products, days = warningDays()) {
  let inStock = 0;
  let out = 0;
  let soon = 0;
  let expired = 0;
  for (const product of products) {
    if (product.inStock) inStock += 1; else out += 1;
    if (!product.inStock) continue; // lo que ya no hay no se cuenta como vencido
    const info = expiryInfo(product, days);
    if (info.state === EXPIRY.EXPIRED) expired += 1;
    else if (info.state === EXPIRY.SOON || info.state === EXPIRY.TODAY) soon += 1;
  }
  return { total: products.length, inStock, out, soon, expired };
}

export const FILTERS = [
  { value: 'all', label: 'Todos' },
  { value: 'in', label: 'Hay' },
  { value: 'out', label: 'No hay' },
  { value: 'soon', label: 'Por vencer' },
  { value: 'expired', label: 'Vencidos' },
];

/** Búsqueda, filtros y orden del inventario. */
export function filterProducts(products, { query = '', categoryId = '', storeId = '', status = 'all', sort = 'name' } = {}) {
  const q = normalize(query);
  const days = warningDays();
  const collator = new Intl.Collator('es', { sensitivity: 'base' });

  const filtered = products.filter((product) => {
    if (q) {
      const haystack = `${product.name} ${product.notes} ${product.unit}`;
      if (!normalize(haystack).includes(q)) return false;
    }
    if (categoryId && product.categoryId !== categoryId) return false;
    if (storeId && product.storeId !== storeId) return false;

    switch (status) {
      case 'in': return product.inStock;
      case 'out': return !product.inStock;
      case 'soon': return product.inStock && isExpiringSoon(product, days);
      case 'expired': return product.inStock && isExpired(product, days);
      default: return true;
    }
  });

  return filtered.sort((a, b) => {
    switch (sort) {
      case 'status': {
        const diff = (a.inStock ? 1 : 0) - (b.inStock ? 1 : 0);
        return diff !== 0 ? diff : collator.compare(a.name, b.name);
      }
      case 'expiry': {
        const da = expirySortKey(a);
        const db = expirySortKey(b);
        return da !== db ? da - db : collator.compare(a.name, b.name);
      }
      case 'recent': return String(b.updatedAt).localeCompare(String(a.updatedAt));
      case 'category': {
        const ca = state.categoriesById.get(a.categoryId)?.name || 'zzz';
        const cb = state.categoriesById.get(b.categoryId)?.name || 'zzz';
        const diff = collator.compare(ca, cb);
        return diff !== 0 ? diff : collator.compare(a.name, b.name);
      }
      default: return collator.compare(a.name, b.name);
    }
  });
}

function expirySortKey(product) {
  if (!product.tracksExpiry || !product.expiresOn) return 99999;
  return daysUntil(product.expiresOn) ?? 99999;
}

/** Productos que hay que comprar. */
export function shoppingList(products = state.products) {
  return products.filter((product) => !product.inStock);
}

/** Productos con vencimiento próximo o pasado (solo los que hay). */
export function expiringSoon(products = state.products, days = warningDays()) {
  return products
    .filter((product) => product.inStock && product.tracksExpiry && product.expiresOn)
    .map((product) => ({ product, info: expiryInfo(product, days) }))
    .filter(({ info }) => [EXPIRY.EXPIRED, EXPIRY.TODAY, EXPIRY.SOON].includes(info.state))
    .sort((a, b) => (a.info.days ?? 0) - (b.info.days ?? 0));
}

export function groupByStore(products) {
  const groups = new Map();
  for (const product of products) {
    const key = product.storeId || '__none__';
    if (!groups.has(key)) {
      groups.set(key, {
        storeId: product.storeId || null,
        storeName: state.storesById.get(product.storeId)?.name || 'Sin comercio',
        products: [],
      });
    }
    groups.get(key).products.push(product);
  }
  return [...groups.values()].sort((a, b) => {
    if (!a.storeId) return 1;
    if (!b.storeId) return -1;
    return a.storeName.localeCompare(b.storeName, 'es');
  });
}

export function groupByCategory(products) {
  const groups = new Map();
  for (const product of products) {
    const key = product.categoryId || '__none__';
    if (!groups.has(key)) {
      const category = state.categoriesById.get(product.categoryId);
      groups.set(key, {
        categoryId: product.categoryId || null,
        name: category?.name || 'Sin categoría',
        icon: category?.icon || 'tag',
        color: category?.color || '#6C7684',
        sortOrder: category?.sortOrder ?? 99,
        products: [],
      });
    }
    groups.get(key).products.push(product);
  }
  return [...groups.values()].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'es'));
}

/** Busca un producto por nombre (para evitar duplicados). */
export function findByName(name, products = state.products) {
  const key = normalize(name);
  return products.find((product) => normalize(product.name) === key) || null;
}

/** Fechas sugeridas al marcar algo como comprado. */
export function expiryPresets(from = new Date()) {
  const make = (days, label) => {
    const date = new Date(from);
    date.setDate(date.getDate() + days);
    return { label, value: todayKey(date) };
  };
  return [make(7, '1 semana'), make(15, '15 días'), make(30, '1 mes'), make(90, '3 meses'), make(365, '1 año')];
}
