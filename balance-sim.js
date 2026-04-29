/**
 * One Piece Draft — Balance Simulator
 * Run: node balance-sim.js
 *
 * Extracts game logic from index.html and runs simulations without touching the app.
 * Reports: scenario ceilings, pick-order fairness, synergy dominance, character dominance.
 */

'use strict';
const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

// ─── 1. Load and extract the <script> block from index.html ───────────────────
const html   = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
const src    = scripts.join('\n');

// ─── 2. Minimal DOM / browser stubs so the script evaluates without errors ───
const noop = () => {};
// Fully chainable null element — every method returns itself or a safe value
function nullEl() {
  const el = {
    innerHTML: '', textContent: '', value: '', style: {}, dataset: {},
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    appendChild: () => el, insertBefore: () => el, removeChild: () => el,
    setAttribute: noop, getAttribute: () => null, removeAttribute: noop,
    addEventListener: noop, removeEventListener: noop,
    querySelector: () => nullEl(), querySelectorAll: () => [],
    closest: () => null, matches: () => false,
    getBoundingClientRect: () => ({ top:0,left:0,right:0,bottom:0,width:0,height:0 }),
    focus: noop, blur: noop, click: noop,
    children: [], childNodes: [], parentNode: null, nextSibling: null,
    scrollIntoView: noop, scrollTo: noop,
  };
  return el;
}

const sandbox = {
  window:    {},
  document: {
    getElementById:       () => nullEl(),
    querySelector:        () => nullEl(),
    querySelectorAll:     () => [],
    getElementsByClassName: () => [],
    createElement:        () => nullEl(),
    createTextNode:       () => nullEl(),
    addEventListener:     noop,
    removeEventListener:  noop,
    body:                 nullEl(),
    head:                 nullEl(),
    documentElement:      nullEl(),
  },
  navigator:  { userAgent: '' },
  location:   { href: '', search: '', hash: '' },
  history:    { pushState: noop, replaceState: noop },
  console,
  setTimeout:  (fn) => { try { fn(); } catch(_) {} },
  clearTimeout:  noop,
  setInterval:   noop,
  clearInterval: noop,
  requestAnimationFrame: noop,
  cancelAnimationFrame:  noop,
  localStorage:  { getItem: () => null, setItem: noop, removeItem: noop },
  sessionStorage:{ getItem: () => null, setItem: noop, removeItem: noop },
  matchMedia:    () => ({ matches: false, addListener: noop, removeEventListener: noop }),
  innerWidth:    1440, innerHeight: 900,
  devicePixelRatio: 1,
  Image:         function() { return nullEl(); },
  getComputedStyle: () => ({}),
  alert: noop, confirm: () => false, prompt: () => null,
  addEventListener:    noop,
  removeEventListener: noop,
  dispatchEvent:       noop,
  ResizeObserver: function() { return { observe: noop, unobserve: noop, disconnect: noop }; },
  MutationObserver: function() { return { observe: noop, disconnect: noop }; },
  IntersectionObserver: function() { return { observe: noop, disconnect: noop }; },
  CustomEvent: function() { return {}; },
  Event: function() { return {}; },
};
sandbox.window = sandbox;

// In a vm context, only `var` declarations attach to the sandbox object.
// `const` / `let` stay in block scope and aren't reachable from outside.
// We rewrite them to `var` so everything lands on `sandbox.*`.
const srcVarified = src
  .replace(/\bconst\b/g, 'var')
  .replace(/\blet\b/g,   'var');

vm.createContext(sandbox);
try {
  vm.runInContext(srcVarified, sandbox, { filename: 'index.html' });
} catch (e) {
  // Swallow DOM / UI errors that fire after all data & functions are defined
  if (!sandbox.FALLBACK || !sandbox.SCENARIOS) {
    console.error('Failed to extract game data:', e.message);
    console.error(e.stack);
    process.exit(1);
  }
}

// Pull the functions and data we need
const {
  FALLBACK, SCENARIOS, BOSSES, BOSS_DEBUFFS, SYNERGIES,
  computeStats, scoreTeam, getActiveSynergies,
} = sandbox;

// Pre-compute stats for every character (mirrors what the app does at runtime)
const ROSTER = FALLBACK.map(c => ({ ...c, stats: computeStats(c) }));

// Characters that are bosses in at least one scenario (excluded from their own scenario pool)
const ALL_BOSS_NAMES = new Set(Object.values(BOSSES).flat());

function draftableFor(sc) {
  const bossesHere = new Set(BOSSES[sc.id] || []);
  // Mirror the game's pool filter: exclude bosses and legends (legendsMode = false)
  return ROSTER.filter(c => !bossesHere.has(c.name) && !c.legends);
}

// ─── 3. Greedy draft simulation ───────────────────────────────────────────────
// Each pick turn: the active player picks the character that maximises their
// own final score given the characters already on their team.
// numPlayers: 2 or 4 | picksEach: 5
function greedyDraft(sc, numPlayers = 4, picksEach = 5) {
  const pool = [...draftableFor(sc)];
  const teams = Array.from({ length: numPlayers }, () => []);

  // Snake draft order: 1-2-3-4-4-3-2-1-1-2-... for picksEach rounds
  const order = [];
  for (let round = 0; round < picksEach; round++) {
    const row = Array.from({ length: numPlayers }, (_, i) => i);
    order.push(...(round % 2 === 0 ? row : row.reverse()));
  }

  for (const pid of order) {
    if (!pool.length) break;
    let bestScore = -Infinity, bestIdx = 0;
    for (let i = 0; i < pool.length; i++) {
      const candidate = [...teams[pid], pool[i]];
      const { percentage } = scoreTeam(candidate, sc);
      if (percentage > bestScore) { bestScore = percentage; bestIdx = i; }
    }
    teams[pid].push(pool.splice(bestIdx, 1)[0]);
  }

  return teams.map(team => ({
    team,
    result: scoreTeam(team, sc),
    synergies: getActiveSynergies(team),
  }));
}

// ─── 4. Brute-force optimal team (top-5 by score) ────────────────────────────
// Samples N random 5-char combos + exhaustive for small pools — good enough for balance checking
function findBestTeam(sc, samples = 8000) {
  const pool = draftableFor(sc);
  let best = null, bestScore = -1;

  // Exhaustive for pools ≤ 30, sampled otherwise
  function score5(indices) {
    const team = indices.map(i => pool[i]);
    const { percentage } = scoreTeam(team, sc);
    if (percentage > bestScore) { bestScore = percentage; best = team; }
  }

  if (pool.length <= 30) {
    // C(30,5) = 142,506 — fast enough
    for (let a = 0; a < pool.length - 4; a++)
    for (let b = a+1; b < pool.length - 3; b++)
    for (let c = b+1; c < pool.length - 2; c++)
    for (let d = c+1; d < pool.length - 1; d++)
    for (let e = d+1; e < pool.length;     e++)
      score5([a,b,c,d,e]);
  } else {
    const tried = new Set();
    for (let i = 0; i < samples; i++) {
      const idxs = randomSample(pool.length, 5);
      const key  = idxs.sort((a,b)=>a-b).join(',');
      if (tried.has(key)) continue;
      tried.add(key);
      score5(idxs);
    }
  }
  return { team: best, score: bestScore };
}

function randomSample(n, k) {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, k);
}

// ─── 5. Helpers ───────────────────────────────────────────────────────────────
const BAR  = (v, max = 99, width = 20) => '█'.repeat(Math.round(v / max * width)).padEnd(width, '░');
const PCT  = v => String(v).padStart(3);
const PAD  = (s, n) => String(s).padEnd(n);

function header(title) {
  const line = '═'.repeat(60);
  console.log(`\n${line}`);
  console.log(`  ${title}`);
  console.log(line);
}

function subheader(title) {
  console.log(`\n  ── ${title} ${'─'.repeat(Math.max(0, 54 - title.length))}`);
}

// ─── 6. REPORT A: Scenario score ceilings ────────────────────────────────────
function reportCeilings() {
  header('REPORT A — Scenario Score Ceilings (best possible team)');
  console.log(`  ${'Scenario'.padEnd(22)} ${'Best%'.padStart(5)}  Bar`);
  console.log('  ' + '─'.repeat(55));
  const results = SCENARIOS.map(sc => {
    const { score, team } = findBestTeam(sc);
    return { sc, score, team };
  }).sort((a, b) => b.score - a.score);

  for (const { sc, score, team } of results) {
    const bar = BAR(score);
    console.log(`  ${PAD(sc.shortName, 22)} ${PCT(score)}%  ${bar}`);
    console.log(`    Best team: ${team.map(c => c.name).join(', ')}`);
  }

  const scores = results.map(r => r.score);
  const spread = Math.max(...scores) - Math.min(...scores);
  console.log(`\n  Ceiling spread: ${Math.min(...scores)}% – ${Math.max(...scores)}% (gap: ${spread}pts)`);
  if (spread > 15) console.log('  ⚠️  Wide ceiling gap — some scenarios may feel harder to excel in');
  else             console.log('  ✅  Ceilings are balanced (≤15pt spread)');
}

// ─── 7. REPORT B: Pick-order fairness ────────────────────────────────────────
function reportPickOrder(runs = 200) {
  header(`REPORT B — Pick-Order Fairness (${runs} greedy drafts per scenario)`);
  console.log(`  ${'Scenario'.padEnd(22)}  P1 win%  P2 win%  P3 win%  P4 win%`);
  console.log('  ' + '─'.repeat(62));

  for (const sc of SCENARIOS) {
    const wins = [0, 0, 0, 0];
    for (let i = 0; i < runs; i++) {
      const draft = greedyDraft(sc, 4, 5);
      const max   = Math.max(...draft.map(d => d.result.percentage));
      draft.forEach((d, p) => { if (d.result.percentage === max) wins[p]++; });
    }
    const total = wins.reduce((a, b) => a + b, 0) || 1;
    const pcts  = wins.map(w => PCT(Math.round(w / total * 100)) + '%');
    console.log(`  ${PAD(sc.shortName, 22)}  ${pcts.join('     ')}`);
  }

  console.log('\n  Ideal: ~25% each. >40% for P1 suggests top characters are too dominant.');
}

// ─── 8. REPORT C: Character dominance ────────────────────────────────────────
function reportCharDominance() {
  header('REPORT C — Character Dominance (avg score contribution across all scenarios)');

  const charScores = {};
  for (const c of ROSTER) {
    if (ALL_BOSS_NAMES.has(c.name)) continue; // skip dedicated bosses
    if (c.legends) continue;                  // skip legends-mode characters
    let total = 0;
    for (const sc of SCENARIOS) {
      // Score a solo "team" — measures raw scenario fit, ignoring bonuses
      const { crewScore } = scoreTeam([c], sc);
      total += crewScore;
    }
    charScores[c.name] = Math.round(total / SCENARIOS.length);
  }

  const sorted = Object.entries(charScores).sort((a, b) => b[1] - a[1]);
  const topN   = sorted.slice(0, 15);
  const max    = topN[0][1];

  subheader('Top 15 characters by average scenario fit');
  for (const [name, avg] of topN) {
    console.log(`  ${PAD(name, 20)} ${PCT(avg)}  ${BAR(avg, max)}`);
  }

  const top10names = new Set(topN.slice(0, 10).map(([n]) => n));
  let top10Appearances = 0;
  for (const sc of SCENARIOS) {
    const { team } = findBestTeam(sc, 2000);
    for (const c of team) if (top10names.has(c.name)) top10Appearances++;
  }
  const totalSlots = SCENARIOS.length * 5;
  const dominance  = Math.round(top10Appearances / totalSlots * 100);
  console.log(`\n  Top-10 chars occupy ${dominance}% of optimal team slots across all scenarios`);
  if (dominance > 70) console.log('  ⚠️  High dominance — draft pools may feel predictable');
  else                console.log('  ✅  Good spread across the roster');
}

// ─── 9. REPORT D: Synergy dominance ─────────────────────────────────────────
function reportSynergyDominance() {
  header('REPORT D — Synergy Impact (synergy teams vs. pure stat teams)');
  console.log(`  ${'Scenario'.padEnd(22)}  Stat-opt%  Synergy%  Delta`);
  console.log('  ' + '─'.repeat(55));

  // Find synergies with enough members available in the roster
  const activeSynDefs = SYNERGIES.filter(s => {
    if (s.members) return s.members.every(m => ROSTER.find(c => c.name === m));
    return false; // skip tiered synergies for this test
  });

  for (const sc of SCENARIOS) {
    // Stat-optimised: greedy top-5 ignoring synergies
    const pool = draftableFor(sc).sort((a, b) => {
      const sa = Object.entries(sc.weights).reduce((t, [k, w]) => t + (a.stats[k] || 0) * w, 0);
      const sb = Object.entries(sc.weights).reduce((t, [k, w]) => t + (b.stats[k] || 0) * w, 0);
      return sb - sa;
    });
    const statTeam   = pool.slice(0, 5);
    const statScore  = scoreTeam(statTeam, sc).percentage;

    // Best synergy team: try each synergy group as a seed, fill remaining slots greedily
    let bestSynScore = 0;
    for (const syn of activeSynDefs) {
      const seed = syn.members.map(m => ROSTER.find(c => c.name === m)).filter(Boolean);
      if (seed.length > 5) continue;
      const bossesHere = new Set(BOSSES[sc.id] || []);
      if (seed.some(c => bossesHere.has(c.name))) continue;

      const seedNames = new Set(seed.map(c => c.name));
      const remaining = draftableFor(sc)
        .filter(c => !seedNames.has(c.name))
        .sort((a, b) => {
          const sa = Object.entries(sc.weights).reduce((t, [k, w]) => t + (a.stats[k] || 0) * w, 0);
          const sb = Object.entries(sc.weights).reduce((t, [k, w]) => t + (b.stats[k] || 0) * w, 0);
          return sb - sa;
        });
      const synTeam  = [...seed, ...remaining.slice(0, 5 - seed.length)];
      const synScore = scoreTeam(synTeam, sc).percentage;
      if (synScore > bestSynScore) bestSynScore = synScore;
    }

    const delta = bestSynScore - statScore;
    const flag  = delta > 12 ? ' ⚠️ synergy too strong' : delta < -5 ? ' ℹ️ synergy underperforms' : '';
    console.log(`  ${PAD(sc.shortName, 22)}  ${PCT(statScore)}%       ${PCT(bestSynScore)}%  ${delta >= 0 ? '+' : ''}${delta}${flag}`);
  }

  console.log('\n  Healthy range: synergy teams within ±12pts of stat-optimal teams.');
}

// ─── 10. REPORT E: Boss threat calibration ───────────────────────────────────
function reportBossThreats() {
  header('REPORT E — Boss Threat Calibration');
  console.log(`  ${'Boss'.padEnd(18)}  ${'Scenario'.padEnd(18)}  Optimal%  After boss  Boss mod`);
  console.log('  ' + '─'.repeat(70));

  for (const sc of SCENARIOS) {
    const bossNames = BOSSES[sc.id] || [];
    if (!bossNames.length) continue;
    const { team, score: optScore } = findBestTeam(sc, 2000);
    const fullResult = scoreTeam(team, sc);
    for (const b of bossNames) {
      const mod = Math.round((fullResult.bossMod - 1) * 100);
      const flag = mod < -25 ? ' ⚠️ very punishing' : mod < -15 ? ' ℹ️ significant' : ' ✅';
      console.log(`  ${PAD(b, 18)}  ${PAD(sc.shortName, 18)}  ${PCT(optScore)}%       ${PCT(fullResult.percentage)}%       ${mod >= 0 ? '+' : ''}${mod}%${flag}`);
    }
  }
}

// ─── Run all reports ──────────────────────────────────────────────────────────
console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║          ONE PIECE DRAFT — BALANCE SIMULATION               ║');
console.log('╚══════════════════════════════════════════════════════════════╝');

reportCeilings();
reportPickOrder(150);
reportCharDominance();
reportSynergyDominance();
reportBossThreats();

console.log('\n' + '═'.repeat(62));
console.log('  Simulation complete.\n');
