/** Sección «Más»: accesos, apariencia, instalación y datos de demostración. */
import { h } from '../../utils/dom.js';
import { icon } from '../../utils/icons.js';
import { plural } from '../../utils/format.js';
import { formatRelative } from '../../utils/date.js';
import { state } from '../../state.js';
import { THEMES, getTheme, setTheme } from '../../theme.js';
import { canInstall, promptInstall, isIOS, isStandalone, onInstallAvailability } from '../../install.js';
import { inventorySummary } from '../../services/inventory-service.js';
import { loadDemoData, removeDemoData } from '../../services/demo-data.js';
import { openSheet } from '../ui/sheet.js';
import { confirmDialog } from '../ui/confirm.js';
import { toastOk, toastError } from '../ui/toast.js';
import { APP_VERSION } from '../../app-info.js';

export function render(ctx) {
  ctx.setHeader({ title: 'Más', subtitle: 'Herramientas y ajustes' });
  ctx.onState(() => ctx.refresh());
  ctx.onCleanup(onInstallAvailability(() => ctx.refresh()));

  const root = h('div');
  const summary = inventorySummary(state.products);
  const demoLoaded = state.products.some((product) => product.demo);

  root.appendChild(h('div.card',
    h('div.row', { style: { gap: '13px' } },
      h('div.thumb.thumb--lg', { html: icon('jar', { size: 26 }) }),
      h('div.grow',
        h('h2', state.settings?.householdName || 'Mi hogar'),
        h('div.muted.small', `${plural(summary.total, 'producto')} · ${summary.available} con existencia · ${summary.out} agotados`),
      ),
    ),
  ));

  root.appendChild(h('div.card.mt-2',
    h('div.menu-list',
      menu('store', 'Comercios', plural(state.stores.length, 'comercio'), () => ctx.go('/comercios')),
      menu('tag', 'Categorías', plural(state.categories.length, 'categoría', 'categorías'), () => ctx.go('/categorias')),
    ),
  ));

  root.appendChild(h('div.card',
    h('div.menu-list',
      menu('database', 'Copia de seguridad', state.settings?.lastBackupAt
        ? `Última: ${formatRelative(state.settings.lastBackupAt)}`
        : 'Nunca has exportado tus datos', () => ctx.go('/respaldo')),
      menu('sliders', 'Ajustes', 'Moneda, hogar y comportamiento', () => ctx.go('/ajustes')),
      menu('shield', 'Privacidad', 'Tus datos viven en este dispositivo', () => ctx.go('/privacidad')),
    ),
  ));

  /* ---- Apariencia ---- */
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

  /* ---- Instalación ---- */
  if (!isStandalone()) {
    root.appendChild(h('div.card.install-banner',
      h('div.card-head', h('h3', 'Instalar la aplicación')),
      h('p.muted.small', 'Instálala en tu pantalla de inicio para abrirla como una app y usarla sin conexión.'),
      canInstall()
        ? h('button.btn.btn-primary.btn-block', {
          type: 'button',
          onclick: async () => {
            const outcome = await promptInstall();
            if (outcome === 'accepted') toastOk('Aplicación instalada');
            ctx.refresh();
          },
        }, h('span', { html: icon('download', { size: 18 }) }), 'Instalar ahora')
        : h('button.btn.btn-soft.btn-block', { type: 'button', onclick: () => openInstallHelp() },
          h('span', { html: icon('info', { size: 18 }) }), 'Cómo instalarla'),
    ));
  }

  /* ---- Datos de demostración ---- */
  root.appendChild(h('div.card',
    h('div.card-head', h('h3', 'Datos de demostración')),
    h('p.muted.small', demoLoaded
      ? 'Los datos de ejemplo están cargados. Puedes eliminarlos sin tocar tu información real.'
      : 'Carga productos, comercios e historial ficticio para probar todas las funciones.'),
    demoLoaded
      ? h('button.btn.btn-soft.btn-block', {
        type: 'button',
        onclick: async () => {
          const ok = await confirmDialog({
            title: '¿Eliminar los datos de demostración?',
            message: 'Se borrarán solo los productos, comercios y compras de ejemplo.',
            confirmText: 'Eliminar ejemplos',
          });
          if (!ok) return;
          try {
            const result = await removeDemoData();
            toastOk(`${result.products} productos de ejemplo eliminados`);
          } catch (error) { toastError(error); }
        },
      }, h('span', { html: icon('trash', { size: 18 }) }), 'Eliminar datos de ejemplo')
      : h('button.btn.btn-soft.btn-block', {
        type: 'button',
        onclick: async () => {
          try {
            const result = await loadDemoData();
            toastOk(`${result.products} productos de ejemplo cargados`);
          } catch (error) { toastError(error); }
        },
      }, h('span', { html: icon('sparkles', { size: 18 }) }), 'Cargar datos de ejemplo'),
  ));

  root.appendChild(h('div.text-center.muted.small', { style: { padding: '22px 0 6px' } },
    `Despensa ${APP_VERSION} · funciona sin conexión`));

  return root;

  function menu(iconName, title, hint, onClick) {
    return h('button.menu-item', { type: 'button', onclick: onClick },
      h('span.menu-item__icon', { html: icon(iconName, { size: 19 }) }),
      h('div.menu-item__body', h('div.menu-item__title', title), hint ? h('div.menu-item__hint', hint) : null),
      h('span.chevron', { html: icon('chevronRight', { size: 18 }) }));
  }

  function openInstallHelp() {
    openSheet({
      title: 'Instalar en tu teléfono',
      content: h('div',
        isIOS()
          ? h('ol', { style: { paddingLeft: '20px', lineHeight: '1.7' } },
            h('li', 'Abre esta página en Safari.'),
            h('li', 'Toca el botón Compartir (el cuadrado con la flecha).'),
            h('li', 'Elige «Agregar a inicio».'),
            h('li', 'Confirma con «Agregar».'))
          : h('ol', { style: { paddingLeft: '20px', lineHeight: '1.7' } },
            h('li', 'Abre el menú del navegador (⋮).'),
            h('li', 'Elige «Instalar aplicación» o «Agregar a pantalla principal».'),
            h('li', 'Confirma la instalación.')),
        h('div.notice.notice--info.mt-2',
          h('span', { html: icon('wifiOff', { size: 18 }) }),
          h('span.grow', 'Una vez instalada podrás usarla sin conexión a Internet.')),
      ),
    });
  }
}
