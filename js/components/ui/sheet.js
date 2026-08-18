/**
 * Bottom sheets / modales accesibles.
 * Bloquea el desplazamiento del fondo, atrapa el foco y se cierra con Esc,
 * con el botón de cerrar o tocando fuera.
 */
import { h, $$ } from '../../utils/dom.js';
import { icon } from '../../utils/icons.js';

const FOCUSABLE = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';
let openCount = 0;

/**
 * @param {object} options
 * @param {string} options.title
 * @param {Node|Function} options.content  contenido o función que recibe la API del sheet
 * @param {Array} [options.actions] botones inferiores: {label, variant, onClick, keepOpen}
 * @returns {{close:Function, el:HTMLElement, body:HTMLElement, setBusy:Function}}
 */
export function openSheet({ title = '', subtitle = '', content = null, actions = [], dialog = false, onClose = null, dismissible = true } = {}) {
  const previouslyFocused = document.activeElement;
  const body = h('div.sheet__body');
  const titleId = `sheet-title-${Math.random().toString(36).slice(2, 8)}`;

  const sheet = h('div', {
    class: `sheet${dialog ? ' sheet--dialog' : ''}`,
    role: 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': titleId,
  });

  const backdrop = h('div.sheet-backdrop', sheet);

  const api = {
    el: backdrop,
    body,
    close,
    setBusy(busy) {
      $$('button', sheet).forEach((button) => { button.disabled = !!busy; });
    },
  };

  if (!dialog) sheet.appendChild(h('div.sheet__handle', { 'aria-hidden': 'true' }));

  const head = h('div.sheet__head',
    h('div.grow',
      h('h2.sheet__title', { id: titleId }, title),
      subtitle ? h('div.muted.small', subtitle) : null,
    ),
    dismissible ? h('button.btn-icon.btn-ghost', {
      type: 'button',
      'aria-label': 'Cerrar',
      onclick: () => close(),
      html: icon('close', { size: 22 }),
    }) : null,
  );
  sheet.appendChild(head);

  const node = typeof content === 'function' ? content(api) : content;
  if (node) body.appendChild(node);
  sheet.appendChild(body);

  if (actions.length) {
    const bar = h('div.sheet__actions');
    actions.forEach((action) => {
      bar.appendChild(h('button', {
        type: 'button',
        class: `btn ${action.variant || 'btn-soft'}`,
        onclick: async (event) => {
          const result = await action.onClick?.(api, event);
          if (!action.keepOpen && result !== false) close();
        },
      }, action.label));
    });
    sheet.appendChild(bar);
  }

  function onKeyDown(event) {
    if (event.key === 'Escape' && dismissible) {
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = $$(FOCUSABLE, sheet).filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  }

  backdrop.addEventListener('mousedown', (event) => {
    if (event.target === backdrop && dismissible) close();
  });
  backdrop.addEventListener('keydown', onKeyDown);

  document.body.appendChild(backdrop);
  openCount += 1;
  document.documentElement.style.overflow = 'hidden';
  requestAnimationFrame(() => {
    backdrop.classList.add('is-open');
    const target = sheet.querySelector('[data-autofocus]')
      || sheet.querySelector('input:not([type=hidden]), textarea, select')
      || sheet.querySelector(FOCUSABLE);
    // En móviles no se enfoca automáticamente el primer campo para no abrir el teclado de golpe
    const coarse = window.matchMedia?.('(pointer: coarse)').matches;
    if (target && (!coarse || target.hasAttribute('data-autofocus'))) target.focus({ preventScroll: true });
    else sheet.focus?.();
  });

  let closed = false;
  function close(result) {
    if (closed) return;
    closed = true;
    backdrop.classList.remove('is-open');
    openCount = Math.max(0, openCount - 1);
    if (!openCount) document.documentElement.style.overflow = '';
    setTimeout(() => {
      backdrop.remove();
      try { previouslyFocused?.focus?.({ preventScroll: true }); } catch (_) { /* ignorado */ }
      onClose?.(result);
    }, 240);
  }

  return api;
}

/** Cierra todos los sheets abiertos (por ejemplo al navegar). */
export function closeAllSheets() {
  $$('.sheet-backdrop').forEach((el) => el.remove());
  openCount = 0;
  document.documentElement.style.overflow = '';
}
