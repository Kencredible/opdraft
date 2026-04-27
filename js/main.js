import { fetchCharacters } from './api.js';
import { computeStats, scoreTeam } from './engine.js';
import { Draft } from './draft.js';
import { aiPick } from './ai.js';
import {
  showScreen, renderPickSlots, updateTeamPower,
  updateDraftStatus, setDraftComplete,
  renderCharGrid, setupSearch,
  renderScenarios, renderResults,
} from './ui.js';

// ─── State ────────────────────────────────────────────────────────────────────
let allChars   = [];
let draft      = null;
let mode       = null;
let scenario   = null;
let refreshGrid = null;

// ─── Home ─────────────────────────────────────────────────────────────────────
document.getElementById('btn-vs-ai').addEventListener('click',     () => startGame('vs-ai'));
document.getElementById('btn-vs-player').addEventListener('click', () => startGame('vs-player'));
document.getElementById('btn-play-again').addEventListener('click', () => showScreen('screen-home'));

// ─── Game init ────────────────────────────────────────────────────────────────
async function startGame(gameMode) {
  mode     = gameMode;
  scenario = null;
  draft    = new Draft(mode);

  document.getElementById('p2-label').textContent =
    mode === 'vs-ai' ? 'AI Opponent' : 'Player 2';

  showScreen('screen-draft');

  // Initial slot render
  renderPickSlots(0, [], draft.teamSize);
  renderPickSlots(1, [], draft.teamSize);
  updateTeamPower(0, 0);
  updateTeamPower(1, 0);
  updateDraftStatus(0, 0, draft.totalPicks, mode);

  // Load characters once
  if (!allChars.length) {
    document.getElementById('char-grid').innerHTML =
      '<div class="loading-msg">⚓ Loading crew manifest from the Grand Line...</div>';
    const raw = await fetchCharacters();
    allChars = processCharacters(raw);
  }

  // Wire up search and render grid
  refreshGrid = setupSearch(allChars, draft, handlePick);
  refreshGrid();
}

function processCharacters(raw) {
  return raw
    .filter(c => c.name)
    .map(c => ({ ...c, stats: computeStats(c) }))
    .sort((a, b) => b.stats.overall - a.stats.overall)
    .slice(0, 200);
}

// ─── Draft logic ──────────────────────────────────────────────────────────────
function handlePick(char) {
  if (!draft || draft.complete) return;
  // In vs-ai mode block manual picks on AI's turn
  if (mode === 'vs-ai' && draft.currentPlayer === 1) return;
  executePick(char, draft.currentPlayer);
}

function executePick(char, playerId) {
  if (!draft.pick(char, playerId)) return;

  renderPickSlots(0, draft.teams[0], draft.teamSize);
  renderPickSlots(1, draft.teams[1], draft.teamSize);
  updateTeamPower(0, draft.teamPower(0));
  updateTeamPower(1, draft.teamPower(1));

  if (draft.complete) {
    setDraftComplete();
    refreshGrid();
    setTimeout(() => {
      renderScenarios(handleScenarioSelect);
      showScreen('screen-scenario');
    }, 700);
    return;
  }

  updateDraftStatus(draft.currentPlayer, draft.pickIndex, draft.totalPicks, mode);
  refreshGrid();

  // Trigger AI pick
  if (mode === 'vs-ai' && draft.currentPlayer === 1 && !draft.complete) {
    setTimeout(doAiPick, 900);
  }
}

function doAiPick() {
  if (!draft || draft.complete || draft.currentPlayer !== 1) return;
  const picked = aiPick(allChars, draft.pickedIds, scenario);
  if (picked) executePick(picked, 1);
}

// ─── Scenario & results ───────────────────────────────────────────────────────
function handleScenarioSelect(sc) {
  scenario = sc;

  const p1Result = scoreTeam(draft.teams[0], scenario);
  const p2Result = scoreTeam(draft.teams[1], scenario);

  renderResults(p1Result, p2Result, scenario, mode);
  showScreen('screen-results');
}
