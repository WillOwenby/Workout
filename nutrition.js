'use strict';

/* =========================================================================
   Nutrition: MyFitnessPal-style food diary.
   Food search (built-in database, My foods, recents, Open Food Facts online),
   serving sizes, barcode lookup, saved meals and a calorie/macro calculator.
   Loaded before app.js; uses its helpers and state at call time.
   ========================================================================= */

const OFF_FIELDS = 'code,product_name,product_name_en,brands,serving_size,serving_quantity,nutriments';
const SRC_LABEL = { off: 'Open Food Facts', usda: 'USDA' };
const OZ = 28.3495;

const dv = {
  view: 'day',       // day | search | detail | create | scan
  meal: null,
  q: '',
  tab: 'all',        // all | recent | mine | meals
  cat: null,
  list: [],          // foods currently shown in search results (tap targets index into this)
  online: { q: '', status: 'idle', results: [] },
  detail: null,      // { food, amt, unit, meal, editIdx }
  createMode: 'create', // create | quick
  scanStatus: '',
};

function defaultMeal() {
  const h = new Date().getHours() + new Date().getMinutes() / 60;
  return h < 10.5 ? 'Breakfast' : h < 15 ? 'Lunch' : h < 21 ? 'Dinner' : 'Snacks';
}
function resetDietView() { stopScan(); dv.view = 'day'; dv.detail = null; }

// ---------- food math ----------
function unitFactor(food, amt, unit) {
  const a = num(amt) || 0;
  if (unit === 'g' && food.grams) return a / food.grams;
  if (unit === 'oz' && food.grams) return (a * OZ) / food.grams;
  return a;
}
function makeEntry(food, amt, unit, meal) {
  const k = unitFactor(food, amt, unit);
  const base = { id: food.id, src: food.src, name: food.name, brand: food.brand || '', serving: food.serving, grams: food.grams || null, cal: food.cal, p: food.p, c: food.c, f: food.f };
  return {
    id: uid(), meal, name: food.name, brand: food.brand || '', food: base, amt: num(amt) || 0, unit, qty: 1,
    cal: Math.round(food.cal * k), p: r1(food.p * k), c: r1(food.c * k), f: r1(food.f * k),
  };
}
const fmtAmt = (n) => (Math.round(n * 100) / 100).toString();
function entryDesc(e) {
  if (e.food) return e.unit !== 'srv' ? `${fmtAmt(e.amt)} ${e.unit}` : e.amt === 1 ? e.food.serving : `${fmtAmt(e.amt)} × ${e.food.serving}`;
  const q = num(e.qty) || 1;
  return q !== 1 ? `× ${q}` : '';
}
/** Turn a diary entry back into a food (used for recents and editing). */
function foodFromEntry(e) {
  if (e.food) return { ...e.food, lastAmt: e.amt, lastUnit: e.unit };
  const q = num(e.qty) || 1;
  return { id: 'q-' + keyOf(e.name), src: 'quick', name: e.name, serving: '1 serving', grams: null, cal: (num(e.cal) || 0) * q, p: (num(e.p) || 0) * q, c: (num(e.c) || 0) * q, f: (num(e.f) || 0) * q };
}
const foodKey = (f) => `${keyOf(f.name)}|${keyOf(f.brand)}|${keyOf(f.serving)}`;

function recentFoods(limit = 40) {
  const seen = new Map();
  const dates = Object.keys(S.diet).sort().reverse();
  outer: for (const dt of dates) for (const e of S.diet[dt].entries.slice().reverse()) {
    const f = foodFromEntry(e);
    const k = foodKey(f);
    if (!seen.has(k)) seen.set(k, { ...f, recent: true });
    if (seen.size >= limit) break outer;
  }
  return [...seen.values()];
}
const isMine = (f) => S.foods.some((m) => foodKey(m) === foodKey(f));

function searchFoods(q) {
  const qn = keyOf(q);
  const toks = qn.split(/\s+/).filter(Boolean);
  const pool = [...S.foods.map((f) => ({ ...f, mine: true })), ...recentFoods(), ...FOOD_DB];
  const seen = new Set();
  const hits = [];
  for (const f of pool) {
    const k = foodKey(f);
    if (seen.has(k)) continue;
    const hay = `${keyOf(f.name)} ${keyOf(f.brand)} ${keyOf(f.cat)}`;
    if (!toks.every((t) => hay.includes(t))) continue;
    seen.add(k);
    const n = keyOf(f.name);
    let s = n.startsWith(qn) ? 0 : n.includes(qn) ? 1 : n.split(/[\s,]+/).some((w) => w.startsWith(toks[0])) ? 2 : 3;
    if (n.split(',')[0].trim() === qn) s -= 0.5; // "egg" → "Egg, whole" before "Egg white"
    if (f.mine) s -= 0.6; else if (f.recent) s -= 0.4;
    hits.push([s + n.length / 1000, f]);
  }
  return hits.sort((a, b) => a[0] - b[0]).slice(0, 60).map((h) => h[1]);
}

function weekTotals(endDate) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = addDays(endDate, i - 6);
    return { d, ...dietTotals(d) };
  });
}

// ---------- online food databases ----------
// Two free sources, searched together:
//  • USDA FoodData Central "Branded Foods": ~400k US packaged foods from manufacturer label data.
//  • Open Food Facts: crowd-sourced, worldwide, strongest for barcodes.
const USDA_URL = 'https://api.nal.usda.gov/fdc/v1/foods/search';
const usdaKey = () => (S.settings.usdaKey || '').trim() || 'DEMO_KEY';
const onlineCache = new Map(); // query -> { results, notes }

const isShouting = (s) => s && s === s.toUpperCase() && /[A-Z]/.test(s);
const titleCase = (s) => String(s || '').toLowerCase().replace(/(^|[\s\-/(&,])([a-z])/g, (m, a, b) => a + b.toUpperCase());
const tidy = (s) => (isShouting(s) ? titleCase(s) : String(s || '')).replace(/\s+/g, ' ').trim();

function offToFood(p) {
  const n = p.nutriments || {};
  const name = tidy(p.product_name || p.product_name_en || '');
  if (!name) return null;
  const k100 = num(n['energy-kcal_100g']) ?? (num(n.energy_100g) != null ? num(n.energy_100g) / 4.184 : null);
  const sq = num(p.serving_quantity);
  const brands = Array.isArray(p.brands) ? p.brands.join(',') : p.brands || '';
  const base = { id: 'off' + (p.code || uid()), src: 'off', name, brand: tidy(brands.split(',')[0]), code: p.code || '' };
  const g = (key, per) => num(n[`${key}_${per}`]) || 0;
  if (k100 != null && sq > 0) {
    const k = sq / 100;
    return { ...base, serving: p.serving_size || `${sq} g`, grams: sq, cal: Math.round(k100 * k), p: r1(g('proteins', '100g') * k), c: r1(g('carbohydrates', '100g') * k), f: r1(g('fat', '100g') * k) };
  }
  if (num(n['energy-kcal_serving']) != null) {
    return { ...base, serving: p.serving_size || '1 serving', grams: null, cal: Math.round(num(n['energy-kcal_serving'])), p: r1(g('proteins', 'serving')), c: r1(g('carbohydrates', 'serving')), f: r1(g('fat', 'serving')) };
  }
  if (k100 != null) {
    return { ...base, serving: '100 g', grams: 100, cal: Math.round(k100), p: r1(g('proteins', '100g')), c: r1(g('carbohydrates', '100g')), f: r1(g('fat', '100g')) };
  }
  return null;
}

/** USDA branded search results list nutrients per 100 g; scale them to the label serving. */
function usdaToFood(x) {
  const name = tidy(x.description);
  if (!name) return null;
  const nut = (ids, nums) => {
    const hit = (x.foodNutrients || []).find((n) => ids.includes(n.nutrientId) || nums.includes(String(n.nutrientNumber)));
    if (!hit) return null;
    const v = num(hit.value);
    return v != null && /kj/i.test(hit.unitName || '') ? v / 4.184 : v;
  };
  const k100 = nut([1008, 2047, 2048], ['208', '957', '958']);
  if (k100 == null) return null;
  const p100 = nut([1003], ['203']) || 0, c100 = nut([1005], ['205']) || 0, f100 = nut([1004], ['204']) || 0;
  const unitG = /^(g|gm|grm|ml|mlt)$/i.test(x.servingSizeUnit || '');
  const grams = unitG && num(x.servingSize) > 0 ? num(x.servingSize) : null;
  const house = tidy(x.householdServingFullText || '');
  const base = { id: 'usda' + x.fdcId, src: 'usda', name, brand: tidy(x.brandName || x.brandOwner || ''), code: String(x.gtinUpc || '').replace(/^0+/, '') };
  if (!grams) return { ...base, serving: '100 g', grams: 100, cal: Math.round(k100), p: r1(p100), c: r1(c100), f: r1(f100) };
  const k = grams / 100;
  return {
    ...base, serving: house && !/^\d+(\.\d+)?\s*(g|ml)$/i.test(house) ? house : `${r1(grams)} g`, grams,
    cal: Math.round(k100 * k), p: r1(p100 * k), c: r1(c100 * k), f: r1(f100 * k),
  };
}

async function fetchJson(url, ms = 9000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) { const e = new Error('HTTP ' + res.status); e.status = res.status; throw e; }
    return await res.json();
  } finally { clearTimeout(t); }
}
async function searchUsda(q) {
  const data = await fetchJson(`${USDA_URL}?api_key=${encodeURIComponent(usdaKey())}&query=${encodeURIComponent(q)}&dataType=Branded&pageSize=40`);
  return (data.foods || []).map(usdaToFood).filter(Boolean);
}
async function searchOff(q) {
  try {
    // Newer Open Food Facts search engine: better ranking, matches brand + product name.
    const data = await fetchJson(`https://search.openfoodfacts.org/search?q=${encodeURIComponent(q)}&page_size=30&langs=en&fields=${OFF_FIELDS}`);
    return (data.hits || []).map(offToFood).filter(Boolean);
  } catch (e) {
    const data = await fetchJson(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=30&fields=${OFF_FIELDS}`, 12000);
    return (data.products || []).map(offToFood).filter(Boolean);
  }
}

/** Rank merged online results by how well brand + name match the words typed. */
function rankOnline(q, foods) {
  const toks = keyOf(q).split(/\s+/).filter(Boolean);
  const seen = new Set();
  return foods
    .filter((f) => { const k = `${keyOf(f.brand)}${keyOf(f.name)}`.replace(/[^a-z0-9]/g, ''); if (seen.has(k)) return false; seen.add(k); return true; })
    .map((f, i) => {
      const hay = `${keyOf(f.brand)} ${keyOf(f.name)}`.replace(/[^a-z0-9 ]/g, ' ');
      const words = hay.split(/\s+/);
      const hit = toks.filter((t) => words.some((w) => w.startsWith(t.replace(/[^a-z0-9]/g, '')))).length;
      return [hit / toks.length + (f.grams ? 0.05 : 0) - i / 10000, f];
    })
    .sort((a, b) => b[0] - a[0])
    .map((x) => x[1])
    .slice(0, 50);
}

async function searchOnline() {
  const q = dv.q.trim();
  if (q.length < 2) return;
  if (onlineCache.has(keyOf(q))) {
    dv.online = { q, status: 'done', ...onlineCache.get(keyOf(q)) };
    return renderFoodResults();
  }
  dv.online = { q, status: 'loading', results: [], notes: [] };
  renderFoodResults();
  const [usda, off] = await Promise.allSettled([searchUsda(q), searchOff(q)]);
  if (dv.online.q !== q) return; // user kept typing
  const notes = [];
  if (usda.status === 'rejected') {
    notes.push(usda.reason?.status === 429 || usda.reason?.status === 403
      ? 'USDA search limit reached. Add your free USDA key in Plan → Settings for more searches.'
      : 'USDA database did not respond.');
  }
  if (off.status === 'rejected') notes.push('Open Food Facts did not respond.');
  const merged = rankOnline(q, [...(usda.value || []), ...(off.value || [])]);
  const failed = usda.status === 'rejected' && off.status === 'rejected';
  dv.online = { q, status: failed ? 'error' : 'done', results: merged, notes };
  if (!failed && !notes.length) onlineCache.set(keyOf(q), { results: merged, notes });
  if (dv.view === 'search') renderFoodResults();
}

async function lookupBarcode(code) {
  code = String(code || '').replace(/\D/g, '');
  if (code.length < 6) return toast('Enter the number under the barcode');
  const strip = (c) => String(c || '').replace(/^0+/, '');
  const mine = S.foods.find((f) => f.code && strip(f.code) === strip(code));
  if (mine) return openDetail(mine);
  dv.scanStatus = `Looking up ${code}…`;
  const st = $('#scan-status'); if (st) st.textContent = dv.scanStatus;
  let food = null;
  try {
    const data = await fetchJson(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${OFF_FIELDS}`);
    food = data && data.status === 1 && offToFood({ ...data.product, code });
  } catch (e) { /* try USDA next */ }
  if (!food) {
    try {
      const hits = await searchUsda(code);
      food = hits.find((f) => strip(f.code) === strip(code) || strip(f.code).endsWith(strip(code)) || strip(code).endsWith(strip(f.code))) || null;
    } catch (e) { /* not found */ }
  }
  if (food) { dv.scanStatus = ''; openDetail(food); return; }
  dv.scanStatus = `No match for ${code}. You can create it as a custom food.`;
  if (dv.view === 'scan') render();
}

// ---------- barcode camera ----------
let scan = null; // { stream, reader, timer }
async function startScan() {
  const video = $('#scan-video');
  if (!video) return;
  stopScan();
  const status = (t) => { dv.scanStatus = t; const el = $('#scan-status'); if (el) el.textContent = t; };
  if (!navigator.mediaDevices?.getUserMedia) return status('Camera not available here. Type the barcode number instead.');
  status('Starting camera…');
  const found = (code) => { stopScan(); if (navigator.vibrate) navigator.vibrate(80); lookupBarcode(code); };
  try {
    if ('BarcodeDetector' in window) {
      const detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      scan = { stream };
      video.srcObject = stream;
      video.classList.remove('hidden');
      await video.play();
      status('Point the camera at a barcode');
      const tick = async () => {
        if (!scan || scan.stream !== stream) return;
        try {
          const codes = await detector.detect(video);
          if (codes.length) return found(codes[0].rawValue);
        } catch (e) { /* frame not ready */ }
        scan.timer = setTimeout(tick, 250);
      };
      tick();
    } else {
      // iPhone Safari has no BarcodeDetector; load a small decoder library on demand.
      if (!window.ZXing) {
        status('Loading scanner…');
        await new Promise((ok, fail) => {
          const s = document.createElement('script');
          s.src = 'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js';
          s.onload = ok; s.onerror = fail;
          document.head.appendChild(s);
        });
      }
      const reader = new ZXing.BrowserMultiFormatReader();
      scan = { reader };
      video.classList.remove('hidden');
      await reader.decodeFromConstraints({ video: { facingMode: 'environment' } }, video, (result) => {
        if (result && scan?.reader === reader) found(result.getText());
      });
      status('Point the camera at a barcode');
    }
  } catch (e) {
    stopScan();
    status('Could not start the camera. Allow camera access, or type the barcode number below.');
  }
}
function stopScan() {
  if (!scan) return;
  clearTimeout(scan.timer);
  scan.stream?.getTracks().forEach((t) => t.stop());
  try { scan.reader?.reset(); } catch (e) { /* already stopped */ }
  scan = null;
  const v = $('#scan-video');
  if (v) { v.srcObject = null; v.classList.add('hidden'); }
}

// ---------- views ----------
function viewDiet() {
  if (dv.view === 'search') return viewFoodSearch();
  if (dv.view === 'detail' && dv.detail) return viewFoodDetail();
  if (dv.view === 'create') return viewFoodCreate();
  if (dv.view === 'scan') return viewScan();
  return viewDiary();
}

function viewDiary() {
  const d = ui.dietDate;
  const day = S.diet[d] || { entries: [], water: 0 };
  const t = dietTotals(d);
  const st = S.settings;
  const isToday = d === today();
  const remaining = Math.round(st.calGoal - t.cal);
  return `
  <div class="card row between">
    <button class="icon-btn" data-a="diet-date" data-n="-1" aria-label="Previous day">‹</button>
    <div style="text-align:center"><b>${isToday ? 'Today' : fmtDate(d)}</b><div class="tiny muted">${isToday ? fmtDate(d) : `<button class="btn sm ghost" data-a="diet-today">Jump to today</button>`}</div></div>
    <button class="icon-btn" data-a="diet-date" data-n="1" aria-label="Next day">›</button>
  </div>

  <div class="card">
    <div class="small muted" style="margin-bottom:4px">Calories remaining</div>
    <div class="cal-eq num">
      <div><b>${Number(st.calGoal).toLocaleString()}</b><span>Goal</span></div><i>−</i>
      <div><b>${Math.round(t.cal).toLocaleString()}</b><span>Food</span></div><i>=</i>
      <div class="${remaining < 0 ? 'neg' : 'pos'}"><b>${remaining.toLocaleString()}</b><span>Remaining</span></div>
    </div>
    <hr>
    ${macroRow('Protein', t.p, st.proteinGoal, 'var(--protein)')}
    ${macroRow('Carbs', t.c, st.carbGoal, 'var(--carbs)')}
    ${macroRow('Fat', t.f, st.fatGoal, 'var(--fat)')}
    <button class="btn primary block" style="margin-top:12px" data-a="food-open" data-meal="${defaultMeal()}">Search & add food</button>
  </div>

  ${MEALS.map((m) => {
    const es = day.entries.map((e, idx) => ({ e, idx })).filter((x) => x.e.meal === m);
    const tot = (k) => sum(es.map((x) => (num(x.e[k]) || 0) * (num(x.e.qty) || 1)));
    return `<div class="card meal-card">
      <div class="meal-head"><h3>${m}</h3><span class="small muted num">${Math.round(tot('cal'))} kcal</span></div>
      ${es.length ? `<div class="tiny muted" style="margin:-2px 0 4px">P ${Math.round(tot('p'))}g · C ${Math.round(tot('c'))}g · F ${Math.round(tot('f'))}g</div>` : ''}
      ${es.map(({ e, idx }) => {
        const q = num(e.qty) || 1;
        return `<div class="list-item tap" data-a="entry-edit" data-idx="${idx}">
          <div class="grow"><div class="ellipsis">${esc(e.name)}</div>
            <div class="food-macros ellipsis">${esc([e.brand, entryDesc(e)].filter(Boolean).join(' · '))}</div></div>
          <div class="num" style="text-align:right">${Math.round((num(e.cal) || 0) * q)}<div class="tiny muted">kcal</div></div></div>`;
      }).join('')}
      <div class="row" style="margin-top:8px">
        <button class="btn sm grow" data-a="food-open" data-meal="${m}">+ Add food</button>
        ${es.length ? `<button class="btn sm" data-a="meal-save" data-meal="${m}">Save meal</button>` : ''}
      </div>
    </div>`;
  }).join('')}

  <div class="card row between">
    <span>Water <span class="muted small">${t.water} / ${st.waterGoal} glasses</span></span>
    <span class="row"><button class="icon-btn" data-a="water" data-d="${d}" data-n="-1" aria-label="Less water">−</button><button class="icon-btn" data-a="water" data-d="${d}" data-n="1" aria-label="More water">+</button></span>
  </div>
  ${!day.entries.length && S.diet[addDays(d, -1)]?.entries.length ? `<button class="btn block" data-a="diet-copy" style="margin-bottom:12px">Copy yesterday's food</button>` : ''}

  ${viewWeekNutrition(d)}`;
}

function viewWeekNutrition(endDate) {
  const wk = weekTotals(endDate);
  const logged = wk.filter((x) => x.count);
  const st = S.settings;
  const avg = (k) => (logged.length ? sum(logged.map((x) => x[k])) / logged.length : null);
  return `<div class="card">
    <div class="row between"><h2>Last 7 days</h2><button class="btn sm ghost" data-a="goals-open">Edit goals ›</button></div>
    ${barChart(wk.map((x) => [fmtDate(x.d, { weekday: 'narrow' }), x.cal, x.d === endDate]), st.calGoal)}
    <div class="grid3" style="margin-top:10px">
      <div class="stat"><div class="v">${avg('cal') != null ? Math.round(avg('cal')).toLocaleString() : '–'}</div><div class="l">avg kcal</div></div>
      <div class="stat"><div class="v">${avg('p') != null ? Math.round(avg('p')) + 'g' : '–'}</div><div class="l">avg protein</div></div>
      <div class="stat"><div class="v">${logged.length}/7</div><div class="l">days logged</div></div>
    </div>
  </div>`;
}
function barChart(rows, goal) {
  const W = 340, H = 150, L = 8, R = 8, T = 12, B = 22;
  const max = Math.max(goal || 0, ...rows.map((r) => r[1])) * 1.1 || 1;
  const bw = (W - L - R) / rows.length;
  const sy = (v) => T + (1 - v / max) * (H - T - B);
  let g = '';
  rows.forEach(([lab, v, sel], i) => {
    const x = L + i * bw + bw * 0.18, w = bw * 0.64;
    const over = goal && v > goal * 1.05;
    g += `<rect x="${x}" y="${sy(v)}" width="${w}" height="${Math.max(0, H - B - sy(v))}" rx="4" class="${over ? 'bar-over' : 'bar-ok'}${sel ? ' bar-sel' : ''}"/>`;
    g += `<text x="${x + w / 2}" y="${H - 6}" text-anchor="middle">${esc(lab)}</text>`;
  });
  if (goal) g += `<line class="goal" x1="${L}" x2="${W - R}" y1="${sy(goal)}" y2="${sy(goal)}"/>`;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Calories per day">${g}</svg>`;
}

function viewFoodSearch() {
  return `
  <div class="row" style="margin-bottom:12px">
    <button class="icon-btn" data-a="diet-back" aria-label="Back">‹</button>
    <div class="seg grow">${MEALS.map((m) => `<button class="${dv.meal === m ? 'on' : ''}" data-a="dv-meal" data-v="${m}">${m}</button>`).join('')}</div>
  </div>
  <div class="search-box">
    <input id="food-q" type="search" placeholder="Search foods (e.g. chicken, banana, Chobani)" value="${esc(dv.q)}" autocomplete="off" enterkeyhint="search">
  </div>
  <div class="row" style="margin:10px 0">
    <button class="btn sm grow" data-a="scan-open">▥ Scan barcode</button>
    <button class="btn sm grow" data-a="create-open" data-mode="quick">Quick add</button>
    <button class="btn sm grow" data-a="create-open" data-mode="create">Create food</button>
  </div>
  <div class="seg" style="margin-bottom:10px">${[['all', 'All'], ['recent', 'Recent'], ['mine', 'My foods'], ['meals', 'My meals']].map(([v, l]) => `<button class="${dv.tab === v ? 'on' : ''}" data-a="dv-tab" data-v="${v}">${l}</button>`).join('')}</div>
  <div id="food-results">${foodResultsHtml()}</div>`;
}

function foodRow(f, k) {
  const badge = f.mine ? '<span class="tag">My food</span> ' : SRC_LABEL[f.src] ? `<span class="tag">${SRC_LABEL[f.src]}</span> ` : '';
  return `<div class="list-item">
    <div class="grow tap" data-a="food-pick" data-k="${k}">
      <div class="ellipsis">${esc(f.name)}</div>
      <div class="food-macros ellipsis">${badge}${esc([f.brand, f.serving].filter(Boolean).join(' · '))} · ${Math.round(f.cal)} kcal · P ${r1(f.p)} C ${r1(f.c)} F ${r1(f.f)}</div>
    </div>
    <button class="icon-btn add" data-a="food-quickadd" data-k="${k}" aria-label="Add ${esc(f.name)}">+</button>
  </div>`;
}

function foodResultsHtml() {
  const q = dv.q.trim();
  let list = [];
  let html = '';
  if (dv.tab === 'meals') {
    dv.list = [];
    if (!S.meals.length) return '<div class="card empty">No saved meals yet. Log a meal, then tap “Save meal” under it to reuse it in one tap.</div>';
    return `<div class="card">${S.meals.filter((m) => !q || keyOf(m.name).includes(keyOf(q))).map((m, i) => {
      const cal = sum(m.items.map((e) => (num(e.cal) || 0) * (num(e.qty) || 1)));
      return `<div class="list-item"><div class="grow tap" data-a="mymeal-add" data-i="${S.meals.indexOf(m)}"><div>${esc(m.name)}</div>
        <div class="food-macros ellipsis">${m.items.length} items · ${Math.round(cal)} kcal · ${esc(m.items.map((e) => e.name).join(', '))}</div></div>
        <button class="icon-btn" data-a="mymeal-del" data-i="${S.meals.indexOf(m)}" aria-label="Delete meal">✕</button>
        <button class="icon-btn add" data-a="mymeal-add" data-i="${S.meals.indexOf(m)}" aria-label="Add meal">+</button></div>`;
    }).join('')}</div>`;
  }
  if (dv.tab === 'recent') list = recentFoods().filter((f) => !q || keyOf(f.name).includes(keyOf(q)));
  else if (dv.tab === 'mine') list = S.foods.map((f) => ({ ...f, mine: true })).filter((f) => !q || keyOf(f.name).includes(keyOf(q)));
  else if (q) list = searchFoods(q);
  else if (dv.cat) list = FOOD_DB.filter((f) => f.cat === dv.cat);
  else list = recentFoods(10);

  const online = dv.tab === 'all' && q.length >= 2 && dv.online.q === q ? dv.online.results : [];
  dv.list = list.concat(online);

  if (dv.tab === 'all' && !q) {
    html += `<div class="chips" style="margin-bottom:10px">${FOOD_CATEGORIES.map((c) => `<button class="chip ${dv.cat === c ? 'on' : ''}" data-a="dv-cat" data-v="${esc(c)}">${esc(c)}</button>`).join('')}</div>`;
    if (!dv.cat) html += `<div class="section-title" style="margin-top:4px">${list.length ? 'Recent' : ''}</div>`;
  }
  if (list.length) html += `<div class="card">${list.map((f, k) => foodRow(f, k)).join('')}</div>`;
  else if (dv.tab === 'mine') html += '<div class="card empty">No custom foods yet. Tap “Create food” to add one, or save any food to My foods.</div>';
  else if (dv.tab === 'recent') html += '<div class="card empty">Foods you log will show up here.</div>';
  else if (q) html += `<div class="card empty">No matches in the built-in list.</div>`;
  else if (!dv.cat) html += '<div class="card empty">Search above, browse a category, or scan a barcode.</div>';

  if (dv.tab === 'all' && q.length >= 2) {
    const o = dv.online;
    const notes = (o.notes || []).map((n) => `<p class="tiny muted" style="margin:4px 0">${esc(n)}</p>`).join('');
    if (o.q !== q || o.status === 'idle') html += `<button class="btn block" data-a="food-online">Search brands & packaged foods for “${esc(q)}”</button>`;
    else if (o.status === 'loading') html += '<div class="empty">Searching USDA and Open Food Facts…</div>';
    else if (o.status === 'error') html += `<div class="empty">Online search failed. Check your connection and try again.</div>${notes}<button class="btn block" data-a="food-online">Retry online search</button>`;
    else if (!o.results.length) html += `<div class="empty">No online matches. Try fewer words (e.g. brand + product), scan the barcode, or create the food.</div>${notes}`;
    else html += `<div class="section-title">Brands & packaged foods</div><div class="card">${o.results.map((f, k) => foodRow(f, list.length + k)).join('')}</div>
      ${notes}<p class="tiny muted">From USDA FoodData Central and Open Food Facts. Double-check against the label.</p>`;
  }
  return html;
}
function renderFoodResults() {
  const el = $('#food-results');
  if (el) el.innerHTML = foodResultsHtml();
}

function openDetail(food, editIdx = null) {
  stopScan();
  const e = editIdx != null ? S.diet[ui.dietDate].entries[editIdx] : null;
  dv.detail = {
    food,
    amt: e ? (e.food ? e.amt : num(e.qty) || 1) : food.lastAmt ?? 1,
    unit: e ? (e.food ? e.unit : 'srv') : food.lastUnit ?? 'srv',
    meal: e ? e.meal : dv.meal || defaultMeal(),
    editIdx,
  };
  dv.view = 'detail';
  render(); window.scrollTo(0, 0);
}
function detailPreview() {
  const { food, amt, unit } = dv.detail;
  const k = unitFactor(food, amt, unit);
  const cal = Math.round(food.cal * k), p = food.p * k, c = food.c * k, f = food.f * k;
  const kc = p * 4 + c * 4 + f * 9 || 1;
  const pct = (v, m) => Math.round(((v * m) / kc) * 100);
  return `<div class="detail-cal num"><b>${cal.toLocaleString()}</b> kcal</div>
    <div class="grid3">
      <div class="stat"><div class="v" style="color:var(--protein)">${r1(p)}g</div><div class="l">Protein · ${pct(p, 4)}%</div></div>
      <div class="stat"><div class="v" style="color:var(--carbs)">${r1(c)}g</div><div class="l">Carbs · ${pct(c, 4)}%</div></div>
      <div class="stat"><div class="v" style="color:var(--fat)">${r1(f)}g</div><div class="l">Fat · ${pct(f, 9)}%</div></div>
    </div>`;
}
function viewFoodDetail() {
  const { food, amt, unit, meal, editIdx } = dv.detail;
  const units = [['srv', food.serving]].concat(food.grams ? [['g', 'grams'], ['oz', 'ounces']] : []);
  return `
  <div class="row" style="margin-bottom:12px"><button class="icon-btn" data-a="detail-back" aria-label="Back">‹</button><b class="grow">${editIdx != null ? 'Edit entry' : 'Add food'}</b></div>
  <div class="card stack">
    <div><div class="ex-name">${esc(food.name)}</div>
      <div class="small muted">${esc([food.brand, `${food.serving}${food.grams && !/\bg\b/.test(food.serving) ? ` (${r1(food.grams)} g)` : ''}`, SRC_LABEL[food.src] || (food.src === 'db' ? food.cat : '')].filter(Boolean).join(' · '))}</div></div>
    <div class="grid2">
      ${field('Amount', `<input id="fd-amt" type="number" inputmode="decimal" step="any" value="${esc(amt)}">`)}
      ${field('Unit', `<select id="fd-unit">${units.map(([v, l]) => `<option value="${v}" ${unit === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`)}
    </div>
    ${unit === 'srv' ? `<div class="chips">${[0.5, 1, 1.5, 2, 3].map((n) => `<button class="chip ${num(amt) === n ? 'on' : ''}" data-a="fd-amt" data-v="${n}">${n}×</button>`).join('')}</div>` : ''}
    <div id="fd-preview">${detailPreview()}</div>
    <div class="seg">${MEALS.map((m) => `<button class="${meal === m ? 'on' : ''}" data-a="fd-meal" data-v="${m}">${m}</button>`).join('')}</div>
    <button class="btn primary block" data-a="fd-save">${editIdx != null ? 'Save changes' : `Add to ${esc(meal)}`}</button>
    ${!isMine(food) && food.src !== 'quick' ? '<button class="btn block" data-a="fd-mine">☆ Save to My foods</button>' : ''}
    ${editIdx != null ? '<button class="btn danger ghost block" data-a="fd-delete">Delete entry</button>' : ''}
  </div>`;
}

function viewFoodCreate() {
  const quick = dv.createMode === 'quick';
  return `
  <div class="row" style="margin-bottom:12px"><button class="icon-btn" data-a="create-back" aria-label="Back">‹</button><b class="grow">${quick ? 'Quick add' : 'Create food'}</b></div>
  <div class="card stack">
    ${quick ? '<p class="small muted" style="margin:0">Log calories and macros without saving a food.</p>' : '<p class="small muted" style="margin:0">Copy the numbers from the nutrition label. Saved foods show up under My foods.</p>'}
    ${field(quick ? 'Description (optional)' : 'Food name', `<input id="cf-name" placeholder="${quick ? 'Quick add' : 'e.g. Homemade chili'}">`)}
    ${quick ? '' : `${field('Brand (optional)', '<input id="cf-brand">')}
    <div class="grid2">
      ${field('Serving size', '<input id="cf-serving" value="1 serving" placeholder="e.g. 1 cup">')}
      ${field('Grams per serving (optional)', '<input id="cf-grams" type="number" inputmode="decimal" placeholder="lets you log by weight">')}
    </div>
    ${field('Barcode (optional)', '<input id="cf-code" inputmode="numeric">')}`}
    <div class="grid2">
      ${field('Calories', '<input id="cf-cal" type="number" inputmode="decimal">')}
      ${field('Protein g', '<input id="cf-p" type="number" inputmode="decimal">')}
      ${field('Carbs g', '<input id="cf-c" type="number" inputmode="decimal">')}
      ${field('Fat g', '<input id="cf-f" type="number" inputmode="decimal">')}
    </div>
    <div class="seg">${MEALS.map((m) => `<button class="${dv.meal === m ? 'on' : ''}" data-a="dv-meal" data-v="${m}">${m}</button>`).join('')}</div>
    <button class="btn primary block" data-a="create-save" data-log="1">${quick ? 'Add' : 'Save & add'} to ${esc(dv.meal)}</button>
    ${quick ? '' : '<button class="btn block" data-a="create-save">Save to My foods only</button>'}
  </div>`;
}

function viewScan() {
  return `
  <div class="row" style="margin-bottom:12px"><button class="icon-btn" data-a="scan-back" aria-label="Back">‹</button><b class="grow">Scan barcode</b></div>
  <div class="card stack">
    <video id="scan-video" class="scan-video hidden" playsinline muted></video>
    <div id="scan-status" class="small muted">${esc(dv.scanStatus || 'Use your camera, or type the number under the barcode.')}</div>
    <button class="btn primary block" data-a="scan-start">Start camera</button>
    <div class="row"><input id="scan-code" inputmode="numeric" placeholder="Barcode number" class="grow"><button class="btn" data-a="scan-lookup">Look up</button></div>
    <p class="tiny muted" style="margin:0">Looks up products in Open Food Facts (needs internet).</p>
    ${/^No match/.test(dv.scanStatus) ? '<button class="btn block" data-a="create-open" data-mode="create">Create this food</button>' : ''}
  </div>`;
}

// ---------- goal calculator (shown in Plan) ----------
function goalCalculatorHtml() {
  const p = S.profile;
  const metric = unit() === 'kg';
  const latestW = weightSeries().at(-1)?.[1] ?? '';
  const sel = (f, opts) => `<select data-in="profile" data-f="${f}">${opts.map(([v, l]) => `<option value="${v}" ${String(p[f] ?? opts[0][0]) === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  return `<details class="card"><summary>Calorie & macro calculator</summary>
    <div class="stack">
      <p class="small muted" style="margin:0">Estimates your daily calories (Mifflin-St Jeor) and sets protein high for building muscle while losing fat.</p>
      <div class="grid2">
        ${field('Sex', sel('sex', [['m', 'Male'], ['f', 'Female']]))}
        ${field('Age', `<input type="number" inputmode="numeric" data-in="profile" data-f="age" value="${esc(p.age ?? '')}">`)}
      </div>
      ${metric ? field('Height (cm)', `<input type="number" inputmode="decimal" data-in="profile" data-f="cm" value="${esc(p.cm ?? '')}">`)
        : `<div class="grid2">${field('Height (ft)', `<input type="number" inputmode="numeric" data-in="profile" data-f="ft" value="${esc(p.ft ?? '')}">`)}${field('(in)', `<input type="number" inputmode="decimal" data-in="profile" data-f="in" value="${esc(p.in ?? '')}">`)}</div>`}
      ${field(`Current weight (${unit()})`, `<input type="number" inputmode="decimal" data-in="profile" data-f="weight" value="${esc(p.weight ?? latestW)}" placeholder="${esc(latestW)}">`)}
      ${field('Activity', sel('activity', [['1.375', 'Lightly active (desk job + 3–4 workouts)'], ['1.2', 'Sedentary'], ['1.55', 'Moderately active (on your feet / 5 workouts)'], ['1.725', 'Very active (physical job + training)']]))}
      ${field('Goal', sel('goal', [['-500', 'Lose about 1 lb/week'], ['-250', 'Lose about 0.5 lb/week (recomp)'], ['0', 'Maintain'], ['250', 'Lean gain']]))}
      <button class="btn primary block" data-a="calc-goals">Calculate & apply</button>
    </div>
  </details>`;
}
function calcGoals() {
  const p = S.profile;
  const metric = unit() === 'kg';
  const latestW = weightSeries().at(-1)?.[1];
  const w = num(p.weight) ?? latestW;
  const age = num(p.age);
  const cm = metric ? num(p.cm) : ((num(p.ft) || 0) * 12 + (num(p.in) || 0)) * 2.54;
  if (!w || !age || !cm) return toast('Fill in age, height and weight first');
  const kg = metric ? w : w * 0.453592;
  const bmr = 10 * kg + 6.25 * cm - 5 * age + ((p.sex || 'm') === 'f' ? -161 : 5);
  const tdee = bmr * Number(p.activity || 1.375);
  const cal = Math.round((tdee + Number(p.goal ?? -500)) / 10) * 10;
  const protein = Math.round(kg * 2.0);
  const fat = Math.round((cal * 0.25) / 9);
  const carbs = Math.max(0, Math.round((cal - protein * 4 - fat * 9) / 4));
  if (!confirm(`Maintenance ≈ ${Math.round(tdee).toLocaleString()} kcal/day.\n\nNew goals:\n• ${cal.toLocaleString()} kcal\n• Protein ${protein} g\n• Carbs ${carbs} g\n• Fat ${fat} g\n\nApply these?`)) return;
  Object.assign(S.settings, { calGoal: cal, proteinGoal: protein, carbGoal: carbs, fatGoal: fat });
  save(); render(); toast('Goals updated');
}

// ---------- actions ----------
const nutritionActions = {
  'diet-date'(d) { ui.dietDate = addDays(ui.dietDate, Number(d.n)); render(); },
  'diet-today'() { ui.dietDate = today(); render(); },
  'food-open'(d) {
    dv.meal = d.meal || defaultMeal();
    dv.view = 'search'; dv.cat = null; dv.q = '';
    render(); window.scrollTo(0, 0);
  },
  'diet-back'() { resetDietView(); render(); },
  'dv-meal'(d) {
    dv.meal = d.v;
    document.querySelectorAll('[data-a="dv-meal"]').forEach((b) => b.classList.toggle('on', b.dataset.v === d.v));
    const btn = document.querySelector('[data-a="create-save"][data-log]');
    if (btn) btn.textContent = `${dv.createMode === 'quick' ? 'Add' : 'Save & add'} to ${d.v}`;
  },
  'dv-tab'(d) { dv.tab = d.v; render(); },
  'dv-cat'(d) { dv.cat = dv.cat === d.v ? null : d.v; renderFoodResults(); },
  'food-online'() { searchOnline(); },
  'food-pick'(d) { const f = dv.list[d.k]; if (f) openDetail(f); },
  'food-quickadd'(d) {
    const f = dv.list[d.k];
    if (!f) return;
    dietDay(ui.dietDate).entries.push(makeEntry(f, f.lastAmt ?? 1, f.lastUnit ?? 'srv', dv.meal));
    save(); toast(`${f.name} added to ${dv.meal}`);
  },
  'entry-edit'(d) {
    const e = S.diet[ui.dietDate].entries[d.idx];
    dv.meal = e.meal;
    openDetail(foodFromEntry(e), Number(d.idx));
  },
  'detail-back'() {
    dv.view = dv.detail?.editIdx != null ? 'day' : 'search';
    dv.detail = null; render();
  },
  'fd-amt'(d) {
    dv.detail.amt = Number(d.v);
    $('#fd-amt').value = d.v;
    document.querySelectorAll('[data-a="fd-amt"]').forEach((b) => b.classList.toggle('on', b.dataset.v === d.v));
    $('#fd-preview').innerHTML = detailPreview();
  },
  'fd-meal'(d) {
    dv.detail.meal = d.v;
    document.querySelectorAll('[data-a="fd-meal"]').forEach((b) => b.classList.toggle('on', b.dataset.v === d.v));
    if (dv.detail.editIdx == null) $('[data-a="fd-save"]').textContent = `Add to ${d.v}`;
  },
  'fd-save'() {
    const { food, amt, unit, meal, editIdx } = dv.detail;
    if (!(num(amt) > 0)) return toast('Enter an amount');
    const entry = makeEntry(food, amt, unit, meal);
    const day = dietDay(ui.dietDate);
    if (editIdx != null) { entry.id = day.entries[editIdx].id; day.entries[editIdx] = entry; }
    else day.entries.push(entry);
    save();
    const editing = editIdx != null;
    dv.detail = null;
    dv.view = editing ? 'day' : 'search';
    if (!editing) dv.meal = meal;
    render(); window.scrollTo(0, 0);
    toast(editing ? 'Entry updated' : `Added to ${meal}`);
  },
  'fd-delete'() {
    S.diet[ui.dietDate].entries.splice(dv.detail.editIdx, 1);
    save(); resetDietView(); render(); toast('Entry deleted');
  },
  'fd-mine'() {
    const f = dv.detail.food;
    const { lastAmt, lastUnit, recent, mine, ...clean } = f;
    S.foods.unshift({ ...clean, id: uid(), src: 'my' });
    dv.detail.food = S.foods[0];
    save(); render(); toast('Saved to My foods');
  },
  'meal-save'(d) {
    const items = S.diet[ui.dietDate].entries.filter((e) => e.meal === d.meal);
    const name = prompt('Name this meal (e.g. "Usual breakfast"):', `My ${d.meal.toLowerCase()}`);
    if (!name || !name.trim()) return;
    S.meals.unshift({ id: uid(), name: name.trim(), items: clone(items) });
    save(); toast('Meal saved — find it under Add food → My meals');
  },
  'mymeal-add'(d) {
    const m = S.meals[d.i];
    dietDay(ui.dietDate).entries.push(...m.items.map((e) => ({ ...clone(e), id: uid(), meal: dv.meal })));
    save(); resetDietView(); render(); toast(`${m.name} added to ${dv.meal}`);
  },
  'mymeal-del'(d) {
    if (!confirm(`Delete saved meal “${S.meals[d.i].name}”?`)) return;
    S.meals.splice(d.i, 1); save(); renderFoodResults();
  },
  'diet-copy'() {
    const y = S.diet[addDays(ui.dietDate, -1)];
    dietDay(ui.dietDate).entries.push(...y.entries.map((e) => ({ ...clone(e), id: uid() })));
    save(); render(); toast("Copied yesterday's food");
  },
  'create-open'(d) {
    stopScan();
    dv.createMode = d.mode; dv.view = 'create';
    const code = /^No match for (\d+)/.exec(dv.scanStatus)?.[1];
    render(); window.scrollTo(0, 0);
    if (code && $('#cf-code')) $('#cf-code').value = code;
    $('#cf-name')?.focus();
  },
  'create-back'() { dv.view = 'search'; render(); },
  'create-save'(d) {
    const quick = dv.createMode === 'quick';
    const val = (id) => $(id)?.value.trim() ?? '';
    const name = val('#cf-name') || (quick ? 'Quick add' : '');
    const cal = num(val('#cf-cal'));
    if (!name) return toast('Enter a food name');
    if (cal == null) return toast('Enter calories');
    const food = {
      id: uid(), src: quick ? 'quick' : 'my', name, brand: val('#cf-brand'), serving: val('#cf-serving') || '1 serving',
      grams: num(val('#cf-grams')), code: val('#cf-code').replace(/\D/g, ''),
      cal, p: num(val('#cf-p')) || 0, c: num(val('#cf-c')) || 0, f: num(val('#cf-f')) || 0,
    };
    if (!quick) S.foods.unshift(food);
    if (d.log) dietDay(ui.dietDate).entries.push(makeEntry(food, 1, 'srv', dv.meal));
    save();
    dv.view = d.log ? 'day' : 'search';
    if (!d.log) dv.tab = 'mine';
    render(); window.scrollTo(0, 0);
    toast(d.log ? `Added to ${dv.meal}` : 'Saved to My foods');
  },
  'scan-open'() { dv.view = 'scan'; dv.scanStatus = ''; render(); window.scrollTo(0, 0); },
  'scan-back'() { stopScan(); dv.view = 'search'; render(); },
  'scan-start'() { startScan(); },
  'scan-lookup'() { stopScan(); lookupBarcode($('#scan-code').value); },
  'goals-open'() { ui.tab = 'plan'; render(); setTimeout(() => document.querySelector('[data-f="calGoal"]')?.scrollIntoView({ block: 'center' }), 50); },
  'calc-goals'() { calcGoals(); },
};

// Live updates that shouldn't re-render the whole page (keeps the keyboard open).
document.addEventListener('input', (ev) => {
  const t = ev.target;
  if (t.id === 'food-q') {
    dv.q = t.value;
    dv.cat = null;
    renderFoodResults();
    clearTimeout(searchOnline.timer);
    if (dv.tab === 'all' && dv.q.trim().length >= 3) searchOnline.timer = setTimeout(searchOnline, 700);
  } else if (t.id === 'fd-amt' && dv.detail) {
    dv.detail.amt = t.value;
    $('#fd-preview').innerHTML = detailPreview();
    document.querySelectorAll('[data-a="fd-amt"]').forEach((b) => b.classList.toggle('on', Number(b.dataset.v) === num(t.value)));
  }
});
document.addEventListener('change', (ev) => {
  if (ev.target.id !== 'fd-unit' || !dv.detail) return;
  const d = dv.detail, f = d.food, newU = ev.target.value;
  // Keep the same amount of food when switching units.
  const grams = d.unit === 'srv' ? (num(d.amt) || 0) * (f.grams || 0) : d.unit === 'oz' ? (num(d.amt) || 0) * OZ : num(d.amt) || 0;
  d.amt = newU === 'srv' ? r1(grams / f.grams) : newU === 'oz' ? r1(grams / OZ) : Math.round(grams);
  d.unit = newU;
  render();
});
document.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Enter') return;
  if (ev.target.id === 'food-q') { ev.target.blur(); clearTimeout(searchOnline.timer); if (dv.tab === 'all' && dv.online.q !== dv.q.trim()) searchOnline(); }
  if (ev.target.id === 'scan-code') nutritionActions['scan-lookup']();
  if (ev.target.id === 'fd-amt') nutritionActions['fd-save']();
});
