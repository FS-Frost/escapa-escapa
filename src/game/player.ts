import { LANE_Y, LANE_COUNT, LANE_GAP, LANE_ANIM_DUR, LANE_ARC } from '../constants';
import { audio } from '../audio';
import { world, STATE } from './world';
import { spawnLaneTrailArc } from './particles';

export type Expression = 'normal' | 'hurt' | 'scared' | 'rush' | 'happy';

export interface Player {
  lane: number;        // lags behind targetLane until the jump lands
  targetLane: number;  // lane being moved to; collisions use this one
  laneT: number;       // jump progress 0..1
  fromY: number;       // Y where the current jump started (may be mid-air)
  jumpDur: number;
  jumpArc: number;
  x: number; y: number; w: number; h: number;
  hp: number; maxHp: number;
  hitFlash: number;
  invincible: number;
  expression: Expression;
  comboStreak: number;
  comboMultiplier: number;
  nearMissTimer: number;
  trailTimer: number;
  speedDemonTimer: number;
}

export function createPlayer(): Player {
  return {
    lane: 0, targetLane: 0, laneT: 1,
    fromY: LANE_Y[0], jumpDur: LANE_ANIM_DUR, jumpArc: LANE_ARC,
    x: 80, y: LANE_Y[0], w: 16, h: 16,
    hp: 1, maxHp: 1,
    hitFlash: 0, invincible: 0,
    expression: 'normal',
    comboStreak: 0, comboMultiplier: 1,
    nearMissTimer: 0, trailTimer: 0, speedDemonTimer: 0,
  };
}

const clampLane = (l: number) => Math.max(0, Math.min(LANE_COUNT - 1, l));
export const getLaneY = (lane: number) => LANE_Y[clampLane(lane)];

export function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

// Lane nearest to a logical Y coordinate (tap-to-lane).
export function laneAtY(y: number): number {
  let best = 0;
  for (let l = 1; l < LANE_COUNT; l++) {
    if (Math.abs(LANE_Y[l] - y) < Math.abs(LANE_Y[best] - y)) best = l;
  }
  return best;
}

// Jump straight to any lane. Allowed mid-jump: the new arc starts from the
// current Y. Duration and arc height grow with sqrt(distance in lanes).
export function moveToLane(lane: number) {
  const p = world.player;
  if (world.state !== STATE.PLAYING) return;
  const next = clampLane(lane);
  if (next === p.targetLane) return;
  const toY = getLaneY(next);
  const span = Math.max(0.25, Math.abs(toY - p.y) / LANE_GAP);
  spawnLaneTrailArc(p.y, toY, p.x);
  p.fromY = p.y;
  p.targetLane = next;
  p.laneT = 0;
  p.jumpDur = LANE_ANIM_DUR * Math.sqrt(span);
  p.jumpArc = LANE_ARC * Math.sqrt(span);
  audio.play('jump');
}

export function updatePlayerMotion(dt: number) {
  const p = world.player;
  if (p.laneT < 1) {
    p.laneT = Math.min(1, p.laneT + dt / p.jumpDur);
    if (p.laneT >= 1) p.lane = p.targetLane;
  }
  const toY = getLaneY(p.targetLane);
  const arc = -p.jumpArc * Math.sin(p.laneT * Math.PI);
  p.y = p.fromY + (toY - p.fromY) * easeInOut(p.laneT) + arc;
}
