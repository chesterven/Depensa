/** Diálogo de confirmación antes de acciones destructivas. */
import { h } from '../../utils/dom.js';
import { icon } from '../../utils/icons.js';
import { openSheet } from './sheet.js';

/**
 * @returns {Promise<boolean>} true si el usuario confirma
 */
export function confirmDialog({
  title = '¿Confirmar?',
  message = '',
  confirmText = 'Eliminar',
  cancelText = 'Cancelar',
  danger = true,
  detail = null,
} = {}) {
  return new Promise((resolve) => {
    let decided = false;
    openSheet({
      title,
      dialog: true,
      content: h('div',
        h('div.row', { style: { alignItems: 'flex-start', gap: '12px' } },
          h('div', {
            class: 'empty__icon',
            style: { width: '46px', height: '46px', margin: '0', borderRadius: '15px', color: danger ? 'var(--danger)' : 'var(--pine)' },
            html: icon(danger ? 'alert' : 'info', { size: 22 }),
          }),
          h('div.grow', h('p', { style: { margin: 0 } }, message)),
        ),
        detail ? h('div.notice.mt-2', { html: `${icon('info', { size: 18 })}<span>${detail}</span>` }) : null,
      ),
      actions: [
        { label: cancelText, variant: 'btn-soft', onClick: () => { decided = true; resolve(false); } },
        { label: confirmText, variant: danger ? 'btn-danger' : 'btn-primary', onClick: () => { decided = true; resolve(true); } },
      ],
      onClose: () => { if (!decided) resolve(false); },
    });
  });
}
