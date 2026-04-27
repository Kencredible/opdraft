import { SCENARIOS } from './data/scenarios.js';

// ─── Screen switching ──────────────────────────────────────────────────────────
export function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ─── Bounty formatter ─────────────────────────────────────────────────────────
function fmtBounty(n) {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2).replace(/\.?0+$/, '') + 'B';
  if (n >= 1_000_000)     return (n / 1_000_000).toFixed(0) + 'M';
  if (n >= 1_000)         return (n / 1_000).toFixed(0) + 'K';
  return n > 0 ? n.toString() : null;
}

// ─── Pick slots ───────────────────────────────────────────────────────────────
export function renderPickSlots(playerId, team, teamSize) {
  const el = document.getElementById(`p${playerId + 1}-picks`);
  el.innerHTML = '';
  const colorClass = playerId === 0 ? 'p1-pick' : 'p2-pick';

  for (let i = 0; i < teamSize; i++) {
    const char = team[i];
    const slot = document.createElement('div');

    if (char) {
      slot.className = `pick-slot filled ${colorClass}`;
      slot.innerHTML = `
        <div class="slot-name">${char.name}</div>
        <div class="slot-role">${char.job || '—'}</div>
        <div class="slot-pwr">⚡ ${char.stats.overall}</div>
      `;
    } else {
      slot.className = 'pick-slot';
      slot.textContent = `Pick ${i + 1}`;
    }

    el.appendChild(slot);
  }
}

// ─── Team power display ───────────────────────────────────────────────────────
export function updateTeamPower(playerId, power) {
  const el = document.getElementById(`p${playerId + 1}-power`);
  if (el) el.textContent = power > 0 ? `${power} PWR` : '— PWR';
}

// ─── Draft status bar ──────────────────────────────────────────────────────────
export function updateDraftStatus(currentPlayer, pickIndex, totalPicks, mode) {
  const names = ['Player 1', mode === 'vs-ai' ? 'AI Opponent' : 'Player 2'];
  const turnEl = document.getElementById('draft-turn-text');
  const numEl  = document.getElementById('draft-pick-num');
  if (turnEl) turnEl.textContent = `${names[currentPlayer]}'s Pick`;
  if (numEl)  numEl.textContent  = `Pick ${pickIndex + 1} of ${totalPicks}`;
}

export function setDraftComplete() {
  const turnEl = document.getElementById('draft-turn-text');
  const numEl  = document.getElementById('draft-pick-num');
  if (turnEl) turnEl.textContent = 'Draft Complete — Choose a Scenario';
  if (numEl)  numEl.textContent  = 'All picks made';
}

// ─── Character grid ───────────────────────────────────────────────────────────
export function renderCharGrid(chars, draft, onPick) {
  const grid = document.getElementById('char-grid');
  grid.innerHTML = '';

  if (!chars.length) {
    grid.innerHTML = '<div class="loading-msg">No characters found.</div>';
    return;
  }

  for (const char of chars) {
    const takenBy = draft.pickedBy(char.id);
    const card = document.createElement('div');

    let takenClass = '';
    if (takenBy === 0) takenClass = 'taken-p1';
    else if (takenBy === 1) takenClass = 'taken-p2';

    card.className = `char-card ${takenClass}`;
    card.dataset.id = char.id;

    const bountyFmt = fmtBounty(char.stats.bounty);
    const fruitName = char.fruit?.name ?? null;

    card.innerHTML = `
      <div class="cc-name">${char.name}</div>
      <div class="cc-role">${char.job || 'Unknown'}</div>
      ${bountyFmt ? `<div class="cc-bounty">💰 ${bountyFmt}</div>` : ''}
      ${fruitName  ? `<div class="cc-fruit">🍎 ${fruitName}</div>` : ''}
      <div class="cc-bar-row">
        <div class="cc-bar">
          <div class="cc-bar-fill" style="width:${char.stats.overall}%"></div>
        </div>
        <span class="cc-pwr">${char.stats.overall}</span>
      </div>
    `;

    if (takenBy === null) {
      card.addEventListener('click', () => onPick(char));
    }

    grid.appendChild(card);
  }
}

// ─── Search & filter ─────────────────────────────────────────────────────────
export function setupSearch(allChars, draft, onPick) {
  const searchEl = document.getElementById('char-search');
  const roleEl   = document.getElementById('role-filter');

  function refresh() {
    const q    = searchEl.value.trim().toLowerCase();
    const role = roleEl.value.toLowerCase();

    const filtered = allChars.filter(c => {
      const matchQ    = !q    || c.name.toLowerCase().includes(q) || (c.job || '').toLowerCase().includes(q);
      const matchRole = !role || (c.job || '').toLowerCase().includes(role);
      return matchQ && matchRole;
    });

    renderCharGrid(filtered, draft, onPick);
  }

  searchEl.addEventListener('input', refresh);
  roleEl.addEventListener('change', refresh);

  return refresh;
}

// ─── Scenario grid ────────────────────────────────────────────────────────────
export function renderScenarios(onSelect) {
  const grid = document.getElementById('scenario-grid');
  grid.innerHTML = '';

  for (const sc of SCENARIOS) {
    const card = document.createElement('div');
    card.className = 'scenario-card';
    card.innerHTML = `
      <div class="sc-arc">${sc.arc}</div>
      <div class="sc-name">${sc.name}</div>
      <div class="sc-desc">${sc.desc}</div>
      <div class="sc-tags">${sc.tags.map(t => `<span class="sc-tag">${t}</span>`).join('')}</div>
      <div class="sc-diff">Difficulty: <span>${sc.difficulty}</span></div>
    `;
    card.addEventListener('click', () => onSelect(sc));
    grid.appendChild(card);
  }
}

// ─── Results screen ───────────────────────────────────────────────────────────
export function renderResults(p1Result, p2Result, scenario, mode) {
  const p2Name = mode === 'vs-ai' ? 'AI Opponent' : 'Player 2';

  document.getElementById('results-arc-name').textContent = scenario.shortName ?? scenario.name;

  // Winner banner
  const bannerEl = document.getElementById('winner-banner');
  if (p1Result.percentage > p2Result.percentage) {
    bannerEl.textContent = '🏆 Player 1 Wins!';
  } else if (p2Result.percentage > p1Result.percentage) {
    bannerEl.textContent = `🏆 ${p2Name} Wins!`;
  } else {
    bannerEl.textContent = "⚓ It's a Tie!";
  }

  const panels = document.getElementById('results-panels');
  panels.innerHTML = `
    ${buildPanel('Player 1', p1Result, 'p1', p1Result.percentage >= p2Result.percentage, 'fill-p1')}
    ${buildPanel(p2Name,     p2Result, 'p2', p2Result.percentage >= p1Result.percentage, 'fill-p2')}
  `;

  // Animate bars after paint
  requestAnimationFrame(() => {
    document.getElementById('bar-p1').style.width = `${p1Result.percentage}%`;
    document.getElementById('bar-p2').style.width = `${p2Result.percentage}%`;
  });
}

function buildPanel(name, result, prefix, isWinner, fillClass) {
  const pColor = prefix === 'p1' ? 'var(--p1)' : 'var(--p2)';

  const charsHtml = result.breakdown.map(item => `
    <div class="rp-char">
      <div class="rp-char-info">
        <div class="rp-char-name">${item.character.name}</div>
        <div class="rp-char-role">${item.character.job || ''}</div>
      </div>
      <div class="rp-char-score">+${item.score}</div>
    </div>
  `).join('');

  const bonuses = [];
  if (result.bonuses.diversity > 0) bonuses.push(`🤝 Role Diversity +${result.bonuses.diversity}%`);
  if (result.bonuses.leader    > 0) bonuses.push(`👑 Captain Bonus +${result.bonuses.leader}%`);
  if (result.bonuses.fruit     > 0) bonuses.push(`🍎 Fruit Variety +${result.bonuses.fruit}%`);

  return `
    <div class="result-panel ${isWinner ? 'is-winner' : ''}">
      <div class="rp-header">
        <span class="rp-player" style="color:${pColor}">${name}</span>
        <span class="rp-score"  style="color:${pColor}">${result.percentage}%</span>
      </div>
      <div class="rp-bar-wrap">
        <div id="bar-${prefix}" class="rp-bar-fill ${fillClass}" style="width:0%"></div>
      </div>
      <div class="rp-chars">${charsHtml}</div>
      ${bonuses.length ? `
        <div class="rp-bonuses">
          ${bonuses.map(b => `<span class="bonus-chip">${b}</span>`).join('')}
        </div>` : ''}
    </div>
  `;
}
