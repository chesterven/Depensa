/** Ajustes del hogar (compartidos entre todos los dispositivos). */
import { h } from '../../utils/dom.js';
import { icon } from '../../utils/icons.js';
import { state, setHouseholdLocal } from '../../state.js';
import { updateHousehold } from '../../api/household.js';
import { field, input, segmented, select } from '../ui/form.js';
import { toastOk, toastError } from '../ui/toast.js';

const CURRENCIES = ['$', '€', '₡', 'Q', 'L', 'C$', 'S/', 'MX$', 'Bs'];

export function render(ctx) {
  ctx.setHeader({ title: 'Ajustes del hogar', subtitle: 'Se aplican a todos los dispositivos', back: true });
  ctx.onState(() => ctx.refresh());

  const household = state.household;
  const root = h('div');
  if (!household) return root;

  const nameInput = input({
    value: household.name,
    placeholder: 'Mi hogar',
    onchange: (event) => save({ name: event.target.value.trim() || 'Mi hogar' }),
  });

  root.appendChild(h('div.card',
    h('div.card-head', h('h3', 'Nombre del hogar')),
    field('Cómo se llama tu casa', nameInput, { hint: 'Aparece en la pantalla de inicio.' }),
  ));

  root.appendChild(h('div.card.mt-2',
    h('div.card-head', h('h3', 'Avisos de vencimiento')),
    h('p.muted.small', 'Con cuántos días de anticipación quieres ver el aviso «por vencer».'),
    segmented(
      [{ value: '3', label: '3 días' }, { value: '7', label: '7 días' }, { value: '15', label: '15 días' }, { value: '30', label: '30 días' }],
      String(household.expiryWarningDays),
      (value) => save({ expiryWarningDays: Number(value) }),
    ),
  ));

  root.appendChild(h('div.card',
    h('div.card-head', h('h3', 'Moneda')),
    field('Símbolo para los precios de referencia',
      select(CURRENCIES.map((symbol) => ({ value: symbol, label: symbol })), household.currencySymbol,
        { onchange: (event) => save({ currencySymbol: event.target.value }) })),
  ));

  root.appendChild(h('div.notice.notice--info.mt-2',
    h('span', { html: icon('info', { size: 18 }) }),
    h('span.grow', 'Los cambios se guardan en la base de datos y los verán todos los miembros del hogar.')));

  return root;

  async function save(patch) {
    try {
      const updated = await updateHousehold(household.id, patch);
      setHouseholdLocal(updated);
      toastOk('Ajustes guardados');
    } catch (error) {
      toastError(error);
    }
  }
}
