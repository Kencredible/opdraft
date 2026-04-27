// Snake draft: P1 → P2 → P2 → P1 → P1 → P2 → P2 → P1 → P1 → P2
const SNAKE_ORDER = [0, 1, 1, 0, 0, 1, 1, 0, 0, 1];
const TEAM_SIZE   = 5;

export class Draft {
  constructor(mode) {
    this.mode        = mode; // 'vs-ai' | 'vs-player'
    this.pickIndex   = 0;
    this.teams       = [[], []];
    this.pickedIds   = new Set();
    this.complete    = false;
  }

  get currentPlayer() {
    return SNAKE_ORDER[this.pickIndex] ?? 0;
  }

  get totalPicks() {
    return SNAKE_ORDER.length;
  }

  pick(character, playerId) {
    if (this.complete) return false;
    if (this.currentPlayer !== playerId) return false;
    if (this.pickedIds.has(character.id)) return false;

    this.teams[playerId].push(character);
    this.pickedIds.add(character.id);
    this.pickIndex++;

    if (this.pickIndex >= this.totalPicks) this.complete = true;
    return true;
  }

  pickedBy(charId) {
    for (let p = 0; p < 2; p++) {
      if (this.teams[p].some(c => c.id === charId)) return p;
    }
    return null;
  }

  teamPower(playerId) {
    const team = this.teams[playerId];
    if (!team.length) return 0;
    return Math.round(team.reduce((s, c) => s + c.stats.overall, 0) / team.length);
  }

  get teamSize() { return TEAM_SIZE; }
}
