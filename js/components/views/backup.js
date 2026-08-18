/** Copia de seguridad: exportar, compartir, importar y borrar datos. */
import { h, setChildren } from '../../utils/dom.js';
import { icon } from '../../utils/icons.js';
import { bytes, plural } from '../../utils/format.js';
import { formatRelative } from '../../utils/date.js';
import { state } from '../../state.js';
import { estimateStorage, requestPersistence } from '../../database/database.js';
import {
  downloadBackup, shareBackup, canShareFiles, readBackupFile, analyzeBackup, importBackup, wipeAllData, backupFilename,
} from '../../services/backup-service.js';
import { openSheet } from '../ui/sheet.js';
import { confirmDialog } from '../ui/confirm.js';
import { toastOk, toastError } from '../ui/toast.js';
import { switchRow } from '../ui/form.js';

export function render(ctx) {
  ctx.setHeader({ title: 'Copia de seguridad', subtitle: 'Exporta, comparte e importa tus datos', back: true });
  ctx.onState(() => ctx.refresh());

  let includePhotos = true;
  const root = h('div');
  const lastBackup = state.settings?.lastBackupAt;

  /* ---- Estado ---- */
  root.appendChild(h('div.card',
    h('div.row', { style: { gap: '13px' } },
      h('div.thumb.thumb--lg', { class: `thumb thumb--lg ${lastBackup ? 'thumb--ok' : 'thumb--low'}`, html: icon('database', { size: 24 }) }),
      h('div.grow',
        h('div.muted.small', 'Última copia de seguridad'),
        h('div', { style: { fontWeight: 650, fontSize: '1.05rem' } }, lastBackup ? formatRelative(lastBackup) : 'Nunca'),
        h('div.muted.small', `${plural(state.products.length, 'producto')} · ${plural(state.stores.length, 'comercio')}`),
      ),
    ),
    h('div.notice.mt-2',
      h('span', { html: icon('alert', { size: 18 }) }),
      h('span.grow', 'Si borras los datos del navegador o desinstalas la aplicación y no tienes un respaldo, podrías perder la información.')),
  ));

  /* ---- Exportar ---- */
  root.appendChild(h('div.card.mt-2',
    h('div.card-head', h('h3', 'Exportar respaldo')),
    h('p.muted.small', `Se genera un archivo JSON (${backupFilename()}) con productos, categorías, comercios, lista de compras y configuración.`),
    switchRow({
      title: 'Incluir fotografías',
      hint: 'Aumenta el tamaño del archivo',
      checked: includePhotos,
      onChange: (value) => { includePhotos = value; },
    }),
    h('div.row.mt-2', { style: { gap: '8px' } },
      h('button.btn.btn-primary.grow', {
        type: 'button',
        onclick: async (event) => {
          const button = event.currentTarget;
          button.disabled = true;
          try {
            const result = await downloadBackup({ includePhotos });
            toastOk(`Respaldo exportado (${bytes(result.size)})`);
          } catch (error) {
            toastError(error, 'No se pudo exportar el respaldo.');
          } finally {
            button.disabled = false;
            ctx.refresh();
          }
        },
      }, h('span', { html: icon('download', { size: 18 }) }), 'Exportar'),
      h('button.btn.btn-soft.grow', {
        type: 'button',
        onclick: async () => {
          try {
            const result = await shareBackup({ includePhotos });
            toastOk(result.shared ? 'Respaldo compartido' : 'Respaldo descargado');
          } catch (error) {
            if (error?.name === 'AbortError') return;
            toastError(error, 'No se pudo compartir el respaldo.');
          } finally {
            ctx.refresh();
          }
        },
      }, h('span', { html: icon('share', { size: 18 }) }), 'Compartir datos'),
    ),
    h('div.field__hint', canShareFiles()
      ? 'Puedes enviarlo por WhatsApp, Telegram, AirDrop, correo o guardarlo en Drive o Archivos.'
      : 'Este navegador descargará el archivo; después puedes compartirlo desde tu gestor de archivos.'),
  ));

  /* ---- Importar ---- */
  const fileInput = h('input', {
    type: 'file',
    accept: 'application/json,.json',
    class: 'sr-only',
    id: 'backup-file-input',
    onchange: async (event) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      try {
        const payload = await readBackupFile(file);
        const analysis = analyzeBackup(payload);
        if (!analysis.valid) {
          toastError(analysis.errors[0] || 'El archivo no es válido.');
          return;
        }
        openImportSheet(analysis);
      } catch (error) {
        toastError(error, 'No se pudo leer el archivo.');
      }
    },
  });

  root.appendChild(h('div.card',
    h('div.card-head', h('h3', 'Importar información')),
    h('p.muted.small', 'Selecciona un archivo JSON exportado desde esta aplicación (por ejemplo, el que te compartió otro miembro del hogar).'),
    h('label.btn.btn-soft.btn-block', { for: 'backup-file-input' },
      h('span', { html: icon('upload', { size: 18 }) }), 'Seleccionar archivo'),
    fileInput,
  ));

  /* ---- Almacenamiento ---- */
  const storageCard = h('div.card',
    h('div.card-head', h('h3', 'Almacenamiento del dispositivo')),
    h('div.muted.small', 'Calculando…'),
  );
  root.appendChild(storageCard);
  estimateStorage().then(({ usage, quota }) => {
    setChildren(storageCard,
      h('div.card-head', h('h3', 'Almacenamiento del dispositivo')),
      h('div.row.row--between',
        h('div.muted.small', 'Usado por la aplicación'),
        h('div', { style: { fontWeight: 650 } }, bytes(usage)),
      ),
      quota ? h('div.bar-track.mt-1', h('div.bar-fill', { style: { width: `${Math.min(100, Math.max(1, (usage / quota) * 100))}%` } })) : null,
      quota ? h('div.field__hint', `Disponible aproximadamente ${bytes(quota)}.`) : null,
      h('button.btn.btn-soft.btn-sm.mt-2', {
        type: 'button',
        onclick: async () => {
          const granted = await requestPersistence();
          toastOk(granted
            ? 'El navegador protegerá tus datos de la limpieza automática.'
            : 'El navegador no concedió almacenamiento persistente.');
        },
      }, h('span', { html: icon('shield', { size: 16 }) }), 'Proteger datos'),
    );
  }).catch(() => {});

  /* ---- Zona peligrosa ---- */
  root.appendChild(h('div.card',
    h('div.card-head', h('h3', { style: { color: 'var(--danger)' } }, 'Borrar todo')),
    h('p.muted.small', 'Elimina productos, comercios y listas de este dispositivo. Exporta un respaldo antes.'),
    h('button.btn.btn-danger-soft.btn-block', {
      type: 'button',
      onclick: async () => {
        const ok = await confirmDialog({
          title: '¿Borrar toda la información?',
          message: 'Se eliminarán todos los productos, comercios y listas guardados en este dispositivo.',
          detail: 'Esta acción no se puede deshacer. Si no tienes un respaldo, la información se perderá.',
          confirmText: 'Borrar todo',
        });
        if (!ok) return;
        try {
          await wipeAllData();
          toastOk('Toda la información fue eliminada');
          ctx.go('/');
        } catch (error) { toastError(error); }
      },
    }, h('span', { html: icon('trash', { size: 18 }) }), 'Borrar todos los datos'),
  ));

  return root;

  function openImportSheet(analysis) {
    const { summary, warnings } = analysis;
    let mode = 'merge';
    const modeButtons = h('div.stack');

    function optionButton(value, title, description) {
      const button = h('button', {
        type: 'button',
        class: `tile${mode === value ? '' : ''}`,
        style: mode === value ? { borderColor: 'var(--pine)', background: 'var(--pine-soft)' } : {},
        onclick: () => { mode = value; refreshOptions(); },
      },
      h('span', { html: icon(mode === value ? 'checkCircle' : 'box', { size: 20 }), style: { color: 'var(--pine)' } }),
      h('div.tile__body',
        h('div.tile__title', title),
        h('div.tile__meta', { style: { whiteSpace: 'normal' } }, description),
      ));
      return button;
    }

    function refreshOptions() {
      modeButtons.replaceChildren(
        optionButton('merge', 'Combinar con lo existente', 'Agrega lo nuevo, evita duplicados y conserva tu historial.'),
        optionButton('replace', 'Reemplazar información', 'Borra los datos actuales de este dispositivo y deja solo los del archivo.'),
      );
    }
    refreshOptions();

    openSheet({
      title: 'Importar información',
      subtitle: summary.exportedAt ? `Archivo del ${formatRelative(summary.exportedAt)}` : '',
      content: h('div',
        h('div.card', { style: { boxShadow: 'none' } },
          row('Productos encontrados', summary.products),
          row('Comercios encontrados', summary.stores),
          row('Categorías encontradas', summary.categories),
          row('Artículos en lista', summary.shoppingList),
          summary.photos ? row('Fotografías', summary.photos) : null,
        ),
        warnings.length ? h('div.notice.mt-2',
          h('span', { html: icon('alert', { size: 18 }) }),
          h('span.grow', warnings.join(' '))) : null,
        h('h3.mt-2', { style: { marginBottom: '8px' } }, '¿Qué deseas hacer?'),
        modeButtons,
      ),
      actions: [
        { label: 'Cancelar', variant: 'btn-soft', onClick: () => {} },
        {
          label: 'Importar',
          variant: 'btn-primary',
          keepOpen: true,
          onClick: async (api) => {
            if (mode === 'replace') {
              const ok = await confirmDialog({
                title: '¿Reemplazar toda la información?',
                message: 'Se borrarán los datos actuales de este dispositivo antes de importar.',
                confirmText: 'Reemplazar',
              });
              if (!ok) return false;
            }
            api.setBusy(true);
            try {
              const report = await importBackup(analysis.payload, mode);
              api.close();
              showReport(report);
            } catch (error) {
              toastError(error, 'No se pudo importar la información.');
              api.setBusy(false);
              return false;
            }
            return true;
          },
        },
      ],
    });

    function row(label, value) {
      return h('div.row.row--between', { style: { padding: '6px 0' } },
        h('span.muted.small', label),
        h('span', { style: { fontWeight: 650 } }, String(value)));
    }
  }

  function showReport(report) {
    openSheet({
      title: 'Importación completada',
      dialog: true,
      content: h('div',
        h('div.notice.notice--ok',
          h('span', { html: icon('checkCircle', { size: 18 }) }),
          h('span.grow', report.mode === 'replace'
            ? 'La información del archivo reemplazó los datos anteriores.'
            : 'La información se combinó con tus datos actuales.')),
        h('div.card.mt-2', { style: { boxShadow: 'none' } },
          line('Productos', `${report.products.added} nuevos · ${report.products.updated} actualizados · ${report.products.skipped} sin cambios`),
          line('Comercios', `${report.stores.added} nuevos`),
          line('Categorías', `${report.categories.added} nuevas`),
          line('Lista de compras', `${report.shoppingList.added} artículos`),
        ),
      ),
      actions: [{ label: 'Entendido', variant: 'btn-primary', onClick: () => ctx.refresh() }],
    });

    function line(label, value) {
      return h('div.row.row--between', { style: { padding: '6px 0' } },
        h('span.muted.small', label),
        h('span.small', { style: { fontWeight: 600 } }, value));
    }
  }
}
