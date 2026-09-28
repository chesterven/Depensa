/**
 * Avisos de vencimiento del sistema operativo.
 *
 * ALCANCE REAL (importante): estos avisos los dispara la propia aplicación, así
 * que solo aparecen mientras Despensa está abierta —en una pestaña, en segundo
 * plano o instalada—. Si el teléfono tiene la app cerrada del todo, nadie
 * ejecuta este código y no llega nada.
 *
 * Para recibir avisos con la app cerrada haría falta un servidor que empuje las
 * notificaciones (Web Push con VAPID + una tarea programada en Supabase). Ver
 * la nota al final del archivo.
 *
 * Se usa registration.showNotification() y no `new Notification()` porque en
 * Chrome para Android el segundo lanza una excepción.
 */
import { state, warningDays } from '../state.js';
import { expiryInfo, EXPIRY } from './inventory.js';
import { getPref, setPref, removePref } from '../utils/prefs.js';
import { todayKey } from '../utils/date.js';

const ENABLED_KEY = 'notify.expiry';
const SENT_KEY = 'notify.sent';
const ICON = './assets/icons/icon-192.png';
const BADGE = './assets/icons/icon-96.png';

/* ---------- Capacidades del navegador ---------- */

/**
 * En iOS la API de notificaciones solo existe si la app está instalada en la
 * pantalla de inicio (iOS 16.4+). En una pestaña de Safari, `Notification` ni
 * siquiera está definida, por eso se comprueba así y no por navegador.
 */
export function notificationsSupported() {
  return typeof window !== 'undefined'
    && 'Notification' in window
    && 'serviceWorker' in navigator;
}

export function permissionState() {
  if (!notificationsSupported()) return 'unsupported';
  return Notification.permission; // 'default' | 'granted' | 'denied'
}

export const notificationsBlocked = () => permissionState() === 'denied';

/** Activadas = el usuario las pidió y el navegador las concedió. */
export function notificationsEnabled() {
  return getPref(ENABLED_KEY, false) === true && permissionState() === 'granted';
}

/**
 * Pide permiso. Debe llamarse desde un gesto del usuario (un botón), porque
 * los navegadores ignoran o penalizan las peticiones automáticas.
 * @returns {Promise<'granted'|'denied'|'unsupported'>}
 */
export async function enableNotifications() {
  if (!notificationsSupported()) return 'unsupported';

  let permission = Notification.permission;
  if (permission === 'default') {
    try {
      permission = await Notification.requestPermission();
    } catch (_) {
      return 'denied';
    }
  }

  if (permission !== 'granted') {
    setPref(ENABLED_KEY, false);
    return 'denied';
  }

  setPref(ENABLED_KEY, true);
  removePref(SENT_KEY); // empezar limpio: hoy sí puede avisar
  return 'granted';
}

export function disableNotifications() {
  setPref(ENABLED_KEY, false);
  removePref(SENT_KEY);
}

/* ---------- Qué avisar ---------- */

/**
 * Productos que hay en casa y están por vencer o ya vencieron.
 * El umbral es el del hogar (Ajustes → Avisos de vencimiento).
 */
export function productsToWarnAbout(days = warningDays()) {
  return state.products
    .filter((product) => product.inStock)
    .map((product) => ({ product, info: expiryInfo(product, days) }))
    .filter(({ info }) => info.state === EXPIRY.SOON
      || info.state === EXPIRY.TODAY
      || info.state === EXPIRY.EXPIRED)
    .sort((a, b) => (a.info.days ?? 0) - (b.info.days ?? 0));
}

/** Un aviso por producto y por día: nada de repetir en cada actualización. */
function alreadySentToday(productId) {
  const sent = getPref(SENT_KEY, {}) || {};
  return sent[productId] === todayKey();
}

function markSent(productIds) {
  const today = todayKey();
  const sent = getPref(SENT_KEY, {}) || {};
  // Se conserva solo lo de hoy para que el registro no crezca sin fin
  const fresh = {};
  for (const [id, day] of Object.entries(sent)) {
    if (day === today) fresh[id] = day;
  }
  productIds.forEach((id) => { fresh[id] = today; });
  setPref(SENT_KEY, fresh);
}

/* ---------- Mostrar ---------- */

async function show(title, options) {
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return false;
  await registration.showNotification(title, {
    icon: ICON,
    badge: BADGE,
    lang: 'es',
    ...options,
  });
  return true;
}

/**
 * Revisa el inventario y avisa de lo que está por vencer.
 * Silencioso y tolerante: si algo falla, no interrumpe a la app.
 * @returns {Promise<number>} cuántos productos se anunciaron
 */
export async function checkExpiringAndNotify({ force = false } = {}) {
  if (!notificationsEnabled()) return 0;
  if (!state.household) return 0;

  try {
    const pending = productsToWarnAbout()
      .filter(({ product }) => force || !alreadySentToday(product.id));
    if (!pending.length) return 0;

    const ids = pending.map(({ product }) => product.id);

    if (pending.length === 1) {
      const { product, info } = pending[0];
      await show(product.name, {
        body: info.state === EXPIRY.EXPIRED ? `${info.label}. Revísalo.` : `${info.label}.`,
        tag: `vence-${product.id}`,
        data: { url: `#/producto/${product.id}` },
      });
    } else {
      // Varios a la vez: un solo aviso resumen en lugar de una lluvia
      const names = pending.slice(0, 3).map(({ product }) => product.name).join(', ');
      const rest = pending.length - 3;
      await show(`${pending.length} productos por vencer`, {
        body: rest > 0 ? `${names} y ${rest} más.` : `${names}.`,
        tag: 'vence-resumen',
        data: { url: '#/' },
      });
    }

    markSent(ids);
    return pending.length;
  } catch (error) {
    console.warn('[avisos] no se pudo notificar', error);
    return 0;
  }
}

/* ---------- Enganche con el ciclo de vida de la app ---------- */

let unsubscribe = null;
let lastRun = 0;
const MIN_GAP_MS = 60000; // no revisar más de una vez por minuto

function throttledCheck() {
  const now = Date.now();
  if (now - lastRun < MIN_GAP_MS) return;
  lastRun = now;
  checkExpiringAndNotify();
}

/**
 * Empieza a vigilar. Revisa al arrancar, cada vez que llegan datos frescos y
 * al volver a la app. Nada de esto ocurre con la aplicación cerrada.
 */
export function startExpiryWatch(subscribe) {
  stopExpiryWatch();
  throttledCheck();
  unsubscribe = subscribe((_, reason) => {
    if (reason === 'loaded' || reason === 'products') throttledCheck();
  });
  document.addEventListener('visibilitychange', onVisible);
}

export function stopExpiryWatch() {
  unsubscribe?.();
  unsubscribe = null;
  document.removeEventListener('visibilitychange', onVisible);
}

function onVisible() {
  if (document.visibilityState === 'visible') throttledCheck();
}

/*
 * ¿Y con la app cerrada?
 * -----------------------------------------------------------------------
 * Haría falta Web Push «de verdad», que son tres piezas más:
 *   1. Un par de claves VAPID y una tabla push_subscriptions en Supabase.
 *   2. Que el service worker escuche el evento 'push'.
 *   3. Una Edge Function disparada por pg_cron una vez al día que busque lo
 *      que está por vencer y empuje el aviso a cada suscripción.
 * Funciona en Android y escritorio; en iPhone solo si la app está instalada
 * en la pantalla de inicio (iOS 16.4+).
 */
