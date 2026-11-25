'use strict';

/* =========================================================================
   Coach: guidance that shows up on its own.
   - Weekly check-in: estimates real maintenance calories from the weight trend
     and logged food (the energy-balance approach MacroFactor describes) and
     suggests a new calorie/macro goal.
   - Workout summary after finishing.
   - Protein ideas when you're behind on protein.
   - Sets per muscle this week (information only).
   Loaded before app.js; uses its helpers and state at call time.
   ========================================================================= */

const CHECKIN_DAYS = 14;
const MIN_FOOD_DAYS = 10;
const MIN_WEIGH_INS = 4;
const MAX_WEEKLY_CHANGE = 250; // kcal: keep adjustments gradual
const GOAL_LABELS = { '-500': 'lose about 1 lb/week', '-250': 'lose about 0.5 lb/week', 0: 'maintain', 250: 'lean gain' };

// ---------- weekly check-in ----------
function slopePerDay(points) {
  const n = points.length;
  const mx = sum(points.map((p) => p[0])) / n, my = sum(points.map((p) => p[1])) / n;
  const den = sum(points.map((p) => (p[0] - mx) ** 2));
  return den ? sum(points.map((p) => (p[0] - mx) * (p[1] - my))) / den : 0;
}

/** Everything the check-in needs, over the 14 complete days before today. */
function checkinData() {
  const end = addDays(today(), -1);
  const days = Array.from({ length: CHECKIN_DAYS }, (_, i) => addDays(end, i - CHECKIN_DAYS + 1));
  // Days with very little logged are probably incomplete; leave them out.
  const food = days.map(dietTotals).filter((t) => t.count && t.cal >= 600);
  const weighs = days.filter((d) => num(S.body[d]?.weight) != null).map((d) => [dayNum(d), num(S.body[d].weight)]);
  const span = weighs.length ? weighs.at(-1)[0] - weighs[0][0] : 0;
  const ready = food.length >= MIN_FOOD_DAYS && weighs.length >= MIN_WEIGH_INS && span >= 7;
  const out = { ready, foodDays: food.length, weighIns: weighs.length };
  if (!ready) return out;

  const st = S.settings;
  const intake = sum(food.map((t) => t.cal)) / food.length;
  const perDay = slopePerDay(weighs); // lb or kg per day
  const kcalPerUnit = unit() === 'kg' ? 7700 : 3500;
  const raw = intake - perDay * kcalPerUnit;
  const prev = S.checkins.at(-1);
  // Blend with the last estimate so one noisy fortnight doesn't swing the goal.
  const tdee = prev?.tdee ? prev.tdee * 0.5 + raw * 0.5 : raw;
  const delta = num(S.profile.goal) ?? -500;
  const floor = S.profile.sex === 'f' ? 1200 : 1500;
  const cur = Number(st.calGoal) || 2000;
  let cal = Math.max(floor, Math.round((tdee + delta) / 10) * 10);
  const capped = Math.abs(cal - cur) > MAX_WEEKLY_CHANGE;
  if (capped) cal = cur + Math.sign(cal - cur) * MAX_WEEKLY_CHANGE;
  const protein = Number(st.proteinGoal) || 150;
  const fat = Math.round((cal * 0.25) / 9);
  const carbs = Math.max(0, Math.round((cal - protein * 4 - fat * 9) / 4));
  return { ...out, intake, ratePerWeek: perDay * 7, tdee, cal, protein, fat, carbs, capped, cur, onTrack: Math.abs(cal - cur) < 50, goalLabel: GOAL_LABELS[String(delta)] || 'your goal' };
}

function checkinDue() {
  const last = S.checkins.at(-1);
  return !last || dayNum(today()) - dayNum(last.date) >= 7;
}

function checkinCard() {
  if (!checkinDue()) return '';
  const c = checkinData();
  if (!c.ready) {
    if (!c.foodDays && !c.weighIns) return '';
    return `<div class="card coach-slim small"><b>Weekly check-in</b> <span class="muted">unlocks after 2 weeks of logging: ${Math.min(c.foodDays, MIN_FOOD_DAYS)}/${MIN_FOOD_DAYS} food days · ${Math.min(c.weighIns, MIN_WEIGH_INS)}/${MIN_WEIGH_INS} weigh-ins</span></div>`;
  }
  const U = unit();
  const rate = r1(c.ratePerWeek);
  return `<div class="card coach">
    <div class="row between"><h2>Weekly check-in</h2><span class="tag">Coach</span></div>
    <p class="small" style="margin:4px 0 8px">Last 2 weeks you averaged <b>${Math.round(c.intake).toLocaleString()} kcal</b>/day and your weight trend is <b>${rate > 0 ? '+' : ''}${rate} ${U}/week</b>.
      That puts your real maintenance around <b>${(Math.round(c.tdee / 10) * 10).toLocaleString()} kcal</b>.</p>
    ${c.onTrack ? `<p class="small" style="margin:0 0 10px">You're on track to ${esc(c.goalLabel)} — keep <b>${c.cur.toLocaleString()} kcal</b>.</p>
      <button class="btn primary block" data-a="checkin" data-apply="0">Got it</button>`
      : `<p class="small" style="margin:0 0 10px">To ${esc(c.goalLabel)}: <b>${c.cal.toLocaleString()} kcal</b> · P ${c.protein} g · C ${c.carbs} g · F ${c.fat} g${c.capped ? ` <span class="muted">(changed by ${MAX_WEEKLY_CHANGE} kcal max per week to keep it gradual)</span>` : ''}.</p>
      <div class="row"><button class="btn primary grow" data-a="checkin" data-apply="1">Apply</button><button class="btn" data-a="checkin" data-apply="0">Not now</button></div>`}
    <p class="tiny muted" style="margin:8px 0 0">Based on what you logged and your weight trend. Change your goal in Plan → Calorie & macro calculator.</p>
  </div>`;
}

// ---------- workout summary ----------
function viewSummary(id) {
  const w = S.workouts.find((x) => x.id === id);
  if (!w) { ui.summary = null; return viewTrainPicker(); }
  const st = workoutStats(w);
  const prevSame = finished().find((x) => x.dayId === w.dayId && x.id !== w.id && x.date <= w.date);
  const prevVol = prevSame ? workoutStats(prevSame).volume : 0;
  const volPct = prevVol ? Math.round(((st.volume - prevVol) / prevVol) * 100) : null;
  const up = [], stalled = [], down = [];
  for (const e of w.exercises) {
    if (e.type !== 'reps' || !e.sets.some((s) => s.done)) continue;
    const hist = exHistory(e.name, null, w.date);
    const now = hist.find((x) => x.date === w.date);
    const before = hist.find((x) => x !== now);
    if (now && before && now.best > before.best * 1.005) up.push(e.name);
    const tmpl = { ...e, sets: e.targetSets ?? e.sets.length };
    const s = exStatus(tmpl, hist);
    if (s === 'stalled') stalled.push(e);
    else if (s === 'down') down.push(e);
  }
  let focus;
  if (stalled.length) {
    const e = stalled[0];
    const alt = alternativesFor(e.base || e.name, e.muscle)[0];
    focus = `${e.name} has stalled. Next time, try ${alt ? `the ${alt} alternative` : 'an alternative'} or tap “Lighter restart”.`;
  } else if (down.length) {
    focus = `Reps dropped on ${down[0].name} — the app will suggest backing off about 7.5% next time.`;
  } else if (w.feel === 'rough') {
    focus = 'You trained on a rough day — prioritise sleep and protein before the next session.';
  } else {
    const next = dayById(recommendedDay());
    focus = `Next up: ${next ? next.name : 'your next session'}. Keep hitting your effort targets.`;
  }
  return `
  <div class="card hero d-${esc(w.dayId)}" style="text-align:center">
    <div class="big">${esc(w.name)} done 💪</div>
    <div class="small muted">${fmtDate(w.date)}${st.dur ? ` · ${st.dur} min` : ''} · ${st.sets} sets</div>
  </div>
  <div class="grid3">
    <div class="stat"><div class="v">${w.prs?.length || 0}</div><div class="l">PRs</div></div>
    <div class="stat"><div class="v">${up.length}</div><div class="l">lifts up</div></div>
    <div class="stat"><div class="v ${volPct == null ? '' : volPct >= 0 ? 'down' : 'up'}">${volPct == null ? '–' : `${volPct > 0 ? '+' : ''}${volPct}%`}</div><div class="l">volume vs last ${esc(w.name)}</div></div>
  </div>
  <div class="card" style="margin-top:12px">
    ${w.prs?.length ? `<p class="small" style="margin:0 0 8px"><span class="pr">PR</span> ${w.prs.map(esc).join(', ')}</p>` : ''}
    ${up.filter((n) => !w.prs?.includes(n)).length ? `<p class="small" style="margin:0 0 8px"><span class="tag st-up">↑</span> ${up.filter((n) => !w.prs?.includes(n)).map(esc).join(', ')}</p>` : ''}
    <div class="hint good" style="margin:0"><div class="hint-do">Focus for next time</div><div class="small">${esc(focus)}</div></div>
  </div>
  <div class="row"><button class="btn primary grow" data-a="summary-done">Done</button><button class="btn" data-a="summary-details" data-id="${esc(w.id)}">See details</button></div>`;
}

// ---------- protein ideas ----------
// Everyday high-protein staples shown first (after foods you log yourself).
const PROTEIN_STAPLES = ['chicken breast, cooked, skinless', 'greek yogurt, plain nonfat', 'whey protein powder', 'cottage cheese, 2%',
  'egg, whole', 'protein shake, ready-to-drink', 'tuna, canned in water, drained', 'deli turkey breast', 'beef jerky', 'string cheese'];
function proteinIdeas(date, totals) {
  const gap = Math.round((Number(S.settings.proteinGoal) || 0) - totals.p);
  const late = date !== today() || new Date().getHours() >= 14;
  if (gap < 20 || !late) return '';
  const seen = new Set();
  const pool = [...S.foods.map((f) => ({ ...f, mine: true })), ...recentFoods(30), ...FOOD_DB]
    .filter((f) => f.p >= 12 && f.cal > 0 && (f.p * 4) / f.cal >= 0.35)
    .filter((f) => { const k = keyOf(f.name); if (seen.has(k)) return false; seen.add(k); return true; });
  const staple = (f) => { const i = PROTEIN_STAPLES.indexOf(keyOf(f.name)); return i < 0 ? 99 : i; };
  pool.sort((a, b) => (b.mine || b.recent ? 1 : 0) - (a.mine || a.recent ? 1 : 0) || staple(a) - staple(b) || (b.p * 4) / b.cal - (a.p * 4) / a.cal);
  dv.proteinList = pool.slice(0, 3);
  return `<div class="protein-ideas"><div class="small"><b>${gap} g protein left.</b> <span class="muted">Ideas:</span></div>
    <div class="chips" style="margin-top:6px">${dv.proteinList.map((f, k) => `<button class="chip" data-a="protein-add" data-k="${k}">+ ${esc(f.name)} · ${Math.round(f.p)} g</button>`).join('')}</div></div>`;
}

// ---------- sets per muscle this week ----------
function muscleSetsCard() {
  if (!S.workouts.length) return '';
  const mon = mondayOf(today());
  const count = (from, to) => {
    const m = {};
    for (const w of S.workouts) {
      if (w.date < from || w.date > to) continue;
      for (const e of w.exercises) {
        const g = muscleOf(e.name, e.muscle) || muscleOf(e.base || '', e.muscle) || muscleOf(e.name, programEx(e.base || e.name)?.muscle);
        if (!g || g === 'cardio') continue;
        m[g] = (m[g] || 0) + e.sets.filter((s) => s.done).length;
      }
    }
    return m;
  };
  const now = count(mon, addDays(mon, 6));
  const last = count(addDays(mon, -7), addDays(mon, -1));
  const planned = new Set(S.program.flatMap((d) => d.exercises).map((e) => muscleOf(e.name, e.muscle)).filter((g) => g && g !== 'cardio'));
  const groups = Object.keys(MUSCLES).filter((g) => now[g] || last[g]);
  const missing = Object.keys(MUSCLES).filter((g) => planned.has(g) && !now[g]);
  if (!groups.length) return '';
  return `<div class="card">
    <div class="row between"><h2>Sets per muscle</h2><span class="tiny muted">this week (last week)</span></div>
    <div class="muscle-grid">${groups.map((g) => `<div class="mg ${now[g] ? '' : 'zero'}"><span>${esc(MUSCLES[g])}</span><b class="num">${now[g] || 0}</b><span class="tiny muted num">(${last[g] || 0})</span></div>`).join('')}</div>
    ${missing.length ? `<p class="small" style="margin:8px 0 0"><span class="muted">Not trained yet this week:</span> ${missing.map((g) => esc(MUSCLES[g])).join(', ')}</p>` : ''}
    <p class="tiny muted" style="margin:6px 0 0">Completed working sets. Use it to spot missed muscles; more isn't automatically better.</p>
  </div>`;
}

const coachActions = {
  checkin(d) {
    const c = checkinData();
    if (d.apply === '1' && c.ready) {
      Object.assign(S.settings, { calGoal: c.cal, proteinGoal: c.protein, carbGoal: c.carbs, fatGoal: c.fat });
      toast(`New goal: ${c.cal.toLocaleString()} kcal`);
    }
    S.checkins.push({ date: today(), tdee: c.tdee ? Math.round(c.tdee) : null, intake: c.intake ? Math.round(c.intake) : null, rate: c.ratePerWeek ?? null, applied: d.apply === '1' });
    save(); render();
  },
  'summary-done'() { ui.summary = null; go('today'); },
  'summary-details'(d) { ui.summary = null; ui.openWorkout = d.id; go('history'); },
  'protein-add'(d) {
    const f = dv.proteinList?.[d.k];
    if (!f) return;
    const meal = ui.dietDate === today() ? defaultMeal() : 'Snacks';
    dietDay(ui.dietDate).entries.push(makeEntry(f, f.lastAmt ?? 1, f.lastUnit ?? 'srv', meal));
    save(); render(); toast(`${f.name} added to ${meal}`);
  },
  feel(d) { S.active.feel = S.active.feel === d.v ? 'normal' : d.v; save(); render(); },
};
