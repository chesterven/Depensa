/** Ayudantes de formulario: campos etiquetados, selects, interruptores y lectura de valores. */
import { h } from '../../utils/dom.js';
import { icon } from '../../utils/icons.js';

let seq = 0;
const nextId = (prefix = 'f') => `${prefix}-${(seq += 1)}`;

/** Envuelve un control con su etiqueta, pista y espacio para errores. */
export function field(label, control, { hint = '', id = null, required = false } = {}) {
  // El control puede venir envuelto (por ejemplo el campo de dinero): se busca
  // el input real para que la etiqueta quede asociada de verdad.
  const target = control.matches?.('input, select, textarea')
    ? control
    : (control.querySelector?.('input, select, textarea') || control);
  const controlId = id || target.id || nextId('field');
  target.id = controlId;
  if (required) target.required = true;
  return h('div.field',
    h('label.field__label', { for: controlId }, label, required ? h('span', { 'aria-hidden': 'true', style: { color: 'var(--danger)' } }, ' *') : null),
    control,
    hint ? h('div.field__hint', hint) : null,
  );
}

export function input(attrs = {}) {
  return h('input.input', { type: 'text', ...attrs });
}

export function numberInput(attrs = {}) {
  return h('input.input', {
    type: 'number',
    inputmode: 'decimal',
    step: 'any',
    min: '0',
    ...attrs,
  });
}

/** Campo de dinero con el símbolo a la izquierda. */
export function moneyInput(symbol, attrs = {}) {
  return h('div.input-affix',
    h('span.affix', symbol),
    h('input.input', { type: 'number', inputmode: 'decimal', step: '0.01', min: '0', ...attrs }),
  );
}

export function textarea(attrs = {}) {
  return h('textarea.textarea', { rows: 3, ...attrs });
}

/** @param {Array<{value:string,label:string}>} options */
export function select(options, value, attrs = {}) {
  const el = h('select.select', attrs);
  options.forEach((option) => {
    el.appendChild(h('option', {
      value: option.value,
      selected: String(option.value) === String(value ?? ''),
      disabled: option.disabled,
    }, option.label));
  });
  el.value = value ?? '';
  return el;
}

export function switchRow({ title, hint = '', checked = false, onChange = null, name = null }) {
  const button = h('button.switch', {
    type: 'button',
    role: 'switch',
    name,
    'aria-checked': checked ? 'true' : 'false',
    'aria-label': title,
  });
  button.addEventListener('click', () => {
    const next = button.getAttribute('aria-checked') !== 'true';
    button.setAttribute('aria-checked', next ? 'true' : 'false');
    onChange?.(next);
  });
  return h('div.switch-row',
    h('div.switch-row__body',
      h('div.switch-row__title', title),
      hint ? h('div.switch-row__hint', hint) : null,
    ),
    button,
  );
}

/** Grupo de opciones tipo segmento. */
export function segmented(options, value, onChange) {
  const wrap = h('div.segmented', { role: 'tablist' });
  options.forEach((option) => {
    const button = h('button', {
      type: 'button',
      role: 'tab',
      class: String(option.value) === String(value) ? 'is-active' : '',
      'aria-selected': String(option.value) === String(value) ? 'true' : 'false',
      onclick: () => {
        wrap.querySelectorAll('button').forEach((b) => {
          b.classList.remove('is-active');
          b.setAttribute('aria-selected', 'false');
        });
        button.classList.add('is-active');
        button.setAttribute('aria-selected', 'true');
        onChange(option.value);
      },
    }, option.label);
    wrap.appendChild(button);
  });
  return wrap;
}

/** Fila de chips de filtro. */
export function chipRow(options, value, onChange, { multiple = false } = {}) {
  const wrap = h('div.chip-row', { role: 'group' });
  options.forEach((option) => {
    const active = multiple ? (value || []).includes(option.value) : String(option.value) === String(value ?? '');
    wrap.appendChild(h('button', {
      type: 'button',
      class: `chip${active ? ' is-active' : ''}`,
      'aria-pressed': active ? 'true' : 'false',
      onclick: () => onChange(option.value),
    },
    option.icon ? h('span', { html: icon(option.icon, { size: 15 }) }) : null,
    option.label,
    option.count != null ? h('span.chip__count', String(option.count)) : null));
  });
  return wrap;
}

/** Lee todos los campos con atributo name de un formulario. */
export function readForm(form) {
  const data = {};
  form.querySelectorAll('[name]').forEach((el) => {
    if (el.type === 'checkbox') data[el.name] = el.checked;
    else if (el.getAttribute('role') === 'switch') data[el.name] = el.getAttribute('aria-checked') === 'true';
    else data[el.name] = el.value;
  });
  return data;
}

/** Muestra un mensaje de error debajo de un campo. */
export function setFieldError(control, message) {
  const wrapper = control.closest('.field') || control.parentElement;
  wrapper?.querySelector('.field__error')?.remove();
  if (!message) {
    control.removeAttribute('aria-invalid');
    return;
  }
  control.setAttribute('aria-invalid', 'true');
  wrapper?.appendChild(h('div.field__error', { html: `${icon('alert', { size: 14 })}<span>${message}</span>` }));
}
