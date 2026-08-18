/** Ajustes generales de la aplicación. */
import { h } from '../../utils/dom.js';
import { icon } from '../../utils/icons.js';
import { state, refresh } from '../../state.js';
import { saveAppSettings } from '../../database/settings.js';
import { rebuildFromInventory } from '../../services/shopping-service.js';
import { THEMES, getTheme, setTheme } from '../../theme.js';
import { field, input, select, switchRow } from '../ui/form.js';
import { toastOk, toastError } from '../ui/toast.js';
import { APP_VERSION } from '../../app-info.js';

const CURRENCIES = [
  { value: '$|USD', label: 'Dólar ($)' },
  { value: '€|EUR', label: 'Euro (€)' },
  { value: '₡|CRC', label: 'Colón (₡)' },
  { value: 'Q|GTQ', label: 'Quetzal (Q)' },
  { value: 'L|HNL', label: 'Lempira (L)' },
  { value: 'C$|NIO', label: 'Córdoba (C$)' },
  { value: 'MX$|MXN', label: 'Peso mexicano (MX$)' },
  { value: 'S/|PEN', label: 'Sol (S/)' },
  { value: 'COP$|COP', label: 'Peso colombiano (COP$)' },
  { value: 'Bs|VES', label: 'Bolívar (Bs)' },
];

export function render(ctx) {
  ctx.setHeader({ title: 'Ajustes', subtitle: 'Personaliza la aplicación', back: true });
  ctx.onState(() => ctx.refresh());

  const settings = state.settings || {};
  const root = h('div');

  const householdInput = input({
    value: settings.householdName || '',
    placeholder: 'Mi hogar',
    onchange: async (event) => {
      await save({ householdName: event.target.value.trim() || 'Mi hogar' });
    },
  });

  const currencyValue = `${settings.currency?.symbol || '$'}|${settings.currency?.code || 'USD'}`;
  const currencySelect = select(
    CURRENCIES.some((c) => c.value === currencyValue) ? CURRENCIES : [...CURRENCIES, { value: currencyValue, label: settings.currency?.symbol }],
    currencyValue,
    {
      onchange: async (event) => {
        const [symbol, code] = event.target.value.split('|');
        await save({ currency: { ...settings.currency, symbol, code } });
        ctx.refresh();
      },
    },
  );

  const decimalsSelect = select(
    [{ value: '0', label: 'Sin decimales (100)' }, { value: '2', label: 'Dos decimales (100.00)' }],
    String(settings.currency?.decimals ?? 2),
    {
      onchange: async (event) => {
        await save({ currency: { ...settings.currency, decimals: Number(event.target.value) } });
        ctx.refresh();
      },
    },
  );

  root.appendChild(h('div.card',
    h('div.card-head', h('h3', 'Hogar')),
    field('Nombre del hogar', householdInput, { hint: 'Aparece en la pantalla de inicio.' }),
  ));

  root.appendChild(h('div.card.mt-2',
    h('div.card-head', h('h3', 'Moneda')),
    field('Moneda', currencySelect),
    field('Formato', decimalsSelect),
  ));

  root.appendChild(h('div.card',
    h('div.card-head', h('h3', 'Comportamiento')),
    switchRow({
      title: 'Lista de compras automática',
      hint: 'Agrega a la lista los productos que marques como agotados',
      checked: settings.autoAddToList !== false,
      onChange: async (value) => {
        await save({ autoAddToList: value });
        if (value) await rebuildFromInventory();
      },
    }),
  ));

  const currentTheme = getTheme();
  root.appendChild(h('div.card',
    h('div.card-head', h('h3', 'Apariencia')),
    h('div.row', { style: { gap: '8px' } },
      ...THEMES.map((theme) => h('button', {
        type: 'button',
        class: `btn ${currentTheme === theme.value ? 'btn-primary' : 'btn-soft'} grow`,
        onclick: () => { setTheme(theme.value); ctx.refresh(); },
      }, h('span', { html: icon(theme.icon, { size: 18 }) }), theme.label)),
    ),
  ));

  root.appendChild(h('div.card',
    h('div.menu-list',
      h('button.menu-item', { type: 'button', onclick: () => ctx.go('/respaldo') },
        h('span.menu-item__icon', { html: icon('database', { size: 18 }) }),
        h('div.menu-item__body', h('div.menu-item__title', 'Copia de seguridad'), h('div.menu-item__hint', 'Exportar, compartir e importar')),
        h('span.chevron', { html: icon('chevronRight', { size: 18 }) })),
      h('button.menu-item', { type: 'button', onclick: () => ctx.go('/privacidad') },
        h('span.menu-item__icon', { html: icon('shield', { size: 18 }) }),
        h('div.menu-item__body', h('div.menu-item__title', 'Privacidad')),
        h('span.chevron', { html: icon('chevronRight', { size: 18 }) })),
    ),
  ));

  root.appendChild(h('div.text-center.muted.small', { style: { padding: '20px 0' } }, `Despensa ${APP_VERSION}`));

  return root;

  async function save(partial) {
    try {
      await saveAppSettings(partial);
      await refresh(['settings']);
      toastOk('Ajustes guardados');
    } catch (error) {
      toastError(error);
    }
  }
}
