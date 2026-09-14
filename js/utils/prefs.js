/** Preferencias pequeñas de interfaz guardadas en este dispositivo. */
const PREFIX = 'despensa.';

export function getPref(key, fallback = null) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch (_) {
    return fallback;
  }
}

export function setPref(key, value) {
  try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch (_) { /* modo privado */ }
  return value;
}

export function removePref(key) {
  try { localStorage.removeItem(PREFIX + key); } catch (_) { /* ignorado */ }
}
