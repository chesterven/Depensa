/**
 * Estado de la aplicación en memoria.
 * La base de datos es la única fuente de verdad: aquí solo vive la copia de
 * trabajo de la sesión actual, junto con el estado de la conexión.
 */
import * as auth from './api/auth.js';
import { ensureHousehold } from './api/household.js';
import { listProducts } from './api/products.js';
import { listCategories, listStores } from './api/catalog.js';
import { isConfigured, describeError } from './api/client.js';
import { setCurrency } from './utils/format.js';

export const PHASE = {
  BOOT: 'boot',
  SETUP: 'setup',     // falta conectar el proyecto
  LOGIN: 'login',     // falta iniciar sesión
  READY: 'ready',
  ERROR: 'error',
};

export const state = {
  phase: PHASE.BOOT,
  loading: false,
  refreshing: false,
  error: null,
  online: navigator.onLine,
  lastSyncAt: null,
  session: null,
  household: null,
  categories: [],
  stores: [],
  products: [],
  categoriesById: new Map(),
  storesById: new Map(),
  productsById: new Map(),
};

const listeners = new Set();

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function notify(reason = 'update') {
  Array.from(listeners).forEach((fn) => {
    try { fn(state, reason); } catch (error) { console.error('[state]', error); }
  });
}

function reindex() {
  state.categoriesById = new Map(state.categories.map((c) => [c.id, c]));
  state.storesById = new Map(state.stores.map((s) => [s.id, s]));
  state.productsById = new Map(state.products.map((p) => [p.id, p]));
}

/** Decide en qué pantalla arranca la app. */
export async function bootstrapSession() {
  if (!isConfigured()) {
    state.phase = PHASE.SETUP;
    notify('phase');
    return state.phase;
  }
  try {
    const session = await auth.getSession();
    state.session = session;
    state.phase = session ? PHASE.READY : PHASE.LOGIN;
  } catch (error) {
    state.phase = PHASE.SETUP;
    state.error = describeError(error);
  }
  notify('phase');
  return state.phase;
}

export function setSession(session) {
  state.session = session;
  state.phase = session ? PHASE.READY : PHASE.LOGIN;
  if (!session) {
    state.household = null;
    state.products = [];
    state.categories = [];
    state.stores = [];
    state.lastSyncAt = null;
    reindex();
  }
  notify('session');
}

/** Carga (o recarga) todo lo del hogar desde la base de datos. */
export async function loadAll({ silent = false } = {}) {
  if (!state.session) return false;
  if (silent) state.refreshing = true;
  else state.loading = true;
  state.error = null;
  notify('loading');

  try {
    const household = state.household || await ensureHousehold(state.session.user.id);
    const [categories, stores, products] = await Promise.all([
      listCategories(household.id),
      listStores(household.id),
      listProducts(household.id),
    ]);
    state.household = household;
    state.categories = categories;
    state.stores = stores;
    state.products = products;
    state.lastSyncAt = new Date().toISOString();
    state.online = true;
    setCurrency({ symbol: household.currencySymbol });
    reindex();
    return true;
  } catch (error) {
    state.error = describeError(error);
    if (!navigator.onLine) state.online = false;
    return false;
  } finally {
    state.loading = false;
    state.refreshing = false;
    notify('loaded');
  }
}

/** Vuelve a leer solo los productos (tras un cambio propio o remoto). */
export async function refreshProducts() {
  if (!state.household) return false;
  try {
    state.products = await listProducts(state.household.id);
    state.lastSyncAt = new Date().toISOString();
    reindex();
    notify('products');
    return true;
  } catch (error) {
    state.error = describeError(error);
    notify('error');
    return false;
  }
}

/* ---- Actualizaciones inmediatas en pantalla (se confirman contra el servidor) ---- */

export function upsertProductLocal(product) {
  const index = state.products.findIndex((p) => p.id === product.id);
  if (index >= 0) state.products[index] = { ...state.products[index], ...product };
  else state.products = [...state.products, product].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  reindex();
  notify('products');
}

export function removeProductLocal(id) {
  state.products = state.products.filter((p) => p.id !== id);
  reindex();
  notify('products');
}

export function setCatalogLocal({ categories, stores }) {
  if (categories) state.categories = categories;
  if (stores) state.stores = stores;
  reindex();
  notify('catalog');
}

export function setHouseholdLocal(household) {
  state.household = household;
  setCurrency({ symbol: household.currencySymbol });
  notify('household');
}

/* ---- Conexión y actualización automática ---- */

let timer = null;
const REFRESH_MS = 45000;

export function startAutoRefresh() {
  stopAutoRefresh();
  timer = setInterval(() => {
    if (document.visibilityState === 'visible' && state.phase === PHASE.READY && navigator.onLine) {
      loadAll({ silent: true });
    }
  }, REFRESH_MS);

  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
}

export function stopAutoRefresh() {
  if (timer) clearInterval(timer);
  timer = null;
  document.removeEventListener('visibilitychange', onVisible);
  window.removeEventListener('online', onOnline);
  window.removeEventListener('offline', onOffline);
}

function onVisible() {
  if (document.visibilityState === 'visible' && state.phase === PHASE.READY) {
    state.online = navigator.onLine;
    if (navigator.onLine) loadAll({ silent: true });
    else notify('connection');
  }
}

function onOnline() {
  state.online = true;
  notify('connection');
  if (state.phase === PHASE.READY) loadAll({ silent: true });
}

function onOffline() {
  state.online = false;
  notify('connection');
}

/* ---- Accesos de conveniencia ---- */
export const categoryOf = (product) => state.categoriesById.get(product?.categoryId) || null;
export const storeOf = (product) => state.storesById.get(product?.storeId) || null;
export const categoryName = (id, fallback = 'Sin categoría') => state.categoriesById.get(id)?.name || fallback;
export const storeName = (id, fallback = 'Sin comercio') => state.storesById.get(id)?.name || fallback;
export const warningDays = () => state.household?.expiryWarningDays ?? 7;
