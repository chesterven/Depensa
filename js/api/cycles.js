/**
 * Cuánto dura cada producto en casa.
 *
 * La base de datos cierra un «ciclo» sola cada vez que algo pasa de «hay» a
 * «no hay» (ver el disparador record_product_cycle en supabase/schema.sql).
 * Aquí solo se leen los promedios ya calculados por la vista.
 */
import { getClient, describeError } from './client.js';

function fromRow(row) {
  return {
    productId: row.product_id,
    cycles: row.cycles ?? 0,
    avgDays: row.avg_days == null ? null : Number(row.avg_days),
    minDays: row.min_days == null ? null : Number(row.min_days),
    maxDays: row.max_days == null ? null : Number(row.max_days),
    lastEndedOn: row.last_ended_on || null,
  };
}

/**
 * Promedios de todos los productos del hogar, listos para indexar por id.
 * Si la vista todavía no existe (esquema viejo), devuelve una lista vacía en
 * lugar de tumbar la carga: la app sigue funcionando sin la sección «cuánto dura».
 */
export async function listDurationStats(householdId) {
  const { data, error } = await getClient()
    .from('product_duration_stats')
    .select('*')
    .eq('household_id', householdId);

  if (error) {
    if (isMissingView(error)) {
      console.warn('[ciclos] la vista product_duration_stats no existe todavía; vuelve a ejecutar supabase/schema.sql');
      return [];
    }
    throw new Error(describeError(error));
  }
  return (data || []).map(fromRow);
}

/** Historial detallado de un producto (últimos ciclos, del más reciente al más viejo). */
export async function listProductCycles(productId, limit = 12) {
  const { data, error } = await getClient()
    .from('product_cycles')
    .select('*')
    .eq('product_id', productId)
    .order('ended_on', { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissingView(error)) return [];
    throw new Error(describeError(error));
  }
  return (data || []).map((row) => ({
    id: row.id,
    productId: row.product_id,
    startedOn: row.started_on,
    endedOn: row.ended_on,
    days: Number(row.days),
  }));
}

function isMissingView(error) {
  return error?.code === '42P01' || /does not exist|could not find the table/i.test(String(error?.message || ''));
}

/**
 * Borra el ciclo que acaba de cerrarse, al deshacer un «se acabó».
 * Sin esto, un toque por error dejaría un ciclo falso estropeando el promedio.
 * Se limita a los ciclos creados hace menos de `withinMinutes` para no tocar
 * historial legítimo si el usuario deshace mucho después.
 */
export async function deleteRecentCycle(productId, { withinMinutes = 15 } = {}) {
  const since = new Date(Date.now() - withinMinutes * 60000).toISOString();
  const client = getClient();

  const { data, error } = await client
    .from('product_cycles')
    .select('id')
    .eq('product_id', productId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error || !data?.length) return false;

  const { error: deleteError } = await client
    .from('product_cycles')
    .delete()
    .eq('id', data[0].id);

  if (deleteError) {
    console.warn('[ciclos] no se pudo deshacer el ciclo', describeError(deleteError));
    return false;
  }
  return true;
}
