/** Utilidades de fecha. Todo se calcula en la zona horaria local del dispositivo. */

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** Fecha de hoy como YYYY-MM-DD (sin desfase de zona horaria). */
export function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Convierte 'YYYY-MM-DD' (o ISO) a Date local, evitando el desfase UTC de new Date('YYYY-MM-DD'). */
export function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/** 17 ago 2026 */
export function formatDate(value) {
  const d = parseDate(value);
  if (!d) return '—';
  return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
}

/** 17 ago */
export function formatDateShort(value) {
  const d = parseDate(value);
  if (!d) return '—';
  return `${d.getDate()} ${MESES[d.getMonth()]}`;
}

/** «hoy», «ayer», «hace 3 días», o la fecha completa. */
export function formatRelative(value) {
  const d = parseDate(value);
  if (!d) return '—';
  const today = new Date();
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const b = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.round((b - a) / 86400000);
  if (days === 0) return 'hoy';
  if (days === 1) return 'ayer';
  if (days > 1 && days < 7) return `hace ${days} días`;
  if (days === -1) return 'mañana';
  return formatDate(d);
}

/** Clave de mes YYYY-MM */
export function monthKey(value) {
  const d = parseDate(value) || new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** 'ago 2026' a partir de 'YYYY-MM' */
export function monthLabel(key, long = false) {
  const [y, m] = String(key).split('-').map(Number);
  const name = long ? MESES_LARGOS[m - 1] : MESES[m - 1];
  return `${name} ${y}`;
}

export function startOfWeek(d = new Date()) {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = (date.getDay() + 6) % 7; // lunes = 0
  date.setDate(date.getDate() - day);
  return date;
}

export function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function startOfYear(d = new Date()) {
  return new Date(d.getFullYear(), 0, 1);
}

/** Lista de las últimas n claves de mes, terminando en el mes actual. */
export function lastMonths(n, from = new Date()) {
  const out = [];
  const d = new Date(from.getFullYear(), from.getMonth(), 1);
  for (let i = n - 1; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(monthKey(m));
  }
  return out;
}

/** Diferencia en días entre una fecha y hoy (positivo = en el pasado). */
export function daysSince(value) {
  const d = parseDate(value);
  if (!d) return Infinity;
  return Math.round((Date.now() - d.getTime()) / 86400000);
}
