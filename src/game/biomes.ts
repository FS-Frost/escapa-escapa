import { CW, CH, RADAR_H, LANE_Y } from '../constants';
import { R } from '../gfx/renderer';
import { rgba } from '../gfx/color';
import { world } from './world';
import { storage } from '../storage';
import { t } from '../i18n';

export const BIOMES = [
  { name: 'city' }, { name: 'forest' }, { name: 'sky' },
  { name: 'cave' }, { name: 'volcano' }, { name: 'desert' },
] as const;
export type BiomeName = typeof BIOMES[number]['name'];
// Endless/daily: distance (px) spent in each biome before moving to the next.
export const BIOME_LEN = 4500;

const GROUND = CH - 28;

// Wrap a scrolling x into [-span, CW + span - span) like the original parallax.
const wrap = (x: number, span: number) => ((x % (CW + span)) + CW + span) % (CW + span) - span;
// How many repeating elements spaced `spacing` apart cover the wrap period (CW varies).
const fill = (spacing: number) => Math.ceil((CW + spacing) / spacing);

// Deterministic 0..1 hash so window lights don't flicker frame to frame.
function hash(n: number) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function drawCity(off: number) {
  R.gradientV(0, RADAR_H, CW, CH - RADAR_H, [[0, '#1a1a2e'], [1, '#16213e']]);

  // Far buildings with lit/unlit windows
  for (let i = 0; i < fill(50); i++) {
    const bx = Math.floor(wrap(i * 50 - off * 0.12, 50));
    const bh = 30 + (i % 4) * 18;
    R.rect(bx, GROUND - bh, 28, bh, '#0f3460');
    let row = 0;
    for (let wy = CH - bh - 24; wy < CH - 32; wy += 10, row++) {
      let col = 0;
      for (let wx = bx + 4; wx < bx + 24; wx += 8, col++) {
        R.rect(wx, wy, 4, 4, hash(i * 97 + row * 13 + col) > 0.7 ? '#ffd700' : '#1a3a5e');
      }
    }
  }

  // Mid buildings
  for (let i = 0; i < fill(70); i++) {
    const bx = Math.floor(wrap(i * 70 + 20 - off * 0.3, 70));
    const bh = 20 + (i % 3) * 12;
    R.rect(bx, GROUND - bh, 35, bh, '#e94560');
    R.rect(bx, GROUND - bh, 35, 4, '#c0392b');
  }

  // Road
  R.rect(0, GROUND, CW, 28, '#1a1a1a');
  R.rect(0, GROUND, CW, 3, '#333333');
  const markOff = Math.floor(off * 0.7) % 50;
  for (let i = -1; i < CW / 50 + 1; i++) R.rect(i * 50 - markOff, CH - 15, 20, 3, '#ffff00');

  // Streetlights
  for (let i = 0; i < fill(80); i++) {
    const lx = Math.floor(wrap(i * 80 - off * 0.6, 80));
    R.rect(lx, CH - 55, 3, 27, '#888888');
    R.rect(lx - 5, CH - 55, 13, 3, '#888888');
    R.rect(lx - 5, CH - 52, 13, 4, '#fffaaa');
  }
}

function drawForest(off: number) {
  R.gradientV(0, RADAR_H, CW, CH - RADAR_H, [[0, '#0d2b1a'], [1, '#1a4a2e']]);

  // Far trees
  for (let i = 0; i < fill(60); i++) {
    const tx = Math.floor(wrap(i * 60 - off * 0.1, 60));
    R.rect(tx + 10, CH - 85, 8, 57, '#1a4a2e');
    R.tri(tx + 14, CH - 110, tx + 2, CH - 72, tx + 26, CH - 72, '#1a4a2e');
  }

  // Mushrooms
  for (let i = 0; i < fill(40); i++) {
    const mx = Math.floor(wrap(i * 40 + 10 - off * 0.35, 40));
    const mh = 8 + (i % 3) * 6;
    R.rect(mx, GROUND - mh, 10, mh, '#2d6e3a');
    R.circle(mx + 5, GROUND - mh, 8, i % 2 === 0 ? '#e53e3e' : '#ff69b4', Math.PI, Math.PI * 2);
  }

  // Ground + grass tufts
  R.rect(0, GROUND, CW, 28, '#2d5a27');
  R.rect(0, GROUND, CW, 4, '#3d7a37');
  for (let i = 0; i < CW; i += 12) {
    const gx = Math.floor((i - Math.floor(off * 0.65) % 12 + 12) % (CW + 12) - 12);
    R.rect(gx, CH - 32, 3, 4, '#4caf50');
    R.rect(gx + 5, CH - 31, 3, 3, '#4caf50');
  }

  // Fireflies
  const t = world.gameTime;
  for (let i = 0; i < 12; i++) {
    const ft = (t * 0.8 + i * 1.1) % (Math.PI * 2);
    const fx = ((i * 43 - off * 0.2) % CW + CW) % CW;
    const fy = CH - 60 - (i % 4) * 20 + Math.sin(ft * 2 + i) * 8;
    R.rect(Math.floor(fx), Math.floor(fy), 2, 2, '#aaff44', 0.5 + 0.5 * Math.sin(ft * 3 + i));
  }
}

const AURORA = [[0, 200, 150], [100, 0, 200], [0, 100, 255]] as const;

function drawSky(off: number) {
  R.gradientV(0, RADAR_H, CW, CH - RADAR_H, [[0, '#050520'], [0.5, '#0a0a3a'], [1, '#1a0a3a']]);
  const t = world.gameTime;

  // Stars
  for (let i = 0; i < 40; i++) {
    const sx = wrap(i * 37 + 5 - off * 0.05, 4);
    const sy = RADAR_H + 5 + (i * 17) % (CH - RADAR_H - 60);
    const blink = Math.sin(t * 1.5 + i * 0.7);
    const s = i % 4 === 0 ? 2 : 1;
    R.rect(Math.floor(sx), Math.floor(sy), s, s, '#ffffff', 0.4 + 0.4 * (blink * 0.5 + 0.5));
  }

  // Aurora bands
  for (let band = 0; band < 3; band++) {
    const [r, g, b] = AURORA[band];
    const gy = RADAR_H + 30 + band * 25 + Math.sin(t * 0.3 + band) * 20;
    R.rect(0, Math.floor(gy), CW, 15, rgba(r, g, b, 0.15 + 0.1 * Math.sin(t * 0.5 + band * 1.2)));
  }

  // Mid clouds
  R.save();
  R.alpha *= 0.7;
  for (let i = 0; i < fill(90); i++) {
    const cx = Math.floor(wrap(i * 90 + 15 - off * 0.25, 90));
    const cy = RADAR_H + 40 + (i % 3) * 25;
    R.circle(cx + 20, cy, 18, '#1a2060');
    R.circle(cx + 38, cy - 8, 12, '#1a2060');
    R.circle(cx + 50, cy, 14, '#1a2060');
  }
  R.restore();

  // Cloud floor
  R.rect(0, GROUND, CW, 28, '#2a1a4a');
  R.rect(0, GROUND, CW, 4, '#3a2a6a');
  R.save();
  R.alpha *= 0.6;
  for (let i = 0; i < fill(55); i++) {
    const x = Math.floor(wrap(i * 55 - off * 0.55, 55));
    R.circle(x + 12, CH - 30, 12, '#3a2a6a', Math.PI, Math.PI * 2);
  }
  R.restore();
}

// ===== CAVE: stalactites, glowing crystals (darkness is drawn over it) =====
function drawCave(off: number) {
  R.gradientV(0, RADAR_H, CW, CH - RADAR_H, [[0, '#07060d'], [1, '#1a1226']]);
  const t = world.gameTime;
  for (let i = 0; i < fill(46); i++) {
    const x = Math.floor(wrap(i * 46 - off * 0.15, 46));
    const len = 18 + Math.floor(hash(i * 7) * 40);
    R.tri(x, RADAR_H, x + 18, RADAR_H, x + 9, RADAR_H + len, '#14101f');
  }
  for (let i = 0; i < fill(70); i++) {
    const x = Math.floor(wrap(i * 70 + 20 - off * 0.35, 70));
    const h = 20 + Math.floor(hash(i * 3 + 1) * 30);
    R.tri(x, GROUND, x + 22, GROUND, x + 11, GROUND - h, '#1e1730');
    const c = i % 2 ? '#22d3ee' : '#c084fc';
    const glow = 0.5 + 0.5 * Math.sin(t * 2 + i);
    R.rect(x + 28, GROUND - 10, 4, 10, c, 0.5 + 0.5 * glow);
    R.rect(x + 34, GROUND - 6, 3, 6, c, 0.4 + 0.4 * glow);
  }
  R.rect(0, GROUND, CW, 28, '#231b2e');
  R.rect(0, GROUND, CW, 3, '#3a2d4a');
  for (let i = 0; i < fill(30); i++) {
    const x = Math.floor(wrap(i * 30 - off * 0.7, 30));
    R.rect(x, GROUND + 8 + (i % 3) * 5, 6, 3, '#2f2540');
  }
}

// ===== VOLCANO: red sky, distant volcanoes, falling ash, glowing cracks =====
function drawVolcano(off: number) {
  R.gradientV(0, RADAR_H, CW, CH - RADAR_H, [[0, '#1a0505'], [0.6, '#4a1206'], [1, '#7a2a0a']]);
  const t = world.gameTime;
  for (let i = 0; i < fill(220); i++) {
    const x = Math.floor(wrap(i * 220 - off * 0.08, 220));
    const peak = GROUND - 110 - Math.floor(hash(i * 11) * 30);
    R.tri(x, GROUND, x + 110, peak, x + 220, GROUND, '#2a0c08');
    R.rect(x + 100, peak, 20, 4, '#ff5a1f', 0.6 + 0.4 * Math.sin(t * 3 + i));
    R.rect(x + 106, peak + 4, 4, 30, '#ff5a1f', 0.35);
  }
  for (let i = 0; i < fill(90); i++) {
    const x = Math.floor(wrap(i * 90 + 40 - off * 0.3, 90));
    R.tri(x, GROUND, x + 30, GROUND - 26, x + 60, GROUND, '#1c0907');
  }
  for (let i = 0; i < 30; i++) {
    const x = ((i * 53 - off * 0.25) % CW + CW) % CW;
    const y = RADAR_H + ((t * (14 + (i % 4) * 4) + i * 37) % (GROUND - RADAR_H));
    R.rect(Math.floor(x), Math.floor(y), 2, 2, '#8a6a64', 0.6);
  }
  R.rect(0, GROUND, CW, 28, '#1c1412');
  R.rect(0, GROUND, CW, 3, '#2e1f1b');
  for (let i = 0; i < fill(64); i++) {
    const x = Math.floor(wrap(i * 64 - off * 0.7, 64));
    R.rect(x, GROUND + 10, 18, 2, '#ff5a1f', 0.45 + 0.35 * Math.sin(t * 4 + i));
    R.rect(x + 14, GROUND + 12, 2, 6, '#ff5a1f', 0.4);
  }
}

// ===== DESERT: dusk sky, low sun, dunes, cacti =====
function drawDesert(off: number) {
  R.gradientV(0, RADAR_H, CW, CH - RADAR_H, [[0, '#2d1b4e'], [0.55, '#b5523b'], [1, '#e8a35a']]);
  R.circle(Math.floor(CW * 0.72 - (off * 0.02) % 40), GROUND - 70, 26, '#ffcf70');
  for (let i = 0; i < fill(180); i++) {
    const x = Math.floor(wrap(i * 180 - off * 0.1, 180));
    R.circle(x + 90, GROUND + 30, 110, '#a8553a', Math.PI, Math.PI * 2);
  }
  for (let i = 0; i < fill(120); i++) {
    const x = Math.floor(wrap(i * 120 + 50 - off * 0.3, 120));
    R.circle(x + 60, GROUND + 20, 70, '#c46b3f', Math.PI, Math.PI * 2);
  }
  for (let i = 0; i < fill(150); i++) {
    const x = Math.floor(wrap(i * 150 + 30 - off * 0.45, 150));
    const h = 24 + (i % 3) * 8;
    R.rect(x, GROUND - h, 6, h, '#3d5a2a');
    R.rect(x - 6, GROUND - h + 8, 6, 3, '#3d5a2a'); R.rect(x - 6, GROUND - h + 2, 3, 8, '#3d5a2a');
    R.rect(x + 6, GROUND - h + 12, 6, 3, '#3d5a2a'); R.rect(x + 9, GROUND - h + 5, 3, 9, '#3d5a2a');
  }
  R.rect(0, GROUND, CW, 28, '#d99a5b');
  R.rect(0, GROUND, CW, 3, '#e9b77a');
  for (let i = 0; i < fill(40); i++) {
    const x = Math.floor(wrap(i * 40 - off * 0.7, 40));
    R.rect(x, GROUND + 9 + (i % 2) * 7, 16, 1, '#c4864a');
  }
}

const DRAW: Record<BiomeName, (off: number) => void> = {
  city: drawCity, forest: drawForest, sky: drawSky, cave: drawCave, volcano: drawVolcano, desert: drawDesert,
};

function drawBiome(index: number, alpha: number) {
  R.save();
  R.alpha *= alpha;
  DRAW[BIOMES[index].name](world.worldX);
  R.restore();
}

export function drawBackground() {
  const bt = world.biomeTransition;
  if (bt) {
    drawBiome(bt.from, 1);
    drawBiome(bt.to, bt.t);
  } else {
    drawBiome(world.currentBiome, 1);
  }

  // Dashed lane guides
  for (const y of LANE_Y) {
    for (let x = 0; x < CW; x += 12) R.rect(x, y + 10, 4, 1, '#ffffff', 0.08);
  }
}

// How much of biome `name` is on screen (crossfades count partially).
export function biomeWeight(name: BiomeName): number {
  const bt = world.biomeTransition;
  if (!bt) return BIOMES[world.currentBiome].name === name ? 1 : 0;
  return (BIOMES[bt.from].name === name ? 1 - bt.t : 0) + (BIOMES[bt.to].name === name ? bt.t : 0);
}

// Music theme for the biome being shown (or faded into); names match MusicSection.
export function biomeTheme(): BiomeName {
  return BIOMES[world.biomeTransition?.to ?? world.currentBiome].name;
}

// Biome the run should be in: stages have one; endless/daily cycle by distance.
export function targetBiome(): number {
  if (world.tutorial) return 0;
  if (world.stage) return world.stage.biome;
  return Math.floor(world.worldX / BIOME_LEN) % BIOMES.length;
}

// First time a biome shows up in a run: unlock its track and announce it
// (name + what its mechanic is) so new hazards never come unexplained.
export function enterBiome(index: number) {
  const name = BIOMES[index].name;
  storage.unlockTrack(name);
  if (world.tutorial || world.seenBiomes.has(index)) return;
  world.seenBiomes.add(index);
  world.caption = { title: t(`biome.${name}`), sub: t(`mech.${name}`), life: 3.2, maxLife: 3.2, color: '#ffd166' };
}

export function updateBiomes(dt: number) {
  const target = targetBiome();
  if (target !== world.currentBiome && !world.biomeTransition) {
    world.biomeTransition = { from: world.currentBiome, to: target, t: 0, dur: 3.0 };
    enterBiome(target);
  }
  const bt = world.biomeTransition;
  if (bt) {
    bt.t += dt / bt.dur;
    if (bt.t >= 1) {
      world.currentBiome = bt.to;
      world.biomeTransition = null;
    }
  }
}
