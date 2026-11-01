import { CW, CH, RADAR_H, LANE_Y } from '../constants';
import { R } from '../gfx/renderer';
import { rgba } from '../gfx/color';
import { world } from './world';
import { storage } from '../storage';

export const BIOMES = [
  { scoreStart: 0, name: 'city' },
  { scoreStart: 34, name: 'forest' },
  { scoreStart: 67, name: 'sky' },
] as const;
type BiomeName = typeof BIOMES[number]['name'];

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

const DRAW: Record<BiomeName, (off: number) => void> = { city: drawCity, forest: drawForest, sky: drawSky };

function drawBiome(index: number, alpha: number) {
  R.save();
  R.alpha *= alpha;
  DRAW[BIOMES[Math.min(index, BIOMES.length - 1)].name](world.worldX);
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

// Music theme for the biome being shown (or faded into); names match MusicSection.
export function biomeTheme(): BiomeName {
  const i = world.biomeTransition?.to ?? world.currentBiome;
  return BIOMES[Math.min(i, BIOMES.length - 1)].name;
}

export function updateBiomes(dt: number) {
  const newBiome = BIOMES.reduce((cur, b, i) => world.score >= b.scoreStart ? i : cur, 0);
  if (newBiome !== world.currentBiome && !world.biomeTransition) {
    world.biomeTransition = { from: world.currentBiome, to: newBiome, t: 0, dur: 3.0 };
    storage.unlockTrack(BIOMES[newBiome].name); // jukebox: reaching a biome unlocks its theme
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
