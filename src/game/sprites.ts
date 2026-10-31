import { P } from '../constants';
import { R } from '../gfx/renderer';
import type { Color } from '../gfx/color';
import type { Expression } from './player';

// All sprites are code: rects on a 2×2 "art pixel" grid, origin at top-left
// of the sprite after R.translate().

function px(col: number, row: number, w: number, h: number, c: Color) {
  R.rect(col * P, row * P, w * P, h * P, c);
}

const FACE = '#1a0a2e';

// Player: 9×9 art pixels centered on (cx, cy)
export function drawPlayer(cx: number, cy: number, expr: Expression, flash: boolean, shield: boolean) {
  R.save();
  R.translate(Math.floor(cx - 9 * P / 2), Math.floor(cy - 9 * P / 2));

  const body = flash ? '#ffffff' : (shield ? '#e879f9' : '#c084fc');
  const shadow = flash ? '#dddddd' : (shield ? '#a855f7' : '#7c3aed');
  const shine = flash ? '#ffffff' : (shield ? '#f0abfc' : '#e9d5ff');
  for (let row = 1; row <= 7; row++) {
    for (let col = 1; col <= 7; col++) {
      let c = body;
      if (row === 1 || col === 1) c = shine;
      if (row === 7 || col === 7) c = shadow;
      px(col, row, 1, 1, c);
    }
  }

  if (shield && !flash) R.strokeRect(0, 0, 9 * P, 9 * P, '#ffd700');

  switch (expr) {
    case 'normal':
      px(2, 3, 1, 1, FACE); px(5, 3, 1, 1, FACE);
      px(2, 6, 1, 1, FACE); px(3, 7, 3, 1, FACE); px(6, 6, 1, 1, FACE);
      break;
    case 'hurt':
      px(2, 3, 1, 1, FACE); px(4, 3, 1, 1, FACE);
      px(3, 4, 1, 1, FACE); px(5, 4, 1, 1, FACE);
      px(2, 5, 1, 1, FACE); px(4, 5, 1, 1, FACE);
      px(2, 7, 1, 1, FACE); px(3, 6, 3, 1, FACE); px(6, 7, 1, 1, FACE);
      break;
    case 'scared':
      px(2, 3, 1, 2, FACE); px(5, 3, 1, 2, FACE);
      px(3, 6, 1, 1, FACE); px(4, 6, 1, 2, FACE); px(5, 6, 1, 1, FACE);
      px(7, 2, 1, 2, '#88ddff');
      break;
    case 'rush':
      px(2, 4, 2, 1, FACE); px(5, 4, 2, 1, FACE);
      px(3, 6, 4, 1, FACE);
      break;
    case 'happy':
      px(2, 3, 2, 2, FACE); px(5, 3, 2, 2, FACE);
      px(2, 3, 1, 1, '#ffffff'); px(5, 3, 1, 1, '#ffffff');
      px(2, 6, 1, 1, FACE); px(3, 7, 3, 1, FACE); px(6, 6, 1, 1, FACE);
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
export function drawBat(cx: number, cy: number, frame: number) {
  R.save();
  R.translate(Math.floor(cx - 5 * P), Math.floor(cy - 3 * P));
  px(4, 2, 2, 3, '#7c3aed');
  px(4, 2, 1, 1, '#ff4444'); px(5, 2, 1, 1, '#ff4444');
  const wy = frame === 0 ? 1 : 3;
  px(0, wy, 4, 3, '#a855f7'); px(6, wy, 4, 3, '#a855f7');
  const my = frame === 0 ? 0 : 5;
  px(1, my, 2, 1, '#6d28d9'); px(7, my, 2, 1, '#6d28d9');
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
