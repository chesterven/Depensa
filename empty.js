/** Estados vacíos, esqueletos de carga y bloques informativos. */
import { h } from '../../utils/dom.js';
import { icon } from '../../utils/icons.js';

export function emptyState({ iconName = 'box', title = 'Sin información', text = '', actionLabel = null, onAction = null, secondaryLabel = null, onSecondary = null } = {}) {
  return h('div.empty',
    h('div.empty__icon', { html: icon(iconName, { size: 28 }), 'aria-hidden': 'true' }),
    h('div.empty__title', title),
    text ? h('div.empty__text', text) : null,
    actionLabel ? h('button.btn.btn-primary', { type: 'button', onclick: onAction }, actionLabel) : null,
    secondaryLabel ? h('div', { style: { marginTop: '10px' } },
      h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: onSecondary }, secondaryLabel)) : null,
  );
}

export function skeletonList(count = 4) {
  return h('div', ...Array.from({ length: count }, () => h('div.skeleton.skeleton--tile')));
}

export function skeletonStats(count = 4) {
  return h('div.stat-grid', ...Array.from({ length: count }, () => h('div.skeleton.skeleton--stat')));
}

export function loadingInline(text = 'Cargando…') {
  return h('div.row', { style: { justifyContent: 'center', padding: '24px', color: 'var(--muted)' } },
    h('span.loader'), h('span.small', text));
}

export function notice(text, { type = 'info', iconName = 'info' } = {}) {
  return h('div', { class: `notice notice--${type}` },
    h('span', { html: icon(iconName, { size: 18 }) }),
    h('span.grow', text));
}
