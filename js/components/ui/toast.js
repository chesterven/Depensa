/** Notificaciones breves (toasts) para confirmar acciones. */
import { h } from '../../utils/dom.js';
import { icon } from '../../utils/icons.js';

let host = null;

function getHost() {
  if (host && document.body.contains(host)) return host;
  host = h('div.toast-host', { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'false' });
  document.body.appendChild(host);
  return host;
}

const ICONS = { ok: 'checkCircle', error: 'alert', warn: 'alert', info: 'info' };

/**
 * @param {string} message
 * @param {object} [options] type: 'ok'|'error'|'warn'|'info', duration, action:{label,onClick}
 */
export function toast(message, { type = 'info', duration = 2800, action = null } = {}) {
  const node = h('div', { class: `toast toast--${type}` },
    h('span', { html: icon(ICONS[type] || 'info', { size: 19 }) }),
    h('span.grow', message),
    action ? h('button.toast__action', {
      type: 'button',
      onclick: () => { action.onClick?.(); dismiss(); },
    }, action.label) : null,
  );

  function dismiss() {
    if (!node.isConnected) return;
    node.classList.add('is-out');
    setTimeout(() => node.remove(), 220);
  }

  getHost().appendChild(node);
  const timer = setTimeout(dismiss, duration);
  node.addEventListener('click', (event) => {
    if (event.target.closest('.toast__action')) return;
    clearTimeout(timer);
    dismiss();
  });
  return dismiss;
}

export const toastOk = (message, options) => toast(message, { type: 'ok', ...options });
export const toastWarn = (message, options) => toast(message, { type: 'warn', ...options });

export function toastError(error, fallback = 'Ocurrió un error inesperado.') {
  const message = typeof error === 'string' ? error : (error?.message || fallback);
  console.error('[despensa]', error);
  return toast(message, { type: 'error', duration: 4200 });
}
