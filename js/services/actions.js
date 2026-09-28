/**
 * Acciones compartidas entre pantallas.
 * Actualizan la pantalla al instante y confirman contra la base de datos;
 * si algo falla, se revierte y se avisa.
 */
import { state, upsertProductLocal, removeProductLocal, refreshDurations } from '../state.js';
import { setStock, updateProduct, deleteProduct } from '../api/products.js';
import { removePhoto } from '../api/photos.js';
import { deleteRecentCycle } from '../api/cycles.js';
import { toast, toastOk, toastError } from '../components/ui/toast.js';
import { askExpiryDate } from '../components/product-form.js';
import { haptic } from '../utils/dom.js';

/**
 * Cambia «hay / no hay».
 * Al reponer algo que vence, ofrece anotar la nueva fecha.
 */
export async function toggleStock(product, { askExpiry = true } = {}) {
  const next = !product.inStock;
  haptic();

  let expiresOn;
  if (next && product.tracksExpiry && askExpiry) {
    const chosen = await askExpiryDate(product);
    expiresOn = chosen || null;
  }

  const previous = { ...product };
  const optimistic = { ...product, inStock: next };
  if (expiresOn !== undefined) optimistic.expiresOn = expiresOn;
  upsertProductLocal(optimistic);

  try {
    const patch = expiresOn !== undefined ? { expiresOn } : {};
    const saved = await setStock(product.id, next, patch);
    upsertProductLocal(saved);
    // Al acabarse algo, la base de datos cierra un ciclo: hay promedio nuevo.
    if (!next) refreshDurations();
    toast(next ? `«${product.name}» otra vez en casa` : `«${product.name}» pasó a la lista`, {
      type: next ? 'ok' : 'warn',
      action: { label: 'Deshacer', onClick: () => revert(previous) },
    });
    return saved;
  } catch (error) {
    upsertProductLocal(previous);
    toastError(error, 'No se pudo guardar el cambio.');
    return null;
  }
}

async function revert(previous) {
  upsertProductLocal(previous);
  try {
    // Al volver a «hay» se manda la fecha de compra original a propósito: el
    // disparador solo la genera cuando llega vacía, así que así se conserva.
    const saved = await updateProduct(previous.id, {
      inStock: previous.inStock,
      expiresOn: previous.expiresOn,
      purchasedOn: previous.purchasedOn ?? null,
    });
    upsertProductLocal(saved);
    // Y se retira el ciclo que había cerrado el toque que se está deshaciendo
    if (previous.inStock) {
      await deleteRecentCycle(previous.id);
      refreshDurations();
    }
  } catch (error) {
    toastError(error, 'No se pudo deshacer.');
  }
}

/** Cambia solo la fecha de vencimiento. */
export async function setExpiry(product, expiresOn) {
  const previous = { ...product };
  upsertProductLocal({ ...product, expiresOn, tracksExpiry: true });
  try {
    const saved = await updateProduct(product.id, { expiresOn, tracksExpiry: true });
    upsertProductLocal(saved);
    toastOk(expiresOn ? 'Fecha actualizada' : 'Fecha eliminada');
    return saved;
  } catch (error) {
    upsertProductLocal(previous);
    toastError(error);
    return null;
  }
}

export async function removeProduct(product) {
  try {
    await deleteProduct(product.id);
    if (product.photoPath) removePhoto(product.photoPath);
    removeProductLocal(product.id);
    toastOk('Producto eliminado');
    return true;
  } catch (error) {
    toastError(error, 'No se pudo eliminar el producto.');
    return false;
  }
}

/** Texto de la lista de compras para compartir por mensaje. */
export function shoppingListText(products) {
  const lines = [`🛒 Falta en casa (${products.length})`, ''];
  const groups = new Map();
  for (const product of products) {
    const key = state.storesById.get(product.storeId)?.name || 'Sin comercio';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(product);
  }
  for (const [store, items] of groups) {
    lines.push(`— ${store}`);
    items.forEach((item) => lines.push(`• ${item.name}${item.unit ? ` (${item.unit})` : ''}`));
    lines.push('');
  }
  return lines.join('\n').trim();
}
