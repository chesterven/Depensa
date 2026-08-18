/**
 * Fotografías de productos.
 * Se guardan en su propia tabla (clave = id del producto) para que las listas
 * de inventario no carguen imágenes en memoria innecesariamente.
 */
import { STORE, getAll, get, put, remove, bulkPut } from './database.js';

export const getPhoto = (productId) => get(STORE.PHOTOS, productId);
export const listPhotos = () => getAll(STORE.PHOTOS);
export const deletePhoto = (productId) => remove(STORE.PHOTOS, productId);
export const bulkPutPhotos = (list) => bulkPut(STORE.PHOTOS, list);

export async function savePhoto(productId, dataUrl) {
  const record = { id: productId, dataUrl, updatedAt: new Date().toISOString() };
  await put(STORE.PHOTOS, record);
  return record;
}

/**
 * Redimensiona y comprime una imagen antes de guardarla.
 * Devuelve un data URL JPEG (~40-80 KB) para no llenar el almacenamiento del dispositivo.
 */
export function compressImage(file, { maxSize = 640, quality = 0.72 } = {}) {
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
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        try {
          resolve(canvas.toDataURL('image/jpeg', quality));
        } catch (error) {
          reject(error);
        }
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
