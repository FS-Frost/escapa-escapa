import { CW, LANE_Y, LANE_COUNT, GOAL_TRAVEL_TIME, PLAYER_X, SPAWN_AHEAD } from '../constants';
import { RULES } from './difficulty';
import { R } from '../gfx/renderer';
import { world } from './world';
import { drawZombie, drawSpike, drawBat, drawGhost, drawOrb, drawGoalFlag } from './sprites';

// ===== OBSTACLES =====
export type ObsType = 'zombie' | 'spike' | 'bat' | 'ghost' | 'pit' | 'orb';

export interface Obstacle {
  type: ObsType;
  lane: number;
  x: number; y: number; w: number; h: number;
  active: boolean;
  frame: number;
  frameTimer: number;
  sineOffset: number;
  passed: boolean;
  scored: boolean;
}

const OBS_W: Record<ObsType, number> = { zombie: 12, spike: 16, bat: 20, ghost: 16, pit: 36, orb: 12 };
const OBS_H: Record<ObsType, number> = { zombie: 20, spike: 10, bat: 14, ghost: 16, pit: 20, orb: 12 };
const OBS_YOFF: Record<ObsType, number> = { zombie: 0, spike: 5, bat: -4, ghost: -3, pit: 0, orb: -5 };
const ANIM_SPEED = 0.2;

export function makeObs(type: ObsType, lane: number, x: number): Obstacle {
  return {
    type, lane, x,
    y: LANE_Y[lane] + OBS_YOFF[type],
    w: OBS_W[type], h: OBS_H[type],
    active: true,
    frame: 0, frameTimer: 0,
    sineOffset: Math.random() * Math.PI * 2,
    passed: false, scored: false,
  };
}

export function updateObstacle(o: Obstacle, dt: number, spd: number) {
  o.x -= spd * dt;
  o.frameTimer += dt;
  if (o.frameTimer >= ANIM_SPEED) { o.frame = 1 - o.frame; o.frameTimer = 0; }
  const t = world.gameTime;
  if (o.type === 'bat') o.y = LANE_Y[o.lane] - 4 + Math.sin(t * 3 + o.sineOffset) * 6;
  if (o.type === 'ghost') o.y = LANE_Y[o.lane] - 3 + Math.sin(t * 2 + o.sineOffset) * 8;
  if (o.x < -60) o.active = false;
}

export function drawObstacle(o: Obstacle) {
  const cx = Math.floor(o.x + o.w / 2);
  const cy = Math.floor(o.y);
  switch (o.type) {
    case 'zombie': drawZombie(cx, cy, o.frame); break;
    case 'spike': drawSpike(cx, cy); break;
    case 'bat': drawBat(cx, cy, o.frame); break;
    case 'ghost': drawGhost(cx, cy, o.frame); break;
    case 'pit': drawPit(o); break;
    case 'orb': drawOrb(cx, cy, Math.sin(world.gameTime * 4) * 0.5 + 0.5); break;
  }
}

function drawPit(o: Obstacle) {
  const x = Math.floor(o.x), y = Math.floor(o.y);
  R.rect(x, y - 4, Math.floor(o.w), 24, '#111111');
  for (let i = 0; i < o.w; i += 6) R.rect(Math.floor(o.x + i), y + 16, 3, 4, '#ff4400');
}

// ===== SPAWNER =====
const MIN_INTERVAL = 1.2;
const at = PLAYER_X + SPAWN_AHEAD;

interface Pattern { weight: number; simple?: boolean; fn: (x: number) => Obstacle[]; }

const SPAWN_PATTERNS: Pattern[] = [
  { weight: 3, simple: true, fn: x => [makeObs('zombie', 0, x)] },
  { weight: 2, simple: true, fn: x => [makeObs('zombie', 1, x)] },
  { weight: 2, simple: true, fn: x => [makeObs('bat', 2, x)] },
  { weight: 2, simple: true, fn: x => [makeObs('bat', 1, x)] },
  { weight: 2, simple: true, fn: x => [makeObs('spike', 0, x)] },
  { weight: 1, simple: true, fn: x => [makeObs('ghost', 2, x)] },
  { weight: 1, fn: x => [makeObs('pit', 0, x)] },
  { weight: 1, fn: x => [makeObs('zombie', 1, x), makeObs('bat', 2, x + 10)] },
  { weight: 1, fn: x => [makeObs('spike', 0, x), makeObs('ghost', 2, x)] },
];

// Gentle start: the first WARMUP_S seconds spawn single obstacles, further apart.
const WARMUP_S = 20;
const WARMUP_EXTRA_INTERVAL = 0.9;
// Fairness: around any spawn, obstacles within this time window (reaction +
// longest jump) must leave at least one lane free.
const FAIR_WINDOW_S = 0.5;
const FAIR_RETRY_S = 0.15;

function pick(pool: Pattern[]): Pattern {
  let r = Math.random() * pool.reduce((s, p) => s + p.weight, 0);
  for (const p of pool) { r -= p.weight; if (r <= 0) return p; }
  return pool[0];
}

// True if adding `candidate` would leave no free lane near its x.
function blocksAllLanes(candidate: Obstacle[]): boolean {
  const gap = world.scrollSpeed * world.speedBoost * FAIR_WINDOW_S + 40;
  const lanes = new Set<number>();
  for (const o of [...world.obstacles, ...candidate]) {
    if (o.type !== 'orb' && Math.abs(o.x - at) < gap) lanes.add(o.lane);
  }
  return lanes.size >= LANE_COUNT;
}

export function updateSpawner(dt: number) {
  world.spawnTimer -= dt;
  if (world.spawnTimer > 0) return;
  const rules = RULES[world.opts.difficulty];
  const warmup = Math.max(0, 1 - world.gameTime / WARMUP_S);
  const interval = Math.max(0.45, MIN_INTERVAL - world.score * 0.005) * rules.interval + warmup * WARMUP_EXTRA_INTERVAL;
  world.spawnTimer = interval + Math.random() * 0.3;

  // Occasionally spawn a health orb instead when HP < maxHp
  if (world.player.hp < world.player.maxHp && Math.random() < 0.15) {
    world.obstacles.push(makeObs('orb', Math.floor(Math.random() * 3), at));
    return;
  }
  const pool = warmup > 0 ? SPAWN_PATTERNS.filter(p => p.simple) : SPAWN_PATTERNS;
  for (let tries = 0; tries < 8; tries++) {
    const obs = pick(pool).fn(at);
    if (!blocksAllLanes(obs)) { world.obstacles.push(...obs); return; }
  }
  world.spawnTimer = FAIR_RETRY_S; // nothing fair fits right now; try again shortly
}

// Fresh runs start with a few easy obstacles already on the way, so the road
// isn't empty while the first spawns travel in from SPAWN_AHEAD.
export function seedOpening() {
  const simple = SPAWN_PATTERNS.filter(p => p.simple);
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

export function spawnGoal() {
  const dist = world.scrollSpeed * world.speedBoost * GOAL_TRAVEL_TIME;
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
