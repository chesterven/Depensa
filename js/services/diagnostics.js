/**
 * Comprobaciones de la conexión con la base de datos.
 * Sirven para que, si algo falta, el mensaje diga exactamente qué hacer.
 *
 * Nota: estas pruebas corren antes de iniciar sesión, así que una tabla que
 * responde «permiso denegado» es una buena señal: existe y está protegida.
 */
import { getClient, describeError } from '../api/client.js';
import { BUCKET } from '../api/photos.js';

const TABLES = ['households', 'categories', 'stores', 'products'];

async function probeTable(client, table) {
  const { error } = await client.from(table).select('id').limit(1);
  if (!error) return { exists: true };

  const code = error.code || '';
  const message = error.message || '';

  if (code === '42P01' || /does not exist|could not find the table/i.test(message)) return { exists: false, missing: true };
  if (/api key|apikey/i.test(message)) return { exists: false, badKey: true };
  if (/failed to fetch|networkerror|load failed/i.test(message)) return { exists: false, network: true };
  // Protegida por RLS o sin sesión: la tabla está ahí
  if (code === '42501' || /permission denied|row-level security|invalid authentication|jwt/i.test(message)) {
    return { exists: true, protectedByRls: true };
  }
  return { exists: false, other: describeError(error) };
}

export async function runDiagnostics() {
  const steps = [];
  let client;

  try {
    client = getClient();
    steps.push({ key: 'config', label: 'Datos de conexión', ok: true, detail: 'URL y clave con formato válido' });
  } catch (error) {
    steps.push({ key: 'config', label: 'Datos de conexión', ok: false, detail: describeError(error) });
    return { ok: false, steps };
  }

  const probes = [];
  for (const table of TABLES) probes.push({ table, result: await probeTable(client, table) });

  const network = probes.find((probe) => probe.result.network);
  if (network) {
    steps.push({ key: 'reachable', label: 'Proyecto accesible', ok: false, detail: 'No se pudo contactar el proyecto. Revisa la URL y tu conexión.' });
    return { ok: false, steps };
  }

  const badKey = probes.find((probe) => probe.result.badKey);
  if (badKey) {
    steps.push({ key: 'reachable', label: 'Proyecto accesible', ok: true, detail: 'El proyecto respondió' });
    steps.push({ key: 'key', label: 'Clave del proyecto', ok: false, detail: 'La clave anon no es válida para este proyecto.' });
    return { ok: false, steps };
  }

  steps.push({ key: 'reachable', label: 'Proyecto accesible', ok: true, detail: 'El proyecto respondió correctamente' });
  steps.push({ key: 'key', label: 'Clave del proyecto', ok: true, detail: 'Clave aceptada' });

  const missing = probes.filter((probe) => probe.result.missing).map((probe) => probe.table);
  const other = probes.find((probe) => probe.result.other);
  steps.push({
    key: 'tables',
    label: 'Tablas de la despensa',
    ok: missing.length === 0 && !other,
    detail: missing.length
      ? `Faltan: ${missing.join(', ')}. Ejecuta supabase/schema.sql en el SQL Editor de Supabase.`
      : (other ? other.result.other : `${TABLES.length} tablas encontradas y protegidas`),
  });

  try {
    const { error } = await client.storage.from(BUCKET).list('', { limit: 1 });
    const blocked = error && /not authorized|permission|jwt/i.test(error.message || '');
    steps.push({
      key: 'storage',
      label: 'Almacenamiento de fotos',
      ok: !error || blocked,
      detail: !error || blocked ? 'Espacio «product-photos» listo' : describeError(error),
    });
  } catch (error) {
    steps.push({ key: 'storage', label: 'Almacenamiento de fotos', ok: false, detail: describeError(error) });
  }

  return { ok: steps.every((step) => step.ok), steps };
}
