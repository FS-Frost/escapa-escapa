// Run modes and the stage list.
//  - stage:   one biome, a goal after `goalScore` points, rated with up to 3 stars.
//  - endless: no goal; biomes cycle every BIOME_LEN px and the pace ramps up.
//  - daily:   endless with a date-seeded layout, same for everyone that day.

export type RunMode = 'stage' | 'endless' | 'daily';

export interface StageDef {
  id: number;          // 1-based, also the i18n key `stage.<id>`
  biome: number;       // index into BIOMES
  goalScore: number;   // points needed before the goal appears
  speed: number;       // × base scroll speed
  interval: number;    // × base spawn interval (higher = calmer)
  simpleOnly?: boolean; // only single-obstacle patterns (first stage)
}

// Difficulty grows exponentially stage by stage: each one is 8% faster, 9%
// denser and needs 20% more points than the previous. Stage 8 ends at 1.71×
// speed / 0.54× interval, still inside the fairness limits (see
// obstacles.ts), so it is hard but never impossible.
const BIOME_OF = [0, 0, 1, 1, 2, 3, 4, 5];
export const STAGES: StageDef[] = BIOME_OF.map((biome, i) => ({
  id: i + 1,
  biome,
  goalScore: Math.round(25 * 1.2 ** i),
  speed: 1.0 * 1.08 ** i,
  interval: 1.05 * 0.91 ** i,
  simpleOnly: i === 0,
}));

export const STAGE_GOAL_TRAVEL_S = 15;
export const MAX_STARS = STAGES.length * 3;

// ★ finished, ★ no hits, ★ reached the ×4 multiplier.
export function starsFor(hitsTaken: number, maxMult: number): number {
  return 1 + (hitsTaken === 0 ? 1 : 0) + (maxMult >= 4 ? 1 : 0);
}

// A stage is playable once the previous one has at least one star.
export const isStageUnlocked = (id: number, stars: Record<number, number>) => id === 1 || (stars[id - 1] ?? 0) > 0;

export const totalStars = (stars: Record<number, number>) => Object.values(stars).reduce((s, n) => s + n, 0);
