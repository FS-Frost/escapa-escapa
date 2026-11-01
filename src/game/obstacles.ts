import { CW, LANE_Y, LANE_COUNT, BASE_SPEED, PLAYER_X, SPAWN_AHEAD } from '../constants';
import { RULES } from './difficulty';
import { R } from '../gfx/renderer';
import { world, type PowerKind } from './world';
import { rand, randInt } from './rng';
import { audio } from '../audio';
import { spawnBeam, beamAllowed } from './hazards';
import {
  drawZombie, drawSpike, drawBat, drawGhost, drawOrb, drawGoalFlag, drawGeyser, drawGem, drawPowerUp,
} from './sprites';

// ===== OBSTACLES =====
// zombie/spike/bat/ghost/pit: classic hazards. swoop: bat that switches lane
// SWOOP_AT px ahead of the player (forest). geyser: dormant vent that erupts
// GEYSER_AT px ahead and then blocks two lanes (volcano). orb heals, gem is
// currency, power grants shield/magnet/slow-mo.
export type ObsType = 'zombie' | 'spike' | 'bat' | 'ghost' | 'pit' | 'orb' | 'swoop' | 'geyser' | 'gem' | 'power';

export interface Obstacle {
  type: ObsType;
  lane: number;           // lane it collides in now (swoop: changes once)
  lanes?: number[];       // geyser: both lanes it blocks
  fromLane?: number;      // swoop: starting lane
  toLane?: number;        // swoop: lane it will switch to
  switchT?: number;       // swoop: 0..1 switch animation (undefined = not yet)
  erupted?: boolean;      // geyser
  kind?: PowerKind;       // power
  x: number; y: number; w: number; h: number;
  active: boolean;
  frame: number;
  frameTimer: number;
  sineOffset: number;
  passed: boolean;
  scored: boolean;
}

// Pickups never hurt and never count as blocking a lane.
export const isPickup = (o: Obstacle) => o.type === 'orb' || o.type === 'gem' || o.type === 'power';

// Lanes an obstacle may occupy (fairness checks, radar).
export const laneSet = (o: Obstacle) => o.lanes ?? (o.toLane !== undefined ? [o.fromLane!, o.toLane] : [o.lane]);

const OBS_W: Record<ObsType, number> = { zombie: 12, spike: 16, bat: 20, ghost: 16, pit: 36, orb: 12, swoop: 20, geyser: 18, gem: 10, power: 14 };
const OBS_H: Record<ObsType, number> = { zombie: 20, spike: 10, bat: 14, ghost: 16, pit: 20, orb: 12, swoop: 14, geyser: 20, gem: 10, power: 14 };
const OBS_YOFF: Record<ObsType, number> = { zombie: 0, spike: 5, bat: -4, ghost: -3, pit: 0, orb: -5, swoop: -4, geyser: 0, gem: -4, power: -5 };
const ANIM_SPEED = 0.2;
const SWOOP_AT = 300;   // px ahead of the player where a swoop bat changes lane
const SWOOP_DUR = 0.3;
export const GEYSER_AT = 240; // px ahead of the player where a geyser erupts
const MAGNET_RANGE = 220;

export function makeObs(type: ObsType, lane: number, x: number): Obstacle {
  return {
    type, lane, x,
    y: LANE_Y[lane] + OBS_YOFF[type],
    w: OBS_W[type], h: OBS_H[type],
    active: true,
    frame: 0, frameTimer: 0,
    sineOffset: rand() * Math.PI * 2,
    passed: false, scored: false,
  };
}

const makeSwoop = (from: number, to: number, x: number): Obstacle => ({ ...makeObs('swoop', from, x), fromLane: from, toLane: to });
const makeGeyser = (low: number, x: number): Obstacle => ({ ...makeObs('geyser', low, x), lanes: [low, low + 1], erupted: false });
const makePower = (kind: PowerKind, lane: number, x: number): Obstacle => ({ ...makeObs('power', lane, x), kind });

export function updateObstacle(o: Obstacle, dt: number, spd: number) {
  o.x -= spd * dt;
  o.frameTimer += dt;
  if (o.frameTimer >= ANIM_SPEED) { o.frame = 1 - o.frame; o.frameTimer = 0; }
  const t = world.gameTime;
  const ahead = o.x - PLAYER_X;

  if (o.type === 'bat') o.y = LANE_Y[o.lane] - 4 + Math.sin(t * 3 + o.sineOffset) * 6;
  if (o.type === 'ghost') o.y = LANE_Y[o.lane] - 3 + Math.sin(t * 2 + o.sineOffset) * 8;
  const pulled = o.type === 'gem' && world.power?.kind === 'magnet' && ahead < MAGNET_RANGE && ahead > -20;
  if ((o.type === 'gem' && !pulled) || o.type === 'power') o.y = LANE_Y[o.lane] + OBS_YOFF[o.type] + Math.sin(t * 4 + o.sineOffset) * 2;
  if (o.type === 'swoop') {
    // Collides in the new lane from the moment it starts switching
    if (o.switchT === undefined && ahead < SWOOP_AT) { o.switchT = 0; o.lane = o.toLane!; audio.play('swoop'); }
    if (o.switchT !== undefined && o.switchT < 1) o.switchT = Math.min(1, o.switchT + dt / SWOOP_DUR);
    const k = o.switchT ?? 0, e = k * k * (3 - 2 * k);
    const fromY = LANE_Y[o.fromLane!] - 4, toY = LANE_Y[o.toLane!] - 4;
    o.y = fromY + (toY - fromY) * e + Math.sin(t * 5) * 2;
  }
  if (o.type === 'geyser' && !o.erupted && ahead < GEYSER_AT) { o.erupted = true; audio.play('geyser'); }

  // Magnet power pulls nearby gems toward the player
  if (pulled) {
    const p = world.player;
    o.x += (p.x - o.x) * Math.min(1, dt * 6);
    o.y += (p.y - o.y) * Math.min(1, dt * 6);
  }
  if (o.x < -60) o.active = false;
}

export function drawObstacle(o: Obstacle) {
  const cx = Math.floor(o.x + o.w / 2);
  const cy = Math.floor(o.y);
  switch (o.type) {
    case 'zombie': drawZombie(cx, cy, o.frame); break;
    case 'spike': drawSpike(cx, cy); break;
    case 'bat': drawBat(cx, cy, o.frame); break;
    case 'swoop': drawBat(cx, cy, o.frame, true); break;
    case 'ghost': drawGhost(cx, cy, o.frame); break;
    case 'pit': drawPit(o); break;
    case 'orb': drawOrb(cx, cy, Math.sin(world.gameTime * 4) * 0.5 + 0.5); break;
    case 'geyser': drawGeyser(cx, o.lanes![0], o.erupted!, world.gameTime); break;
    case 'gem': drawGem(cx, cy, world.gameTime + o.sineOffset); break;
    case 'power': drawPowerUp(cx, cy, o.kind!, world.gameTime); break;
  }
}

function drawPit(o: Obstacle) {
  const x = Math.floor(o.x), y = Math.floor(o.y);
  R.rect(x, y - 4, Math.floor(o.w), 24, '#111111');
  for (let i = 0; i < o.w; i += 6) R.rect(Math.floor(o.x + i), y + 16, 3, 4, '#ff4400');
}

// ===== SPAWNER =====
// Distance-based: a spawn fires each time worldX passes world.nextSpawnX, so
// the layout depends only on the seed and the distance run (not on frame
// timing, slow-mo or the player) — the daily challenge relies on this.
const at = PLAYER_X + SPAWN_AHEAD;

// beam patterns spawn a lane laser (hazards.ts) instead of obstacles.
// hard patterns are absent at level 0 and grow with the difficulty level.
interface Pattern { weight: number; simple?: boolean; beam?: boolean; hard?: boolean; fn: (x: number) => Obstacle[]; }

const BASE_PATTERNS: Pattern[] = [
  { weight: 3, simple: true, fn: x => [makeObs('zombie', 0, x)] },
  { weight: 2, simple: true, fn: x => [makeObs('zombie', 1, x)] },
  { weight: 2, simple: true, fn: x => [makeObs('bat', 2, x)] },
  { weight: 2, simple: true, fn: x => [makeObs('bat', 1, x)] },
  { weight: 2, simple: true, fn: x => [makeObs('spike', 0, x)] },
  { weight: 1, simple: true, fn: x => [makeObs('ghost', 2, x)] },
  { weight: 1, fn: x => [makeObs('pit', 0, x)] },
  { weight: 1, fn: x => [makeObs('zombie', 1, x), makeObs('bat', 2, x + 10)] },
  { weight: 1, fn: x => [makeObs('spike', 0, x), makeObs('ghost', 2, x)] },
  // Hard patterns (see weightOf): walls, stairs and zigzags that force quick
  // successive moves. Steps are STEP_S apart at the current speed, more than
  // the fairness window, so each step always leaves a lane free.
  { weight: 3, hard: true, fn: x => wall(randInt(3), x) },
  { weight: 2, hard: true, fn: x => { const [a, b, c] = shuffled(); return [lone(a, x), lone(b, x + step()), lone(c, x + 2 * step())]; } },
  { weight: 2, hard: true, fn: x => { const a = randInt(3), b = (a + 1 + randInt(2)) % 3; return [lone(a, x), lone(b, x + step()), lone(a, x + 2 * step())]; } },
  { weight: 2, hard: true, fn: x => { const g = randInt(3); return [...wall(g, x), ...wall((g + 1 + randInt(2)) % 3, x + 1.2 * step())]; } },
];

// Lane-appropriate single hazard: ground lane walkers/spikes, top lane fliers.
function lone(lane: number, x: number): Obstacle {
  const types: ObsType[][] = [['zombie', 'spike'], ['zombie', 'bat'], ['bat', 'ghost']];
  return makeObs(types[lane][randInt(2)], lane, x);
}
// Two hazards side by side, leaving only lane `gap` open.
const wall = (gap: number, x: number) => [0, 1, 2].filter(l => l !== gap).map(l => lone(l, x));
function shuffled(): number[] {
  const a = [0, 1, 2];
  for (let i = 2; i > 0; i--) { const j = randInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const STEP_S = 0.6;
const step = () => world.scrollSpeed * world.speedBoost * STEP_S;

// Swoop bats move to an adjacent lane.
const swoop = (weight = 3): Pattern => ({
  weight,
  fn: x => {
    const from = randInt(3);
    const to = from === 1 ? (rand() < 0.5 ? 0 : 2) : 1;
    return [makeSwoop(from, to, x)];
  },
});
const beam = (weight = 2): Pattern => ({ weight, beam: true, fn: () => [] });
const geyser = (weight = 3): Pattern => ({ weight, fn: x => [makeGeyser(randInt(2), x)] });

// Each biome adds its own mechanic on top of the classic hazards.
const BIOME_PATTERNS: Pattern[][] = [
  BASE_PATTERNS,                                         // city
  [...BASE_PATTERNS, swoop()],                           // forest: lane-switching bats
  [...BASE_PATTERNS, beam()],                            // sky: telegraphed beams
  [...BASE_PATTERNS, swoop(1)],                          // cave: darkness
  [...BASE_PATTERNS, geyser()],                          // volcano: two-lane geysers
  [...BASE_PATTERNS, swoop(1), beam(1), geyser(1)],      // desert: sandstorms + everything
];

// Gentle start: the first WARMUP_DIST px spawn single obstacles, further apart.
const WARMUP_DIST = 1200;
const WARMUP_EXTRA_INTERVAL = 0.9;
// Endless/daily difficulty: an exponential curve over distance that reaches
// its cap at RAMP_DIST px — slow at first, then steeper and steeper.
const RAMP_DIST = 18000;
const RAMP_K = 9000; // smaller = flatter start, sharper end
// Fairness: around any spawn, obstacles within this time window (reaction +
// longest jump) must leave at least one lane free.
const FAIR_WINDOW_S = 0.5;
const MIN_INTERVAL_S = 0.4;
const FAIR_RETRY_PX = 20;
const GEM_CHANCE = 0.3;
const POWER_CHANCE = 0.05;
const ORB_CHANCE = 0.15;

// Harder levels favour multi-obstacle patterns and biome mechanics (up to 3×).
function weightOf(p: Pattern): number {
  const level = difficultyLevel();
  if (p.hard) return p.weight * 3 * level;
  return p.simple ? p.weight * (1 - 0.6 * level) : p.weight * (1 + 2 * level);
}

function pick(pool: Pattern[]): Pattern {
  let r = rand() * pool.reduce((s, p) => s + weightOf(p), 0);
  for (const p of pool) { r -= weightOf(p); if (r <= 0) return p; }
  return pool[0];
}

// True if adding `candidate` would leave no free lane around any of its
// obstacles (patterns can span several x positions).
function blocksAllLanes(candidate: Obstacle[], x: number): boolean {
  const gap = world.scrollSpeed * world.speedBoost * FAIR_WINDOW_S + 40;
  const all = [...world.obstacles, ...candidate].filter(o => !isPickup(o));
  const centers = candidate.length ? candidate.map(c => c.x) : [x];
  return centers.some(cx => {
    const lanes = new Set<number>();
    for (const o of all) if (Math.abs(o.x - cx) < gap) for (const l of laneSet(o)) lanes.add(l);
    return lanes.size >= LANE_COUNT;
  });
}

// 0..1 difficulty level. Endless/daily: exponential in distance, capped.
// Stages: a gentle rise toward the goal on top of the stage's own settings.
// The cap keeps everything inside the fairness limits: top speed 2.3×, min
// interval 0.45 s (≥ reaction + longest jump), always a free lane.
export function difficultyLevel(): number {
  if (world.stage) return Math.min(1, world.score / world.stage.goalScore);
  return Math.min(1, (Math.exp(world.worldX / RAMP_K) - 1) / (Math.exp(RAMP_DIST / RAMP_K) - 1));
}
export const endlessRamp = difficultyLevel;

// Scroll speed before goal rush / slow-mo.
export function baseScrollSpeed(): number {
  const rules = RULES[world.difficulty];
  if (world.stage) return BASE_SPEED * rules.speed * world.stage.speed * (1 + 0.1 * difficultyLevel());
  return BASE_SPEED * rules.speed * (1 + 1.5 * difficultyLevel());
}

function spawnInterval(warm: number): number {
  const rules = RULES[world.difficulty];
  const level = difficultyLevel();
  const base = world.stage ? world.stage.interval * (1 - 0.2 * level) : 1.05 - 0.65 * level;
  return Math.max(MIN_INTERVAL_S, base * rules.interval) + warm * WARMUP_EXTRA_INTERVAL + rand() * 0.25 * (1 - 0.6 * level);
}

export function updateSpawner(biome: number) {
  while (world.worldX >= world.nextSpawnX) {
    const x = at - (world.worldX - world.nextSpawnX); // where it would have spawned exactly
    const warm = Math.max(0, 1 - world.worldX / WARMUP_DIST);
    world.nextSpawnX += spawnInterval(warm) * world.scrollSpeed * world.speedBoost;

    const simpleOnly = warm > 0 || world.stage?.simpleOnly;
    const pool = BIOME_PATTERNS[biome].filter(p => !simpleOnly || p.simple);
    let placed: Obstacle[] | null = null;
    for (let tries = 0; tries < 8 && !placed; tries++) {
      const p = pick(pool);
      if (p.beam) {
        const lane = randInt(3);
        if (beamAllowed(lane)) { spawnBeam(lane); placed = []; }
        continue;
      }
      const obs = p.fn(x);
      if (!blocksAllLanes(obs, x)) placed = obs;
    }
    if (!placed) { world.nextSpawnX = world.worldX + FAIR_RETRY_PX; continue; }
    world.obstacles.push(...placed);

    // Pickups ride along in a lane the pattern left free.
    const used = new Set(placed.flatMap(laneSet));
    const free = [0, 1, 2].filter(l => !used.has(l));
    const roll = rand(), lane = free.length ? free[randInt(free.length)] : randInt(3);
    if (roll < POWER_CHANCE && warm === 0) {
      const kinds: PowerKind[] = ['shield', 'magnet', 'slowmo'];
      world.obstacles.push(makePower(kinds[randInt(3)], lane, x + 50));
    } else if (roll < POWER_CHANCE + GEM_CHANCE) {
      for (let i = 0; i < 3; i++) world.obstacles.push(makeObs('gem', lane, x + 40 + i * 22));
    }
    // Health orbs depend on the player's HP, so they use Math.random and never
    // consume the seeded sequence (keeps daily layouts identical).
    if (world.player.hp < world.player.maxHp && Math.random() < ORB_CHANCE) {
      world.obstacles.push(makeObs('orb', Math.floor(Math.random() * 3), x + 70));
    }
  }
}

// Fresh runs start with a few easy obstacles already on the way, so the road
// isn't empty while the first spawns travel in from SPAWN_AHEAD.
export function seedOpening() {
  const simple = BASE_PATTERNS.filter(p => p.simple);
  for (const d of [520, 780, 1040]) world.obstacles.push(...pick(simple).fn(PLAYER_X + d));
}

// ===== GOAL =====
export interface Goal {
  x: number; y: number; w: number; h: number;
  active: boolean;
  flash: boolean;
  flashTimer: number;
  startDist: number; // distance to the player at spawn, for the progress bar
}

export function spawnGoal(travelS: number) {
  const dist = world.scrollSpeed * world.speedBoost * travelS;
  const x = CW + dist;
  world.goal = { x, y: LANE_Y[0], w: 20, h: 40, active: true, flash: false, flashTimer: 0, startDist: x - PLAYER_X };
  world.goalTimer = 0;
  world.goalCountdown = 0;
}

export function updateGoal(g: Goal, dt: number, spd: number) {
  g.x -= spd * dt;
  g.flashTimer += dt;
  if (g.flashTimer > 0.4) { g.flash = !g.flash; g.flashTimer = 0; }
}

export function drawGoal(g: Goal) {
  drawGoalFlag(Math.floor(g.x), Math.floor(g.y), g.flash);
}
