'use strict';

/* =====================================================================
   Datos
   Todo se guarda en un único JSON. Las cantidades van en céntimos (enteros)
   para que las sumas no arrastren errores de decimales.
   ===================================================================== */

// Sube SCHEMA y añade un paso en migrate() cada vez que cambie la forma de los datos.
const SCHEMA = 4;
const APP_VERSION = '1.3';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const MES_C = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// Paleta categórica (tema oscuro). Cada categoría tiene su color fijo, aunque se reordenen o añadan otras.
const PALETTE = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];
const GRAY = '#8a8984';
const CAT_COLORS = {
  super: '#3987e5', comida: '#d95926', alquiler: '#c98500', piso: '#86b6ef', transporte: '#199e70', coche: '#7fd3b0',
  seguro: '#f3a77f', ocio: '#d55181', ropa: '#008300', suscrip: '#9085e9', salud: '#e66767',
};
const C_IN = '#3987e5';   // serie "Ingresos" en el gráfico anual
const C_OUT = '#d95926';  // serie "Gastos" en el gráfico anual

const CAR_KINDS = {
  gasolina:   { name: 'Gasolina',   icon: '⛽', sign: -1, help: 'Lo que echas al coche. Se resta de la hucha y no cuenta como gasto del mes.' },
  blablacar:  { name: 'BlaBlaCar',  icon: '🚗', sign: 1,  help: 'Lo que te pagan los pasajeros. Se suma a la hucha y no cuenta como ingreso del mes.' },
  aportacion: { name: 'Aportación', icon: '💶', sign: 1,  help: 'Dinero tuyo que metes en la cuenta del coche. Se suma a la hucha y cuenta como gasto de Transporte del mes.' },
};

const SAV_KINDS = {
  deposito: { name: 'Meter', icon: '➕', sign: 1,  help: 'Dinero que pasas a la cuenta de ahorros. Se suma al saldo y no cuenta como gasto del mes.' },
  retirada: { name: 'Sacar', icon: '➖', sign: -1, help: 'Dinero que sacas de los ahorros, por ejemplo para comprar algo. Se resta del saldo y no cuenta en tus gastos del mes.' },
};
/** Las dos cuentas aparte (hucha del coche y ahorros) comparten formulario; esto dice cuál es cuál. */
const FUNDS = {
  car: { kinds: CAR_KINDS, store: () => S.car, title: 'Hucha del coche', placeholder: 'p. ej. Madrid – Valencia' },
  sav: { kinds: SAV_KINDS, store: () => S.savings, title: 'Ahorros', placeholder: 'p. ej. Portátil nuevo' },
};

function defaults() {
  return {
    version: SCHEMA,
    categories: {
      gasto: [
        { id: 'super', name: 'Supermercado' },
        { id: 'comida', name: 'Comidas fuera' },
        { id: 'alquiler', name: 'Alquiler' },
        { id: 'piso', name: 'Gastos del piso', subs: [
          { id: 'luz', name: 'Luz' }, { id: 'agua', name: 'Agua' }, { id: 'internet', name: 'Internet' },
          { id: 'gas', name: 'Gas' }, { id: 'comunidad', name: 'Comunidad' }, { id: 'otros', name: 'Otros' }] },
        { id: 'transporte', name: 'Transporte' },
        { id: 'coche', name: 'Coche', subs: [
          { id: 'cuota', name: 'Cuota' }, { id: 'taller', name: 'Taller' }, { id: 'itv', name: 'ITV e impuestos' },
          { id: 'parking', name: 'Parking' }, { id: 'otros', name: 'Otros' }] },
        { id: 'seguro', name: 'Seguros', subs: [
          { id: 'coche', name: 'Coche' }, { id: 'hogar', name: 'Hogar' }, { id: 'salud', name: 'Salud' },
          { id: 'vida', name: 'Vida' }, { id: 'otros', name: 'Otros' }] },
        { id: 'ocio', name: 'Ocio' },
        { id: 'ropa', name: 'Ropa' },
        { id: 'suscrip', name: 'Suscripciones' },
        { id: 'salud', name: 'Salud' },
        { id: 'otros', name: 'Otros' },
      ],
      ingreso: [
        { id: 'nomina', name: 'Nómina' },
        { id: 'extra', name: 'Extras' },
        { id: 'otros_i', name: 'Otros' },
      ],
    },
    movements: [],                                   // {id, type:'gasto'|'ingreso', amount, category, sub?, date:'YYYY-MM-DD', note, created}
    car: { start: null, startDate: null, movements: [] }, // movements: {id, kind, amount, date, note, created}
    savings: { start: null, startDate: null, movements: [] }, // igual que car, con kind 'deposito' | 'retirada'
    budgets: {},                                     // {categoryId: céntimos al mes}
    // monthMode: 'calendario' (del 1 al último día) o 'nomina' (cada mes empieza el día que cobras la nómina).
    // payCutoff: una nómina cobrada a partir de este día cuenta para el mes siguiente.
    settings: { monthMode: 'calendario', payCutoff: 20 },
    lastExport: null,
  };
}

/** Lleva datos de cualquier versión anterior a la actual sin perder nada. */
function migrate(d) {
  if (!d || typeof d !== 'object' || !Array.isArray(d.movements)) return defaults();
  const base = defaults();
  for (const k of Object.keys(base)) if (d[k] === undefined || d[k] === null && k !== 'lastExport') d[k] = base[k];
  d.car = Object.assign(base.car, d.car);
  d.savings = Object.assign(base.savings, d.savings); // v3: cuenta de ahorros (empieza vacía)
  d.settings = Object.assign(base.settings, d.settings);
  // v4: quien ya usaba la app pasa a meses según nómina (lo pidió así); una instalación nueva empieza en calendario.
  if (d.version && d.version < 4 && d.movements.length) d.settings.monthMode = 'nomina';
  if (!d.version || d.version < 2) {
    // v2: nuevas categorías (Gastos del piso, Coche, Seguros) con tipos. Se toma la lista nueva y se conserva
    // al final cualquier categoría que no esté en ella; los movimientos no cambian.
    const known = new Set(base.categories.gasto.map(c => c.id));
    d.categories.gasto = base.categories.gasto.concat(d.categories.gasto.filter(c => !known.has(c.id)));
  }
  d.version = SCHEMA;
  return d;
}

const store = {
  load() {
    try { return window.Android ? Android.load() : (localStorage.getItem('finanzas') || ''); } catch (e) { return ''; }
  },
  save(s) {
    try {
      if (window.Android) return Android.save(s);
      localStorage.setItem('finanzas', s);
      return true;
    } catch (e) { return false; }
  },
};

function parseJson(s) { try { return s ? JSON.parse(s) : null; } catch (e) { return null; } }

let S = migrate(parseJson(store.load()));

function persist() {
  periodCache = null;
  if (!store.save(JSON.stringify(S))) toast('No se pudo guardar. Inténtalo de nuevo.');
}

/* =====================================================================
   Utilidades
   ===================================================================== */

const $ = (s, r = document) => r.querySelector(s);
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => ymd(new Date());
/** Mes en curso: el periodo que contiene hoy (con meses según nómina, tras cobrar ya es el mes siguiente). */
const curMonth = () => periodOf(today());
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const EUR = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const eur = c => EUR.format(c / 100);
const eurSigned = c => (c > 0 ? '+' : c < 0 ? '−' : '') + EUR.format(Math.abs(c) / 100);
const sum = a => a.reduce((t, x) => t + x.amount, 0);
const pct = (v, t) => t ? Math.round(v / t * 100) + '%' : '';

function parseAmount(s) {
  s = String(s || '').trim().replace(/[\s€]/g, '');
  if (!s) return NaN;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const v = Number(s);
  return isFinite(v) ? Math.round(v * 100) : NaN;
}
const amountText = c => c ? (c / 100).toFixed(2).replace('.', ',') : '';

function monthLabel(mk) { const [y, m] = mk.split('-').map(Number); return MESES[m - 1] + ' ' + y; }
function shiftMonth(mk, d) {
  let [y, m] = mk.split('-').map(Number);
  m += d;
  while (m < 1) { m += 12; y--; }
  while (m > 12) { m -= 12; y++; }
  return y + '-' + pad(m);
}
function shortDate(s) { const [, m, d] = s.split('-').map(Number); return d + ' ' + MES_C[m - 1]; }
function axisEur(c) {
  const e = c / 100, a = Math.abs(e);
  if (a >= 1000) return (e / 1000).toFixed(a >= 10000 ? 0 : 1).replace('.', ',').replace(',0', '') + 'k';
  return String(Math.round(e));
}
const byDateDesc = (a, b) => b.date.localeCompare(a.date) || (b.created || 0) - (a.created || 0);

function catList(type) { return S.categories[type]; }
function catInfo(type, id) {
  const list = catList(type), i = list.findIndex(c => c.id === id);
  const name = i >= 0 ? list[i].name : 'Sin categoría';
  if (type !== 'gasto') return { name, color: 'var(--pos)' };
  return { name, color: CAT_COLORS[id] || GRAY };
}
/** Tipos dentro de una categoría (p. ej. Luz, Agua… en Gastos del piso); [] si no tiene. */
function subList(type, catId) {
  const c = catList(type).find(x => x.id === catId);
  return (c && c.subs) || [];
}
function subName(type, catId, subId) {
  const s = subList(type, catId).find(x => x.id === subId);
  return s ? s.name : '';
}

/* --------- Consultas (prefix = 'YYYY-MM' para un mes o 'YYYY' para un año) --------- */

/* --------- Periodos ---------
   Un "mes" puede ser natural (del 1 al último día) o ir de nómina a nómina: empieza el día que cobras la
   nómina que le corresponde y acaba el día antes de la siguiente. Si un mes no tiene nómina, empieza el día 1. */

let periodCache = null;
/** {'YYYY-MM': fecha de la primera nómina de ese mes}. Se recalcula cada vez que se guardan datos. */
function payStarts() {
  if (periodCache) return periodCache;
  const map = {}, cut = S.settings.payCutoff;
  for (const m of S.movements) {
    if (m.type !== 'ingreso' || m.category !== 'nomina') continue;
    const mk = Number(m.date.slice(8, 10)) >= cut ? shiftMonth(m.date.slice(0, 7), 1) : m.date.slice(0, 7);
    if (!map[mk] || m.date < map[mk]) map[mk] = m.date;
  }
  return (periodCache = map);
}
function periodStart(mk) {
  return (S.settings.monthMode === 'nomina' && payStarts()[mk]) || mk + '-01';
}
function dayBefore(d) {
  const x = new Date(d + 'T12:00:00');
  x.setDate(x.getDate() - 1);
  return ymd(x);
}
/** Fechas (incluidas) de un mes 'YYYY-MM' o de un año 'YYYY'. */
function periodRange(p) {
  if (p.length === 4) return { from: periodStart(p + '-01'), to: dayBefore(periodStart((Number(p) + 1) + '-01')) };
  return { from: periodStart(p), to: dayBefore(periodStart(shiftMonth(p, 1))) };
}
function inPeriod(p) {
  const r = periodRange(p);
  return m => m.date >= r.from && m.date <= r.to;
}
/** Mes al que pertenece una fecha. */
function periodOf(date) {
  const mk = date.slice(0, 7), r = periodRange(mk);
  if (date < r.from) return shiftMonth(mk, -1);
  if (date > r.to) return shiftMonth(mk, 1);
  return mk;
}
/** "28 oct – 27 nov" cuando el mes no es el natural; vacío si lo es. */
function periodSub(mk) {
  const r = periodRange(mk), natural = r.from === mk + '-01' && r.to === dayBefore(shiftMonth(mk, 1) + '-01');
  return natural ? '' : shortDate(r.from) + ' – ' + shortDate(r.to);
}

/** Gastos del periodo, incluidas las aportaciones a la hucha del coche (cuentan como Transporte). */
function expenses(prefix) {
  const inP = inPeriod(prefix);
  const own = S.movements.filter(m => m.type === 'gasto' && inP(m));
  const car = S.car.movements.filter(m => m.kind === 'aportacion' && inP(m)).map(m => ({
    id: m.id, type: 'gasto', category: 'transporte', amount: m.amount, date: m.date, created: m.created,
    note: 'Aportación hucha coche' + (m.note ? ' · ' + m.note : ''), car: true,
  }));
  return own.concat(car);
}
function incomes(prefix) { const inP = inPeriod(prefix); return S.movements.filter(m => m.type === 'ingreso' && inP(m)); }

function carMovs(prefix) { return S.car.movements.filter(inPeriod(prefix)); }
function carStats(prefix) {
  const ms = carMovs(prefix), g = k => sum(ms.filter(m => m.kind === k));
  const gas = g('gasolina'), bla = g('blablacar');
  return { gas, bla, apo: g('aportacion'), net: gas - bla };
}
/** Saldo = saldo inicial + movimientos desde la fecha del saldo inicial (hasta `upTo`, si se indica). */
function fundBalance(fund, upTo) {
  const f = FUNDS[fund], acc = f.store();
  if (acc.start == null) return null;
  return acc.start + acc.movements
    .filter(m => m.date >= acc.startDate && (!upTo || m.date <= upTo))
    .reduce((t, m) => t + f.kinds[m.kind].sign * m.amount, 0);
}
const carBalance = () => fundBalance('car');
function savStats(prefix) {
  const ms = S.savings.movements.filter(inPeriod(prefix)), g = k => sum(ms.filter(m => m.kind === k));
  const dep = g('deposito'), ret = g('retirada');
  return { dep, ret, net: dep - ret };
}

/* =====================================================================
   Gráficos (SVG)
   ===================================================================== */

function niceTicks(min, max) {
  const raw = (max - min) / 3, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(f => f * mag).find(s => s >= raw);
  const ticks = [];
  for (let v = Math.floor(min / step) * step; v <= Math.ceil(max / step) * step + step / 2; v += step) ticks.push(Math.round(v));
  return ticks;
}

/** Barra con las esquinas redondeadas solo en el extremo del dato. */
function barPath(x, w, y0, y1) {
  const h = Math.abs(y1 - y0);
  if (h < 0.5) return '';
  const r = Math.min(4, w / 2, h);
  if (y1 < y0) return `M${x},${y0}V${y1 + r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 + r}V${y0}Z`;
  return `M${x},${y0}V${y1 - r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 - r}V${y0}Z`;
}

/**
 * Barras verticales (agrupadas si hay varias series). Al tocar un mes se muestra su detalle.
 * series: [{name, color, values[]}], tip(i) devuelve el texto del detalle.
 */
function barChart({ labels, series, tip, height = 160 }) {
  const W = 340, H = height, padL = 30, padB = 18, padT = 8;
  const all = series.flatMap(s => s.values);
  let min = Math.min(0, ...all), max = Math.max(0, ...all);
  if (max === min) max = 10000;
  const ticks = niceTicks(min, max);
  min = ticks[0]; max = ticks[ticks.length - 1];
  const y = v => padT + (max - v) / (max - min) * (H - padT - padB);
  const n = labels.length, slot = (W - padL) / n, groupW = slot * 0.66, gap = 2;
  const bw = (groupW - gap * (series.length - 1)) / series.length;
  let out = '';
  for (const t of ticks) {
    out += `<line class="${t === 0 ? 'zero' : 'grid'}" x1="${padL}" x2="${W}" y1="${y(t)}" y2="${y(t)}"/>`;
    out += `<text class="ax y" x="${padL - 5}" y="${y(t) + 3}">${axisEur(t)}</text>`;
  }
  labels.forEach((lab, i) => {
    const gx = padL + i * slot;
    series.forEach((s, k) => {
      const x = gx + (slot - groupW) / 2 + k * (bw + gap);
      out += `<path d="${barPath(x, bw, y(0), y(s.values[i]))}" fill="${s.color}"/>`;
    });
    out += `<text class="ax x" x="${gx + slot / 2}" y="${H - 4}">${lab}</text>`;
    out += `<rect class="hit" data-act="tip" data-tip="${esc(tip(i))}" x="${gx}" y="0" width="${slot}" height="${H - padB}"/>`;
  });
  const legend = series.length > 1
    ? `<div class="chart-legend">${series.map(s => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>` : '';
  return `${legend}<svg class="chart" viewBox="0 0 ${W} ${H}">${out}</svg>`;
}

function arcPath(c, R, r, a0, a1) {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const p = (rad, a) => (c + rad * Math.cos(a)).toFixed(2) + ',' + (c + rad * Math.sin(a)).toFixed(2);
  return `M${p(R, a0)}A${R},${R} 0 ${large} 1 ${p(R, a1)}L${p(r, a1)}A${r},${r} 0 ${large} 0 ${p(r, a0)}Z`;
}

function donut(items, total) {
  const C = 70, R = 64, r = 45;
  let a = -Math.PI / 2;
  const segs = items.map(it => {
    const ang = it.value / total * 2 * Math.PI;
    const d = items.length === 1
      ? `M${C - R},${C}A${R},${R} 0 1 1 ${C + R},${C}A${R},${R} 0 1 1 ${C - R},${C}ZM${C - r},${C}A${r},${r} 0 1 0 ${C + r},${C}A${r},${r} 0 1 0 ${C - r},${C}Z`
      : arcPath(C, R, r, a, a + ang);
    a += ang;
    const dim = ui.filterCat && ui.filterCat !== it.id ? ' class="dim"' : '';
    return `<path${dim} d="${d}" fill="${it.color}" fill-rule="evenodd" stroke="var(--card)" stroke-width="2" data-act="filter" data-id="${it.id}"/>`;
  }).join('');
  return `<svg class="donut" viewBox="0 0 140 140">${segs}
    <text class="dc-v" x="${C}" y="${C + 3}">${axisEurFull(total)} €</text>
    <text class="dc-l" x="${C}" y="${C + 19}">gastado</text></svg>`;
}

/* =====================================================================
   Vistas
   ===================================================================== */

const ui = {
  tab: 'mes',
  month: curMonth(),
  year: Number(today().slice(0, 4)),
  carMonth: curMonth(),
  savMonth: curMonth(),
  yearCat: 'super',
  filterCat: null,
  form: null,
};

const periodNav = (label, sub) => `<div class="period"><button data-act="prev" aria-label="Anterior">‹</button>
  <div class="pt"><h1>${label}</h1>${sub ? `<div class="psub">${sub}</div>` : ''}</div><button data-act="next" aria-label="Siguiente">›</button></div>`;
const stat = (label, value, cls = '') => `<div class="stat ${cls}"><div class="l">${label}</div><div class="v">${value}</div></div>`;
const empty = t => `<p class="empty">${t}</p>`;

function rowMov(m) {
  const inc = m.type === 'ingreso';
  const info = catInfo(m.type, m.category), sub = m.sub ? subName(m.type, m.category, m.sub) : '';
  const name = (inc ? 'Ingreso · ' : '') + info.name + (sub ? ' · ' + sub : '');
  return `<button class="row" data-act="${m.car ? 'editcar' : 'edit'}" data-id="${m.id}">
    <i style="background:${info.color}"></i>
    <div class="rt"><div class="rn">${esc(name)}</div>
      <div class="rs">${shortDate(m.date)}${m.note ? ' · ' + esc(m.note) : ''}</div></div>
    <div class="ra ${inc ? 'pos' : ''}">${inc ? '+' : '−'}${eur(m.amount)}</div></button>`;
}

function rowCar(m) {
  const k = CAR_KINDS[m.kind];
  return `<button class="row" data-act="editcar" data-id="${m.id}">
    <i style="background:${m.kind === 'gasolina' ? PALETTE[2] : 'var(--pos)'}"></i>
    <div class="rt"><div class="rn">${k.icon} ${k.name}</div>
      <div class="rs">${shortDate(m.date)}${m.note ? ' · ' + esc(m.note) : ''}</div></div>
    <div class="ra ${k.sign > 0 ? 'pos' : ''}">${k.sign > 0 ? '+' : '−'}${eur(m.amount)}</div></button>`;
}

function rowSav(m) {
  const k = SAV_KINDS[m.kind];
  return `<button class="row" data-act="editsav" data-id="${m.id}">
    <i style="background:${k.sign > 0 ? 'var(--pos)' : 'var(--accent)'}"></i>
    <div class="rt"><div class="rn">${k.sign > 0 ? 'Metido en ahorros' : 'Sacado de ahorros'}</div>
      <div class="rs">${shortDate(m.date)}${m.note ? ' · ' + esc(m.note) : ''}</div></div>
    <div class="ra ${k.sign > 0 ? 'pos' : ''}">${k.sign > 0 ? '+' : '−'}${eur(m.amount)}</div></button>`;
}

function viewMonth() {
  const mk = ui.month, exp = expenses(mk), inc = incomes(mk);
  const tE = sum(exp), tI = sum(inc), left = tI - tE;
  const byCat = {};
  exp.forEach(m => { byCat[m.category] = (byCat[m.category] || 0) + m.amount; });
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1])
    .map(([id, value]) => Object.assign({ id, value }, catInfo('gasto', id)));
  if (ui.filterCat && !byCat[ui.filterCat]) ui.filterCat = null;

  const budgets = catList('gasto').filter(c => S.budgets[c.id] > 0).map(c => {
    const spent = byCat[c.id] || 0, b = S.budgets[c.id], over = spent > b;
    return `<div class="bud"><div class="bud-top"><span>${esc(c.name)}</span><span>${eur(spent)} / ${eur(b)}</span></div>
      <div class="bar"><div style="width:${Math.min(100, spent / b * 100)}%;background:${over ? 'var(--bad)' : catInfo('gasto', c.id).color}"></div></div>
      <div class="bud-sub ${over ? 'bad' : ''}">${over ? '⚠ Te has pasado ' + eur(spent - b) : 'Te quedan ' + eur(b - spent)}</div></div>`;
  }).join('');

  let list = exp.concat(inc).sort(byDateDesc);
  if (ui.filterCat) list = list.filter(m => m.type === 'gasto' && m.category === ui.filterCat);

  // Desglose por tipo cuando se filtra una categoría que los tiene (Luz, Agua… o Cuota, Taller…).
  let breakdown = '';
  if (ui.filterCat && subList('gasto', ui.filterCat).length) {
    const bySub = {};
    list.forEach(m => { const k = subName('gasto', m.category, m.sub) || 'Sin tipo'; bySub[k] = (bySub[k] || 0) + m.amount; });
    breakdown = Object.entries(bySub).sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `<div class="kv"><span>${esc(k)}</span><span>${eur(v)}</span></div>`).join('')
      + '<div class="sep"></div>';
  }

  return `${needsInstall() ? `<div class="note install"><b>Instálala en tu iPhone</b> para que no se borren los datos:
    <ol><li>Pulsa el botón Compartir de Safari</li><li>Elige «Añadir a pantalla de inicio»</li><li>Abre Finanzas desde el icono nuevo</li></ol></div>` : ''}
  ${periodNav(monthLabel(mk), periodSub(mk))}
  <div class="stats">${stat('Ingresos', eur(tI))}${stat('Gastos', eur(tE))}${stat('Te queda', eur(left), left < 0 ? 'neg' : 'hl')}</div>
  <section class="card"><h2>Gastos por categoría</h2>
    ${cats.length ? `${donut(cats, tE)}<div class="legend">${cats.map(c => `
      <button class="leg ${ui.filterCat === c.id ? 'on' : ''}" data-act="filter" data-id="${c.id}">
        <i style="background:${c.color}"></i><span>${esc(c.name)}</span><span class="lv">${eur(c.value)}</span><span class="lp">${pct(c.value, tE)}</span>
      </button>`).join('')}</div><p class="hint">Toca una categoría para ver solo sus movimientos.</p>`
      : empty('Aún no hay gastos este mes.')}
  </section>
  ${budgets ? `<section class="card"><h2>Presupuestos</h2>${budgets}</section>` : ''}
  <section class="card"><h2>Movimientos${ui.filterCat ? ' · ' + esc(catInfo('gasto', ui.filterCat).name)
    + ` <button class="link" data-act="filter" data-id="${ui.filterCat}">Ver todos</button>` : ''}</h2>
    ${breakdown}${list.length ? `<div class="list">${list.map(rowMov).join('')}</div>` : empty('Pulsa + para apuntar tu primer movimiento.')}
  </section>`;
}

function viewYear() {
  const y = ui.year, now = curMonth();
  const rows = MES_C.map((_, i) => {
    const mk = `${y}-${pad(i + 1)}`, I = sum(incomes(mk)), E = sum(expenses(mk));
    return { mk, i, I, E, A: I - E, future: mk > now };
  });
  let acc = 0;
  rows.forEach(r => { if (!r.future) acc += r.A; r.acc = acc; });
  const tI = rows.reduce((t, r) => t + r.I, 0), tE = rows.reduce((t, r) => t + r.E, 0);
  const labels = MES_C.map(m => m[0].toUpperCase());

  const cat = ui.yearCat, ci = catInfo('gasto', cat);
  const catVals = rows.map(r => sum(expenses(r.mk).filter(m => m.category === cat)));
  const pastMonths = rows.filter(r => !r.future && (r.I || r.E)).length;
  const catAvg = pastMonths ? Math.round(catVals.reduce((a, b) => a + b, 0) / pastMonths) : 0;

  return `${periodNav(String(y))}
  <div class="stats">${stat('Ingresos', axisEurFull(tI) + ' €')}${stat('Gastos', axisEurFull(tE) + ' €')}${stat('Ahorrado', axisEurFull(tI - tE) + ' €', tI - tE < 0 ? 'neg' : 'hl')}</div>
  <section class="card"><h2>Ingresos y gastos por mes</h2>
    ${barChart({
      labels, series: [{ name: 'Ingresos', color: C_IN, values: rows.map(r => r.I) }, { name: 'Gastos', color: C_OUT, values: rows.map(r => r.E) }],
      tip: i => `${MESES[i]}\nIngresos ${eur(rows[i].I)}\nGastos ${eur(rows[i].E)}\nAhorro ${eurSigned(rows[i].A)}`,
    })}
  </section>
  <section class="card"><h2>Ahorro de cada mes</h2>
    ${barChart({
      labels, series: [{ name: 'Ahorro', color: '#9085e9', values: rows.map(r => r.A) }], height: 140,
      tip: i => `${MESES[i]}\nAhorro ${eurSigned(rows[i].A)}\nAcumulado ${eurSigned(rows[i].acc)}`,
    })}
    <p class="hint">Por debajo de 0, ese mes gastaste más de lo que ingresaste.</p>
  </section>
  <section class="card"><h2>Comparar una categoría</h2>
    <div class="chips">${catList('gasto').map(c => `<button class="chip ${c.id === cat ? 'on' : ''}" data-act="ycat" data-id="${c.id}">${esc(c.name)}</button>`).join('')}</div>
    ${barChart({
      labels, series: [{ name: ci.name, color: ci.color, values: catVals }], height: 130,
      tip: i => `${MESES[i]}\n${ci.name}: ${eur(catVals[i])}`,
    })}
    <p class="hint">Media: ${eur(catAvg)} al mes · Total del año: ${eur(catVals.reduce((a, b) => a + b, 0))}</p>
  </section>
  <section class="card"><h2>Resumen mes a mes</h2>
    <table class="table"><thead><tr><th>Mes</th><th>Ingresos</th><th>Gastos</th><th>Ahorro</th><th>Acumul.</th></tr></thead><tbody>
    ${rows.map(r => r.future ? `<tr class="future"><td>${MES_C[r.i]}</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>`
      : `<tr class="go" data-act="gomonth" data-mk="${r.mk}"><td>${MES_C[r.i]}</td><td>${axisEurFull(r.I)}</td><td>${axisEurFull(r.E)}</td>
        <td class="${r.A < 0 ? 'neg' : r.A > 0 ? 'pos' : ''}">${axisEurFull(r.A)}</td><td>${axisEurFull(r.acc)}</td></tr>`).join('')}
    </tbody><tfoot><tr><td>Total</td><td>${axisEurFull(tI)}</td><td>${axisEurFull(tE)}</td><td class="${tI - tE < 0 ? 'neg' : 'pos'}">${axisEurFull(tI - tE)}</td><td></td></tr></tfoot></table>
    <p class="hint">Cifras en euros. Toca un mes para abrirlo.</p>
  </section>`;
}
/** Euros sin decimales para la tabla, que tiene poco ancho. */
function axisEurFull(c) { return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(Math.round(c / 100)); }

function viewCar() {
  if (S.car.start == null) {
    return `<h1 class="title">Hucha del coche</h1>
    <section class="card"><h2>Primer paso</h2>
      <p style="margin:0 0 14px;color:var(--text-2)">¿Cuánto dinero hay ahora mismo en la cuenta que usas para el coche? A partir de ahí la app lleva el saldo sola.</p>
      <input id="car-start" class="amount" inputmode="decimal" placeholder="0,00 €" autocomplete="off">
      <label class="field"><span>A fecha de</span><input id="car-date" type="date" value="${today()}"></label>
      <button class="primary" data-act="carsetup">Empezar</button>
    </section>
    <p class="hint">Gasolina resta, BlaBlaCar suma y ninguno cuenta en tus gastos del mes. Solo cuando metes dinero tuyo (aportación) cuenta como gasto de Transporte.</p>`;
  }
  const bal = carBalance(), mk = ui.carMonth, st = carStats(mk), y = mk.slice(0, 4);
  const yearly = MES_C.map((_, i) => carStats(`${y}-${pad(i + 1)}`)), ys = carStats(y);
  const list = carMovs(mk).sort(byDateDesc);
  return `<div class="hero"><div class="lbl">Saldo de la hucha del coche</div>
      <div class="big ${bal < 0 ? 'neg' : ''}">${eur(bal)}</div>
      <div class="sub">${bal < 0 ? 'Falta dinero en la cuenta: añade una aportación' : 'Debería coincidir con lo que tienes en esa cuenta'}</div></div>
    <div class="car-btns">${Object.entries(CAR_KINDS).map(([k, v]) => `<button data-act="addcar" data-kind="${k}"><span>${v.icon}</span>${v.name}</button>`).join('')}</div>
    ${periodNav(monthLabel(mk), periodSub(mk))}
    <div class="stats">${stat('Gasolina', eur(st.gas))}${stat('BlaBlaCar', eur(st.bla))}${st.net > 0 ? stat('Te costó', eur(st.net), 'neg') : stat('Te sobró', eur(-st.net), 'hl')}</div>
    ${st.apo ? `<p class="note">Este mes metiste ${eur(st.apo)} de tu dinero. Aparece como gasto de Transporte en tu resumen del mes.</p>` : ''}
    <section class="card"><h2>Coste neto por mes · ${y}</h2>
      ${barChart({
        labels: MES_C.map(m => m[0].toUpperCase()), series: [{ name: 'Coste neto', color: PALETTE[2], values: yearly.map(s => s.net) }], height: 140,
        tip: i => `${MESES[i]}\nGasolina ${eur(yearly[i].gas)}\nBlaBlaCar ${eur(yearly[i].bla)}\n${yearly[i].net > 0 ? 'Te costó ' + eur(yearly[i].net) : 'Te sobró ' + eur(-yearly[i].net)}`,
      })}
      <p class="hint">Gasolina menos BlaBlaCar. Por debajo de 0, BlaBlaCar pagó toda la gasolina y sobró.</p>
      <div class="kv" style="margin-top:8px"><span>Gasolina en ${y}</span><span>${eur(ys.gas)}</span></div>
      <div class="kv"><span>BlaBlaCar en ${y}</span><span>${eur(ys.bla)}</span></div>
      <div class="kv"><span>Dinero tuyo aportado en ${y}</span><span>${eur(ys.apo)}</span></div>
    </section>
    <section class="card"><h2>Movimientos de la hucha</h2>
      ${list.length ? `<div class="list">${list.map(rowCar).join('')}</div>` : empty('Nada apuntado este mes.')}
    </section>`;
}

function viewSavings() {
  if (S.savings.start == null) {
    return `<h1 class="title">Ahorros</h1>
    <section class="card"><h2>Primer paso</h2>
      <p style="margin:0 0 14px;color:var(--text-2)">¿Cuánto tienes ahora mismo en tu cuenta de ahorros? A partir de ahí la app lleva el saldo sola.</p>
      <input id="sav-start" class="amount" inputmode="decimal" placeholder="0,00 €" autocomplete="off">
      <label class="field"><span>A fecha de</span><input id="sav-date" type="date" value="${today()}"></label>
      <button class="primary" data-act="savsetup">Empezar</button>
    </section>
    <p class="hint">Después podrás meter dinero o sacarlo (por ejemplo, si compras algo con los ahorros). Nada de esto cuenta en los gastos o ingresos del mes.</p>`;
  }
  const bal = fundBalance('sav'), mk = ui.savMonth, st = savStats(mk), y = mk.slice(0, 4), now = today();
  const startMonth = periodOf(S.savings.startDate), nowMonth = curMonth();
  // Saldo a final de cada mes del año (solo desde que empezó la cuenta y hasta hoy).
  const ends = MES_C.map((_, i) => {
    const m = `${y}-${pad(i + 1)}`;
    if (m < startMonth || m > nowMonth) return null;
    return fundBalance('sav', m === nowMonth ? now : periodRange(m).to);
  });
  const ys = savStats(y), list = S.savings.movements.filter(inPeriod(mk)).sort(byDateDesc);
  return `<div class="hero"><div class="lbl">Saldo de tu cuenta de ahorros</div>
      <div class="big ${bal < 0 ? 'neg' : ''}">${eur(bal)}</div>
      <div class="sub">Debería coincidir con lo que tienes en esa cuenta</div></div>
    <div class="car-btns two">${Object.entries(SAV_KINDS).map(([k, v]) => `<button data-act="addsav" data-kind="${k}"><span>${v.icon}</span>${v.name} dinero</button>`).join('')}</div>
    ${periodNav(monthLabel(mk), periodSub(mk))}
    <div class="stats">${stat('Metido', eur(st.dep))}${stat('Sacado', eur(st.ret))}${stat('Variación', eurSigned(st.net), st.net < 0 ? 'neg' : 'hl')}</div>
    <section class="card"><h2>Saldo a final de mes · ${y}</h2>
      ${barChart({
        labels: MES_C.map(m => m[0].toUpperCase()), series: [{ name: 'Saldo', color: PALETTE[0], values: ends.map(v => v || 0) }], height: 140,
        tip: i => ends[i] == null ? `${MESES[i]}
Sin datos` : `${MESES[i]}
Saldo ${eur(ends[i])}
Metido ${eur(savStats(`${y}-${pad(i + 1)}`).dep)} · Sacado ${eur(savStats(`${y}-${pad(i + 1)}`).ret)}`,
      })}
      <div class="kv" style="margin-top:8px"><span>Metido en ${y}</span><span>${eur(ys.dep)}</span></div>
      <div class="kv"><span>Sacado en ${y}</span><span>${eur(ys.ret)}</span></div>
      <div class="kv"><span>Variación en ${y}</span><span>${eurSigned(ys.net)}</span></div>
    </section>
    <section class="card"><h2>Movimientos de ahorros</h2>
      ${list.length ? `<div class="list">${list.map(rowSav).join('')}</div>` : empty('Nada apuntado este mes.')}
    </section>`;
}

function viewSettings() {
  return `<h1 class="title">Ajustes</h1>
  <section class="card"><h2>Presupuesto mensual por categoría</h2>
    ${catList('gasto').map(c => `<label class="set-row"><i style="background:${catInfo('gasto', c.id).color}"></i><span>${esc(c.name)}</span>
      <input data-budget="${c.id}" inputmode="decimal" placeholder="Sin límite" value="${amountText(S.budgets[c.id])}"><em>€</em></label>`).join('')}
    <p class="hint">Déjalo vacío si no quieres límite. Se guarda al salir del campo.</p>
  </section>
  ${S.car.start != null ? `<section class="card"><h2>Hucha del coche</h2>
    <label class="field"><span>Saldo inicial</span><input data-carstart inputmode="decimal" value="${amountText(S.car.start)}"></label>
    <label class="field"><span>A fecha de</span><input data-carstartdate type="date" value="${S.car.startDate}"></label>
    <p class="hint" style="margin:0">Usa esto si el saldo de la app no cuadra con el del banco.</p>
  </section>` : ''}
  ${S.savings.start != null ? `<section class="card"><h2>Ahorros</h2>
    <label class="field"><span>Saldo inicial</span><input data-savstart inputmode="decimal" value="${amountText(S.savings.start)}"></label>
    <label class="field"><span>A fecha de</span><input data-savstartdate type="date" value="${S.savings.startDate}"></label>
    <p class="hint" style="margin:0">Usa esto si el saldo de la app no cuadra con el del banco.</p>
  </section>` : ''}
  <section class="card"><h2>Cómo se cuentan los meses</h2>
    <div class="seg">${[['calendario', 'Calendario'], ['nomina', 'Según nómina']].map(([v, l]) =>
      `<button data-act="monthmode" data-v="${v}" class="${S.settings.monthMode === v ? 'on' : ''}">${l}</button>`).join('')}</div>
    ${S.settings.monthMode === 'nomina' ? `<p class="kind-help">Cada mes empieza el día que cobras la nómina y termina el día antes de la siguiente.
      Si te pagan tarde, el mes se alarga solo. Solo cuentan los ingresos de la categoría Nómina.</p>
      <label class="set-row plain"><span>Una nómina cobrada a partir del día</span><input data-cutoff inputmode="numeric" value="${S.settings.payCutoff}"><em></em></label>
      <p class="hint" style="margin-top:4px">…cuenta para el mes siguiente. Ejemplo: cobrada el ${S.settings.payCutoff} de octubre, es la de noviembre.</p>`
    : '<p class="kind-help" style="margin:0">Cada mes va del día 1 al último, como en el banco.</p>'}
  </section>
  <section class="card"><h2>Copia de seguridad</h2>
    <p style="margin:0 0 12px;color:var(--text-2);font-size:14px">Guarda un archivo con todos tus datos (en Drive, descargas…). Te sirve si cambias de móvil o reinstalas la app.</p>
    <div class="btns"><button class="primary" data-act="export">Exportar copia</button><button class="secondary" data-act="import">Importar copia</button></div>
    <p class="hint">${S.lastExport ? 'Última copia: ' + S.lastExport.split('-').reverse().join('/') : 'Aún no has hecho ninguna copia.'}</p>
  </section>
  <p class="about">Finanzas ${APP_VERSION} · ${S.movements.length + S.car.movements.length + S.savings.movements.length} movimientos · tus datos se guardan solo en este móvil</p>`;
}

function render() {
  const views = { mes: viewMonth, anio: viewYear, coche: viewCar, ahorros: viewSavings, ajustes: viewSettings };
  $('#view').innerHTML = views[ui.tab]();
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === ui.tab));
  $('#fab').classList.toggle('hidden', ui.tab !== 'mes' && ui.tab !== 'anio');
  hideTip();
}

/* =====================================================================
   Formularios (hoja inferior)
   ===================================================================== */

function openMovForm(id) {
  const m = id && S.movements.find(x => x.id === id);
  const month = ui.tab === 'mes' ? ui.month : curMonth();
  ui.form = m
    ? { kind: 'mov', id: m.id, created: m.created, type: m.type, amount: amountText(m.amount), category: m.category, sub: m.sub || null, date: m.date, note: m.note || '' }
    : { kind: 'mov', type: 'gasto', amount: '', category: null, sub: null, date: month === curMonth() ? today() : periodRange(month).from, note: '' };
  renderSheet(!m);
}

/** Formulario de una cuenta aparte: fund = 'car' (hucha del coche) o 'sav' (ahorros). */
function openFundForm(fund, id, kind) {
  const m = id && FUNDS[fund].store().movements.find(x => x.id === id);
  const month = fund === 'car' ? ui.carMonth : ui.savMonth;
  ui.form = m
    ? { kind: fund, id: m.id, created: m.created, fk: m.kind, amount: amountText(m.amount), date: m.date, note: m.note || '' }
    : { kind: fund, fk: kind || Object.keys(FUNDS[fund].kinds)[0], amount: '', date: month === curMonth() ? today() : periodRange(month).from, note: '' };
  renderSheet(!m);
}

function readForm() {
  const f = ui.form;
  if (!f) return;
  f.amount = $('#f-amount').value;
  f.date = $('#f-date').value;
  f.note = $('#f-note').value;
}

function renderSheet(focus) {
  const f = ui.form;
  let body;
  if (f.kind === 'mov') {
    body = `<div class="seg">${['gasto', 'ingreso'].map(t => `<button data-act="ftype" data-v="${t}" class="${f.type === t ? 'on' : ''}">${t === 'gasto' ? 'Gasto' : 'Ingreso'}</button>`).join('')}</div>
      <input id="f-amount" class="amount" inputmode="decimal" placeholder="0,00 €" autocomplete="off" value="${esc(f.amount)}">
      <div class="chips">${catList(f.type).map(c => `<button class="chip ${f.category === c.id ? 'on' : ''}" data-act="fcat" data-id="${c.id}">${esc(c.name)}</button>`).join('')}</div>
      ${subList(f.type, f.category).length ? `<p class="sub-label">¿De qué es?</p>
        <div class="chips sub">${subList(f.type, f.category).map(s => `<button class="chip ${f.sub === s.id ? 'on' : ''}" data-act="fsub" data-id="${s.id}">${esc(s.name)}</button>`).join('')}</div>` : ''}
      ${f.type === 'gasto' && (f.category === 'transporte' || f.category === 'coche') ? '<p class="note">¿Es gasolina? Apúntala en la pestaña Coche para que salga de la hucha y no de tus gastos.</p>' : ''}`;
  } else {
    const kinds = FUNDS[f.kind].kinds;
    body = `<div class="seg">${Object.entries(kinds).map(([k, v]) => `<button data-act="fkind" data-v="${k}" class="${f.fk === k ? 'on' : ''}">${v.icon} ${v.name}</button>`).join('')}</div>
      <p class="kind-help">${kinds[f.fk].help}</p>
      <input id="f-amount" class="amount" inputmode="decimal" placeholder="0,00 €" autocomplete="off" value="${esc(f.amount)}">`;
  }
  const title = f.kind === 'mov' ? (f.id ? 'Editar movimiento' : 'Nuevo movimiento') : (f.id ? 'Editar · ' : '') + FUNDS[f.kind].title;
  $('#panel').innerHTML = `<div class="sh-head"><h3>${title}</h3><button class="x" data-act="close" aria-label="Cerrar">✕</button></div>
    ${body}
    <label class="field"><span>Fecha</span><input id="f-date" type="date" value="${esc(f.date)}"></label>
    <label class="field"><span>Nota (opcional)</span><input id="f-note" maxlength="80" placeholder="${f.kind === 'mov' ? 'p. ej. compra semanal' : FUNDS[f.kind].placeholder}" value="${esc(f.note)}"></label>
    <button class="primary" data-act="fsave">${f.id ? 'Guardar cambios' : 'Añadir'}</button>
    ${f.id ? '<button class="danger" data-act="fdelete">Eliminar</button>' : ''}`;
  $('#sheet').classList.remove('hidden');
  if (focus) setTimeout(() => $('#f-amount') && $('#f-amount').focus(), 60);
}

function closeSheet() {
  ui.form = null;
  $('#sheet').classList.add('hidden');
  if (document.activeElement) document.activeElement.blur();
}

function upsert(arr, item) {
  const i = arr.findIndex(x => x.id === item.id);
  if (i >= 0) arr[i] = item; else arr.push(item);
}

function saveForm() {
  readForm();
  const f = ui.form, amount = parseAmount(f.amount);
  if (!(amount > 0)) return toast('Escribe una cantidad válida');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date)) return toast('Elige una fecha');
  const base = { id: f.id || uid(), amount, date: f.date, note: f.note.trim(), created: f.created || Date.now() };
  if (f.kind === 'mov') {
    if (!f.category) return toast('Elige una categoría');
    const subs = subList(f.type, f.category);
    if (subs.length && !subs.some(s => s.id === f.sub)) return toast('Elige de qué es el gasto (' + subs.map(s => s.name).slice(0, 3).join(', ') + '…)');
    upsert(S.movements, Object.assign(base, { type: f.type, category: f.category }, subs.length ? { sub: f.sub } : {}));
  } else {
    upsert(FUNDS[f.kind].store().movements, Object.assign(base, { kind: f.fk }));
  }
  persist();
  const shown = ui.tab === 'coche' ? ui.carMonth : ui.tab === 'ahorros' ? ui.savMonth : ui.month;
  closeSheet();
  render();
  const saved = periodOf(f.date);
  toast(saved === shown || ui.tab === 'anio' ? 'Guardado' : 'Guardado en ' + monthLabel(saved));
}

function deleteForm() {
  const f = ui.form;
  if (!confirm('¿Eliminar este movimiento?')) return;
  const arr = f.kind === 'mov' ? S.movements : FUNDS[f.kind].store().movements;
  const i = arr.findIndex(x => x.id === f.id);
  if (i >= 0) arr.splice(i, 1);
  persist();
  closeSheet();
  render();
  toast('Eliminado');
}

/* =====================================================================
   Copias de seguridad
   ===================================================================== */

function exportBackup() {
  const name = `finanzas-copia-${today()}.json`, json = JSON.stringify(S, null, 1);
  if (window.Android) return Android.exportBackup(json, name);
  // iPhone: hoja de compartir (Guardar en Archivos, WhatsApp, correo…).
  const file = new File([json], name, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    return navigator.share({ files: [file], title: name })
      .then(() => window.onExportDone(true))
      .catch(err => { if (err && err.name !== 'AbortError') window.onExportDone(false); });
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  a.download = name;
  a.click();
  window.onExportDone(true);
}

window.onExportDone = ok => {
  if (ok) { S.lastExport = today(); persist(); render(); }
  toast(ok ? 'Copia guardada' : 'No se pudo guardar la copia');
};

function importBackup() {
  if (window.Android) return Android.importBackup();
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = '.json,application/json';
  inp.onchange = () => inp.files[0] && inp.files[0].text().then(window.onImportData);
  inp.click();
}

window.onImportData = text => {
  const d = parseJson(text);
  if (!d || !Array.isArray(d.movements)) return toast('Ese archivo no es una copia de Finanzas');
  const n = d.movements.length + (d.car && d.car.movements ? d.car.movements.length : 0)
    + (d.savings && d.savings.movements ? d.savings.movements.length : 0);
  if (!confirm(`Se sustituirán tus datos actuales por los de la copia (${n} movimientos). ¿Continuar?`)) return;
  S = migrate(d);
  persist();
  render();
  toast('Copia restaurada');
};

/* =====================================================================
   Eventos
   ===================================================================== */

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2200);
}

let tipTarget = null;
function showTip(el, x, y) {
  hideTip();
  tipTarget = el;
  el.classList.add('on');
  const t = $('#tip');
  t.textContent = el.dataset.tip;
  t.classList.remove('hidden');
  const w = t.offsetWidth, h = t.offsetHeight;
  t.style.left = Math.max(8, Math.min(innerWidth - w - 8, x - w / 2)) + 'px';
  t.style.top = (y - h - 16 < 8 ? y + 16 : y - h - 16) + 'px';
}
function hideTip() {
  $('#tip').classList.add('hidden');
  if (tipTarget) tipTarget.classList.remove('on');
  tipTarget = null;
}

const ACTIONS = {
  tab: el => { ui.tab = el.dataset.tab; render(); scrollTo(0, 0); },
  prev: () => movePeriod(-1),
  next: () => movePeriod(1),
  filter: el => { ui.filterCat = ui.filterCat === el.dataset.id ? null : el.dataset.id; render(); },
  ycat: el => { ui.yearCat = el.dataset.id; render(); },
  gomonth: el => { ui.month = el.dataset.mk; ui.tab = 'mes'; ui.filterCat = null; render(); scrollTo(0, 0); },
  add: () => openMovForm(null),
  edit: el => openMovForm(el.dataset.id),
  addcar: el => openFundForm('car', null, el.dataset.kind),
  editcar: el => openFundForm('car', el.dataset.id),
  addsav: el => openFundForm('sav', null, el.dataset.kind),
  editsav: el => openFundForm('sav', el.dataset.id),
  ftype: el => { readForm(); ui.form.type = el.dataset.v; ui.form.category = null; renderSheet(); },
  fcat: el => { readForm(); if (ui.form.category !== el.dataset.id) ui.form.sub = null; ui.form.category = el.dataset.id; renderSheet(); },
  fsub: el => { readForm(); ui.form.sub = el.dataset.id; renderSheet(); },
  fkind: el => { readForm(); ui.form.fk = el.dataset.v; renderSheet(); },
  fsave: saveForm,
  fdelete: deleteForm,
  close: closeSheet,
  tip: (el, e) => (tipTarget === el ? hideTip() : showTip(el, e.clientX, e.clientY)),
  carsetup: () => {
    const v = parseAmount($('#car-start').value), d = $('#car-date').value;
    if (!(v >= 0)) return toast('Escribe el saldo actual (puede ser 0)');
    if (!d) return toast('Elige una fecha');
    S.car.start = v;
    S.car.startDate = d;
    persist();
    render();
    toast('Hucha creada');
  },
  savsetup: () => {
    const v = parseAmount($('#sav-start').value), d = $('#sav-date').value;
    if (!(v >= 0)) return toast('Escribe lo que tienes ahorrado (puede ser 0)');
    if (!d) return toast('Elige una fecha');
    S.savings.start = v;
    S.savings.startDate = d;
    persist();
    render();
    toast('Cuenta de ahorros creada');
  },
  monthmode: el => {
    S.settings.monthMode = el.dataset.v;
    persist();
    ui.month = ui.carMonth = ui.savMonth = curMonth();
    render();
    toast(el.dataset.v === 'nomina' ? 'Meses según nómina' : 'Meses de calendario');
  },
  export: exportBackup,
  import: importBackup,
};

function movePeriod(d) {
  if (ui.tab === 'mes') { ui.month = shiftMonth(ui.month, d); ui.filterCat = null; }
  else if (ui.tab === 'anio') ui.year += d;
  else if (ui.tab === 'coche') ui.carMonth = shiftMonth(ui.carMonth, d);
  else if (ui.tab === 'ahorros') ui.savMonth = shiftMonth(ui.savMonth, d);
  render();
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.dataset.act !== 'tip') hideTip();
  if (el && ACTIONS[el.dataset.act]) ACTIONS[el.dataset.act](el, e);
});

document.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.budget) {
    const id = el.dataset.budget;
    if (el.value.trim() === '') delete S.budgets[id];
    else {
      const v = parseAmount(el.value);
      if (!(v > 0)) return toast('Cantidad no válida');
      S.budgets[id] = v;
      el.value = amountText(v);
    }
    persist();
    toast('Presupuesto guardado');
  } else if (el.hasAttribute('data-carstart')) {
    const v = parseAmount(el.value);
    if (!(v >= 0)) return toast('Cantidad no válida');
    S.car.start = v;
    persist();
    toast('Saldo inicial guardado');
  } else if (el.hasAttribute('data-carstartdate') && el.value) {
    S.car.startDate = el.value;
    persist();
    toast('Fecha guardada');
  } else if (el.hasAttribute('data-cutoff')) {
    const v = Number(el.value);
    if (!(v >= 1 && v <= 31 && Number.isInteger(v))) return toast('Pon un día del 1 al 31');
    S.settings.payCutoff = v;
    persist();
    ui.month = ui.carMonth = ui.savMonth = curMonth();
    render();
    toast('Guardado');
  } else if (el.hasAttribute('data-savstart')) {
    const v = parseAmount(el.value);
    if (!(v >= 0)) return toast('Cantidad no válida');
    S.savings.start = v;
    persist();
    toast('Saldo inicial guardado');
  } else if (el.hasAttribute('data-savstartdate') && el.value) {
    S.savings.startDate = el.value;
    persist();
    toast('Fecha guardada');
  }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && ui.form && e.target.tagName === 'INPUT') { e.preventDefault(); saveForm(); }
});

/** Botón atrás de Android: cierra lo que haya abierto antes de salir. */
window.handleBack = () => {
  if (tipTarget) return hideTip();
  if (ui.form) return closeSheet();
  if (ui.tab !== 'mes') { ui.tab = 'mes'; return render(); }
  if (window.Android) Android.exit();
};

/* =====================================================================
   Versión web (iPhone)
   ===================================================================== */

const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
/** En Safari sin instalar, iOS puede borrar los datos tras unos días sin uso; instalada no. */
function needsInstall() { return !window.Android && isIOS && !isStandalone; }

if (!window.Android && /^https?:$/.test(location.protocol)) {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
}

render();
