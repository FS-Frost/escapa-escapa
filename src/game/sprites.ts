import { P, LANE_Y } from '../constants';
import { R } from '../gfx/renderer';
import type { Color } from '../gfx/color';
import type { Expression } from './player';

// All sprites are code: rects on a 2×2 "art pixel" grid, origin at top-left
// of the sprite after R.translate().

function px(col: number, row: number, w: number, h: number, c: Color) {
  R.rect(col * P, row * P, w * P, h * P, c);
}

export interface CubeColors { body: string; shine: string; shadow: string; face: string; }

// Player: 9×9 art pixels centered on (cx, cy). `colors` comes from the skin;
// `invuln` adds the gold border of the post-hit grace period.
export function drawPlayer(cx: number, cy: number, expr: Expression, flash: boolean, invuln: boolean, colors: CubeColors) {
  R.save();
  R.translate(Math.floor(cx - 9 * P / 2), Math.floor(cy - 9 * P / 2));

  const body = flash ? '#ffffff' : colors.body;
  const shadow = flash ? '#dddddd' : colors.shadow;
  const shine = flash ? '#ffffff' : colors.shine;
  const face = colors.face;
  for (let row = 1; row <= 7; row++) {
    for (let col = 1; col <= 7; col++) {
      let c = body;
      if (row === 1 || col === 1) c = shine;
      if (row === 7 || col === 7) c = shadow;
      px(col, row, 1, 1, c);
    }
  }

  if (invuln && !flash) R.strokeRect(0, 0, 9 * P, 9 * P, '#ffd700');

  switch (expr) {
    case 'normal':
      px(2, 3, 1, 1, face); px(5, 3, 1, 1, face);
      px(2, 6, 1, 1, face); px(3, 7, 3, 1, face); px(6, 6, 1, 1, face);
      break;
    case 'hurt':
      px(2, 3, 1, 1, face); px(4, 3, 1, 1, face);
      px(3, 4, 1, 1, face); px(5, 4, 1, 1, face);
      px(2, 5, 1, 1, face); px(4, 5, 1, 1, face);
      px(2, 7, 1, 1, face); px(3, 6, 3, 1, face); px(6, 7, 1, 1, face);
      break;
    case 'scared':
      px(2, 3, 1, 2, face); px(5, 3, 1, 2, face);
      px(3, 6, 1, 1, face); px(4, 6, 1, 2, face); px(5, 6, 1, 1, face);
      px(7, 2, 1, 2, '#88ddff');
      break;
    case 'rush':
      px(2, 4, 2, 1, face); px(5, 4, 2, 1, face);
      px(3, 6, 4, 1, face);
      break;
    case 'happy':
      px(2, 3, 2, 2, face); px(5, 3, 2, 2, face);
      px(2, 3, 1, 1, '#ffffff'); px(5, 3, 1, 1, '#ffffff');
      px(2, 6, 1, 1, face); px(3, 7, 3, 1, face); px(6, 6, 1, 1, face);
      break;
  }
  R.restore();
}

// 6×10
export function drawZombie(cx: number, cy: number, frame: number) {
  R.save();
  R.translate(Math.floor(cx - 3 * P), Math.floor(cy - 5 * P));
  px(1, 3, 4, 5, '#4ade80');
  px(1, 0, 4, 3, '#86efac');
  px(2, 1, 1, 1, '#ff2222'); px(4, 1, 1, 1, '#ff2222');
  if (frame === 0) { px(0, 3, 1, 3, '#4ade80'); px(5, 4, 1, 3, '#4ade80'); }
  else { px(0, 4, 1, 3, '#4ade80'); px(5, 3, 1, 3, '#4ade80'); }
  if (frame === 0) { px(1, 8, 1, 2, '#166534'); px(3, 8, 1, 2, '#166534'); }
  else { px(2, 8, 1, 2, '#166534'); px(4, 8, 1, 2, '#166534'); }
  R.restore();
}

// Two spikes, 8×8
export function drawSpike(cx: number, cy: number) {
  R.save();
  R.translate(Math.floor(cx - 6 * P), Math.floor(cy - 4 * P));
  const c1 = '#ff4444', c2 = '#ff8888';
  px(0, 6, 4, 2, c1); px(1, 4, 2, 2, c1); px(2, 2, 1, 2, c1);
  px(4, 6, 4, 2, c1); px(5, 4, 2, 2, c1); px(6, 2, 1, 2, c1);
  px(2, 3, 1, 1, c2); px(6, 3, 1, 1, c2);
  R.restore();
}

// 10×7
// `swoop` = the forest bat that changes lane: red-orange palette.
export function drawBat(cx: number, cy: number, frame: number, swoop = false) {
  const [body, wing, membrane] = swoop ? ['#b91c1c', '#f97316', '#7f1d1d'] : ['#7c3aed', '#a855f7', '#6d28d9'];
  R.save();
  R.translate(Math.floor(cx - 5 * P), Math.floor(cy - 3 * P));
  px(4, 2, 2, 3, body);
  px(4, 2, 1, 1, (swoop ? '#ffff66' : '#ff4444')); px(5, 2, 1, 1, (swoop ? '#ffff66' : '#ff4444'));
  const wy = frame === 0 ? 1 : 3;
  px(0, wy, 4, 3, wing); px(6, wy, 4, 3, wing);
  const my = frame === 0 ? 0 : 5;
  px(1, my, 2, 1, membrane); px(7, my, 2, 1, membrane);
  R.restore();
}

// 8×9, translucent
export function drawGhost(cx: number, cy: number, frame: number) {
  R.save();
  R.alpha *= 0.75;
  R.translate(Math.floor(cx - 4 * P), Math.floor(cy - 4 * P));
  const c = '#88ddff';
  px(1, 0, 6, 5, c);
  px(0, 3, 8, 4, c);
  if (frame === 0) { px(0, 7, 2, 2, c); px(4, 7, 2, 2, c); }
  else { px(2, 7, 2, 2, c); px(6, 7, 2, 2, c); }
  px(2, 2, 1, 1, '#1a3a5e'); px(5, 2, 1, 1, '#1a3a5e');
  R.restore();
}

const ORB_GLOW = [[0, 'rgba(255,215,0,0.9)'], [0.5, 'rgba(255,165,0,0.5)'], [1, 'rgba(255,120,0,0)']] as const;

export function drawOrb(cx: number, cy: number, pulse: number) {
  const r = (5 + pulse) * P;
  R.radial(cx, cy, r * 1.5, ORB_GLOW);
  R.circle(cx, cy, r, '#ffd700');
  R.text('M', cx, cy, '#7c3aed', { align: 'center', baseline: 'middle', shadow: null });
}

export function drawGoalFlag(cx: number, cy: number, flash: boolean) {
  R.save();
  R.translate(Math.floor(cx), Math.floor(cy));
  R.rect(-P, -20 * P, 2 * P, 20 * P, '#aaaaaa');
  R.rect(P, -20 * P, 10 * P, 7 * P, flash ? '#ffd700' : '#ff6600');
  R.text('★', 6 * P, -16.5 * P, '#ffffff', { align: 'center', baseline: 'middle', shadow: null });
  R.rect(-3 * P, 0, 6 * P, 2 * P, '#555555');
  R.restore();
}

// Volcano geyser spanning lanes `low` and `low + 1`. Dormant: two glowing,
// smoking vents (the warning). Erupted: a lava column joining both lanes.
export function drawGeyser(cx: number, low: number, erupted: boolean, t: number) {
  const yLow = LANE_Y[low], yHigh = LANE_Y[low + 1];
  if (!erupted) {
    const glow = 0.5 + 0.5 * Math.sin(t * 8);
    for (const y of [yLow, yHigh]) {
      R.rect(cx - 8, y + 6, 16, 4, '#2a0c08');
      R.rect(cx - 6, y + 6, 12, 2, '#ff5a1f', 0.5 + 0.5 * glow);
      for (let i = 0; i < 3; i++) {
        const k = (t * 1.5 + i / 3) % 1;
        R.rect(cx - 3 + Math.sin(t * 3 + i) * 3, y + 4 - k * 16, 4, 4, '#6b5a55', 0.6 * (1 - k));
      }
    }
    return;
  }
  const top = yHigh - 16, bottom = yLow + 10;
  R.rect(cx - 9, top, 18, bottom - top, '#ff5a1f');
  R.rect(cx - 5, top, 10, bottom - top, '#ffd166');
  for (let y = top; y < bottom; y += 6) {
    const wob = Math.sin(t * 12 + y * 0.3) * 3;
    R.rect(cx - 11 + wob, y, 4, 4, '#ff8c42');
    R.rect(cx + 7 - wob, y + 3, 4, 4, '#ff8c42');
  }
  R.rect(cx - 12, top - 4, 24, 6, '#ffd166', 0.8);
}

// Gem: small spinning diamond (currency).
export function drawGem(cx: number, cy: number, t: number) {
  const w = Math.max(1, Math.round(Math.abs(Math.cos(t * 3)) * 5));
  R.rect(cx - w, cy - 1, w * 2, 2, '#67e8f9');
  R.rect(cx - Math.max(1, w - 2), cy - 3, Math.max(2, (w - 2) * 2), 2, '#a5f3fc');
  R.rect(cx - Math.max(1, w - 2), cy + 1, Math.max(2, (w - 2) * 2), 2, '#0891b2');
  R.rect(cx - 1, cy - 5, 2, 2, '#ecfeff');
  R.rect(cx - 1, cy + 3, 2, 2, '#0e7490');
}

const POWER_COLORS = { shield: '#38bdf8', magnet: '#f43f5e', slowmo: '#a3e635' } as const;

// Power-up bubble with a tiny icon: shield, magnet (U) or hourglass.
export function drawPowerUp(cx: number, cy: number, kind: keyof typeof POWER_COLORS, t: number) {
  const c = POWER_COLORS[kind];
  R.radial(cx, cy, 13 + Math.sin(t * 5), [[0, c], [0.6, c], [1, 'rgba(0,0,0,0)']]);
  R.circle(cx, cy, 9, '#0b1020');
  drawPowerIcon(cx, cy, kind);
}

export function drawPowerIcon(cx: number, cy: number, kind: keyof typeof POWER_COLORS) {
  const c = POWER_COLORS[kind];
  R.save();
  R.translate(cx - 5, cy - 5);
  if (kind === 'shield') {
    R.rect(1, 0, 8, 2, c); R.rect(0, 1, 10, 4, c); R.rect(1, 5, 8, 2, c); R.rect(3, 7, 4, 2, c); R.rect(4, 9, 2, 1, c);
    R.rect(4, 2, 2, 4, '#ffffff');
  } else if (kind === 'magnet') {
    R.rect(0, 0, 3, 7, c); R.rect(7, 0, 3, 7, c); R.rect(0, 7, 10, 3, c);
    R.rect(0, 0, 3, 2, '#e5e7eb'); R.rect(7, 0, 3, 2, '#e5e7eb');
  } else {
    R.rect(0, 0, 10, 2, c); R.rect(0, 8, 10, 2, c);
    R.rect(2, 2, 6, 2, '#fde68a'); R.rect(4, 4, 2, 2, '#fde68a'); R.rect(2, 6, 6, 2, '#fde68a');
  }
  R.restore();
}

// Shield bubble around the player while the shield power is up.
export function drawShieldBubble(cx: number, cy: number, t: number) {
  R.save();
  R.alpha *= 0.35 + 0.15 * Math.sin(t * 6);
  R.radial(cx, cy, 17, [[0, 'rgba(56,189,248,0)'], [0.75, 'rgba(56,189,248,0.3)'], [1, '#38bdf8']]);
  R.restore();
}
