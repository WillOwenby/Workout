'use strict';

/* =========================================================================
   LiftLog: workout, bodyweight and diet tracker.
   All data lives in this browser's localStorage. Use Plan → Data to back up.
   ========================================================================= */

const STORE_KEY = 'liftlog.v1';

// ---------- helpers ----------
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
const dayNum = (s) => Math.round(parseYmd(s).getTime() / 86400000);
const fmtDate = (s, o = { weekday: 'short', month: 'short', day: 'numeric' }) => parseYmd(s).toLocaleDateString(undefined, o);
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
const r1 = (n) => Math.round(n * 10) / 10;
const clone = (o) => JSON.parse(JSON.stringify(o));
const sum = (a) => a.reduce((x, y) => x + y, 0);
const fmtNum = (n) => (n == null ? '–' : (Math.round(n * 10) / 10).toLocaleString());
const mondayOf = (s) => { const d = parseYmd(s); const off = (d.getDay() + 6) % 7; d.setDate(d.getDate() - off); return ymd(d); };
const fmtClock = (sec) => { sec = Math.max(0, Math.round(sec)); const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60; return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`; };
const e1rm = (w, r) => (w > 0 && r > 0 ? w * (1 + Math.min(r, 15) / 30) : 0);
const today = () => ymd();

// ---------- template data (from the 4-day tracker doc) ----------
function ex(name, muscle, sets, repMin, repMax, o = {}) {
  return { id: uid(), name, muscle, sets, setsText: o.setsText || '', repMin, repMax, type: o.type || 'reps', compound: !!o.compound, perSide: !!o.perSide };
}
const DEFAULT_PROGRAM = () => [
  { id: 'push', name: 'Push', focus: 'Chest • shoulders • triceps', exercises: [
    ex('Machine or barbell bench press', 'Chest', 3, 8, 12, { compound: true }),
    ex('Incline dumbbell press', 'Upper chest', 3, 8, 12, { compound: true }),
    ex('Seated chest press or cable fly', 'Choose one', 3, 10, 15, { setsText: '2–3' }),
    ex('Seated shoulder press', 'Shoulders', 3, 8, 12, { compound: true }),
    ex('Dumbbell lateral raise', 'Side delts', 3, 12, 15),
    ex('Cable triceps pushdown', 'Triceps', 3, 10, 15),
    ex('Overhead cable triceps extension', 'Triceps', 2, 10, 15),
  ] },
  { id: 'pull', name: 'Pull', focus: 'Back • rear delts • biceps', exercises: [
    ex('Lat pulldown or assisted pull-up', 'Vertical pull', 3, 8, 12, { compound: true }),
    ex('Chest-supported row', 'Upper/mid back', 3, 8, 12, { compound: true }),
    ex('Seated cable row', 'Controlled reps', 3, 10, 12, { setsText: '2–3' }),
    ex('Reverse pec deck or cable rear-delt fly', 'Rear delts', 3, 12, 15),
    ex('EZ-bar or dumbbell curl', 'Biceps', 3, 8, 12),
    ex('Hammer curl', 'Biceps/forearms', 3, 10, 15, { setsText: '2–3' }),
  ] },
  { id: 'legs', name: 'Legs + Core', focus: 'Quads • hamstrings • glutes • calves • abs', exercises: [
    ex('Leg press or squat variation', 'Quads/glutes', 3, 8, 12, { compound: true }),
    ex('Romanian deadlift (DB or barbell)', 'Hamstrings/glutes', 3, 8, 12, { compound: true }),
    ex('Seated or lying leg curl', 'Hamstrings', 3, 10, 15),
    ex('Leg extension', 'Quads', 3, 10, 15, { setsText: '2–3' }),
    ex('Walking lunge or split squat', 'Optional if time', 2, 8, 10, { perSide: true }),
    ex('Standing or seated calf raise', 'Calves', 3, 12, 20),
    ex('Plank', 'Core', 3, 30, 60, { type: 'time' }),
    ex('Cable crunch or dead bug', 'Core', 3, 10, 15, { setsText: '2–3' }),
  ] },
  { id: 'bonus', name: 'Bonus', focus: 'Extra upper body • arms • optional cardio', exercises: [
    ex('Incline dumbbell press or machine chest press', 'Moderate effort', 3, 10, 12),
    ex('Cable row or machine row', 'Controlled reps', 3, 10, 12),
    ex('Cable or dumbbell lateral raise', 'Shoulders', 3, 12, 15),
    ex('Preacher curl or cable curl', 'Biceps', 3, 10, 15),
    ex('Rope triceps pushdown', 'Triceps', 3, 10, 15),
    ex('Optional cardio', 'Easy/moderate pace', 1, 10, 20, { type: 'cardio' }),
  ] },
];

const SCHEDULE = [
  ['Day 1', 'Push', 'Chest, shoulders, triceps'],
  ['Day 2', 'Pull', 'Back, rear delts, biceps'],
  ['Day 3', 'Rest / light activity', 'Walking or easy cardio'],
  ['Day 4', 'Legs + core', 'Quads, hamstrings, glutes, calves, abs'],
  ['Day 5', 'Optional bonus', 'Extra upper body, arms, core, or moderate cardio'],
  ['Days 6–7', 'Rest / flexible', 'Move days around to fit your week; avoid stacking hard sessions if recovery suffers'],
];
const HOW_TO = [
  'Use the next 4 weeks as a starting cycle. Every session is saved, so you can compare loads and reps week to week.',
  'Choose a weight that lets you finish the target reps with controlled form, usually leaving about 1–3 good reps in reserve.',
  'When you can reach the top of the rep range on all working sets with good form, increase the load by the smallest practical amount next time.',
  'Rest about 2–3 minutes after demanding compound lifts and 60–120 seconds after smaller isolation exercises.',
  'Machines vary between gyms. Record the machine name or setup if needed; compare your numbers on the same equipment.',
  'Stop or change an exercise if you feel sharp pain. Ask gym staff to show you unfamiliar equipment and setup.',
  'Warm up for 5–8 minutes and do lighter warm-up sets before your first heavy movement. Log only the working sets.',
];
const WEEK_NOTES = [
  'Week 1: learn the equipment and find comfortable working weights.',
  'Week 2: aim for a rep or two more where possible.',
  'Week 3: add a small amount of weight only when reps and form are solid.',
  'Week 4: continue progressing if recovered; otherwise keep loads steady or use a lighter week.',
];
const SWAPS = [
  ['Bench press', 'Chest press machine or dumbbell bench press', ['bench']],
  ['Incline press', 'Incline chest press machine', ['incline']],
  ['Lat pulldown', 'Assisted pull-up machine', ['pulldown', 'pull-up']],
  ['Chest-supported row', 'Seated cable row or machine row', ['row']],
  ['Squat / leg press', 'Goblet squat or hack squat machine', ['squat', 'leg press']],
  ['Romanian deadlift', 'Dumbbell RDL or cable pull-through', ['deadlift', 'rdl']],
  ['Leg curl', 'Different seated/lying leg curl machine', ['leg curl']],
  ['Triceps pushdown', 'Overhead cable extension', ['pushdown', 'triceps']],
];
const NEXT_TIME = ['Keep weights', 'Add reps', 'Increase weight', 'Adjust exercise'];
const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];
const DAY_ORDER = ['push', 'pull', 'legs', 'bonus'];

// ---------- state ----------
function defaultState() {
  return {
    version: 1,
    settings: {
      unit: 'lb', increment: 5, restCompound: 150, restIsolation: 90,
      calGoal: 2200, proteinGoal: 180, carbGoal: 200, fatGoal: 70, waterGoal: 8,
      goalWeight: '', programStart: mondayOf(today()), autoRest: true,
    },
    goalNotes: '',
    program: DEFAULT_PROGRAM(),
    workouts: [],
    active: null,
    body: {},   // 'YYYY-MM-DD' -> { weight, waist, bf }
    diet: {},   // 'YYYY-MM-DD' -> { entries: [], water: 0 }
    setup: {},  // exercise name (lowercase) -> { setting, notes }
  };
}
function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return defaultState();
    const s = JSON.parse(raw);
    const d = defaultState();
    return { ...d, ...s, settings: { ...d.settings, ...(s.settings || {}) } };
  } catch (e) {
    return defaultState();
  }
}
let S = load();
let storageOk = true;
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); storageOk = true; }
  catch (e) { if (storageOk) toast('Could not save. Storage may be full or blocked.'); storageOk = false; }
}

const ui = {
  tab: 'today',
  dietDate: today(),
  bodyDate: today(),
  meal: 'Breakfast',
  calMonth: today().slice(0, 7),
  calSel: today(),
  progEx: '',
  bodyRange: 90,
  planDay: 'push',
  editPlan: false,
  openWorkout: null,
  addExOpen: false,
};
let rest = null; // { end, total, name }

// ---------- domain logic ----------
const unit = () => S.settings.unit;
const dayById = (id) => S.program.find((d) => d.id === id);
const keyOf = (name) => String(name || '').trim().toLowerCase();
const finished = () => S.workouts.slice().sort((a, b) => (b.date + (b.finishedAt || 0)).localeCompare(a.date + (a.finishedAt || 0)));

function targetText(e) {
  if (e.type === 'cardio') return `${e.repMin}–${e.repMax} min`;
  const sets = e.setsText || e.sets;
  const reps = e.repMin === e.repMax ? `${e.repMin}` : `${e.repMin}–${e.repMax}`;
  return `${sets} × ${reps}${e.type === 'time' ? ' sec' : ''}${e.perSide ? '/leg' : ''}`;
}
function colLabels(e) {
  if (e.type === 'time') return [`${unit()} (opt)`, 'sec'];
  if (e.type === 'cardio') return ['min', 'level'];
  return [unit(), 'reps'];
}

function cycleInfo(dateStr = today()) {
  const start = S.settings.programStart || mondayOf(today());
  const diff = dayNum(dateStr) - dayNum(start);
  if (diff < 0) return { cycle: 1, week: 1, before: true };
  return { cycle: Math.floor(diff / 28) + 1, week: (Math.floor(diff / 7) % 4) + 1 };
}

function recommendedDay() {
  const last = finished()[0];
  if (!last) return DAY_ORDER.find((id) => dayById(id)) || S.program[0]?.id;
  const ids = S.program.map((d) => d.id);
  const i = ids.indexOf(last.dayId);
  return ids[(i + 1) % ids.length] || ids[0];
}

/** Most recent logged performance of an exercise (by name), before the given workout. */
function lastPerformance(name, excludeId, beforeDate) {
  const k = keyOf(name);
  for (const w of finished()) {
    if (w.id === excludeId) continue;
    if (beforeDate && w.date > beforeDate) continue;
    const e = w.exercises.find((x) => keyOf(x.name) === k);
    if (e) {
      const sets = e.sets.filter((s) => s.done && (num(s.w) != null || num(s.r) != null));
      if (sets.length) return { date: w.date, sets, e };
    }
  }
  return null;
}

/** Gravl-style progression suggestion based on the template's double-progression rule. */
function suggestion(e, prev) {
  if (!prev) return { text: 'First time: pick a weight that leaves 1–3 reps in reserve.', perSet: [] };
  const sets = prev.sets;
  const ws = sets.map((s) => num(s.w));
  const rs = sets.map((s) => num(s.r));
  const lastStr = sets.map((s) => fmtSet(s, e)).join(', ');
  const when = fmtDate(prev.date, { month: 'short', day: 'numeric' });
  if (e.type === 'cardio') return { text: `Last (${when}): ${lastStr}`, perSet: sets.map((s) => ({ w: s.w, r: s.r })) };
  const enoughSets = sets.length >= Math.min(e.sets, 2);
  const allTop = enoughSets && rs.every((r) => r != null && r >= e.repMax);
  const topW = Math.max(0, ...ws.filter((w) => w != null));
  if (e.type === 'time') {
    if (allTop) return { good: true, text: `Last (${when}): ${lastStr}. Hit ${e.repMax}s on every set — add load or a harder variation.`, perSet: sets.map((s) => ({ w: s.w, r: e.repMax })) };
    return { text: `Last (${when}): ${lastStr}. Try holding a few seconds longer.`, perSet: sets.map((s) => ({ w: s.w, r: Math.min(e.repMax, (num(s.r) || e.repMin) + 5) })) };
  }
  if (allTop && topW > 0) {
    const next = r1(topW + Number(S.settings.increment || 5));
    return { good: true, text: `Last (${when}): ${lastStr}. Top of range on all sets — go up to ${next} ${unit()}.`, perSet: Array.from({ length: e.sets }, () => ({ w: next, r: e.repMin })) };
  }
  return {
    text: `Last (${when}): ${lastStr}. Same weight — aim for +1 rep per set.`,
    perSet: sets.map((s) => ({ w: s.w, r: Math.min(e.repMax, (num(s.r) || e.repMin - 1) + 1) })),
  };
}
function fmtSet(s, e) {
  const w = num(s.w), r = num(s.r);
  if (e.type === 'cardio') return `${r1(w || 0)} min${r != null ? ` @ L${r}` : ''}`;
  if (e.type === 'time') return `${w ? `${w}${unit()} ` : ''}${r ?? '–'}s`;
  return `${w ?? 'BW'}×${r ?? '–'}`;
}

function newWorkoutFromDay(dayId) {
  const d = dayById(dayId);
  const w = {
    id: uid(), dayId: d.id, name: d.name, date: today(), startedAt: Date.now(),
    exercises: d.exercises.map((e) => logExercise(e)),
    notes: '', nextTime: [], effort: null, pain: '', bodyweight: S.body[today()]?.weight ?? '',
  };
  return w;
}
function logExercise(e) {
  return {
    uid: uid(), name: e.name, muscle: e.muscle, sets: Array.from({ length: e.sets }, () => ({ w: '', r: '', done: false })),
    targetSets: e.sets, setsText: e.setsText, repMin: e.repMin, repMax: e.repMax, type: e.type, compound: e.compound, perSide: e.perSide,
  };
}
const asTemplate = (le) => ({ ...le, sets: le.targetSets });

function workoutStats(w) {
  let sets = 0, volume = 0;
  for (const e of w.exercises) for (const s of e.sets) {
    if (!s.done) continue;
    sets++;
    if (e.type === 'reps') volume += (num(s.w) || 0) * (num(s.r) || 0);
  }
  const dur = w.durationMin ?? (w.finishedAt && w.startedAt ? Math.round((w.finishedAt - w.startedAt) / 60000) : null);
  return { sets, volume, dur };
}

function bestE1rm(name, excludeId) {
  let best = 0;
  for (const w of S.workouts) {
    if (w.id === excludeId) continue;
    const e = w.exercises.find((x) => keyOf(x.name) === keyOf(name));
    if (!e || e.type !== 'reps') continue;
    for (const s of e.sets) if (s.done) best = Math.max(best, e1rm(num(s.w), num(s.r)));
  }
  return best;
}

function dietDay(date) {
  if (!S.diet[date]) S.diet[date] = { entries: [], water: 0 };
  return S.diet[date];
}
function dietTotals(date) {
  const d = S.diet[date];
  const es = d ? d.entries : [];
  return {
    cal: sum(es.map((e) => (num(e.cal) || 0) * (num(e.qty) || 1))),
    p: sum(es.map((e) => (num(e.p) || 0) * (num(e.qty) || 1))),
    c: sum(es.map((e) => (num(e.c) || 0) * (num(e.qty) || 1))),
    f: sum(es.map((e) => (num(e.f) || 0) * (num(e.qty) || 1))),
    water: d ? d.water || 0 : 0,
    count: es.length,
  };
}
function recentFoods() {
  const seen = new Map();
  const dates = Object.keys(S.diet).sort().reverse();
  for (const dt of dates) for (const e of S.diet[dt].entries.slice().reverse()) {
    const k = keyOf(e.name);
    if (k && !seen.has(k)) seen.set(k, e);
    if (seen.size >= 24) break;
  }
  return [...seen.values()];
}

function weightSeries() {
  return Object.keys(S.body).filter((d) => num(S.body[d].weight) != null).sort().map((d) => [d, num(S.body[d].weight)]);
}
function avgWeight(series, endDate, days = 7) {
  const lo = dayNum(endDate) - days + 1, hi = dayNum(endDate);
  const xs = series.filter(([d]) => dayNum(d) >= lo && dayNum(d) <= hi).map(([, v]) => v);
  return xs.length ? sum(xs) / xs.length : null;
}

// ---------- UI primitives ----------
const ICON_CHECK = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
function bar(value, goal, color) {
  const pct = goal > 0 ? Math.min(100, (value / goal) * 100) : 0;
  return `<div class="bar ${goal > 0 && value > goal * 1.05 ? 'over' : ''}"><i style="width:${pct}%;--c:${color}"></i></div>`;
}
function macroRow(label, v, goal, color, suffix = 'g') {
  return `<div class="macro"><div class="row between"><span>${label}</span><span class="num muted">${Math.round(v)} / ${goal || '–'}${suffix}</span></div>${bar(v, goal, color)}</div>`;
}
function ring(value, goal) {
  const r = 50, C = 2 * Math.PI * r;
  const pct = goal > 0 ? Math.min(1, value / goal) : 0;
  const left = Math.round(goal - value);
  const over = left < 0;
  return `<div class="ring"><svg viewBox="0 0 116 116"><circle cx="58" cy="58" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="10"/>
    <circle cx="58" cy="58" r="${r}" fill="none" stroke="${over ? 'var(--bad)' : 'var(--accent)'}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${C * pct} ${C}"/></svg>
    <div class="c"><div><b>${Math.abs(left).toLocaleString()}</b><div class="tiny muted">${over ? 'kcal over' : 'kcal left'}</div></div></div></div>`;
}
function field(label, inner) { return `<label class="field"><span>${label}</span>${inner}</label>`; }
function dayTag(id, name) { return `<span class="tag d-${esc(id)}">${esc(name || dayById(id)?.name || id)}</span>`; }

/** Small dependency-free SVG line chart. series: [{ pts: [[dayNumber, y]], cls }] */
function lineChart(series, { goal = null, fmtY = (v) => fmtNum(v), height = 180 } = {}) {
  const all = series.flatMap((s) => s.pts);
  if (all.length < 2) return '<div class="empty">Log at least two entries to see a chart.</div>';
  const W = 340, H = height, L = 38, R = 10, T = 10, B = 22;
  let x0 = Math.min(...all.map((p) => p[0])), x1 = Math.max(...all.map((p) => p[0]));
  if (x0 === x1) x1 = x0 + 1;
  const ys = all.map((p) => p[1]).concat(goal != null ? [goal] : []);
  let y0 = Math.min(...ys), y1 = Math.max(...ys);
  const padY = Math.max((y1 - y0) * 0.12, 1);
  y0 -= padY; y1 += padY;
  const sx = (x) => L + ((x - x0) / (x1 - x0)) * (W - L - R);
  const sy = (y) => T + (1 - (y - y0) / (y1 - y0)) * (H - T - B);
  let g = '';
  for (let i = 0; i <= 3; i++) {
    const v = y0 + ((y1 - y0) * i) / 3, y = sy(v);
    g += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y}" y2="${y}"/><text x="${L - 6}" y="${y + 3}" text-anchor="end">${fmtY(v)}</text>`;
  }
  const dlab = (n) => new Date(n * 86400000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  g += `<text x="${L}" y="${H - 6}">${dlab(x0)}</text><text x="${W - R}" y="${H - 6}" text-anchor="end">${dlab(x1)}</text>`;
  if (goal != null) g += `<line class="goal" x1="${L}" x2="${W - R}" y1="${sy(goal)}" y2="${sy(goal)}"/>`;
  for (const s of series) {
    if (s.pts.length < 1) continue;
    const d = s.pts.map((p, i) => `${i ? 'L' : 'M'}${sx(p[0]).toFixed(1)},${sy(p[1]).toFixed(1)}`).join('');
    if (s.area) g += `<path class="area" d="${d}L${sx(s.pts.at(-1)[0])},${H - B}L${sx(s.pts[0][0])},${H - B}Z"/>`;
    g += `<path class="${s.cls}" d="${d}"/>`;
    if (s.dots && s.pts.length <= 60) g += s.pts.map((p) => `<circle class="pt" cx="${sx(p[0])}" cy="${sy(p[1])}" r="2.6"/>`).join('');
  }
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">${g}</svg>`;
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add('hidden'), 2600);
}

// ---------- views ----------
const TITLES = { today: 'Today', train: 'Train', diet: 'Diet', body: 'Body', history: 'Progress', plan: 'Plan & settings' };

function viewToday() {
  const t = today();
  const ci = cycleInfo(t);
  const rec = recommendedDay();
  const recDay = dayById(rec);
  const totals = dietTotals(t);
  const st = S.settings;
  const ws = weightSeries();
  const todayW = S.body[t]?.weight ?? '';
  const avg7 = avgWeight(ws, t), avgPrev = avgWeight(ws, addDays(t, -7));
  const mon = mondayOf(t);
  const week = Array.from({ length: 7 }, (_, i) => addDays(mon, i));
  const byDate = {};
  for (const w of S.workouts) (byDate[w.date] ||= []).push(w);
  const weekCount = week.reduce((n, d) => n + (byDate[d]?.length || 0), 0);
  const doneToday = byDate[t] || [];

  let hero;
  if (S.active) {
    hero = `<div class="card hero d-${esc(S.active.dayId)}">
      <div class="row between"><span class="tag d-${esc(S.active.dayId)}">In progress</span><span class="small muted">${fmtClock((Date.now() - S.active.startedAt) / 1000)}</span></div>
      <div class="big">${esc(S.active.name)} day</div>
      <button class="btn primary block" data-a="tab" data-tab="train">Resume workout</button></div>`;
  } else if (recDay) {
    hero = `<div class="card hero d-${esc(rec)}">
      <div class="row between">${dayTag(rec, 'Up next')}<span class="small muted">Cycle ${ci.cycle} · Week ${ci.week} of 4</span></div>
      <div class="big">${esc(recDay.name)} day</div>
      <div class="small muted">${esc(recDay.focus)} · ${recDay.exercises.length} exercises</div>
      ${doneToday.length ? `<div class="small" style="margin-top:6px">✓ Already trained today: ${[...new Set(doneToday.map((w) => w.name))].map(esc).join(', ')}</div>` : ''}
      <div class="row" style="margin-top:12px"><button class="btn primary grow" data-a="start" data-day="${esc(rec)}">Start ${esc(recDay.name)}</button>
      <button class="btn" data-a="tab" data-tab="train">Other day</button></div></div>`;
  }

  return `
  ${hero}
  <div class="card">
    <div class="row between"><h2>This week</h2><span class="small muted">${weekCount} workout${weekCount === 1 ? '' : 's'}</span></div>
    <div class="week-dots">${week.map((d) => {
      const w = byDate[d]?.[0];
      return `<div class="${d === t ? 'today' : ''}"><div class="d">${fmtDate(d, { weekday: 'narrow' })}</div>
        <div class="dot ${w ? `done d-${esc(w.dayId)}` : ''}">${w ? esc((w.name || '?')[0]) : ''}</div></div>`;
    }).join('')}</div>
    <p class="small muted" style="margin:10px 0 0">${esc(WEEK_NOTES[ci.week - 1])}</p>
  </div>

  <div class="card">
    <div class="row between"><h2>Bodyweight</h2><button class="btn sm ghost" data-a="tab" data-tab="body">Trend ›</button></div>
    <div class="row">
      <input type="number" inputmode="decimal" step="0.1" placeholder="Today's weight (${unit()})" id="quick-weight" value="${esc(todayW)}" class="grow">
      <button class="btn primary" data-a="quick-weight">Save</button>
    </div>
    <div class="grid3" style="margin-top:10px">
      <div class="stat"><div class="v">${fmtNum(avg7)}</div><div class="l">7-day avg</div></div>
      <div class="stat"><div class="v ${avg7 != null && avgPrev != null ? (avg7 > avgPrev ? 'up' : 'down') : ''}">${avg7 != null && avgPrev != null ? (avg7 - avgPrev > 0 ? '+' : '') + r1(avg7 - avgPrev) : '–'}</div><div class="l">vs last week</div></div>
      <div class="stat"><div class="v">${num(st.goalWeight) != null && avg7 != null ? r1(Math.abs(avg7 - num(st.goalWeight))) : '–'}</div><div class="l">to goal</div></div>
    </div>
  </div>

  <div class="card">
    <div class="row between"><h2>Nutrition</h2><button class="btn sm ghost" data-a="tab" data-tab="diet">Log food ›</button></div>
    <div class="row" style="gap:16px;align-items:center">
      ${ring(totals.cal, st.calGoal)}
      <div class="grow">
        ${macroRow('Protein', totals.p, st.proteinGoal, 'var(--protein)')}
        ${macroRow('Carbs', totals.c, st.carbGoal, 'var(--carbs)')}
        ${macroRow('Fat', totals.f, st.fatGoal, 'var(--fat)')}
      </div>
    </div>
    <hr>
    <div class="row between"><span>Water <span class="muted small">${totals.water} / ${st.waterGoal} glasses</span></span>
      <span class="row"><button class="icon-btn" data-a="water" data-d="${t}" data-n="-1" aria-label="Less water">−</button><button class="icon-btn" data-a="water" data-d="${t}" data-n="1" aria-label="More water">+</button></span></div>
  </div>

  <div class="grid3">
    <div class="stat"><div class="v">${S.workouts.length}</div><div class="l">workouts</div></div>
    <div class="stat"><div class="v">${weekStreak()}</div><div class="l">week streak</div></div>
    <div class="stat"><div class="v">${Object.keys(S.diet).filter((d) => S.diet[d].entries.length).length}</div><div class="l">days logged</div></div>
  </div>`;
}

function weekStreak() {
  const weeks = new Set(S.workouts.map((w) => mondayOf(w.date)));
  let m = mondayOf(today()), n = 0;
  if (!weeks.has(m)) m = addDays(m, -7); // current week still in progress
  while (weeks.has(m)) { n++; m = addDays(m, -7); }
  return n;
}

function viewTrainPicker() {
  const rec = recommendedDay();
  const ci = cycleInfo();
  return `
  <p class="muted small" style="margin:0 0 12px">Cycle ${ci.cycle} · Week ${ci.week} of 4 — ${esc(WEEK_NOTES[ci.week - 1])}</p>
  ${S.program.map((d) => {
    const last = finished().find((w) => w.dayId === d.id);
    return `<div class="card day-card d-${esc(d.id)}">
      <div class="row between"><div>${dayTag(d.id, d.name)} ${d.id === rec ? '<span class="tag">Recommended</span>' : ''}</div>
        <span class="tiny muted">${last ? 'Last: ' + fmtDate(last.date) : 'Not done yet'}</span></div>
      <div class="small muted" style="margin:6px 0 8px">${esc(d.focus)}</div>
      <ul class="tight small">${d.exercises.map((e) => `<li>${esc(e.name)} <span class="muted">— ${targetText(e)}</span></li>`).join('')}</ul>
      <button class="btn ${d.id === rec ? 'primary' : ''} block" style="margin-top:12px" data-a="start" data-day="${esc(d.id)}">Start ${esc(d.name)}</button>
    </div>`;
  }).join('')}
  <div class="card"><h3>Rest / light activity day?</h3><p class="small muted" style="margin:0">Walking or easy cardio. Log your weight and food as usual.</p></div>
  <button class="btn block" data-a="tab" data-tab="plan">Edit exercises & targets</button>`;
}

function viewLogger() {
  const w = S.active;
  const allNames = [...new Set(S.program.flatMap((d) => d.exercises.map((e) => e.name)))];
  return `
  <div class="card hero d-${esc(w.dayId)}">
    <div class="row between">${dayTag(w.dayId, w.name)}<span class="num" id="elapsed">${fmtClock((Date.now() - w.startedAt) / 1000)}</span></div>
    <div class="grid2" style="margin-top:10px">
      ${field('Date', `<input type="date" data-in="active" data-f="date" value="${esc(w.date)}">`)}
      ${field(`Bodyweight (${unit()})`, `<input type="number" inputmode="decimal" step="0.1" data-in="active" data-f="bodyweight" value="${esc(w.bodyweight)}" placeholder="optional">`)}
    </div>
    <p class="tiny muted" style="margin:10px 0 0">Warm up 5–8 min and do lighter warm-up sets first. Log working sets. Tap ✓ to complete a set — empty boxes fill from the suggestion.</p>
  </div>

  ${w.exercises.map((e, i) => exerciseCard(w, e, i)).join('')}

  <div class="card">
    ${ui.addExOpen ? `
      <h3>Add exercise</h3>
      <div class="stack">
        <select id="add-ex-select"><option value="">Choose from your plan…</option>${allNames.map((n) => `<option>${esc(n)}</option>`).join('')}</select>
        <input id="add-ex-custom" placeholder="…or type a custom exercise name">
        <div class="row"><button class="btn primary grow" data-a="add-ex">Add</button><button class="btn" data-a="toggle-add-ex">Cancel</button></div>
      </div>` : `<button class="btn block" data-a="toggle-add-ex">+ Add exercise</button>`}
  </div>

  <div class="card stack">
    <h2>Session wrap-up</h2>
    ${field('Session notes', `<textarea data-in="active" data-f="notes" placeholder="How did it go?">${esc(w.notes)}</textarea>`)}
    <div><div class="small muted" style="margin-bottom:6px">Next time</div>
      <div class="chips">${NEXT_TIME.map((n) => `<button class="chip ${w.nextTime.includes(n) ? 'on' : ''}" data-a="next-time" data-v="${esc(n)}">${esc(n)}</button>`).join('')}</div></div>
    <div><div class="small muted" style="margin-bottom:6px">Effort / energy (1–5)</div>
      <div class="effort">${[1, 2, 3, 4, 5].map((n) => `<button class="${w.effort === n ? 'on' : ''}" data-a="effort" data-v="${n}">${n}</button>`).join('')}</div></div>
    ${field('Pain or form notes', `<input data-in="active" data-f="pain" value="${esc(w.pain)}" placeholder="Anything to watch">`)}
    <button class="btn primary block" data-a="finish">Finish workout</button>
    <button class="btn danger block ghost" data-a="discard">${w.editing ? 'Cancel edit' : 'Discard workout'}</button>
  </div>`;
}

function exerciseCard(w, e, i) {
  const prev = lastPerformance(e.name, w.id, w.date);
  const sug = suggestion(asTemplate(e), prev);
  const [wl, rl] = colLabels(e);
  const setup = S.setup[keyOf(e.name)] || {};
  const swaps = SWAPS.filter((s) => s[2].some((k) => keyOf(e.name).includes(k)));
  const best = e.type === 'reps' ? bestE1rm(e.name, w.id) : 0;
  return `<div class="card ex-card">
    <div class="ex-head">
      <div class="grow">
        <div class="ex-name">${esc(e.name)}</div>
        <div class="ex-meta">${esc(e.muscle || '')}${e.muscle ? ' · ' : ''}Target ${targetText(asTemplate(e))}${e.compound ? ' · rest 2–3 min' : ''}${best ? ` · e1RM best ${Math.round(best)}` : ''}</div>
      </div>
      <button class="icon-btn" data-a="ex-up" data-i="${i}" aria-label="Move up" ${i === 0 ? 'disabled' : ''}>↑</button>
      <button class="icon-btn" data-a="ex-menu" data-i="${i}" aria-label="More">⋯</button>
    </div>
    <div id="exmenu-${i}" class="hidden" style="margin-top:10px">
      <div class="chips">
        ${swaps.map((s) => `<button class="chip" data-a="swap" data-i="${i}" data-v="${esc(s[1])}">Swap → ${esc(s[1])}</button>`).join('')}
        <button class="chip" data-a="swap-custom" data-i="${i}">Rename / custom swap…</button>
        <button class="chip" data-a="ex-remove" data-i="${i}">Remove exercise</button>
      </div>
    </div>
    <div class="hint ${sug.good ? 'good' : ''}">${esc(sug.text)}</div>
    <input class="small" data-in="setup" data-name="${esc(e.name)}" value="${esc(setup.setting || '')}" placeholder="Machine / setup (seat, pin, grip…)" style="min-height:34px">
    <table class="sets">
      <thead><tr><th>Set</th><th>Prev</th><th>${esc(wl)}</th><th>${esc(rl)}</th><th></th></tr></thead>
      <tbody>${e.sets.map((s, j) => {
        const ph = sug.perSet[j] || sug.perSet.at(-1) || {};
        const p = prev?.sets[j];
        return `<tr class="${s.done ? 'done' : ''}">
          <td class="n">${j + 1}</td>
          <td class="prev">${p ? esc(fmtSet(p, e)) : '—'}</td>
          <td><input type="number" inputmode="decimal" step="any" data-in="set" data-i="${i}" data-j="${j}" data-f="w" value="${esc(s.w)}" placeholder="${esc(ph.w ?? '')}"></td>
          <td><input type="number" inputmode="numeric" step="any" data-in="set" data-i="${i}" data-j="${j}" data-f="r" value="${esc(s.r)}" placeholder="${esc(ph.r ?? '')}"></td>
          <td class="chk"><button class="check" data-a="set-done" data-i="${i}" data-j="${j}" aria-label="Complete set">${ICON_CHECK}</button></td>
        </tr>`;
      }).join('')}</tbody>
    </table>
    <div class="row"><button class="btn sm grow" data-a="set-add" data-i="${i}">+ Add set</button><button class="btn sm grow" data-a="set-remove" data-i="${i}" ${e.sets.length <= 1 ? 'disabled' : ''}>− Remove set</button></div>
  </div>`;
}

function viewDiet() {
  const d = ui.dietDate;
  const day = S.diet[d] || { entries: [], water: 0 };
  const t = dietTotals(d);
  const st = S.settings;
  const recents = recentFoods();
  const isToday = d === today();
  return `
  <div class="card row between">
    <button class="icon-btn" data-a="diet-date" data-n="-1" aria-label="Previous day">‹</button>
    <div style="text-align:center"><b>${isToday ? 'Today' : fmtDate(d)}</b><div class="tiny muted">${isToday ? fmtDate(d) : `<button class="btn sm ghost" data-a="diet-today">Jump to today</button>`}</div></div>
    <button class="icon-btn" data-a="diet-date" data-n="1" aria-label="Next day">›</button>
  </div>

  <div class="card">
    <div class="row" style="gap:16px;align-items:center">
      ${ring(t.cal, st.calGoal)}
      <div class="grow">
        <div class="small muted" style="margin-bottom:6px">${Math.round(t.cal).toLocaleString()} eaten · goal ${Number(st.calGoal).toLocaleString()}</div>
        ${macroRow('Protein', t.p, st.proteinGoal, 'var(--protein)')}
        ${macroRow('Carbs', t.c, st.carbGoal, 'var(--carbs)')}
        ${macroRow('Fat', t.f, st.fatGoal, 'var(--fat)')}
      </div>
    </div>
  </div>

  <div class="card stack">
    <h2>Add food</h2>
    <div class="seg">${MEALS.map((m) => `<button class="${ui.meal === m ? 'on' : ''}" data-a="meal" data-v="${m}">${m}</button>`).join('')}</div>
    <input id="food-name" placeholder="Food (e.g. Greek yogurt, 1 cup)" autocomplete="off" list="food-list">
    <datalist id="food-list">${recents.map((f) => `<option value="${esc(f.name)}">`).join('')}</datalist>
    <div class="grid2">
      ${field('Calories', '<input id="food-cal" type="number" inputmode="decimal" placeholder="kcal">')}
      ${field('Servings', '<input id="food-qty" type="number" inputmode="decimal" step="0.25" value="1">')}
    </div>
    <div class="grid3">
      ${field('Protein g', '<input id="food-p" type="number" inputmode="decimal">')}
      ${field('Carbs g', '<input id="food-c" type="number" inputmode="decimal">')}
      ${field('Fat g', '<input id="food-f" type="number" inputmode="decimal">')}
    </div>
    <button class="btn primary block" data-a="food-add">Add to ${esc(ui.meal)}</button>
    ${recents.length ? `<div><div class="small muted" style="margin-bottom:6px">Quick add to ${esc(ui.meal)}</div>
      <div class="chips">${recents.slice(0, 12).map((f, k) => `<button class="chip" data-a="food-quick" data-k="${k}">${esc(f.name)} · ${Math.round(num(f.cal) || 0)}</button>`).join('')}</div></div>` : ''}
  </div>

  ${MEALS.map((m) => {
    const es = day.entries.map((e, idx) => ({ e, idx })).filter((x) => x.e.meal === m);
    const kcal = sum(es.map((x) => (num(x.e.cal) || 0) * (num(x.e.qty) || 1)));
    return `<div class="card">
      <div class="meal-head"><h3>${m}</h3><span class="small muted num">${Math.round(kcal)} kcal</span></div>
      ${es.length ? es.map(({ e, idx }) => {
        const q = num(e.qty) || 1;
        return `<div class="list-item"><div class="grow"><div>${esc(e.name)}${q !== 1 ? ` <span class="muted small">× ${q}</span>` : ''}</div>
          <div class="food-macros">${Math.round((num(e.cal) || 0) * q)} kcal · P ${r1((num(e.p) || 0) * q)} · C ${r1((num(e.c) || 0) * q)} · F ${r1((num(e.f) || 0) * q)}</div></div>
          <button class="icon-btn" data-a="food-del" data-idx="${idx}" aria-label="Delete">✕</button></div>`;
      }).join('') : '<div class="small muted">Nothing logged.</div>'}
    </div>`;
  }).join('')}

  <div class="card row between">
    <span>Water <span class="muted small">${t.water} / ${st.waterGoal} glasses</span></span>
    <span class="row"><button class="icon-btn" data-a="water" data-d="${d}" data-n="-1" aria-label="Less water">−</button><button class="icon-btn" data-a="water" data-d="${d}" data-n="1" aria-label="More water">+</button></span>
  </div>
  ${!day.entries.length && S.diet[addDays(d, -1)]?.entries.length ? `<button class="btn block" data-a="diet-copy">Copy yesterday's food</button>` : ''}`;
}

function viewBody() {
  const st = S.settings;
  const d = ui.bodyDate;
  const cur = S.body[d] || {};
  const ws = weightSeries();
  const t = today();
  const latest = ws.at(-1);
  const avg7 = avgWeight(ws, t);
  const avg30ago = avgWeight(ws, addDays(t, -30));
  const goal = num(st.goalWeight);
  const lo = ui.bodyRange ? dayNum(t) - ui.bodyRange : -Infinity;
  const pts = ws.filter(([dd]) => dayNum(dd) >= lo).map(([dd, v]) => [dayNum(dd), v]);
  const avgPts = pts.map(([x]) => {
    const xs = pts.filter(([x2]) => x2 <= x && x2 > x - 7).map((p) => p[1]);
    return [x, sum(xs) / xs.length];
  });
  const waist = Object.keys(S.body).filter((k) => num(S.body[k].waist) != null).sort().filter((k) => dayNum(k) >= lo).map((k) => [dayNum(k), num(S.body[k].waist)]);
  const entries = Object.keys(S.body).filter((k) => ['weight', 'waist', 'bf'].some((f) => num(S.body[k][f]) != null)).sort().reverse();

  return `
  <div class="card stack">
    <h2>Log measurement</h2>
    ${field('Date', `<input type="date" id="body-date" value="${esc(d)}" data-a-change="body-date">`)}
    <div class="grid3">
      ${field(`Weight (${unit()})`, `<input id="body-weight" type="number" inputmode="decimal" step="0.1" value="${esc(cur.weight ?? '')}">`)}
      ${field(`Waist (${unit() === 'kg' ? 'cm' : 'in'})`, `<input id="body-waist" type="number" inputmode="decimal" step="0.1" value="${esc(cur.waist ?? '')}" placeholder="opt">`)}
      ${field('Body fat %', `<input id="body-bf" type="number" inputmode="decimal" step="0.1" value="${esc(cur.bf ?? '')}" placeholder="opt">`)}
    </div>
    <button class="btn primary block" data-a="body-save">Save</button>
  </div>

  <div class="grid3">
    <div class="stat"><div class="v">${latest ? fmtNum(latest[1]) : '–'}</div><div class="l">latest</div></div>
    <div class="stat"><div class="v ${avg7 != null && avg30ago != null ? (avg7 > avg30ago ? 'up' : 'down') : ''}">${avg7 != null && avg30ago != null ? (avg7 - avg30ago > 0 ? '+' : '') + r1(avg7 - avg30ago) : '–'}</div><div class="l">30-day change</div></div>
    <div class="stat"><div class="v">${goal ?? '–'}</div><div class="l">goal (${unit()})</div></div>
  </div>

  <div class="card" style="margin-top:12px">
    <div class="row between"><h2>Weight trend</h2>
      <div class="seg" style="flex:none">${[[30, '30d'], [90, '90d'], [0, 'All']].map(([v, l]) => `<button class="${ui.bodyRange === v ? 'on' : ''}" data-a="body-range" data-v="${v}">${l}</button>`).join('')}</div></div>
    ${lineChart([{ pts, cls: 'l1', dots: true, area: true }, { pts: avgPts, cls: 'l2' }], { goal })}
    <div class="legend"><span><i></i>Daily</span><span><i class="l2"></i>7-day average</span>${goal != null ? '<span><i class="goal"></i>Goal</span>' : ''}</div>
    <p class="tiny muted" style="margin:8px 0 0">Daily weight swings with water and food — the 7-day average is the number to watch.</p>
  </div>

  ${waist.length >= 2 ? `<div class="card"><h2>Waist</h2>${lineChart([{ pts: waist, cls: 'l1', dots: true }])}</div>` : ''}

  <div class="card">
    <h2>History</h2>
    ${entries.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Date</th><th>Weight</th><th>Waist</th><th>BF%</th><th></th></tr></thead><tbody>
      ${entries.slice(0, 60).map((k) => `<tr><td>${fmtDate(k)}</td><td class="num">${esc(S.body[k].weight ?? '')}</td><td class="num">${esc(S.body[k].waist ?? '')}</td><td class="num">${esc(S.body[k].bf ?? '')}</td>
        <td style="text-align:right"><button class="btn sm ghost" data-a="body-edit" data-d="${k}">Edit</button><button class="btn sm ghost danger" data-a="body-del" data-d="${k}">✕</button></td></tr>`).join('')}
    </tbody></table></div>` : '<div class="empty">No entries yet.</div>'}
  </div>`;
}

function viewHistory() {
  const ws = finished();
  const names = [...new Set(ws.flatMap((w) => w.exercises.filter((e) => e.type === 'reps' && e.sets.some((s) => s.done)).map((e) => e.name)))].sort();
  if (!ui.progEx || !names.includes(ui.progEx)) ui.progEx = names[0] || '';
  return `
  ${viewCalendar()}

  <div class="card">
    <h2>Exercise progress</h2>
    ${names.length ? `<select data-a-change="prog-ex">${names.map((n) => `<option ${n === ui.progEx ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
      ${exerciseProgress(ui.progEx)}` : '<div class="empty">Finish a workout to see strength trends here.</div>'}
  </div>

  <div class="section-title">Workout log</div>
  ${ws.length ? ws.map((w) => workoutCard(w)).join('') : '<div class="card empty">No workouts yet. Head to Train to start one.</div>'}`;
}

function viewCalendar() {
  const [y, m] = ui.calMonth.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const startOff = (first.getDay() + 6) % 7;
  const days = new Date(y, m, 0).getDate();
  const byDate = {};
  for (const w of S.workouts) (byDate[w.date] ||= []).push(w);
  const cells = [];
  for (let i = 0; i < startOff; i++) cells.push('<button class="out" tabindex="-1"></button>');
  for (let dd = 1; dd <= days; dd++) {
    const k = `${y}-${pad(m)}-${pad(dd)}`;
    const marks = (byDate[k] || []).map((w) => `<i class="d-${esc(w.dayId)}"></i>`).join('') +
      (num(S.body[k]?.weight) != null ? '<i class="w"></i>' : '') + (S.diet[k]?.entries.length ? '<i class="f"></i>' : '');
    cells.push(`<button class="${k === today() ? 'today' : ''} ${k === ui.calSel ? 'sel' : ''}" data-a="cal-sel" data-d="${k}"><span>${dd}</span><span class="marks">${marks}</span></button>`);
  }
  const sel = ui.calSel;
  const selW = byDate[sel] || [];
  const selT = dietTotals(sel);
  return `<div class="card">
    <div class="row between" style="margin-bottom:10px">
      <button class="icon-btn" data-a="cal-month" data-n="-1" aria-label="Previous month">‹</button>
      <b>${first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</b>
      <button class="icon-btn" data-a="cal-month" data-n="1" aria-label="Next month">›</button>
    </div>
    <div class="cal">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((h) => `<div class="h">${h}</div>`).join('')}${cells.join('')}</div>
    <div class="legend"><span><i style="background:var(--push)"></i>Workout</span><span><i style="background:var(--text);opacity:.6"></i>Weight</span><span><i style="background:var(--warn)"></i>Food</span></div>
    <hr>
    <div class="small"><b>${fmtDate(sel, { weekday: 'long', month: 'short', day: 'numeric' })}</b>
      <div class="muted" style="margin-top:4px">
        ${selW.length ? selW.map((w) => `${esc(w.name)} (${workoutStats(w).sets} sets)`).join(', ') : 'No workout'} ·
        ${num(S.body[sel]?.weight) != null ? `${S.body[sel].weight} ${unit()}` : 'no weight'} ·
        ${selT.count ? `${Math.round(selT.cal)} kcal, ${Math.round(selT.p)}g protein` : 'no food logged'}
      </div></div>
  </div>`;
}

function exerciseProgress(name) {
  const rows = [];
  for (const w of finished().slice().reverse()) {
    const e = w.exercises.find((x) => keyOf(x.name) === keyOf(name));
    if (!e) continue;
    const done = e.sets.filter((s) => s.done && num(s.w) != null && num(s.r) != null);
    if (!done.length) continue;
    const top = done.reduce((a, s) => (e1rm(num(s.w), num(s.r)) > e1rm(num(a.w), num(a.r)) ? s : a));
    rows.push({ date: w.date, top, e1: e1rm(num(top.w), num(top.r)), vol: sum(done.map((s) => num(s.w) * num(s.r))), maxW: Math.max(...done.map((s) => num(s.w))) });
  }
  if (!rows.length) return '<div class="empty">No completed sets yet.</div>';
  const best = rows.reduce((a, r) => (r.e1 > a.e1 ? r : a));
  const heaviest = rows.reduce((a, r) => (r.maxW > a.maxW ? r : a));
  return `
    <div class="grid3" style="margin:10px 0">
      <div class="stat"><div class="v">${Math.round(best.e1)}</div><div class="l">best est. 1RM</div></div>
      <div class="stat"><div class="v">${fmtNum(heaviest.maxW)}</div><div class="l">heaviest (${unit()})</div></div>
      <div class="stat"><div class="v">${rows.length}</div><div class="l">sessions</div></div>
    </div>
    ${lineChart([{ pts: rows.map((r) => [dayNum(r.date), r.e1]), cls: 'l1', dots: true, area: true }], { fmtY: (v) => Math.round(v) })}
    <div class="legend"><span><i></i>Estimated 1-rep max (Epley) from your best set</span></div>
    <div class="tbl-wrap" style="margin-top:8px"><table class="tbl"><thead><tr><th>Date</th><th>Best set</th><th>e1RM</th><th>Volume</th></tr></thead><tbody>
      ${rows.slice().reverse().slice(0, 12).map((r) => `<tr><td>${fmtDate(r.date, { month: 'short', day: 'numeric' })}</td><td class="num">${r.top.w}×${r.top.r}${r === best ? ' <span class="pr">PR</span>' : ''}</td><td class="num">${Math.round(r.e1)}</td><td class="num">${Math.round(r.vol).toLocaleString()}</td></tr>`).join('')}
    </tbody></table></div>`;
}

function workoutCard(w) {
  const st = workoutStats(w);
  const open = ui.openWorkout === w.id;
  return `<div class="card day-card d-${esc(w.dayId)}">
    <div class="row between" data-a="open-workout" data-id="${w.id}" style="cursor:pointer">
      <div><div>${dayTag(w.dayId, w.name)} <span class="small muted">${fmtDate(w.date)}</span></div>
        <div class="small muted" style="margin-top:4px">${st.sets} sets · ${Math.round(st.volume).toLocaleString()} ${unit()} volume${st.dur ? ` · ${st.dur} min` : ''}${w.effort ? ` · effort ${w.effort}/5` : ''}${w.prs?.length ? ` · <span class="pr">${w.prs.length} PR</span>` : ''}</div></div>
      <span class="muted">${open ? '–' : '+'}</span>
    </div>
    ${open ? `<div style="margin-top:10px">
      ${w.exercises.filter((e) => e.sets.some((s) => s.done)).map((e) => `<div class="list-item"><div class="grow"><div>${esc(e.name)}${w.prs?.includes(e.name) ? ' <span class="pr">PR</span>' : ''}</div>
        <div class="small muted num">${e.sets.filter((s) => s.done).map((s) => esc(fmtSet(s, e))).join(' · ')}</div></div></div>`).join('') || '<div class="small muted">No completed sets.</div>'}
      ${w.notes ? `<p class="small"><b>Notes:</b> ${esc(w.notes)}</p>` : ''}
      ${w.nextTime?.length ? `<p class="small"><b>Next time:</b> ${w.nextTime.map(esc).join(', ')}</p>` : ''}
      ${w.pain ? `<p class="small"><b>Pain / form:</b> ${esc(w.pain)}</p>` : ''}
      ${w.bodyweight ? `<p class="small"><b>Bodyweight:</b> ${esc(w.bodyweight)} ${unit()}</p>` : ''}
      <div class="row" style="margin-top:8px"><button class="btn sm" data-a="edit-workout" data-id="${w.id}">Edit</button><button class="btn sm" data-a="repeat-workout" data-id="${w.id}">Repeat</button><button class="btn sm danger" data-a="del-workout" data-id="${w.id}">Delete</button></div>
    </div>` : ''}
  </div>`;
}

function viewPlan() {
  const st = S.settings;
  const day = dayById(ui.planDay) || S.program[0];
  const names = [...new Set(S.program.flatMap((d) => d.exercises.map((e) => e.name)))];
  return `
  <div class="card">
    <h2>Personal goal / notes</h2>
    <textarea data-in="goal-notes" placeholder="e.g. Build muscle and drop to 180 lb by summer">${esc(S.goalNotes)}</textarea>
  </div>

  <div class="card">
    <h2>Weekly schedule</h2>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>When</th><th>Workout</th><th>Focus</th></tr></thead>
    <tbody>${SCHEDULE.map((r) => `<tr><td style="white-space:nowrap">${r[0]}</td><td><b>${r[1]}</b></td><td class="muted small">${r[2]}</td></tr>`).join('')}</tbody></table></div>
  </div>

  <div class="card">
    <div class="row between"><h2>Workout menu</h2><button class="btn sm ${ui.editPlan ? 'primary' : ''}" data-a="edit-plan">${ui.editPlan ? 'Done' : 'Edit'}</button></div>
    <div class="seg" style="margin:6px 0 10px">${S.program.map((d) => `<button class="${d.id === day.id ? 'on' : ''}" data-a="plan-day" data-v="${esc(d.id)}">${esc(d.name)}</button>`).join('')}</div>
    ${ui.editPlan ? planEditor(day) : `<p class="small muted" style="margin:0 0 6px">${esc(day.focus)}</p>
      ${day.exercises.map((e) => `<div class="list-item"><div class="grow">${esc(e.name)} <span class="muted small">(${esc(e.muscle)})</span></div><span class="small num">${targetText(e)}</span></div>`).join('')}`}
  </div>

  <details class="card"><summary>How to use this tracker</summary>
    <ul class="tight small">${HOW_TO.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
    <h3 style="margin-top:12px">Progression notes</h3>
    <ul class="tight small">${WEEK_NOTES.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
  </details>

  <details class="card"><summary>Exercise swaps</summary>
    <p class="small muted" style="margin-top:0">Use a similar movement if your gym is busy or a machine doesn't feel right. You can swap mid-workout from the ⋯ menu.</p>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>If unavailable / uncomfortable</th><th>Try instead</th></tr></thead>
    <tbody>${SWAPS.map((s) => `<tr><td>${s[0]}</td><td>${s[1]}</td></tr>`).join('')}</tbody></table></div>
  </details>

  <details class="card"><summary>My baseline weights / machine settings</summary>
    <p class="small muted" style="margin-top:0">These also show on each exercise while you train.</p>
    ${names.map((n) => {
      const s = S.setup[keyOf(n)] || {};
      const lp = lastPerformance(n);
      return `<div class="list-item" style="display:block"><div class="row between"><b class="small">${esc(n)}</b><span class="tiny muted">${lp ? 'last ' + esc(lp.sets.map((x) => fmtSet(x, lp.e)).join(', ')) : ''}</span></div>
        <div class="grid2" style="margin-top:6px">
          <input class="small" data-in="setup" data-name="${esc(n)}" value="${esc(s.setting || '')}" placeholder="Weight / setting">
          <input class="small" data-in="setup" data-name="${esc(n)}" data-f="notes" value="${esc(s.notes || '')}" placeholder="Notes (seat, pin, grip…)">
        </div></div>`;
    }).join('')}
  </details>

  <details class="card" open><summary>Settings & goals</summary>
    <div class="stack">
      <div class="grid2">
        ${field('Units', `<select data-in="setting" data-f="unit">${['lb', 'kg'].map((u) => `<option ${st.unit === u ? 'selected' : ''}>${u}</option>`).join('')}</select>`)}
        ${field(`Weight increment (${unit()})`, `<input type="number" step="0.5" data-in="setting" data-f="increment" value="${esc(st.increment)}">`)}
      </div>
      <div class="grid2">
        ${field('Rest: compound (sec)', `<input type="number" data-in="setting" data-f="restCompound" value="${esc(st.restCompound)}">`)}
        ${field('Rest: isolation (sec)', `<input type="number" data-in="setting" data-f="restIsolation" value="${esc(st.restIsolation)}">`)}
      </div>
      <label class="row small"><input type="checkbox" data-in="setting" data-f="autoRest" ${st.autoRest ? 'checked' : ''} style="width:auto;min-height:0"> Start rest timer automatically when a set is completed</label>
      <div class="grid2">
        ${field('Cycle start date', `<input type="date" data-in="setting" data-f="programStart" value="${esc(st.programStart)}">`)}
        ${field(`Goal weight (${unit()})`, `<input type="number" step="0.1" data-in="setting" data-f="goalWeight" value="${esc(st.goalWeight)}">`)}
      </div>
      <div class="grid2">
        ${field('Calories / day', `<input type="number" data-in="setting" data-f="calGoal" value="${esc(st.calGoal)}">`)}
        ${field('Water (glasses)', `<input type="number" data-in="setting" data-f="waterGoal" value="${esc(st.waterGoal)}">`)}
      </div>
      <div class="grid3">
        ${field('Protein g', `<input type="number" data-in="setting" data-f="proteinGoal" value="${esc(st.proteinGoal)}">`)}
        ${field('Carbs g', `<input type="number" data-in="setting" data-f="carbGoal" value="${esc(st.carbGoal)}">`)}
        ${field('Fat g', `<input type="number" data-in="setting" data-f="fatGoal" value="${esc(st.fatGoal)}">`)}
      </div>
      <p class="tiny muted" style="margin:0">Changing units only changes labels; existing numbers aren't converted.</p>
    </div>
  </details>

  <div class="card stack">
    <h2>Your data</h2>
    <p class="small muted" style="margin:0">Everything is stored on this device only. Export a backup now and then, and import it on a new phone.</p>
    <div class="row wrap">
      <button class="btn" data-a="export">Export backup</button>
      <label class="btn">Import backup<input type="file" accept="application/json,.json" id="import-file" hidden></label>
      <button class="btn" data-a="export-csv">Export workouts CSV</button>
    </div>
    <button class="btn danger ghost" data-a="reset-all">Erase all data</button>
  </div>`;
}

function planEditor(day) {
  return `
    ${field('Focus', `<input data-in="prog-day" data-d="${esc(day.id)}" data-f="focus" value="${esc(day.focus)}">`)}
    ${day.exercises.map((e, i) => `<div class="list-item" style="display:block">
      <div class="row"><input class="grow" data-in="prog" data-d="${esc(day.id)}" data-i="${i}" data-f="name" value="${esc(e.name)}" placeholder="Exercise name">
        <button class="icon-btn" data-a="prog-up" data-i="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Move up">↑</button>
        <button class="icon-btn" data-a="prog-del" data-i="${i}" aria-label="Delete">✕</button></div>
      <div class="grid3" style="margin-top:6px;grid-template-columns:repeat(4,1fr)">
        ${field('Sets', `<input type="number" data-in="prog" data-d="${esc(day.id)}" data-i="${i}" data-f="sets" value="${e.sets}">`)}
        ${field(e.type === 'time' ? 'Min sec' : e.type === 'cardio' ? 'Min min' : 'Min reps', `<input type="number" data-in="prog" data-d="${esc(day.id)}" data-i="${i}" data-f="repMin" value="${e.repMin}">`)}
        ${field(e.type === 'time' ? 'Max sec' : e.type === 'cardio' ? 'Max min' : 'Max reps', `<input type="number" data-in="prog" data-d="${esc(day.id)}" data-i="${i}" data-f="repMax" value="${e.repMax}">`)}
        ${field('Type', `<select data-in="prog" data-d="${esc(day.id)}" data-i="${i}" data-f="type">${[['reps', 'Reps'], ['time', 'Timed'], ['cardio', 'Cardio']].map(([v, l]) => `<option value="${v}" ${e.type === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}
      </div>
      <div class="grid2" style="margin-top:6px">
        <input class="small" data-in="prog" data-d="${esc(day.id)}" data-i="${i}" data-f="muscle" value="${esc(e.muscle)}" placeholder="Muscle / note">
        <label class="row small"><input type="checkbox" data-in="prog" data-d="${esc(day.id)}" data-i="${i}" data-f="compound" ${e.compound ? 'checked' : ''} style="width:auto;min-height:0"> Compound (longer rest)</label>
      </div>
    </div>`).join('')}
    <div class="row wrap" style="margin-top:10px">
      <button class="btn grow" data-a="prog-add">+ Add exercise</button>
      <button class="btn ghost danger" data-a="prog-reset">Reset to template</button>
    </div>`;
}

// ---------- render ----------
function render() {
  const app = $('#app');
  const y = window.scrollY;
  let html;
  if (ui.tab === 'today') html = viewToday();
  else if (ui.tab === 'train') html = S.active ? viewLogger() : viewTrainPicker();
  else if (ui.tab === 'diet') html = viewDiet();
  else if (ui.tab === 'body') html = viewBody();
  else if (ui.tab === 'history') html = viewHistory();
  else html = viewPlan();
  app.innerHTML = html;
  $('#title').textContent = ui.tab === 'train' && S.active ? `${S.active.name} workout` : TITLES[ui.tab];
  $('#topbar-extra').textContent = ui.tab === 'today' ? fmtDate(today(), { weekday: 'long', month: 'short', day: 'numeric' }) : '';
  document.querySelectorAll('.tabbar button').forEach((b) => b.classList.toggle('on', b.dataset.tab === ui.tab));
  window.scrollTo(0, y);
  renderRest();
}
function go(tab) { ui.tab = tab; render(); window.scrollTo(0, 0); }

// ---------- rest timer ----------
function startRest(seconds, name) {
  rest = { end: Date.now() + seconds * 1000, total: seconds, name, alerted: false };
  renderRest();
}
function renderRest() {
  const el = $('#rest');
  if (!rest) { el.classList.add('hidden'); return; }
  const left = (rest.end - Date.now()) / 1000;
  const done = left <= 0;
  el.classList.remove('hidden');
  el.classList.toggle('done', done);
  el.innerHTML = `<div class="t">${done ? 'Go!' : fmtClock(left)}</div>
    <div class="grow" style="min-width:0"><div class="tiny muted ellipsis" style="margin-bottom:4px">${done ? 'Rest over — next set' : 'Rest · ' + esc(rest.name)}</div>${bar(Math.max(0, rest.total - left), rest.total, done ? 'var(--good)' : 'var(--accent)')}</div>
    <button class="btn sm" data-a="rest-add" data-n="-15">−15</button><button class="btn sm" data-a="rest-add" data-n="15">+15</button>
    <button class="btn sm" data-a="rest-stop">${done ? 'Close' : 'Skip'}</button>`;
  if (done && !rest.alerted) {
    rest.alerted = true;
    try { navigator.vibrate?.([200, 100, 200]); } catch (e) { /* not supported */ }
    beep();
  }
}
let audioCtx;
function beep() {
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.frequency.value = 880; g.gain.value = 0.15;
    o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + 0.35);
  } catch (e) { /* audio not available */ }
}
setInterval(() => {
  if (rest) {
    const left = (rest.end - Date.now()) / 1000;
    if (left > -30) renderRest(); else { rest = null; renderRest(); }
  }
  const el = $('#elapsed');
  if (el && S.active) el.textContent = fmtClock((Date.now() - S.active.startedAt) / 1000);
}, 500);

// ---------- actions ----------
const actions = {
  tab: (d) => go(d.tab),
  start(d) {
    if (S.active) { if (!confirm('A workout is already in progress. Discard it and start a new one?')) return; }
    S.active = newWorkoutFromDay(d.day);
    ui.addExOpen = false;
    save(); go('train');
  },
  'quick-weight'() {
    const v = num($('#quick-weight').value);
    if (v == null) return toast('Enter a weight first');
    S.body[today()] = { ...(S.body[today()] || {}), weight: v };
    save(); render(); toast('Weight saved');
  },
  water(d) {
    const day = dietDay(d.d);
    day.water = Math.max(0, (day.water || 0) + Number(d.n));
    save(); render();
  },

  // logger
  'set-done'(d) {
    const e = S.active.exercises[d.i], s = e.sets[d.j];
    if (!s.done) {
      const row = document.querySelectorAll(`[data-in="set"][data-i="${d.i}"][data-j="${d.j}"]`);
      row.forEach((inp) => { if (s[inp.dataset.f] === '' && inp.placeholder !== '') s[inp.dataset.f] = inp.placeholder; });
      if (s.w === '' && s.r === '') return toast('Enter weight and reps first');
      s.done = true;
      const allDone = e.sets.every((x) => x.done);
      if (S.settings.autoRest && !(allDone && d.i === S.active.exercises.length - 1)) {
        startRest(e.compound ? S.settings.restCompound : S.settings.restIsolation, e.name);
      }
      const prevBest = bestE1rm(e.name, S.active.id);
      const est = e.type === 'reps' ? e1rm(num(s.w), num(s.r)) : 0;
      if (prevBest > 0 && est > prevBest) toast(`New PR pace! ${s.w}×${s.r} on ${e.name}`);
    } else {
      s.done = false;
    }
    save(); render();
  },
  'set-add'(d) {
    const e = S.active.exercises[d.i];
    const last = e.sets.at(-1);
    e.sets.push({ w: last?.w ?? '', r: '', done: false });
    save(); render();
  },
  'set-remove'(d) {
    const e = S.active.exercises[d.i];
    if (e.sets.length > 1) e.sets.pop();
    save(); render();
  },
  'ex-menu'(d) { $(`#exmenu-${d.i}`).classList.toggle('hidden'); },
  'ex-up'(d) {
    const a = S.active.exercises, i = Number(d.i);
    if (i > 0) [a[i - 1], a[i]] = [a[i], a[i - 1]];
    save(); render();
  },
  'ex-remove'(d) {
    if (!confirm(`Remove ${S.active.exercises[d.i].name} from this workout?`)) return;
    S.active.exercises.splice(d.i, 1);
    save(); render();
  },
  swap(d) {
    const e = S.active.exercises[d.i];
    e.name = d.v; e.sets.forEach((s) => { if (!s.done) { s.w = ''; } });
    save(); render();
  },
  'swap-custom'(d) {
    const e = S.active.exercises[d.i];
    const n = prompt('Exercise name for this workout:', e.name);
    if (n && n.trim()) { e.name = n.trim(); save(); render(); }
  },
  'toggle-add-ex'() { ui.addExOpen = !ui.addExOpen; render(); },
  'add-ex'() {
    const name = ($('#add-ex-custom').value || $('#add-ex-select').value).trim();
    if (!name) return toast('Pick or type an exercise');
    const tmpl = S.program.flatMap((x) => x.exercises).find((x) => keyOf(x.name) === keyOf(name));
    S.active.exercises.push(logExercise(tmpl || ex(name, '', 3, 8, 12)));
    ui.addExOpen = false;
    save(); render();
  },
  'next-time'(d) {
    const a = S.active.nextTime;
    const i = a.indexOf(d.v);
    if (i >= 0) a.splice(i, 1); else a.push(d.v);
    save(); render();
  },
  effort(d) { S.active.effort = S.active.effort === Number(d.v) ? null : Number(d.v); save(); render(); },
  finish() {
    const w = S.active;
    const doneSets = w.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
    if (!doneSets) {
      const filled = w.exercises.some((e) => e.sets.some((s) => s.w !== '' || s.r !== ''));
      if (!filled) return toast('Complete at least one set (tap ✓) before finishing');
      if (!confirm('No sets are checked off. Mark every set you filled in as done and finish?')) return;
      w.exercises.forEach((e) => e.sets.forEach((s) => { if (s.r !== '') s.done = true; }));
    }
    if (!w.finishedAt || !w.editing) w.finishedAt = Date.now();
    if (w.durationMin == null) w.durationMin = Math.max(1, Math.round((w.finishedAt - w.startedAt) / 60000));
    // PRs vs. everything logged before this workout
    w.prs = [];
    for (const e of w.exercises) {
      if (e.type !== 'reps') continue;
      const prev = bestE1rm(e.name, w.id);
      const best = Math.max(0, ...e.sets.filter((s) => s.done).map((s) => e1rm(num(s.w), num(s.r))));
      if (prev > 0 && best > prev) w.prs.push(e.name);
    }
    if (num(w.bodyweight) != null) S.body[w.date] = { ...(S.body[w.date] || {}), weight: num(w.bodyweight) };
    delete w.editing;
    S.workouts = S.workouts.filter((x) => x.id !== w.id).concat(w);
    S.active = null;
    rest = null;
    save();
    ui.openWorkout = w.id;
    ui.calSel = w.date; ui.calMonth = w.date.slice(0, 7);
    go('history');
    toast(w.prs.length ? `Workout saved — ${w.prs.length} new PR${w.prs.length > 1 ? 's' : ''}! 🎉` : 'Workout saved 💪');
  },
  discard() {
    const w = S.active;
    if (w.editing) {
      if (!confirm('Cancel editing? Changes since you opened it will be lost.')) return;
      S.workouts.push(w.editing);
    } else if (!confirm('Discard this workout? Logged sets will be lost.')) return;
    S.active = null; rest = null;
    save(); go(w.editing ? 'history' : 'train');
  },
  'rest-add'(d) { if (rest) { rest.end += Number(d.n) * 1000; rest.total = Math.max(rest.total + Number(d.n), 1); rest.alerted = false; renderRest(); } },
  'rest-stop'() { rest = null; renderRest(); },

  // diet
  'diet-date'(d) { ui.dietDate = addDays(ui.dietDate, Number(d.n)); render(); },
  'diet-today'() { ui.dietDate = today(); render(); },
  meal(d) { ui.meal = d.v; render(); },
  'food-add'() {
    const name = $('#food-name').value.trim();
    const cal = num($('#food-cal').value);
    if (!name) return toast('Enter a food name');
    if (cal == null) return toast('Enter calories');
    dietDay(ui.dietDate).entries.push({
      id: uid(), meal: ui.meal, name, cal, qty: num($('#food-qty').value) || 1,
      p: num($('#food-p').value) || 0, c: num($('#food-c').value) || 0, f: num($('#food-f').value) || 0,
    });
    save(); render(); toast(`Added to ${ui.meal}`);
  },
  'food-quick'(d) {
    const f = recentFoods()[d.k];
    if (!f) return;
    dietDay(ui.dietDate).entries.push({ ...f, id: uid(), meal: ui.meal });
    save(); render(); toast(`${f.name} added to ${ui.meal}`);
  },
  'food-del'(d) { dietDay(ui.dietDate).entries.splice(d.idx, 1); save(); render(); },
  'diet-copy'() {
    const y = S.diet[addDays(ui.dietDate, -1)];
    dietDay(ui.dietDate).entries.push(...y.entries.map((e) => ({ ...e, id: uid() })));
    save(); render(); toast("Copied yesterday's food");
  },

  // body
  'body-save'() {
    const d = $('#body-date').value || today();
    const entry = { weight: num($('#body-weight').value), waist: num($('#body-waist').value), bf: num($('#body-bf').value) };
    Object.keys(entry).forEach((k) => entry[k] == null && delete entry[k]);
    if (!Object.keys(entry).length) return toast('Enter at least one value');
    S.body[d] = entry;
    ui.bodyDate = d;
    save(); render(); toast('Saved');
  },
  'body-edit'(d) { ui.bodyDate = d.d; render(); window.scrollTo(0, 0); },
  'body-del'(d) { if (confirm(`Delete entry for ${fmtDate(d.d)}?`)) { delete S.body[d.d]; save(); render(); } },
  'body-range'(d) { ui.bodyRange = Number(d.v); render(); },

  // history
  'cal-month'(d) {
    const [y, m] = ui.calMonth.split('-').map(Number);
    const nd = new Date(y, m - 1 + Number(d.n), 1);
    ui.calMonth = `${nd.getFullYear()}-${pad(nd.getMonth() + 1)}`;
    render();
  },
  'cal-sel'(d) { ui.calSel = d.d; render(); },
  'open-workout'(d) { ui.openWorkout = ui.openWorkout === d.id ? null : d.id; render(); },
  'del-workout'(d) {
    if (!confirm('Delete this workout permanently?')) return;
    S.workouts = S.workouts.filter((w) => w.id !== d.id);
    save(); render();
  },
  'edit-workout'(d) {
    if (S.active) return toast('Finish or discard the current workout first');
    const w = S.workouts.find((x) => x.id === d.id);
    S.workouts = S.workouts.filter((x) => x.id !== d.id);
    S.active = { ...clone(w), editing: clone(w) };
    save(); go('train');
  },
  'repeat-workout'(d) {
    if (S.active) return toast('Finish or discard the current workout first');
    const w = S.workouts.find((x) => x.id === d.id);
    S.active = {
      id: uid(), dayId: w.dayId, name: w.name, date: today(), startedAt: Date.now(),
      exercises: w.exercises.map((e) => ({ ...clone(e), uid: uid(), sets: e.sets.map(() => ({ w: '', r: '', done: false })) })),
      notes: '', nextTime: [], effort: null, pain: '', bodyweight: S.body[today()]?.weight ?? '',
    };
    save(); go('train');
  },

  // plan
  'plan-day'(d) { ui.planDay = d.v; render(); },
  'edit-plan'() { ui.editPlan = !ui.editPlan; render(); },
  'prog-up'(d) {
    const a = dayById(ui.planDay).exercises, i = Number(d.i);
    if (i > 0) [a[i - 1], a[i]] = [a[i], a[i - 1]];
    save(); render();
  },
  'prog-del'(d) {
    const day = dayById(ui.planDay);
    if (!confirm(`Remove ${day.exercises[d.i].name} from ${day.name}?`)) return;
    day.exercises.splice(d.i, 1);
    save(); render();
  },
  'prog-add'() { dayById(ui.planDay).exercises.push(ex('New exercise', '', 3, 8, 12)); save(); render(); },
  'prog-reset'() {
    if (!confirm('Reset all four days back to the original template? Your logged workouts are kept.')) return;
    S.program = DEFAULT_PROGRAM();
    save(); render();
  },
  export() {
    download(`liftlog-backup-${today()}.json`, JSON.stringify(S, null, 2), 'application/json');
  },
  'export-csv'() {
    const rows = [['date', 'workout', 'exercise', 'set', 'weight', 'reps', 'effort', 'notes']];
    for (const w of finished().reverse()) for (const e of w.exercises) e.sets.forEach((s, j) => {
      if (s.done) rows.push([w.date, w.name, e.name, j + 1, s.w, s.r, w.effort ?? '', w.notes || '']);
    });
    download(`liftlog-workouts-${today()}.csv`, rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n'), 'text/csv');
  },
  'reset-all'() {
    if (!confirm('Erase ALL workouts, weights, food and settings on this device?')) return;
    if (!confirm('Really erase everything? This cannot be undone.')) return;
    S = defaultState(); save(); go('today');
  },
};

function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- events ----------
document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-a]');
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.a];
  if (fn) { ev.preventDefault(); fn({ ...el.dataset }); }
});

// Field edits write straight into state without re-rendering, so focus/keyboard stay put.
function onField(ev) {
  const el = ev.target;
  const kind = el.dataset.in;
  if (!kind) return;
  const val = el.type === 'checkbox' ? el.checked : el.value;
  const f = el.dataset.f;
  if (kind === 'set') {
    const s = S.active.exercises[el.dataset.i].sets[el.dataset.j];
    s[f] = val;
  } else if (kind === 'active') {
    S.active[f] = val;
  } else if (kind === 'setup') {
    const k = keyOf(el.dataset.name);
    S.setup[k] = { ...(S.setup[k] || {}), [f || 'setting']: val };
  } else if (kind === 'setting') {
    S.settings[f] = ['unit', 'programStart', 'goalWeight', 'autoRest'].includes(f) ? val : (num(val) ?? val);
  } else if (kind === 'goal-notes') {
    S.goalNotes = val;
  } else if (kind === 'prog-day') {
    dayById(el.dataset.d)[f] = val;
  } else if (kind === 'prog') {
    const e = dayById(el.dataset.d).exercises[el.dataset.i];
    e[f] = ['sets', 'repMin', 'repMax'].includes(f) ? Math.max(1, Math.round(num(val) || 1)) : val;
    if (f === 'sets') e.setsText = '';
  }
  save();
  if (ev.type === 'change' && (kind === 'setting' && f === 'unit' || kind === 'prog' && f === 'type')) render();
}
document.addEventListener('input', onField);
document.addEventListener('change', (ev) => {
  onField(ev);
  const el = ev.target;
  if (el.dataset.aChange === 'prog-ex') { ui.progEx = el.value; render(); }
  if (el.dataset.aChange === 'body-date') { ui.bodyDate = el.value || today(); render(); }
  if (el.id === 'import-file' && el.files[0]) {
    el.files[0].text().then((txt) => {
      const data = JSON.parse(txt);
      if (!data || !Array.isArray(data.workouts) || !data.settings) throw new Error('bad file');
      if (!confirm('Replace all data on this device with this backup?')) return;
      S = { ...defaultState(), ...data, settings: { ...defaultState().settings, ...data.settings } };
      save(); go('today'); toast('Backup imported');
    }).catch(() => toast("That file doesn't look like a LiftLog backup"));
  }
});
// Fill-in food from history when a known name is chosen.
document.addEventListener('change', (ev) => {
  if (ev.target.id !== 'food-name') return;
  const f = recentFoods().find((x) => keyOf(x.name) === keyOf(ev.target.value));
  if (!f) return;
  $('#food-cal').value = f.cal ?? ''; $('#food-p').value = f.p ?? ''; $('#food-c').value = f.c ?? ''; $('#food-f').value = f.f ?? '';
});
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter' && ev.target.id === 'quick-weight') actions['quick-weight']();
  if (ev.key === 'Enter' && ev.target.closest?.('#food-name, #food-cal, #food-p, #food-c, #food-f, #food-qty')) actions['food-add']();
});

// Re-render on day change (e.g. app left open overnight) and keep today's views fresh.
let lastDay = today();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && today() !== lastDay) {
    if (ui.dietDate === lastDay) ui.dietDate = today();
    if (ui.bodyDate === lastDay) ui.bodyDate = today();
    lastDay = today(); render();
  }
});

if (S.active) ui.tab = 'train';
render();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
