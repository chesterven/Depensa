/** Sección «Más»: catálogos, ajustes, apariencia e instalación. */
import { h } from '../../utils/dom.js';
import { icon } from '../../utils/icons.js';
import { plural } from '../../utils/format.js';
import { formatRelative } from '../../utils/date.js';
import { state } from '../../state.js';
import { THEMES, getTheme, setTheme } from '../../theme.js';
import { canInstall, promptInstall, isIOS, isStandalone, onInstallAvailability } from '../../install.js';
import { summary } from '../../services/inventory.js';
import { loadDemo } from '../../services/demo-data.js';
import { openSheet } from '../ui/sheet.js';
import { toastOk, toastError } from '../ui/toast.js';
import { APP_VERSION } from '../../app-info.js';

export function render(ctx) {
  ctx.setHeader({ title: 'Más', subtitle: 'Ajustes y herramientas' });
  ctx.onState(() => ctx.refresh());
  ctx.onCleanup(onInstallAvailability(() => ctx.refresh()));

  const stats = summary(state.products);
  const root = h('div');

  root.appendChild(h('div.card',
    h('div.row', { style: { gap: '13px' } },
      h('div.thumb.thumb--lg', { html: icon('jar', { size: 26 }) }),
      h('div.grow',
        h('h2', state.household?.name || 'Mi hogar'),
        h('div.muted.small', `${plural(stats.total, 'producto')} · ${stats.inStock} en existencia · faltan ${stats.out}`),
        h('div.muted.small', state.lastSyncAt ? `Actualizado ${formatRelative(state.lastSyncAt)}` : 'Sin actualizar'),
      ),
    ),
  ));

  root.appendChild(h('div.card.mt-2',
    h('div.menu-list',
      menu('tag', 'Categorías', plural(state.categories.length, 'categoría', 'categorías'), () => ctx.go('/categorias')),
      menu('store', 'Comercios', plural(state.stores.length, 'comercio'), () => ctx.go('/comercios')),
      menu('sliders', 'Ajustes del hogar', 'Nombre, avisos y moneda', () => ctx.go('/ajustes')),
      menu('shield', 'Datos y privacidad', 'Respaldo, cuenta y conexión', () => ctx.go('/privacidad')),
    ),
  ));

  const current = getTheme();
  root.appendChild(h('div.card',
    h('div.card-head', h('h3', 'Apariencia')),
    h('div.row', { style: { gap: '8px' } },
      ...THEMES.map((theme) => h('button', {
        type: 'button',
        class: `btn ${current === theme.value ? 'btn-primary' : 'btn-soft'} grow`,
        'aria-pressed': current === theme.value ? 'true' : 'false',
        onclick: () => { setTheme(theme.value); ctx.refresh(); },
      }, h('span', { html: icon(theme.icon, { size: 18 }) }), theme.label)),
    ),
  ));

  if (!isStandalone()) {
    root.appendChild(h('div.card.install-banner',
      h('div.card-head', h('h3', 'Instalar la aplicación')),
      h('p.muted.small', 'Agrégala a tu pantalla de inicio para abrirla como una app.'),
      canInstall()
        ? h('button.btn.btn-primary.btn-block', {
          type: 'button',
          onclick: async () => {
            const outcome = await promptInstall();
            if (outcome === 'accepted') toastOk('Aplicación instalada');
            ctx.refresh();
          },
        }, h('span', { html: icon('download', { size: 18 }) }), 'Instalar ahora')
        : h('button.btn.btn-soft.btn-block', { type: 'button', onclick: installHelp },
          h('span', { html: icon('info', { size: 18 }) }), 'Cómo instalarla'),
    ));
  }

  if (state.products.length < 3) {
    root.appendChild(h('div.card',
      h('div.card-head', h('h3', 'Datos de ejemplo')),
      h('p.muted.small', 'Agrega productos de muestra en varias categorías, con fechas de vencimiento, para probar la app.'),
      h('button.btn.btn-soft.btn-block', {
        type: 'button',
        onclick: async (event) => {
          const button = event.currentTarget;
          button.disabled = true;
          try {
            const result = await loadDemo();
            toastOk(`${result.products} productos de ejemplo agregados`);
          } catch (error) { toastError(error); } finally { button.disabled = false; }
        },
      }, h('span', { html: icon('sparkles', { size: 18 }) }), 'Cargar ejemplo'),
    ));
  }

  root.appendChild(h('div.text-center.muted.small', { style: { padding: '22px 0 6px' } },
    `Despensa ${APP_VERSION} · datos en tu base de datos`));

  return root;

  function menu(iconName, title, hint, onClick) {
    return h('button.menu-item', { type: 'button', onclick: onClick },
      h('span.menu-item__icon', { html: icon(iconName, { size: 19 }) }),
      h('div.menu-item__body', h('div.menu-item__title', title), hint ? h('div.menu-item__hint', hint) : null),
      h('span.chevron', { html: icon('chevronRight', { size: 18 }) }));
  }

  function installHelp() {
    openSheet({
      title: 'Instalar en tu teléfono',
      content: h('div',
        isIOS()
          ? h('ol', { style: { paddingLeft: '20px', lineHeight: '1.7' } },
            h('li', 'Abre esta página en Safari.'),
            h('li', 'Toca el botón Compartir.'),
            h('li', 'Elige «Agregar a inicio».'))
          : h('ol', { style: { paddingLeft: '20px', lineHeight: '1.7' } },
            h('li', 'Abre el menú del navegador (⋮).'),
            h('li', 'Elige «Instalar aplicación».')),
      ),
    });
  }
}
