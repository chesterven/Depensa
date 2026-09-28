/** Ajustes del hogar (compartidos entre todos los dispositivos). */
import { h } from '../../utils/dom.js';
import { icon } from '../../utils/icons.js';
import { state, setHouseholdLocal } from '../../state.js';
import { updateHousehold } from '../../api/household.js';
import { field, input, segmented, select, switchRow } from '../ui/form.js';
import { toastOk, toastError, toast } from '../ui/toast.js';
import {
  notificationsSupported, notificationsEnabled, permissionState,
  enableNotifications, disableNotifications, checkExpiringAndNotify,
  productsToWarnAbout,
} from '../../services/notifications.js';

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
      [{ value: '3', label: '3 días' }, { value: '5', label: '5 días' }, { value: '7', label: '7 días' },
        { value: '15', label: '15 días' }, { value: '30', label: '30 días' }],
      String(household.expiryWarningDays),
      (value) => save({ expiryWarningDays: Number(value) }),
    ),
  ));

  root.appendChild(notificationsCard());

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

  /**
   * Avisos del teléfono. Se es explícito con el alcance: solo llegan con la
   * aplicación abierta, y conviene que el usuario lo sepa de antemano.
   */
  function notificationsCard() {
    const card = h('div.card.mt-2', h('div.card-head', h('h3', 'Avisos en el teléfono')));

    if (!notificationsSupported()) {
      card.appendChild(h('p.muted.small',
        'Este navegador no puede mostrar avisos del sistema.'));
      card.appendChild(h('div.notice.notice--info',
        h('span', { html: icon('info', { size: 18 }) }),
        h('span.grow', 'En iPhone y iPad hay que instalar Despensa en la pantalla de inicio (Compartir → Añadir a inicio) y abrirla desde ahí.')));
      return card;
    }

    if (permissionState() === 'denied') {
      card.appendChild(h('div.notice',
        h('span', { html: icon('alert', { size: 18 }) }),
        h('span.grow', 'Bloqueaste los avisos para este sitio. Actívalos desde el candado de la barra de direcciones y vuelve aquí.')));
      return card;
    }

    card.appendChild(switchRow({
      title: 'Avisarme de lo que está por vencer',
      hint: `Un aviso al día por producto, con ${household.expiryWarningDays} días de anticipación.`,
      checked: notificationsEnabled(),
      onChange: async (checked) => {
        if (!checked) {
          disableNotifications();
          toastOk('Avisos desactivados');
          ctx.refresh();
          return;
        }
        const result = await enableNotifications();
        if (result === 'granted') {
          toastOk('Avisos activados');
          await checkExpiringAndNotify();
        } else {
          toast('No se concedió el permiso para avisar.', { type: 'warn' });
        }
        ctx.refresh();
      },
    }));

    card.appendChild(h('div.notice.notice--info.mt-1',
      h('span', { html: icon('info', { size: 18 }) }),
      h('span.grow', 'Los avisos se revisan mientras Despensa está abierta (aunque sea en segundo plano). Con la aplicación cerrada del todo, el teléfono no recibe nada.')));

    if (notificationsEnabled()) {
      const pending = productsToWarnAbout().length;
      card.appendChild(h('button.btn.btn-soft.btn-sm.btn-block.mt-2', {
        type: 'button',
        onclick: async () => {
          const sent = await checkExpiringAndNotify({ force: true });
          if (!sent) toastOk('Nada por vencer ahora mismo');
        },
      },
      h('span', { html: icon('bell', { size: 16 }) }),
      pending ? `Probar ahora (${pending} por vencer)` : 'Probar ahora'));
    }

    return card;
  }

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
