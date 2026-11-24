'use strict';

/* =========================================================================
   Progressive overload engine.
   Double progression (reps to the top of the range, then add weight), adjusted by:
   - reps in reserve (RIR) from a one-tap effort check after each exercise
   - the "Next time" choices saved with the last workout
   - stall detection (3 sessions with no estimated-1RM gain) with an optional lighter restart
   - back-off when reps fall below the range two sessions in a row
   - an optional lighter Week 4 (90% weight, one less set)
   - a weight jump per exercise (big lower-body lifts default to double)
   Loaded before app.js; uses its helpers and state at call time.
   ========================================================================= */

const STALL_SESSIONS = 3;
const DELOAD_PCT = 0.9;
const BACKOFF_PCT = 0.925;
const RIR_OPTIONS = [[0, '0'], [1, '1'], [2, '2'], [3, '3+']];
const STATUS = {
  new: ['New', ''],
  up: ['↑ Progressing', 'st-up'],
  hold: ['→ Holding', 'st-hold'],
  stalled: ['⚠ Stalled', 'st-stall'],
  down: ['↓ Back off', 'st-down'],
  deload: ['Lighter week', 'st-hold'],
};

const isBigLower = (e) => /leg press|squat|deadlift|\brdl\b|hack|hip thrust/i.test(e.name) && e.compound;
function defaultInc(e) {
  const base = num(S.settings.increment) || (unit() === 'kg' ? 2.5 : 5);
  return isBigLower(e) ? base * 2 : base;
}
/** Weight jump for an exercise: its own setting if set, else the default for its type. */
const incFor = (e) => num(S.setup[keyOf(e.name)]?.inc) || defaultInc(e);
const roundTo = (x, step) => r1(Math.round(x / step) * step);
const floorTo = (x, step) => r1(Math.floor(x / step) * step);

function deloadActive(date) {
  return !!S.settings.deloadWeek4 && cycleInfo(date).week === 4;
}

/** Past sessions of an exercise (most recent first), with the context that shapes the next suggestion. */
function exHistory(name, excludeId, beforeDate) {
  const k = keyOf(name);
  const out = [];
  for (const w of finished()) {
    if (w.id === excludeId || (beforeDate && w.date > beforeDate)) continue;
    const e = w.exercises.find((x) => keyOf(x.name) === k);
    if (!e) continue;
    const sets = e.sets.filter((s) => s.done && (num(s.w) != null || num(s.r) != null));
    if (!sets.length) continue;
    const best = Math.max(0, ...sets.map((s) => e1rm(num(s.w), num(s.r))));
    out.push({ date: w.date, sets, best, rir: e.rir ?? null, reset: !!e.reset, deload: !!w.deload, nextTime: w.nextTime || [] });
  }
  return out;
}

/** ↑ / → / ⚠ / ↓ for an exercise based on recent sessions (deload weeks ignored). */
function exStatus(e, hist) {
  const h = hist.filter((x) => !x.deload);
  if (!h.length) return 'new';
  if (e.type !== 'reps') return h.length > 1 && h[0].best > h[1].best ? 'up' : 'hold';
  const below = (x) => x.sets.some((s) => num(s.r) != null && num(s.r) < e.repMin);
  if (h.length >= 2 && below(h[0]) && below(h[1]) && !h[0].reset) return 'down';
  // Only sessions since the last lighter restart count toward a stall.
  const cut = h.findIndex((x) => x.reset);
  const win = cut >= 0 ? h.slice(0, cut + 1) : h;
  if (win.length > STALL_SESSIONS) {
    const recent = Math.max(...win.slice(0, STALL_SESSIONS).map((x) => x.best));
    const before = Math.max(...win.slice(STALL_SESSIONS).map((x) => x.best));
    if (recent <= before * 1.005) return 'stalled';
  }
  if (h.length >= 2 && h[0].best > h[1].best) return 'up';
  return 'hold';
}

/**
 * Suggestion for a logged exercise in workout w.
 * Returns { text, good, perSet: [{w, r}], status, canReset, inc }.
 */
function progressionFor(e, w) {
  const tmpl = { ...e, sets: e.targetSets ?? e.sets.length };
  const hist = exHistory(e.name, w.id, w.date);
  const status = exStatus(tmpl, hist);
  const inc = incFor(tmpl);
  const last = hist.find((x) => !x.deload) || hist[0];
  const res = (o) => ({ status, canReset: false, inc, good: false, perSet: [], ...o });
  if (!last) return res({ text: 'First time: pick a weight that leaves 1–3 reps in reserve.' });

  const lastStr = last.sets.map((s) => fmtSet(s, tmpl)).join(', ');
  const when = fmtDate(last.date, { month: 'short', day: 'numeric' });
  const head = `Last (${when}): ${lastStr}${last.rir != null ? ` · ${last.rir >= 3 ? '3+' : last.rir} in reserve` : ''}.`;
  const n = Math.max(e.sets.length, tmpl.sets);
  const fill = (wt, r) => Array.from({ length: n }, () => ({ w: wt, r }));
  const ws = last.sets.map((s) => num(s.w));
  const rs = last.sets.map((s) => num(s.r));
  const W = Math.max(0, ...ws.filter((x) => x != null));
  const hold = () => last.sets.map((s) => ({ w: s.w, r: Math.min(tmpl.repMax, (num(s.r) || tmpl.repMin - 1) + 1) }));

  if (tmpl.type === 'cardio') return res({ text: head, perSet: last.sets.map((s) => ({ w: s.w, r: s.r })) });
  if (tmpl.type === 'time') {
    const allMax = rs.every((r) => r != null && r >= tmpl.repMax);
    if (allMax) return res({ good: true, text: `${head} Hit ${tmpl.repMax}s on every set — add load or a harder variation.`, perSet: last.sets.map((s) => ({ w: s.w, r: tmpl.repMax })) });
    return res({ text: `${head} Try holding about 5 seconds longer.`, perSet: last.sets.map((s) => ({ w: s.w, r: Math.min(tmpl.repMax, (num(s.r) || tmpl.repMin) + 5) })) });
  }

  // Lighter week takes priority; next week resumes from the last normal session.
  if (w.deload && W > 0) {
    const dw = floorTo(W * DELOAD_PCT, inc);
    return res({ status: 'deload', text: `${head} Lighter week: ${dw} ${unit()} (about 90%), one less set, stop 2–3 reps short of failure. Back to normal next week.`, perSet: fill(dw, Math.min(...rs.filter((r) => r != null), tmpl.repMax)) });
  }
  // Lighter restart chosen for this session.
  if (e.reset && W > 0) {
    const rw = floorTo(W * DELOAD_PCT, inc);
    return res({ status: 'stalled', canReset: true, text: `${head} Lighter restart: ${rw} ${unit()} (about 90%). Aim for the top of the range, then build back up past your old numbers.`, perSet: fill(rw, tmpl.repMax) });
  }

  const enoughSets = last.sets.length >= Math.min(tmpl.sets, 2);
  const allTop = enoughSets && rs.every((r) => r != null && r >= tmpl.repMax);
  const up = (k) => r1(W + inc * k);

  // An explicit "Next time" choice from the last workout wins over the automatic rule.
  const nt = last.nextTime;
  if (W > 0 && nt.includes('Increase weight')) {
    return res({ status: 'up', good: true, text: `${head} You chose “Increase weight” — go up to ${up(1)} ${unit()} and start at ${tmpl.repMin} reps.`, perSet: fill(up(1), tmpl.repMin) });
  }
  if (nt.includes('Add reps')) return res({ text: `${head} You chose “Add reps” — same weight, +1 rep per set.`, perSet: hold() });
  if (nt.includes('Keep weights')) return res({ text: `${head} You chose “Keep weights” — repeat the same weights and reps with cleaner form.`, perSet: last.sets.map((s) => ({ w: s.w, r: s.r })) });
  const adjustNote = nt.includes('Adjust exercise') ? ' You flagged this day to adjust exercises — swap from the ⋯ menu if needed.' : '';

  if (status === 'down' && W > 0) {
    const bw = floorTo(W * BACKOFF_PCT, inc) < W ? floorTo(W * BACKOFF_PCT, inc) : r1(W - inc);
    return res({ text: `${head} Reps fell below ${tmpl.repMin} two sessions in a row — drop to ${bw} ${unit()} and rebuild.${adjustNote}`, perSet: fill(bw, tmpl.repMin) });
  }
  if (allTop && W > 0) {
    const k = last.rir != null && last.rir >= 3 ? 2 : 1;
    const why = k === 2 ? 'Top of range with 3+ reps to spare' : 'Top of range on all sets';
    return res({ status: 'up', good: true, text: `${head} ${why} — go up to ${up(k)} ${unit()}.${adjustNote}`, perSet: fill(up(k), tmpl.repMin) });
  }
  if (status === 'stalled') {
    return res({ canReset: true, text: `${head} No progress in ${STALL_SESSIONS} sessions. Keep pushing for +1 rep, or tap “Lighter restart” to drop about 10% and build back up. A similar swap (⋯) can also help.${adjustNote}`, perSet: hold() });
  }
  const below = rs.some((r) => r != null && r < tmpl.repMin);
  const lead = below && last.rir === 0 ? 'Same weight — focus on getting back into the rep range.' : 'Same weight — aim for +1 rep per set.';
  return res({ text: `${head} ${lead}${adjustNote}`, perSet: hold() });
}

function statusTag(status) {
  const [label, cls] = STATUS[status] || STATUS.new;
  return `<span class="tag ${cls}">${label}</span>`;
}

/** One-tap effort check shown under an exercise once a set is done. */
function rirPicker(e, i) {
  if (e.type !== 'reps' || !e.sets.some((s) => s.done)) return '';
  return `<div class="rir row wrap"><span class="small muted grow">Reps left in the tank on your last set?</span>
    <div class="chips">${RIR_OPTIONS.map(([v, l]) => `<button class="chip ${e.rir === v ? 'on' : ''}" data-a="rir" data-i="${i}" data-v="${v}">${l}</button>`).join('')}</div></div>`;
}

const progressionActions = {
  rir(d) {
    const e = S.active.exercises[d.i];
    e.rir = e.rir === Number(d.v) ? null : Number(d.v);
    save(); render();
  },
  'ex-reset'(d) {
    const e = S.active.exercises[d.i];
    e.reset = !e.reset;
    e.sets.forEach((s) => { if (!s.done) { s.w = ''; s.r = ''; } });
    save(); render();
  },
};
