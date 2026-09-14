/**
 * Fotografías de los productos, guardadas en el almacenamiento de Supabase.
 * Se comprimen en el teléfono antes de subirlas para gastar menos datos.
 */
import { getClient, getConfig, describeError } from './client.js';

export const BUCKET = 'product-photos';

/** Redimensiona y comprime la imagen (máximo ~800 px, JPEG). */
export function compressImage(file, { maxSize = 800, quality = 0.75 } = {}) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type?.startsWith('image/')) {
      reject(new Error('El archivo seleccionado no es una imagen.'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('No se pudo procesar la imagen.'));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('No se pudo comprimir la imagen.'))),
          'image/jpeg',
          quality,
        );
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/** Sube la foto y devuelve la ruta guardada en el producto. */
export async function uploadPhoto(householdId, productId, blob) {
  const path = `${householdId}/${productId}-${Date.now()}.jpg`;
  const { error } = await getClient().storage.from(BUCKET).upload(path, blob, {
    contentType: 'image/jpeg',
    upsert: true,
    cacheControl: '3600',
  });
  if (error) throw new Error(describeError(error));
  return path;
}

export async function removePhoto(path) {
  if (!path) return false;
  const { error } = await getClient().storage.from(BUCKET).remove([path]);
  if (error) console.warn('[fotos] no se pudo borrar', describeError(error));
  return !error;
}

/** URL pública para mostrar la foto en una etiqueta <img>. */
export function photoUrl(path) {
  if (!path) return null;
  const { url } = getConfig();
  if (!url) return null;
  return `${url}/storage/v1/object/public/${BUCKET}/${encodeURI(path)}`;
}
