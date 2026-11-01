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

export const STAGES: StageDef[] = [
  { id: 1, biome: 0, goalScore: 25, speed: 0.95, interval: 1.15, simpleOnly: true },
  { id: 2, biome: 0, goalScore: 40, speed: 1.05, interval: 1.0 },
  { id: 3, biome: 1, goalScore: 40, speed: 1.05, interval: 1.05 },
  { id: 4, biome: 1, goalScore: 55, speed: 1.15, interval: 0.95 },
  { id: 5, biome: 2, goalScore: 55, speed: 1.1, interval: 1.0 },
  { id: 6, biome: 3, goalScore: 55, speed: 1.05, interval: 1.05 },
  { id: 7, biome: 4, goalScore: 65, speed: 1.2, interval: 0.95 },
  { id: 8, biome: 5, goalScore: 80, speed: 1.25, interval: 0.9 },
];

export const STAGE_GOAL_TRAVEL_S = 15;
export const MAX_STARS = STAGES.length * 3;

// ★ finished, ★ no hits, ★ reached the ×4 multiplier.
export function starsFor(hitsTaken: number, maxMult: number): number {
  return 1 + (hitsTaken === 0 ? 1 : 0) + (maxMult >= 4 ? 1 : 0);
}

// A stage is playable once the previous one has at least one star.
export const isStageUnlocked = (id: number, stars: Record<number, number>) => id === 1 || (stars[id - 1] ?? 0) > 0;

export const totalStars = (stars: Record<number, number>) => Object.values(stars).reduce((s, n) => s + n, 0);
