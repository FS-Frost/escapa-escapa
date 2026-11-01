import { CW, CH, LANE_Y, LANE_COUNT, PLAYER_X, RADAR_H } from '../constants';
import { R } from '../gfx/renderer';
import { world } from './world';
import { laneSet, isPickup } from './obstacles';

// Biome hazards that aren't regular obstacles:
//  - beams (sky): a lane charges for BEAM_CHARGE s (blinking warning), then a
//    laser sweeps the whole lane for BEAM_FIRE s.
//  - sandstorm (desert): periodic by distance; sand covers the road ahead and
//    only the radar shows what's coming.
//  - darkness (cave): drawn by R.darkness() around the player.

export const BEAM_CHARGE = 1.2;
export const BEAM_FIRE = 0.45;

export function spawnBeam(lane: number) {
  world.beams.push({ lane, t: 0, hit: false, done: false });
}

// A beam must not, together with what reaches the player when it fires,
// leave no lane free; only one beam per lane at a time.
export function beamAllowed(lane: number): boolean {
  if (world.beams.some(b => !b.done && b.lane === lane)) return false;
  const spd = world.scrollSpeed * world.speedBoost;
  const lanes = new Set<number>([lane]);
  for (const b of world.beams) if (!b.done) lanes.add(b.lane);
  for (const o of world.obstacles) {
    if (isPickup(o)) continue;
    const xAtFire = o.x - spd * BEAM_CHARGE;
    if (xAtFire > PLAYER_X - 40 && xAtFire < PLAYER_X + 80) for (const l of laneSet(o)) lanes.add(l);
  }
  return lanes.size < LANE_COUNT;
}

export const beamFiring = (b: { t: number }) => b.t >= BEAM_CHARGE && b.t < BEAM_CHARGE + BEAM_FIRE;

// Returns beams that just finished (to score them if dodged).
export function updateBeams(dt: number): { lane: number; hit: boolean }[] {
  const finished: { lane: number; hit: boolean }[] = [];
  for (const b of world.beams) {
    b.t += dt;
    if (!b.done && b.t >= BEAM_CHARGE + BEAM_FIRE) { b.done = true; finished.push(b); }
  }
  world.beams = world.beams.filter(b => !b.done);
  return finished;
}

export function drawBeams() {
  const t = world.gameTime;
  for (const b of world.beams) {
    const y = LANE_Y[b.lane];
    if (b.t < BEAM_CHARGE) {
      // Charging: blinking dashed line that speeds up, warning sign at the edge
      const k = b.t / BEAM_CHARGE;
      const on = Math.floor(b.t * (6 + k * 14)) % 2 === 0;
      if (on) for (let x = 0; x < CW; x += 10) R.rect(x, y - 1, 6, 2, '#7df9ff', 0.35 + 0.5 * k);
      R.text('!', CW - 24, y - 4, '#ff4466', { scale: 2, align: 'center', baseline: 'middle' });
    } else {
      // Firing: thick laser with a white core
      const f = 1 - (b.t - BEAM_CHARGE) / BEAM_FIRE;
      R.rect(0, y - 8, CW, 16, '#7df9ff', 0.35 * f + 0.2);
      R.rect(0, y - 3, CW, 6, '#ffffff', 0.6 * f + 0.3);
      for (let x = (t * 600) % 24; x < CW; x += 24) R.rect(x, y - 6, 3, 12, '#ffffff', 0.5 * f);
    }
  }
}

// ===== SANDSTORM =====
const STORM_CYCLE = 2600; // px
const STORM_START = 1300, STORM_END = 2300, STORM_RAMP = 200;

// 0..1 storm intensity at the current distance (before biome weighting).
export function stormPhase(worldX: number): number {
  const p = worldX % STORM_CYCLE;
  if (p < STORM_START || p > STORM_END) return 0;
  return Math.min(1, (p - STORM_START) / STORM_RAMP, (STORM_END - p) / STORM_RAMP);
}

// Sand fills the road from just ahead of the player to the right edge.
export function drawStorm(level: number) {
  if (level <= 0) return;
  const x0 = PLAYER_X + 50;
  R.gradientH(x0, RADAR_H, CW - x0, CH - RADAR_H, [[0, 'rgba(201,149,90,0)'], [0.35, 'rgba(201,149,90,0.85)'], [1, 'rgba(180,120,70,0.97)']], level);
  const t = world.gameTime;
  for (let i = 0; i < 60; i++) {
    const y = RADAR_H + ((i * 37) % (CH - RADAR_H));
    const x = CW - ((t * (420 + (i % 5) * 60) + i * 97) % (CW + 40));
    if (x > x0 - 30) R.rect(x, y, 10 + (i % 3) * 6, 1, '#f5deb3', 0.6 * level);
  }
}
