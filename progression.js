'use strict';

/* =========================================================================
   Progressive overload engine.
   Double progression (reps to the top of the range, then add weight), or per-set targets
   for pyramids and waves (10-8-6, 3-2-1), adjusted by:
   - a weekly effort target (reps in reserve: 3, 2, 1 across the cycle)
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
    out.push({ date: w.date, sets, best, rir: e.rir ?? null, reset: !!e.reset, deload: !!w.deload, nextTime: w.nextTime || [], scheme: e.scheme || null });
  }
  return out;
}

/** Reps-in-reserve target for the week of the cycle: 3, 2, 1, then 1 (or 3 on a lighter Week 4). */
function rirTarget(date, deload) {
  if (deload) return 3;
  return [3, 2, 1, 1][cycleInfo(date).week - 1];
}
/** "3+" is recorded as 3; treat it as 4 when comparing with the target. */
const rirValue = (r) => (r >= 3 ? 4 : r);
const isScheme = (e) => Array.isArray(e.scheme) && e.scheme.length > 1;

/** ↑ / → / ⚠ / ↓ for an exercise based on recent sessions (deload weeks ignored). */
function exStatus(e, hist) {
  const h = hist.filter((x) => !x.deload);
  if (!h.length) return 'new';
  if (e.type !== 'reps') return h.length > 1 && h[0].best > h[1].best ? 'up' : 'hold';
  // Judge each session against the targets it actually had (rotating pyramids change weekly).
  const below = (x) => x.sets.some((s, j) => {
    const r = num(s.r);
    if (r == null) return false;
    const sch = isScheme(x) ? x.scheme : isScheme(e) ? e.scheme : null;
    return sch ? j < sch.length && r < sch[j] - 1 : r < e.repMin;
  });
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
 * Returns { last, text, target, good, perSet: [{w, r}], status, canReset, inc }.
 *   last   – one line describing the last session
 *   text   – what to do today and why, in one line
 *   target – this week's effort target (rep-based exercises only)
 */
function progressionFor(e, w) {
  const tmpl = { ...e, sets: e.targetSets ?? e.sets.length };
  const hist = exHistory(e.name, w.id, w.date);
  const status = exStatus(tmpl, hist);
  const inc = incFor(tmpl);
  const tgt = tmpl.type === 'reps' ? rirTarget(w.date, w.deload) : null;
  const target = tgt == null ? '' : `Effort: stop about ${tgt} rep${tgt === 1 ? '' : 's'} short of failure${w.deload ? ' (lighter week)' : ` (Week ${cycleInfo(w.date).week})`}.`;
  const prior = hist.find((x) => !x.deload) || hist[0];
  const res = (o) => ({ status, canReset: false, inc, good: false, perSet: [], last: '', target, ...o });
  const scheme = isScheme(tmpl) ? tmpl.scheme : null;
  if (!prior) {
    return res({ text: scheme ? `First time: start light and go heavier each set (${scheme.join(' / ')} reps), last set hardest.` : 'First time: pick a weight you can do with good form and stop at the effort target.' });
  }

  const describe = (x) => `Last ${fmtDate(x.date, { month: 'short', day: 'numeric' })}: ${x.sets.map((s) => fmtSet(s, tmpl)).join(', ')}${x.rir != null ? ` · ${x.rir >= 3 ? '3+' : x.rir} left` : ''}`;
  let lastLine = describe(prior);
  const R = (o) => res({ last: lastLine, ...o });
  const n = Math.max(e.sets.length, tmpl.sets);
  const fill = (wt, r) => Array.from({ length: n }, () => ({ w: wt, r }));
  const ws = prior.sets.map((s) => num(s.w));
  const rs = prior.sets.map((s) => num(s.r));
  const W = Math.max(0, ...ws.filter((x) => x != null));
  const U = unit();

  if (tmpl.type === 'cardio') return R({ text: 'Repeat or go a little longer / harder.', perSet: prior.sets.map((s) => ({ w: s.w, r: s.r })) });
  if (tmpl.type === 'time') {
    const allMax = rs.every((r) => r != null && r >= tmpl.repMax);
    if (allMax) return R({ good: true, text: `Hit ${tmpl.repMax}s on every set — add load or a harder variation.`, perSet: prior.sets.map((s) => ({ w: s.w, r: tmpl.repMax })) });
    return R({ text: 'Hold about 5 seconds longer.', perSet: prior.sets.map((s) => ({ w: s.w, r: Math.min(tmpl.repMax, (num(s.r) || tmpl.repMin) + 5) })) });
  }

  // How the last session's effort compared with the target it had.
  const priorTgt = rirTarget(prior.date, prior.deload);
  const spare = prior.rir == null ? 0 : rirValue(prior.rir) - priorTgt;
  const nt = prior.nextTime;
  const adjust = nt.includes('Adjust exercise') ? ' You flagged this day to adjust exercises — use the dropdown to switch.' : '';

  // ----- Pyramid / wave: a rep target for each set, heavier each set -----
  if (scheme) {
    const label = scheme.join(' / ');
    const key = scheme.join('-');
    // Weights come from the last time you ran this same pyramid.
    const same = hist.find((x) => !x.deload && isScheme(x) && x.scheme.join('-') === key);
    if (!same) {
      // New pyramid for you (or this week's rotation): estimate each set from the last session's sets.
      // Count the reps that were left in the tank (logged, or that week's target) so lower-rep weeks get heavier.
      const left = prior.rir != null ? prior.rir : rirTarget(prior.date, prior.deload);
      const est = scheme.map((t, j) => {
        const s = prior.sets[Math.min(j, prior.sets.length - 1)];
        const e1 = e1rm(num(s?.w), (num(s?.r) || 0) + left);
        return e1 ? floorTo(e1 / (1 + (t + tgt) / 30), inc) : '';
      });
      if (est.every((x) => x === '')) return R({ text: `New pyramid (${label}): start light and go heavier each set.` });
      for (let j = 1; j < est.length; j++) if (est[j] !== '' && est[j - 1] !== '' && est[j] < est[j - 1]) est[j] = est[j - 1];
      const k = w.deload ? DELOAD_PCT : 1;
      return R({ status: w.deload ? 'deload' : status, text: `New this week: ${label}. Weights estimated from your last session${w.deload ? ', then about 90% for the lighter week' : ''} — adjust to hit the effort target.`, perSet: scheme.map((t, j) => ({ w: est[j] === '' ? '' : floorTo(est[j] * k, inc) || est[j], r: t })) });
    }
    lastLine = describe(same);
    const sameRir = same.rir == null ? 0 : rirValue(same.rir) - rirTarget(same.date, same.deload);
    const snt = same.nextTime;
    const wAt = (j) => num(same.sets[j]?.w) ?? num(same.sets.at(-1)?.w) ?? 0;
    const per = (fn) => scheme.map((t, j) => ({ w: fn(wAt(j)), r: t }));
    if (w.deload) return R({ status: 'deload', text: 'Lighter week: about 90% on each set, stop well short of failure.', perSet: per((x) => floorTo(x * DELOAD_PCT, inc)) });
    if (e.reset) return R({ status: 'stalled', canReset: true, text: 'Lighter restart: about 90% on each set, then build back up.', perSet: per((x) => floorTo(x * DELOAD_PCT, inc)) });
    const hitAll = scheme.every((t, j) => (num(same.sets[j]?.r) ?? 0) >= t);
    if (snt.includes('Increase weight') || hitAll) {
      const kk = !snt.includes('Increase weight') && sameRir >= 2 ? 2 : 1;
      const why = snt.includes('Increase weight') ? 'You chose “Increase weight”' : kk === 2 ? `Hit ${label} with reps to spare` : `Hit ${label} last time`;
      return R({ status: 'up', good: true, text: `${why} — add ${r1(inc * kk)} ${U} to each set.${adjust}`, perSet: per((x) => r1(x + inc * kk)) });
    }
    if (status === 'down') return R({ text: `Missed the targets twice — drop each set about 7.5% and rebuild.${adjust}`, perSet: per((x) => floorTo(x * BACKOFF_PCT, inc)) });
    if (status === 'stalled') return R({ canReset: true, text: `No progress in ${STALL_SESSIONS} sessions — keep at it or tap “Lighter restart”.${adjust}`, perSet: per((x) => x) });
    return R({ text: `Same weights as last time on ${label} — hit every set.${adjust}`, perSet: per((x) => x) });
  }

  // ----- Straight sets: a rep range (8–12) or fixed reps (5-5-5) -----
  const fixed = tmpl.repMin === tmpl.repMax;
  const hold = (extra = 1) => prior.sets.map((s) => ({ w: s.w, r: Math.min(tmpl.repMax, (num(s.r) || tmpl.repMin - 1) + extra) }));
  const up = (k) => r1(W + inc * k);

  // Lighter week takes priority; next week resumes from the last normal session.
  if (w.deload && W > 0) {
    const dw = floorTo(W * DELOAD_PCT, inc);
    return R({ status: 'deload', text: `Lighter week: ${dw} ${U} (about 90%), one less set. Back to normal next week.`, perSet: fill(dw, Math.min(...rs.filter((r) => r != null), tmpl.repMax)) });
  }
  if (e.reset && W > 0) {
    const rw = floorTo(W * DELOAD_PCT, inc);
    return R({ status: 'stalled', canReset: true, text: `Lighter restart: ${rw} ${U} (about 90%), then build back past your old numbers.`, perSet: fill(rw, tmpl.repMax) });
  }

  const enoughSets = prior.sets.length >= Math.min(tmpl.sets, 2);
  const allTop = enoughSets && rs.every((r) => r != null && r >= tmpl.repMax);

  // An explicit "Next time" choice from the last workout wins over the automatic rule.
  if (W > 0 && nt.includes('Increase weight')) {
    return R({ status: 'up', good: true, text: `You chose “Increase weight” — ${up(1)} ${U} × ${tmpl.repMin}.`, perSet: fill(up(1), tmpl.repMin) });
  }
  if (nt.includes('Add reps') && !fixed) return R({ text: 'You chose “Add reps” — same weight, +1 rep per set.', perSet: hold() });
  if (nt.includes('Keep weights')) return R({ text: 'You chose “Keep weights” — repeat with cleaner form.', perSet: prior.sets.map((s) => ({ w: s.w, r: s.r })) });

  if (status === 'down' && W > 0) {
    const bw = floorTo(W * BACKOFF_PCT, inc) < W ? floorTo(W * BACKOFF_PCT, inc) : r1(W - inc);
    return R({ text: `Under ${tmpl.repMin} reps twice in a row — drop to ${bw} ${U} and rebuild.${adjust}`, perSet: fill(bw, tmpl.repMin) });
  }
  if (allTop && W > 0) {
    const k = spare >= 2 ? 2 : 1;
    const why = k === 2 ? `Hit ${fixed ? 'every rep' : 'the top of the range'} with ${prior.rir >= 3 ? '3+' : prior.rir} left (target ${priorTgt})` : fixed ? 'Hit every rep' : 'Top of the range on every set';
    return R({ status: 'up', good: true, text: `${why} — go up to ${up(k)} ${U}.${adjust}`, perSet: fill(up(k), tmpl.repMin) });
  }
  if (status === 'stalled') {
    return R({ canReset: true, text: `No progress in ${STALL_SESSIONS} sessions — keep pushing, try an alternative, or tap “Lighter restart”.${adjust}`, perSet: hold() });
  }
  if (!fixed && spare >= 2) {
    return R({ text: `You had ${prior.rir >= 3 ? '3+' : prior.rir} left vs a target of ${priorTgt} — same weight, push for +2 reps per set.${adjust}`, perSet: hold(2) });
  }
  const below = rs.some((r) => r != null && r < tmpl.repMin);
  if (fixed) return R({ text: `Same weight — get all ${tmpl.repMax}s.${adjust}`, perSet: fill(W || '', tmpl.repMax) });
  return R({ text: `${below ? 'Same weight — get back into the rep range' : 'Same weight — aim for +1 rep per set'}.${adjust}`, perSet: hold() });
}

/** Warm-up ramp for the first big lift of the day, built from today's working weight. */
function warmupLine(e, sug) {
  const W = num(sug.perSet[0]?.w);
  const minW = unit() === 'kg' ? 20 : 45;
  if (!W) return 'Warm-up: 2–3 lighter sets building up to your first working set.';
  if (W < minW * 1.5) return 'Warm-up: 1–2 light sets of 8 before your working sets.';
  const steps = [[0.5, 8], [0.7, 5], [0.85, 2]]
    .map(([pct, r]) => [Math.max(minW, floorTo(W * pct, sug.inc)), r])
    .filter(([x], i, a) => x < W && (i === 0 || x > a[i - 1][0]));
  return `Warm-up: ${steps.map(([x, r]) => `${x}×${r}`).join(' · ')}`;
}

function statusTag(status) {
  const [label, cls] = STATUS[status] || STATUS.new;
  return `<span class="tag ${cls}">${label}</span>`;
}

/** One-tap effort check shown under an exercise once a set is done. */
function rirPicker(e, i, tgt) {
  if (e.type !== 'reps' || !e.sets.some((s) => s.done)) return '';
  return `<div class="rir row wrap"><span class="small muted grow">Reps left in the tank on your last set?${tgt != null ? ` <b>Target: ${tgt}</b>` : ''}</span>
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
