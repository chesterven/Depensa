/**
 * Estado de la aplicación en memoria.
 * Actúa como caché de IndexedDB: los servicios escriben en la base de datos y
 * luego refrescan el estado; las vistas se suscriben y se vuelven a dibujar.
 */
import * as productsDb from './database/products.js';
import * as purchasesDb from './database/purchases.js';
import * as storesDb from './database/stores.js';
import * as categoriesDb from './database/categories.js';
import * as listDb from './database/shopping-list.js';
import { getAppSettings } from './database/settings.js';
import { setCurrency } from './utils/format.js';

export const state = {
  ready: false,
  products: [],
  purchases: [],
  stores: [],
  categories: [],
  shoppingList: [],
  settings: {},
  // Índices auxiliares
  productsById: new Map(),
  storesById: new Map(),
  categoriesById: new Map(),
  purchasesByProduct: new Map(),
};

const listeners = new Set();

/** Se suscribe a los cambios. Devuelve la función para cancelar la suscripción. */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function notify(reason = 'update') {
  // Se itera sobre una copia: las vistas se resuscriben al volver a dibujarse
  // y hacerlo sobre el Set original provocaría un bucle infinito.
  Array.from(listeners).forEach((fn) => {
    try { fn(state, reason); } catch (error) { console.error('[state] listener', error); }
  });
}

function reindex() {
  state.productsById = new Map(state.products.map((p) => [p.id, p]));
  state.storesById = new Map(state.stores.map((s) => [s.id, s]));
  state.categoriesById = new Map(state.categories.map((c) => [c.id, c]));
  const byProduct = new Map();
  for (const purchase of state.purchases) {
    if (!purchase.productId) continue;
    if (!byProduct.has(purchase.productId)) byProduct.set(purchase.productId, []);
    byProduct.get(purchase.productId).push(purchase);
  }
  for (const list of byProduct.values()) {
    list.sort((a, b) => String(a.purchaseDate).localeCompare(String(b.purchaseDate)));
  }
  state.purchasesByProduct = byProduct;
}

const LOADERS = {
  products: () => productsDb.listProducts(),
  purchases: () => purchasesDb.listPurchases(),
  stores: () => storesDb.listStores(),
  categories: () => categoriesDb.listCategories(),
  shoppingList: () => listDb.listShoppingItems(),
  settings: () => getAppSettings(),
};

/** Recarga una o varias colecciones y avisa a las vistas. */
export async function refresh(keys = Object.keys(LOADERS), { silent = false } = {}) {
  const list = Array.isArray(keys) ? keys : [keys];
  await Promise.all(list.map(async (key) => {
    const loader = LOADERS[key];
    if (!loader) return;
    state[key] = await loader();
  }));
  if (list.includes('settings')) setCurrency(state.settings.currency || {});
  reindex();
  if (!silent) notify(list.join(','));
}

/** Carga inicial completa. */
export async function loadAll() {
  await categoriesDb.ensureDefaultCategories();
  await refresh(Object.keys(LOADERS), { silent: true });
  state.ready = true;
  notify('ready');
}

/* ---- Accesos de conveniencia ---- */
export const getProduct = (id) => state.productsById.get(id) || null;
export const getStore = (id) => state.storesById.get(id) || null;
export const getCategory = (id) => state.categoriesById.get(id) || null;

export function storeName(id, fallback = 'Sin comercio') {
  return state.storesById.get(id)?.name || fallback;
}

export function categoryName(id, fallback = 'Sin categoría') {
  return state.categoriesById.get(id)?.name || fallback;
}

export function productName(id, fallback = 'Producto eliminado') {
  return state.productsById.get(id)?.name || fallback;
}

/** Compras de un producto, de la más antigua a la más reciente. */
export function purchasesOf(productId) {
  return state.purchasesByProduct.get(productId) || [];
}

/** Elementos pendientes de la lista de compras. */
export function pendingItems() {
  return state.shoppingList.filter((item) => item.status === 'pending');
}
