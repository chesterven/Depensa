/** Estadísticas de gasto por período, categoría, comercio y producto. */
import { h } from '../../utils/dom.js';
import { icon } from '../../utils/icons.js';
import { money, plural, percent } from '../../utils/format.js';
import { monthLabel } from '../../utils/date.js';
import { state } from '../../state.js';
import { getPref, setPref } from '../../database/settings.js';
import {
  expenseSummary, monthlySeries, monthComparison, byCategory, byStore, topProducts, inRange, total as sumTotal, presetRange,
} from '../../services/stats-service.js';
import { barChart, barList } from '../ui/chart.js';
import { emptyState } from '../ui/empty.js';
import { segmented } from '../ui/form.js';

export function render(ctx) {
  let preset = getPref('ui.statsRange', 'month');
  const range = presetRange(preset);
  const scoped = inRange(state.purchases, range.from, range.to);
  const summary = expenseSummary(state.purchases);
  const comparison = monthComparison();

  ctx.setHeader({ title: 'Gastos', subtitle: 'Estadísticas de tu hogar', back: true });
  ctx.onState(() => ctx.refresh());

  const root = h('div');

  if (!state.purchases.length) {
    root.appendChild(emptyState({
      iconName: 'chart',
      title: 'Todavía no hay datos',
      text: 'Registra algunas compras para ver en qué se va el presupuesto del hogar.',
      actionLabel: 'Ir a la lista de compras',
      onAction: () => ctx.go('/lista'),
    }));
    return root;
  }

  /* ---- Resumen por período ---- */
  root.appendChild(h('div.stat-grid',
    stat('Hoy', money(summary.today)),
    stat('Esta semana', money(summary.week)),
    stat('Este mes', money(summary.month), comparison.change != null
      ? `${percent(comparison.change)} vs. mes anterior` : null, 'stat--accent'),
    stat('Este año', money(summary.year)),
    stat('Promedio mensual', money(summary.monthlyAverage), plural(summary.monthsTracked, 'mes', 'meses') + ' con registros'),
    stat('Total histórico', money(summary.total), plural(summary.count, 'compra')),
  ));

  /* ---- Gasto mensual ---- */
  const series = monthlySeries(12).map((point) => ({ ...point, label: monthLabel(point.key).split(' ')[0] }));
  root.appendChild(h('div.section',
    h('div.section-title', h('span', { html: icon('chart', { size: 19 }) }), 'Gasto mensual'),
    h('div.card', barChart(series)),
  ));

  /* ---- Filtro de período ---- */
  root.appendChild(h('div.section',
    h('div.section-title', h('span', { html: icon('filter', { size: 18 }) }), 'Desglose'),
    segmented([
      { value: 'month', label: 'Mes' },
      { value: 'last30', label: '30 días' },
      { value: 'year', label: 'Año' },
      { value: 'all', label: 'Todo' },
    ], preset, (value) => { preset = value; setPref('ui.statsRange', value); ctx.refresh(); }),
    h('div.muted.small.mt-1', `${range.label}: ${money(sumTotal(scoped))} en ${plural(scoped.length, 'compra')}`),
  ));

  const categories = byCategory(scoped);
  const stores = byStore(scoped);
  const products = topProducts(scoped, 8);

  if (categories.length) {
    root.appendChild(h('div.card.mt-2',
      h('div.card-head', h('h3', 'Por categoría')),
      barList(categories.map((row) => ({ name: row.name, value: row.value, count: row.count, color: row.color }))),
    ));
  }
  if (stores.length) {
    root.appendChild(h('div.card',
      h('div.card-head', h('h3', 'Por comercio')),
      barList(stores.map((row) => ({ name: row.name, value: row.value, count: row.count, color: 'var(--sky)' }))),
    ));
  }
  if (products.length) {
    root.appendChild(h('div.card',
      h('div.card-head', h('h3', 'Productos con mayor gasto')),
      h('div.list', ...products.map((row) => h('button.tile', {
        type: 'button',
        style: { boxShadow: 'none', border: 0, padding: '9px 0' },
        onclick: () => row.id && ctx.go(`/producto/${row.id}`),
      },
      h('div.tile__body',
        h('div.tile__title', row.name),
        h('div.tile__meta', plural(row.count, 'compra')),
      ),
      h('div.tile__right', h('div.tile__price', money(row.value)))))),
    ));
  }

  return root;

  function stat(label, value, hint = null, variant = '') {
    return h('div', { class: `stat ${variant}` },
      h('div.stat__label', label),
      h('div.stat__value', { style: { fontSize: '1.42rem' } }, value),
      hint ? h('div.stat__hint', hint) : null);
  }
}
