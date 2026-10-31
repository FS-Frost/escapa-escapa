import { CW, LANE_Y, GOAL_TRAVEL_TIME } from '../constants';
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
const at = CW + 10;

const SPAWN_PATTERNS: { weight: number; fn: () => Obstacle[] }[] = [
  { weight: 3, fn: () => [makeObs('zombie', 0, at)] },
  { weight: 2, fn: () => [makeObs('zombie', 1, at)] },
  { weight: 2, fn: () => [makeObs('bat', 2, at)] },
  { weight: 2, fn: () => [makeObs('bat', 1, at)] },
  { weight: 2, fn: () => [makeObs('spike', 0, at)] },
  { weight: 1, fn: () => [makeObs('ghost', 2, at)] },
  { weight: 1, fn: () => [makeObs('pit', 0, at)] },
  { weight: 1, fn: () => [makeObs('zombie', 1, at), makeObs('bat', 2, at + 10)] },
  { weight: 1, fn: () => [makeObs('spike', 0, at), makeObs('ghost', 2, at)] },
];
const TOTAL_WEIGHT = SPAWN_PATTERNS.reduce((s, p) => s + p.weight, 0);

function pickPattern(): Obstacle[] {
  let r = Math.random() * TOTAL_WEIGHT;
  for (const p of SPAWN_PATTERNS) { r -= p.weight; if (r <= 0) return p.fn(); }
  return SPAWN_PATTERNS[0].fn();
}

export function updateSpawner(dt: number) {
  world.spawnTimer -= dt;
  if (world.spawnTimer > 0) return;
  const interval = Math.max(0.45, MIN_INTERVAL - world.score * 0.005);
  world.spawnTimer = interval + Math.random() * 0.3;
  // Occasionally spawn a health orb instead when HP < maxHp
  if (world.player.hp < world.player.maxHp && Math.random() < 0.15) {
    world.obstacles.push(makeObs('orb', Math.floor(Math.random() * 3), at));
  } else {
    world.obstacles.push(...pickPattern());
  }
}

// ===== GOAL =====
export interface Goal {
  x: number; y: number; w: number; h: number;
  active: boolean;
  flash: boolean;
  flashTimer: number;
}

export function spawnGoal() {
  const dist = world.scrollSpeed * world.speedBoost * GOAL_TRAVEL_TIME;
  world.goal = { x: CW + dist, y: LANE_Y[0], w: 20, h: 40, active: true, flash: false, flashTimer: 0 };
  world.goalAlarmTimer = 0;
}

export function updateGoal(g: Goal, dt: number, spd: number) {
  g.x -= spd * dt;
  g.flashTimer += dt;
  if (g.flashTimer > 0.4) { g.flash = !g.flash; g.flashTimer = 0; }
}

export function drawGoal(g: Goal) {
  drawGoalFlag(Math.floor(g.x), Math.floor(g.y), g.flash);
}
