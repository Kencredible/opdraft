// Greedy AI that favors characters matching the active scenario's stat weights.
// Falls back to overall power if no scenario is set yet.

const DEFAULT_WEIGHTS = { combat: 0.5, leadership: 0.3, strategy: 0.2 };

export function aiPick(allChars, pickedIds, scenario) {
  const available = allChars.filter(c => !pickedIds.has(c.id));
  if (!available.length) return null;

  const weights = scenario?.weights ?? DEFAULT_WEIGHTS;

  const scored = available.map(char => {
    const s = char.stats;
    let score = s.overall * 0.4; // base power matters
    for (const [stat, w] of Object.entries(weights)) {
      score += (s[stat] ?? 0) * w * 0.6;
    }
    return { char, score };
  });

  scored.sort((a, b) => b.score - a.score);

  // Pick from top 3 with slight randomness so AI isn't perfectly predictable
  const topN = Math.min(3, scored.length);
  const idx  = Math.random() < 0.78 ? 0 : Math.floor(Math.random() * topN);
  return scored[idx].char;
}
