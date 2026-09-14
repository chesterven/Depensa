/**
 * Cliente de Supabase.
 * La configuración puede venir de config.js (para toda la instalación) o
 * guardarse en este dispositivo desde la pantalla de configuración.
 */
import { createClient } from '../../vendor/supabase.mjs';

const STORAGE_KEY = 'despensa.connection';

let client = null;

/** Configuración efectiva: primero la del dispositivo, luego la del archivo. */
export function getConfig() {
  let stored = null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    stored = raw ? JSON.parse(raw) : null;
  } catch (_) { stored = null; }

  const file = window.DESPENSA_CONFIG || {};
  const url = (stored?.url || file.supabaseUrl || '').trim().replace(/\/+$/, '');
  const anonKey = (stored?.anonKey || file.supabaseAnonKey || '').trim();
  return { url, anonKey, fromDevice: !!stored?.url };
}

export function isConfigured() {
  const { url, anonKey } = getConfig();
  return !!url && !!anonKey;
}

/** Valida el formato antes de guardar, para dar errores claros. */
export function validateConfig({ url, anonKey }) {
  const errors = {};
  const cleanUrl = String(url || '').trim().replace(/\/+$/, '');
  const cleanKey = String(anonKey || '').trim();

  const isRemote = /^https:\/\/[^\s/]+\.[^\s/]+$/.test(cleanUrl);
  // Supabase en local (CLI) corre en http://127.0.0.1:54321
  const isLocal = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(cleanUrl);
  if (!cleanUrl) errors.url = 'Escribe la URL del proyecto.';
  else if (!isRemote && !isLocal) errors.url = 'Debe verse así: https://abcdefgh.supabase.co';

  if (!cleanKey) errors.anonKey = 'Pega la clave anon public.';
  else if (cleanKey.length < 20) errors.anonKey = 'Esa clave parece incompleta.';
  else if (/^ey/.test(cleanKey) && cleanKey.split('.').length !== 3) {
    errors.anonKey = 'La clave no tiene el formato esperado.';
  }

  return { valid: Object.keys(errors).length === 0, errors, url: cleanUrl, anonKey: cleanKey };
}

export function saveConfig({ url, anonKey }) {
  const checked = validateConfig({ url, anonKey });
  if (!checked.valid) throw new Error(Object.values(checked.errors)[0]);
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ url: checked.url, anonKey: checked.anonKey }));
  client = null;
  return checked;
}

export function clearConfig() {
  try { localStorage.removeItem(STORAGE_KEY); } catch (_) { /* modo privado */ }
  client = null;
}

/** Cliente único, creado la primera vez que se necesita. */
export function getClient() {
  if (client) return client;
  const { url, anonKey } = getConfig();
  if (!url || !anonKey) throw new Error('La aplicación todavía no está conectada a la base de datos.');
  client = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
      storageKey: 'despensa.session',
    },
    global: {
      headers: { 'x-application-name': 'despensa' },
    },
  });
  return client;
}

export function resetClient() {
  client = null;
}

/**
 * Traduce los errores de red y de Postgres a mensajes que el usuario entienda.
 */
export function describeError(error) {
  if (!error) return 'Ocurrió un error inesperado.';
  const message = String(error.message || error);

  if (!navigator.onLine || /failed to fetch|networkerror|load failed/i.test(message)) {
    return 'Sin conexión a Internet. Revisa tu señal e inténtalo de nuevo.';
  }
  if (/invalid login credentials/i.test(message)) return 'Correo o contraseña incorrectos.';
  if (/email not confirmed/i.test(message)) return 'Debes confirmar el correo antes de entrar. Revisa tu bandeja.';
  if (/user already registered/i.test(message)) return 'Ya existe una cuenta con ese correo. Inicia sesión.';
  if (/password should be at least/i.test(message)) return 'La contraseña debe tener al menos 6 caracteres.';
  if (/jwt|token/i.test(message) && /expired|invalid/i.test(message)) return 'La sesión expiró. Vuelve a iniciar sesión.';
  if (error.code === '23505' || /duplicate key/i.test(message)) return 'Ya existe un registro con ese nombre.';
  if (error.code === '42P01' || /relation .* does not exist/i.test(message)) {
    return 'Faltan las tablas en la base de datos. Ejecuta el archivo supabase/schema.sql en el SQL Editor.';
  }
  if (error.code === '42501' || /row-level security|permission denied/i.test(message)) {
    return 'La base de datos rechazó la operación por permisos. Revisa que el script SQL se haya ejecutado completo.';
  }
  if (/bucket not found/i.test(message)) {
    return 'Falta el espacio de fotos. Vuelve a ejecutar supabase/schema.sql.';
  }
  if (/api key|apikey/i.test(message)) return 'La clave del proyecto no es válida. Revisa la configuración.';
  return message;
}
