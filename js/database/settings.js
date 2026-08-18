/**
 * Configuración de la aplicación.
 * IndexedDB guarda la configuración "de datos"; localStorage solo guarda
 * preferencias pequeñas de interfaz (tema, últimos filtros).
 */
import { STORE, getAll, get, put, remove } from './database.js';

export const DEFAULT_SETTINGS = {
  currency: { code: 'USD', symbol: '$', decimals: 2, locale: 'es-SV' },
  householdName: 'Mi hogar',
  lowStockAlerts: true,
  autoAddToList: true,
  demoLoaded: false,
  lastBackupAt: null,
  onboarded: false,
};

export async function getSetting(key, fallback = null) {
  const row = await get(STORE.SETTINGS, key);
  return row ? row.value : fallback;
}

export async function setSetting(key, value) {
  await put(STORE.SETTINGS, { key, value, updatedAt: new Date().toISOString() });
  return value;
}

export const deleteSetting = (key) => remove(STORE.SETTINGS, key);
export const listSettings = () => getAll(STORE.SETTINGS);

/** Devuelve la configuración completa mezclada con los valores por defecto. */
export async function getAppSettings() {
  const stored = (await getSetting('app')) || {};
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    currency: { ...DEFAULT_SETTINGS.currency, ...(stored.currency || {}) },
  };
}

export async function saveAppSettings(partial) {
  const current = await getAppSettings();
  const next = {
    ...current,
    ...partial,
    currency: { ...current.currency, ...(partial.currency || {}) },
  };
  await setSetting('app', next);
  return next;
}

/* ---- Preferencias de interfaz en localStorage ---- */
const LS_PREFIX = 'despensa.';

export function getPref(key, fallback = null) {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch (_) {
    return fallback;
  }
}

export function setPref(key, value) {
  try { localStorage.setItem(LS_PREFIX + key, JSON.stringify(value)); } catch (_) { /* modo privado */ }
  return value;
}

export function removePref(key) {
  try { localStorage.removeItem(LS_PREFIX + key); } catch (_) { /* ignorado */ }
}
