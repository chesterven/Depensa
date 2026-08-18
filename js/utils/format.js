/** Formato de números, dinero, cantidades y texto. */

let currency = { code: 'USD', symbol: '$', decimals: 2, locale: 'es-SV' };

/** Actualiza la configuración de moneda (llamado desde el estado / ajustes). */
export function setCurrency(cfg = {}) {
  currency = { ...currency, ...cfg };
}

export function getCurrency() {
  return { ...currency };
}

function nf(min, max) {
  try {
    return new Intl.NumberFormat(currency.locale || 'es-SV', {
      minimumFractionDigits: min,
      maximumFractionDigits: max,
    });
  } catch (_) {
    return { format: (n) => Number(n).toFixed(max) };
  }
}

/** $1.35 */
export function money(value) {
  const n = Number(value);
  if (!isFinite(n)) return `${currency.symbol}0${currency.decimals ? '.' + '0'.repeat(currency.decimals) : ''}`;
  const d = currency.decimals ?? 2;
  return `${currency.symbol}${nf(d, d).format(n)}`;
}

/** $1.35 pero devuelve '—' cuando no hay dato. */
export function moneyOrDash(value) {
  if (value == null || !isFinite(Number(value))) return '—';
  return money(value);
}

/** Número compacto para cantidades: 2, 2.5, 0.75 */
export function qty(value) {
  const n = Number(value) || 0;
  if (Number.isInteger(n)) return String(n);
  return nf(0, 3).format(Math.round(n * 1000) / 1000);
}

export function percent(value, decimals = 1) {
  const n = Number(value);
  if (!isFinite(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${nf(0, decimals).format(n)}%`;
}

/** Texto normalizado para búsquedas: minúsculas y sin acentos. */
export function normalize(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/** Pluralización simple: plural(1,'producto') -> '1 producto' */
export function plural(count, singular, pluralForm) {
  const n = Number(count) || 0;
  const word = n === 1 ? singular : (pluralForm || `${singular}s`);
  return `${nf(0, 2).format(n)} ${word}`;
}

/** Primera letra en mayúscula. */
export function capitalize(text) {
  const s = String(text ?? '');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Iniciales para avatares/marcadores de posición. */
export function initials(text) {
  const parts = String(text ?? '').trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p.charAt(0).toUpperCase()).join('') || '?';
}

/** Redondeo a n decimales evitando errores de coma flotante. */
export function round(value, decimals = 2) {
  const f = Math.pow(10, decimals);
  return Math.round((Number(value) + Number.EPSILON) * f) / f;
}

/** Convierte texto de formulario a número (acepta coma decimal). */
export function toNumber(value, fallback = 0) {
  if (value === '' || value == null) return fallback;
  const n = Number(String(value).replace(',', '.'));
  return isFinite(n) ? n : fallback;
}

export function bytes(size) {
  const n = Number(size) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
