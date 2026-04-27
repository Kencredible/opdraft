// ─── Stat computation ─────────────────────────────────────────────────────────

function parseBounty(str) {
  if (!str) return 0;
  const n = parseInt(str.replace(/[^0-9]/g, ''), 10);
  return isNaN(n) ? 0 : n;
}

function getRoleType(job) {
  if (!job) return 'fighter';
  const j = job.toLowerCase();
  if (/emperor|fleet admiral/i.test(j))            return 'emperor';
  if (/captain|commander/i.test(j))                return 'captain';
  if (/admiral|vice admiral/i.test(j))             return 'marine';
  if (/revolutionary.*leader|leader.*revolutionary/i.test(j)) return 'revolutionary';
  if (/revolutionary/i.test(j))                    return 'revolutionary';
  if (/swordsman|sword/i.test(j))                  return 'swordsman';
  if (/navigator/i.test(j))                        return 'navigator';
  if (/doctor|physician/i.test(j))                 return 'doctor';
  if (/sniper|marksman/i.test(j))                  return 'sniper';
  if (/archaeologist|scholar/i.test(j))            return 'scholar';
  if (/shipwright|engineer/i.test(j))              return 'engineer';
  if (/cook|chef/i.test(j))                        return 'cook';
  if (/musician/i.test(j))                         return 'musician';
  if (/marine/i.test(j))                           return 'marine';
  return 'fighter';
}

const ROLE_BASE_POWER = {
  emperor:       92,
  captain:       68,
  marine:        65,
  revolutionary: 62,
  swordsman:     60,
  fighter:       55,
  sniper:        50,
  doctor:        45,
  navigator:     44,
  scholar:       42,
  engineer:      42,
  cook:          40,
  musician:      38,
};

const ROLE_STAT_MULTS = {
  emperor:       { combat: 1.00, leadership: 1.00, strategy: 0.85, navigation: 0.50, support: 0.40 },
  captain:       { combat: 0.90, leadership: 0.95, strategy: 0.78, navigation: 0.45, support: 0.45 },
  marine:        { combat: 0.88, leadership: 0.80, strategy: 0.72, navigation: 0.50, support: 0.42 },
  revolutionary: { combat: 0.78, leadership: 0.80, strategy: 0.90, navigation: 0.55, support: 0.45 },
  swordsman:     { combat: 1.00, leadership: 0.55, strategy: 0.48, navigation: 0.35, support: 0.28 },
  fighter:       { combat: 0.95, leadership: 0.48, strategy: 0.42, navigation: 0.30, support: 0.28 },
  sniper:        { combat: 0.70, leadership: 0.38, strategy: 0.65, navigation: 0.46, support: 0.52 },
  doctor:        { combat: 0.32, leadership: 0.42, strategy: 0.80, navigation: 0.38, support: 1.00 },
  navigator:     { combat: 0.36, leadership: 0.48, strategy: 0.76, navigation: 1.00, support: 0.52 },
  scholar:       { combat: 0.28, leadership: 0.48, strategy: 1.00, navigation: 0.62, support: 0.65 },
  engineer:      { combat: 0.55, leadership: 0.42, strategy: 0.72, navigation: 0.65, support: 0.72 },
  cook:          { combat: 0.68, leadership: 0.38, strategy: 0.55, navigation: 0.40, support: 0.80 },
  musician:      { combat: 0.40, leadership: 0.35, strategy: 0.55, navigation: 0.42, support: 0.78 },
};

export function computeStats(character) {
  const bounty   = parseBounty(character.bounty);
  const hasFruit = !!character.fruit;
  const roleType = getRoleType(character.job);

  // Base power: blend bounty-derived + role-derived
  let basePower;
  if (bounty > 1_000_000) {
    const MAX_LOG = Math.log10(5_500_000_001);
    const MIN_LOG = Math.log10(1_000_001);
    const normalized = (Math.log10(bounty + 1) - MIN_LOG) / (MAX_LOG - MIN_LOG);
    basePower = 15 + normalized * 80;
  } else {
    basePower = ROLE_BASE_POWER[roleType] ?? 40;
  }

  basePower = Math.min(95, Math.max(15, basePower));
  const power = hasFruit ? basePower * 1.14 : basePower;

  const mults = ROLE_STAT_MULTS[roleType] ?? ROLE_STAT_MULTS.fighter;

  return {
    combat:     Math.round(Math.min(100, power * mults.combat)),
    leadership: Math.round(Math.min(100, power * mults.leadership)),
    strategy:   Math.round(Math.min(100, power * mults.strategy)),
    navigation: Math.round(Math.min(100, power * mults.navigation)),
    support:    Math.round(Math.min(100, power * mults.support)),
    overall:    Math.round(Math.min(100, power)),
    roleType,
    hasFruit,
    bounty,
  };
}

// ─── Team scoring ──────────────────────────────────────────────────────────────

export function scoreTeam(team, scenario) {
  const { weights, difficultyMod } = scenario;
  const rolesSeen = new Set();
  const breakdown = [];
  let rawTotal = 0;

  for (const char of team) {
    const stats = char.stats;
    let charRaw = 0;

    for (const [stat, weight] of Object.entries(weights)) {
      charRaw += (stats[stat] ?? 0) * weight;
    }

    charRaw *= difficultyMod;
    rolesSeen.add(stats.roleType);
    rawTotal += charRaw;
    breakdown.push({ character: char, raw: charRaw });
  }

  // Synergy: reward role diversity
  const diversity = rolesSeen.size >= 5 ? 1.22
    : rolesSeen.size >= 4 ? 1.15
    : rolesSeen.size >= 3 ? 1.08
    : rolesSeen.size >= 2 ? 1.03
    : 1.00;

  // Captain bonus
  const hasLeader = team.some(c =>
    c.stats.roleType === 'captain' || c.stats.roleType === 'emperor'
  );
  const leaderBonus = hasLeader ? 1.06 : 1.00;

  // Devil fruit variety bonus
  const fruitCount = team.filter(c => c.stats.hasFruit).length;
  const fruitBonus = fruitCount >= 4 ? 1.08
    : fruitCount >= 3 ? 1.05
    : fruitCount >= 2 ? 1.02
    : 1.00;

  const multiplier = diversity * leaderBonus * fruitBonus;
  const finalAvg   = (rawTotal / team.length) * multiplier;
  const percentage = Math.min(99, Math.max(5, Math.round(finalAvg)));

  // Scale breakdown scores so they sum to percentage
  const rawSum = breakdown.reduce((s, b) => s + b.raw, 0) || 1;
  const scaledBreakdown = breakdown
    .map(b => ({
      character: b.character,
      score: Math.round((b.raw / rawSum) * percentage),
    }))
    .sort((a, b) => b.score - a.score);

  return {
    percentage,
    breakdown: scaledBreakdown,
    bonuses: {
      diversity: Math.round((diversity - 1) * 100),
      leader:    hasLeader ? 6 : 0,
      fruit:     Math.round((fruitBonus - 1) * 100),
    },
  };
}
