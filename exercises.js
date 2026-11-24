'use strict';

/* =========================================================================
   Exercise library: quick search, and the top 3 alternatives for each exercise.
   Every exercise keeps its own history by name, so an alternative gets its own
   "previous" column, progression suggestions, PRs, machine settings and weight jump.
   Loaded before app.js; uses its helpers and state at call time.
   ========================================================================= */

const MUSCLES = {
  chest: 'Chest', upperchest: 'Upper chest', shoulders: 'Shoulders', sidedelts: 'Side delts', reardelts: 'Rear delts',
  triceps: 'Triceps', lats: 'Lats', back: 'Mid back', biceps: 'Biceps', quads: 'Quads', hamstrings: 'Hamstrings',
  glutes: 'Glutes', calves: 'Calves', core: 'Core', cardio: 'Cardio',
};

// [name, muscle, compound, type]
const EX_ROWS = [
  ['Barbell bench press', 'chest', 1], ['Dumbbell bench press', 'chest', 1], ['Machine chest press', 'chest', 1],
  ['Smith machine bench press', 'chest', 1], ['Push-up', 'chest', 1], ['Chest dip', 'chest', 1],
  ['Cable fly', 'chest', 0], ['Pec deck', 'chest', 0], ['Dumbbell fly', 'chest', 0],
  ['Incline barbell press', 'upperchest', 1], ['Incline dumbbell press', 'upperchest', 1], ['Incline machine press', 'upperchest', 1],
  ['Incline Smith press', 'upperchest', 1], ['Low-to-high cable fly', 'upperchest', 0],
  ['Seated dumbbell shoulder press', 'shoulders', 1], ['Machine shoulder press', 'shoulders', 1], ['Barbell overhead press', 'shoulders', 1],
  ['Arnold press', 'shoulders', 1],
  ['Dumbbell lateral raise', 'sidedelts', 0], ['Cable lateral raise', 'sidedelts', 0], ['Machine lateral raise', 'sidedelts', 0],
  ['Upright row (wide grip)', 'sidedelts', 0],
  ['Reverse pec deck', 'reardelts', 0], ['Cable rear-delt fly', 'reardelts', 0], ['Bent-over dumbbell reverse fly', 'reardelts', 0],
  ['Face pull', 'reardelts', 0],
  ['Cable triceps pushdown', 'triceps', 0], ['Rope triceps pushdown', 'triceps', 0], ['Overhead cable triceps extension', 'triceps', 0],
  ['Dumbbell overhead triceps extension', 'triceps', 0], ['EZ-bar skull crusher', 'triceps', 0], ['Triceps dip machine', 'triceps', 0],
  ['Close-grip bench press', 'triceps', 1],
  ['Lat pulldown', 'lats', 1], ['Assisted pull-up', 'lats', 1], ['Pull-up', 'lats', 1], ['Single-arm cable pulldown', 'lats', 0],
  ['Straight-arm cable pulldown', 'lats', 0],
  ['Chest-supported row', 'back', 1], ['Seated cable row', 'back', 1], ['Machine row', 'back', 1], ['Barbell row', 'back', 1],
  ['Single-arm dumbbell row', 'back', 1], ['T-bar row', 'back', 1],
  ['EZ-bar curl', 'biceps', 0], ['Dumbbell curl', 'biceps', 0], ['Hammer curl', 'biceps', 0], ['Cable curl', 'biceps', 0],
  ['Preacher curl', 'biceps', 0], ['Incline dumbbell curl', 'biceps', 0], ['Rope hammer curl', 'biceps', 0],
  ['Cross-body hammer curl', 'biceps', 0], ['Reverse-grip EZ-bar curl', 'biceps', 0],
  ['Leg press', 'quads', 1], ['Hack squat', 'quads', 1], ['Goblet squat', 'quads', 1], ['Barbell back squat', 'quads', 1],
  ['Smith machine squat', 'quads', 1], ['Leg extension', 'quads', 0], ['Bulgarian split squat', 'quads', 1],
  ['Walking lunge', 'quads', 1], ['Reverse lunge', 'quads', 1], ['Step-up', 'quads', 1],
  ['Romanian deadlift', 'hamstrings', 1], ['Dumbbell RDL', 'hamstrings', 1], ['Cable pull-through', 'hamstrings', 0],
  ['Seated leg curl', 'hamstrings', 0], ['Lying leg curl', 'hamstrings', 0],
  ['Hip thrust', 'glutes', 1], ['Glute bridge', 'glutes', 0],
  ['Standing calf raise', 'calves', 0], ['Seated calf raise', 'calves', 0], ['Leg press calf raise', 'calves', 0],
  ['Smith machine calf raise', 'calves', 0],
  ['Plank', 'core', 0, 'time'], ['Side plank', 'core', 0, 'time'], ['Dead bug', 'core', 0], ['Cable crunch', 'core', 0],
  ['Machine crunch', 'core', 0], ['Hanging knee raise', 'core', 0], ['Ab wheel rollout', 'core', 0],
  ['Incline treadmill walk', 'cardio', 0, 'cardio'], ['Stationary bike', 'cardio', 0, 'cardio'], ['Elliptical', 'cardio', 0, 'cardio'],
  ['Rowing machine', 'cardio', 0, 'cardio'], ['Stair climber', 'cardio', 0, 'cardio'],
];
const EX_LIB = EX_ROWS.map(([name, muscle, compound, type]) => ({ name, muscle, compound: !!compound, type: type || 'reps' }));

// Hand-picked top 3 for every exercise in the 4-day template (based on the doc's swap list).
const ALTS = {
  'machine or barbell bench press': ['Dumbbell bench press', 'Machine chest press', 'Smith machine bench press'],
  'incline dumbbell press': ['Incline machine press', 'Incline barbell press', 'Incline Smith press'],
  'seated chest press or cable fly': ['Pec deck', 'Dumbbell fly', 'Machine chest press'],
  'seated shoulder press': ['Seated dumbbell shoulder press', 'Machine shoulder press', 'Arnold press'],
  'dumbbell lateral raise': ['Cable lateral raise', 'Machine lateral raise', 'Upright row (wide grip)'],
  'cable triceps pushdown': ['Rope triceps pushdown', 'Overhead cable triceps extension', 'Triceps dip machine'],
  'overhead cable triceps extension': ['Dumbbell overhead triceps extension', 'EZ-bar skull crusher', 'Rope triceps pushdown'],
  'lat pulldown or assisted pull-up': ['Assisted pull-up', 'Single-arm cable pulldown', 'Pull-up'],
  'chest-supported row': ['Seated cable row', 'Machine row', 'Single-arm dumbbell row'],
  'seated cable row': ['Machine row', 'Chest-supported row', 'Single-arm dumbbell row'],
  'reverse pec deck or cable rear-delt fly': ['Face pull', 'Cable rear-delt fly', 'Bent-over dumbbell reverse fly'],
  'ez-bar or dumbbell curl': ['Cable curl', 'Preacher curl', 'Incline dumbbell curl'],
  'hammer curl': ['Rope hammer curl', 'Cross-body hammer curl', 'Reverse-grip EZ-bar curl'],
  'leg press or squat variation': ['Hack squat', 'Goblet squat', 'Smith machine squat'],
  'romanian deadlift (db or barbell)': ['Dumbbell RDL', 'Cable pull-through', 'Hip thrust'],
  'seated or lying leg curl': ['Lying leg curl', 'Seated leg curl', 'Cable pull-through'],
  'leg extension': ['Goblet squat', 'Bulgarian split squat', 'Hack squat'],
  'walking lunge or split squat': ['Bulgarian split squat', 'Reverse lunge', 'Step-up'],
  'standing or seated calf raise': ['Leg press calf raise', 'Seated calf raise', 'Smith machine calf raise'],
  'plank': ['Dead bug', 'Side plank', 'Ab wheel rollout'],
  'cable crunch or dead bug': ['Hanging knee raise', 'Ab wheel rollout', 'Machine crunch'],
  'incline dumbbell press or machine chest press': ['Incline machine press', 'Dumbbell bench press', 'Push-up'],
  'cable row or machine row': ['Seated cable row', 'Chest-supported row', 'Single-arm dumbbell row'],
  'cable or dumbbell lateral raise': ['Machine lateral raise', 'Upright row (wide grip)', 'Arnold press'],
  'preacher curl or cable curl': ['EZ-bar curl', 'Dumbbell curl', 'Incline dumbbell curl'],
  'rope triceps pushdown': ['Cable triceps pushdown', 'Overhead cable triceps extension', 'Triceps dip machine'],
  'optional cardio': ['Incline treadmill walk', 'Stationary bike', 'Elliptical'],
};

const libEntry = (name) => EX_LIB.find((x) => keyOf(x.name) === keyOf(name));
const programEx = (name) => S.program.flatMap((d) => d.exercises).find((x) => keyOf(x.name) === keyOf(name));

/** Muscle group for any exercise: library entry, else guess from the template's muscle note. */
function muscleOf(name, note = '') {
  const lib = libEntry(name);
  if (lib) return lib.muscle;
  const hay = keyOf(`${note} ${name}`);
  const guess = [['upper chest', 'upperchest'], ['side delt', 'sidedelts'], ['rear delt', 'reardelts'], ['chest', 'chest'], ['shoulder', 'shoulders'],
    ['tricep', 'triceps'], ['vertical pull', 'lats'], ['pulldown', 'lats'], ['back', 'back'], ['row', 'back'], ['bicep', 'biceps'], ['curl', 'biceps'],
    ['quad', 'quads'], ['hamstring', 'hamstrings'], ['glute', 'glutes'], ['calf', 'calves'], ['calves', 'calves'], ['core', 'core'], ['cardio', 'cardio']];
  return guess.find(([k]) => hay.includes(k))?.[1] || null;
}

/** Top 3 alternatives for an exercise slot. */
function alternativesFor(slotName, note = '') {
  const set = ALTS[keyOf(slotName)];
  if (set) return set;
  const m = muscleOf(slotName, note);
  if (!m) return [];
  const self = libEntry(slotName);
  return EX_LIB.filter((x) => x.muscle === m && keyOf(x.name) !== keyOf(slotName))
    .sort((a, b) => (b.compound === !!self?.compound) - (a.compound === !!self?.compound))
    .slice(0, 3).map((x) => x.name);
}

/** Every exercise you could pick: library, your plan, and anything you've logged before. */
function allExercises() {
  const seen = new Map();
  const add = (name, extra) => { const k = keyOf(name); if (k && !seen.has(k)) seen.set(k, { name, ...extra }); };
  S.program.flatMap((d) => d.exercises).forEach((e) => add(e.name, { muscle: muscleOf(e.name, e.muscle), compound: e.compound, type: e.type, inPlan: true }));
  EX_LIB.forEach((e) => add(e.name, e));
  S.workouts.forEach((w) => w.exercises.forEach((e) => add(e.name, { muscle: muscleOf(e.name, e.muscle), compound: !!e.compound, type: e.type || 'reps' })));
  return [...seen.values()];
}

/** Switch a logged exercise to another exercise, keeping the slot's sets and rep range. */
function switchExercise(e, name) {
  if (!name || keyOf(name) === keyOf(e.name)) return;
  e.base ||= e.name;
  e.slotType ||= e.type || 'reps';
  e.slotRange ||= [e.repMin, e.repMax];
  const info = programEx(name) || libEntry(name);
  const type = info?.type || e.slotType;
  e.name = name;
  if (info) e.compound = !!info.compound;
  if (type !== e.type) {
    e.type = type;
    [e.repMin, e.repMax] = type === e.slotType ? e.slotRange : type === 'time' ? [30, 60] : type === 'cardio' ? [10, 20] : [10, 15];
  }
  e.rir = null; e.reset = false;
  e.sets.forEach((s) => { if (!s.done) { s.w = ''; s.r = ''; } });
}

/** The alternative used most recently in this slot (so the dropdown can mark it). */
function lastUsedInSlot(slot) {
  for (const w of finished()) {
    const e = w.exercises.find((x) => keyOf(x.base || x.name) === keyOf(slot));
    if (e) return e.name;
  }
  return null;
}

function variantPicker(w, e, i) {
  const slot = e.base || e.name;
  const prog = programEx(slot);
  const alts = alternativesFor(slot, prog?.muscle || e.muscle);
  const opts = [slot, ...alts];
  if (!opts.some((n) => keyOf(n) === keyOf(e.name))) opts.push(e.name);
  const used = lastUsedInSlot(slot);
  const label = (n) => {
    const lp = lastPerformance(n, w.id, w.date);
    const tags = [keyOf(n) === keyOf(slot) ? 'main' : '', used && keyOf(used) === keyOf(n) && keyOf(n) !== keyOf(slot) ? 'last used' : ''].filter(Boolean);
    return `${n}${tags.length ? ` (${tags.join(', ')})` : ''}${lp ? ` · last ${lp.sets.slice(0, 1).map((s) => fmtSet(s, e)).join('')}` : ''}`;
  };
  return `<select class="variant" data-a-change="variant" data-i="${i}" aria-label="Switch exercise">
    ${opts.map((n) => `<option value="${esc(n)}" ${keyOf(n) === keyOf(e.name) ? 'selected' : ''}>${esc(label(n))}</option>`).join('')}
    <option value="__search">🔍 Search all exercises…</option>
  </select>`;
}

// ---------- quick search ----------
function searchExercises(q, group) {
  const qn = keyOf(q);
  const toks = qn.split(/\s+/).filter(Boolean);
  const recentRank = new Map();
  finished().forEach((w, i) => w.exercises.forEach((e) => { const k = keyOf(e.name); if (!recentRank.has(k)) recentRank.set(k, i); }));
  return allExercises()
    .filter((x) => (!group || x.muscle === group) && toks.every((t) => `${keyOf(x.name)} ${keyOf(MUSCLES[x.muscle] || '')}`.includes(t)))
    .map((x) => {
      const n = keyOf(x.name);
      let s = !qn ? 0 : n.startsWith(qn) ? 0 : n.split(/[\s\-(]+/).some((wd) => wd.startsWith(toks[0])) ? 1 : 2;
      if (recentRank.has(n)) s -= 0.5 - Math.min(recentRank.get(n), 40) / 100;
      if (x.inPlan) s -= 0.2;
      return [s + n.length / 1000, x];
    })
    .sort((a, b) => a[0] - b[0]).map((r) => r[1]).slice(0, 60);
}

function viewExerciseSearch() {
  const xs = ui.exSearch;
  const target = xs.mode === 'swap' ? S.active.exercises[xs.i] : null;
  return `
  <div class="row" style="margin-bottom:12px"><button class="icon-btn" data-a="exs-close" aria-label="Back">‹</button>
    <b class="grow ellipsis">${target ? `Switch ${esc(target.name)}` : 'Add exercise'}</b></div>
  <div class="search-box"><input id="ex-q" type="search" placeholder="Search exercises (e.g. row, curl, chest)" value="${esc(xs.q)}" autocomplete="off" enterkeyhint="search"></div>
  <div class="chips" style="margin:10px 0">${Object.entries(MUSCLES).map(([k, l]) => `<button class="chip ${xs.group === k ? 'on' : ''}" data-a="exs-group" data-v="${k}">${l}</button>`).join('')}</div>
  <div id="ex-results">${exerciseResultsHtml()}</div>`;
}
function exerciseResultsHtml() {
  const xs = ui.exSearch;
  const list = searchExercises(xs.q, xs.group);
  xs.list = list;
  const custom = xs.q.trim() && !list.some((x) => keyOf(x.name) === keyOf(xs.q)) ? `<button class="btn block" data-a="exs-custom">Use “${esc(xs.q.trim())}” as a custom exercise</button>` : '';
  if (!list.length) return `<div class="card empty">No matches.</div>${custom}`;
  return `<div class="card">${list.map((x, k) => {
    const lp = lastPerformance(x.name);
    return `<div class="list-item tap" data-a="exs-pick" data-k="${k}"><div class="grow">
      <div class="ellipsis">${esc(x.name)}${x.inPlan ? ' <span class="tag">In plan</span>' : ''}</div>
      <div class="food-macros ellipsis">${esc(MUSCLES[x.muscle] || 'Other')}${x.compound ? ' · compound' : ''}${lp ? ` · last ${esc(fmtDate(lp.date, { month: 'short', day: 'numeric' }))}: ${esc(lp.sets.map((s) => fmtSet(s, lp.e)).join(', '))}` : ''}</div>
    </div><span class="muted">›</span></div>`;
  }).join('')}</div>${custom}`;
}
function renderExerciseResults() { const el = $('#ex-results'); if (el) el.innerHTML = exerciseResultsHtml(); }

function openExerciseSearch(mode, i) {
  ui.exSearch = { mode, i: i == null ? null : Number(i), q: '', group: null, list: [], y: window.scrollY };
  render(); window.scrollTo(0, 0);
}
function closeExerciseSearch() {
  const y = ui.exSearch?.y || 0;
  ui.exSearch = null; render(); window.scrollTo(0, y);
}
function pickExercise(name) {
  const xs = ui.exSearch;
  if (xs.mode === 'swap') {
    switchExercise(S.active.exercises[xs.i], name);
  } else {
    const tmpl = programEx(name);
    const lib = libEntry(name);
    const base = tmpl || ex(name, MUSCLES[lib?.muscle] || '', 3, lib?.type === 'time' ? 30 : lib?.type === 'cardio' ? 10 : 8, lib?.type === 'time' ? 60 : lib?.type === 'cardio' ? 20 : 12, { type: lib?.type, compound: lib?.compound });
    if (lib?.type === 'cardio') base.sets = 1;
    S.active.exercises.push(logExercise(base));
  }
  save();
  toast(xs.mode === 'swap' ? `Switched to ${name}` : `${name} added`);
  closeExerciseSearch();
}

const exerciseActions = {
  'exs-open'(d) { openExerciseSearch(d.mode, d.i); },
  'exs-close'() { closeExerciseSearch(); },
  'exs-group'(d) { ui.exSearch.group = ui.exSearch.group === d.v ? null : d.v; render(); },
  'exs-pick'(d) { const x = ui.exSearch.list[d.k]; if (x) pickExercise(x.name); },
  'exs-custom'() { pickExercise(ui.exSearch.q.trim()); },
};

document.addEventListener('input', (ev) => {
  if (ev.target.id === 'ex-q' && ui.exSearch) { ui.exSearch.q = ev.target.value; renderExerciseResults(); }
});
document.addEventListener('change', (ev) => {
  const el = ev.target;
  if (el.dataset.aChange !== 'variant' || !S.active) return;
  if (el.value === '__search') return openExerciseSearch('swap', el.dataset.i);
  const e = S.active.exercises[el.dataset.i];
  if (e.sets.some((s) => s.done) && !confirm(`Switch to ${el.value}? Sets you already completed will count toward ${el.value}.`)) { el.value = e.name; return; }
  switchExercise(e, el.value);
  save(); render();
});
document.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && ev.target.id === 'ex-q') ev.target.blur(); });
