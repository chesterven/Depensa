/** Datos, cuenta y conexión. */
import { h } from '../../utils/dom.js';
import { icon } from '../../utils/icons.js';
import { plural } from '../../utils/format.js';
import { todayKey, formatRelative } from '../../utils/date.js';
import { state, setSession, refreshProducts } from '../../state.js';
import { getConfig, clearConfig, resetClient } from '../../api/client.js';
import * as auth from '../../api/auth.js';
import { createProducts } from '../../api/products.js';
import { createStores, listStores, createCategories, listCategories } from '../../api/catalog.js';
import { setCatalogLocal } from '../../state.js';
import { normalize } from '../../utils/format.js';
import { openSheet } from '../ui/sheet.js';
import { confirmDialog } from '../ui/confirm.js';
import { field, input } from '../ui/form.js';
import { toastOk, toastError } from '../ui/toast.js';

export function render(ctx) {
  ctx.setHeader({ title: 'Datos y privacidad', subtitle: 'Cuenta, respaldo y conexión', back: true });
  ctx.onState(() => ctx.refresh());

  const root = h('div');
  const email = state.session?.user?.email || '—';
  let host = 'tu proyecto';
  try { host = new URL(getConfig().url).hostname; } catch (_) { /* sin configurar */ }

  root.appendChild(h('div.card',
    h('div.row', { style: { gap: '13px' } },
      h('div.thumb.thumb--lg.thumb--ok', { html: icon('database', { size: 24 }) }),
      h('div.grow',
        h('h2', { style: { fontSize: '1.1rem' } }, 'Tus datos viven en tu propia base de datos'),
        h('div.muted.small', `Proyecto: ${host}`),
      ),
    ),
    h('p.muted.small', { style: { marginTop: '10px', marginBottom: 0 } },
      'Solo quien tenga el correo y la contraseña del hogar puede verlos. La aplicación no envía información a ningún otro servicio.'),
  ));

  root.appendChild(h('div.card.mt-2',
    h('div.card-head', h('h3', 'Cuenta del hogar')),
    h('div.row.row--between', { style: { padding: '6px 0' } },
      h('span.muted.small', 'Correo'), h('span', { style: { fontWeight: 600 } }, email)),
    h('div.row.row--between', { style: { padding: '6px 0' } },
      h('span.muted.small', 'Última actualización'),
      h('span', { style: { fontWeight: 600 } }, state.lastSyncAt ? formatRelative(state.lastSyncAt) : '—')),
    h('div.menu-list.mt-1',
      h('button.menu-item', { type: 'button', onclick: changePassword },
        h('span.menu-item__icon', { html: icon('shield', { size: 18 }) }),
        h('div.menu-item__body', h('div.menu-item__title', 'Cambiar contraseña'))),
      h('button.menu-item', { type: 'button', onclick: signOut },
        h('span.menu-item__icon', { html: icon('arrowLeft', { size: 18 }) }),
        h('div.menu-item__body', h('div.menu-item__title', 'Cerrar sesión en este dispositivo'))),
    ),
  ));

  const fileInput = h('input', {
    type: 'file', accept: 'application/json,.json', class: 'sr-only', id: 'import-file',
    onchange: async (event) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (file) await importBackup(file);
    },
  });

  root.appendChild(h('div.card',
    h('div.card-head', h('h3', 'Respaldo de los datos')),
    h('p.muted.small', 'La base de datos ya guarda todo, pero puedes descargar una copia o traer los datos de la versión anterior de la app.'),
    h('div.row', { style: { gap: '8px' } },
      h('button.btn.btn-soft.grow', { type: 'button', onclick: exportData },
        h('span', { html: icon('download', { size: 18 }) }), 'Exportar'),
      h('label.btn.btn-soft.grow', { for: 'import-file' },
        h('span', { html: icon('upload', { size: 18 }) }), 'Importar'),
    ),
    fileInput,
  ));

  root.appendChild(h('div.card',
    h('div.card-head', h('h3', 'Conexión')),
    h('p.muted.small', `Esta aplicación está conectada a ${host}.`),
    h('button.btn.btn-soft.btn-block', { type: 'button', onclick: changeConnection },
      h('span', { html: icon('database', { size: 18 }) }), 'Cambiar de base de datos'),
  ));

  return root;

  async function changePassword() {
    const passwordInput = input({ type: 'password', autocomplete: 'new-password', placeholder: 'Nueva contraseña' });
    openSheet({
      title: 'Cambiar contraseña',
      subtitle: 'Todos los dispositivos seguirán conectados',
      content: h('div', field('Nueva contraseña', passwordInput, { hint: 'Mínimo 6 caracteres.' })),
      actions: [
        { label: 'Cancelar', variant: 'btn-soft', onClick: () => {} },
        {
          label: 'Guardar',
          variant: 'btn-primary',
          keepOpen: true,
          onClick: async (api) => {
            if (passwordInput.value.length < 6) { toastError('Usa al menos 6 caracteres.'); return false; }
            try {
              await auth.updatePassword(passwordInput.value);
              toastOk('Contraseña actualizada');
              api.close();
            } catch (error) { toastError(error); return false; }
            return true;
          },
        },
      ],
    });
  }

  async function signOut() {
    const ok = await confirmDialog({
      title: '¿Cerrar sesión?',
      message: 'Tendrás que escribir el correo y la contraseña del hogar para volver a entrar en este dispositivo.',
      confirmText: 'Cerrar sesión',
    });
    if (!ok) return;
    try {
      await auth.signOut();
      setSession(null);
    } catch (error) { toastError(error); }
  }

  async function changeConnection() {
    const ok = await confirmDialog({
      title: '¿Cambiar de base de datos?',
      message: 'Se cerrará la sesión y podrás conectar otro proyecto de Supabase.',
      confirmText: 'Cambiar',
      danger: false,
    });
    if (!ok) return;
    try { await auth.signOut(); } catch (_) { /* da igual */ }
    clearConfig();
    resetClient();
    window.location.reload();
  }

  function exportData() {
    const payload = {
      app: 'despensa-hogar',
      formatVersion: 3,
      exportedAt: new Date().toISOString(),
      data: {
        household: state.household,
        categories: state.categories,
        stores: state.stores,
        products: state.products,
      },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `despensa-${todayKey()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toastOk('Respaldo descargado');
  }

  async function importBackup(file) {
    let payload;
    try {
      payload = JSON.parse(await file.text());
    } catch (_) {
      toastError('El archivo no es un JSON válido.');
      return;
    }
    const data = payload?.data || {};
    const incoming = Array.isArray(data.products) ? data.products : [];
    if (!incoming.length) {
      toastError('El archivo no contiene productos.');
      return;
    }

    const ok = await confirmDialog({
      title: 'Importar datos',
      message: `Se agregarán ${plural(incoming.length, 'producto')} a tu base de datos. Los nombres repetidos se omiten.`,
      confirmText: 'Importar',
      danger: false,
    });
    if (!ok) return;

    try {
      const householdId = state.household.id;

      // Categorías y comercios del archivo que aún no existan
      const categoryNameById = new Map((data.categories || []).map((c) => [c.id, c.name]));
      const storeNameById = new Map((data.stores || []).map((s) => [s.id, s.name]));

      const existingCategories = new Map(state.categories.map((c) => [normalize(c.name), c]));
      const missingCategories = [...new Set([...categoryNameById.values()].filter((name) => name && !existingCategories.has(normalize(name))))];
      if (missingCategories.length) {
        await createCategories(householdId, missingCategories.map((name, index) => ({
          name, sortOrder: 50 + index, tracksExpiry: /aliment|bebida|medic|beb/i.test(name),
        })));
        const categories = await listCategories(householdId);
        setCatalogLocal({ categories });
        categories.forEach((c) => existingCategories.set(normalize(c.name), c));
      }

      const existingStores = new Map(state.stores.map((s) => [normalize(s.name), s]));
      const missingStores = [...new Set([...storeNameById.values()].filter((name) => name && !existingStores.has(normalize(name))))];
      if (missingStores.length) {
        await createStores(householdId, missingStores.map((name) => ({ name })));
        const stores = await listStores(householdId);
        setCatalogLocal({ stores });
        stores.forEach((s) => existingStores.set(normalize(s.name), s));
      }

      const taken = new Set(state.products.map((p) => normalize(p.name)));
      const rows = [];
      for (const item of incoming) {
        const name = String(item.name || '').trim();
        if (!name || taken.has(normalize(name))) continue;
        taken.add(normalize(name));

        const categoryName = categoryNameById.get(item.categoryId) || item.categoryName;
        const storeName = storeNameById.get(item.storeId) || item.storeName;
        const category = categoryName ? existingCategories.get(normalize(categoryName)) : null;
        const inStock = item.inStock !== undefined
          ? !!item.inStock
          : (item.status ? item.status !== 'out' : Number(item.currentQuantity) > 0);

        rows.push({
          name,
          categoryId: category?.id || null,
          storeId: storeName ? existingStores.get(normalize(storeName))?.id || null : null,
          unit: item.unit || '',
          inStock,
          tracksExpiry: item.tracksExpiry ?? !!category?.tracksExpiry,
          expiresOn: item.expiresOn || null,
          referencePrice: item.referencePrice ?? item.avgPrice ?? item.lastPrice ?? null,
          notes: item.notes || '',
        });
      }

      if (!rows.length) {
        toastOk('Todo lo del archivo ya estaba registrado');
        return;
      }
      await createProducts(householdId, rows);
      await refreshProducts();
      toastOk(`${rows.length} productos importados`);
    } catch (error) {
      toastError(error, 'No se pudo importar el archivo.');
    }
  }
}
