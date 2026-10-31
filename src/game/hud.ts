import { CW, CH, RADAR_H, LANE_COUNT, LANE_GAP, LANE_Y, P, SPAWN_AHEAD } from '../constants';
import { LANE_FLASH_DUR } from './player';
import { R } from '../gfx/renderer';
import { rgba } from '../gfx/color';
import { world, displayName } from './world';
import { t, type Key } from '../i18n';
import type { ObsType } from './obstacles';

// ===== RADAR =====
const RADAR_COLORS: Record<ObsType, string> = {
  zombie: '#7CFC00', spike: '#FF4444', bat: '#AA88FF',
  ghost: '#88DDFF', pit: '#FF8800', orb: '#FFD700',
};
const LANE_ROW_Y = [18, 11, 4]; // bottom/mid/top within radar strip
// The DOM pause button overlaps the top-right corner while playing; keep the
// radar scale and the HUD hearts left of it.
const PAUSE_BTN_INSET = 40;
const RADAR_X0 = 4, RADAR_W = CW - RADAR_X0 - PAUSE_BTN_INSET;

// Distance ahead of the player (0..SPAWN_AHEAD) → radar x across the full strip.
const radarX = (dist: number) => RADAR_X0 + Math.floor(Math.min(1, Math.max(0, dist / SPAWN_AHEAD)) * RADAR_W);

export function drawRadar() {
  if (!world.opts.showRadar) return;
  const { player, obstacles, goal } = world;

  R.rect(0, 0, CW, RADAR_H, '#0a0a18');
  // Portion of the radar that is already visible on screen
  R.rect(RADAR_X0, 0, radarX(CW - player.x) - RADAR_X0, RADAR_H - 1, '#ffffff', 0.05);
  for (let l = 0; l < LANE_COUNT; l++) R.rect(0, LANE_ROW_Y[l], CW, 6, '#ffffff', 0.03);
  R.rect(0, LANE_ROW_Y[player.targetLane], 3, 6, '#e879f9');

  for (const obs of obstacles) {
    const dist = obs.x - player.x;
    if (dist < 0 || dist > SPAWN_AHEAD) continue;
    R.rect(radarX(dist), LANE_ROW_Y[obs.lane], 3, 6, RADAR_COLORS[obs.type]);
  }

  // Goal stays pinned to the right edge until it enters radar range
  if (goal && goal.active && goal.x >= player.x) {
    R.rect(radarX(goal.x - player.x), 0, 4, RADAR_H, goal.flash ? '#FFD700' : '#FF8C00');
  }

  R.rect(0, RADAR_H - 1, CW, 1, '#a855f7');
}

// ===== HUD =====
const MULT_COLORS = ['', '', '#ffd700', '#ff8c00', '#ff4500'];

export function drawHUD() {
  const { player, score, hiScore } = world;
  R.text(`${score}`, 6, RADAR_H + 5, '#ffffff', { scale: 2 });

  if (player.comboMultiplier > 1) {
    R.text(`x${player.comboMultiplier}`, 6, RADAR_H + 23, MULT_COLORS[player.comboMultiplier]);
  }
  if (player.comboStreak > 0) {
    R.text(t('hud.streak', { n: player.comboStreak }), 6, RADAR_H + 33, '#88ddff');
  }

  const hx = CW - PAUSE_BTN_INSET;
  for (let i = 0; i < player.maxHp; i++) {
    R.text('♥', hx - i * 18, RADAR_H + 5, i < player.hp ? '#ff4466' : '#442233', { scale: 2, align: 'right' });
  }
  R.text(displayName(), hx - player.maxHp * 18 - 4, RADAR_H + 9, '#aaaacc', { align: 'right' });

  if (world.goalApproaching) {
    const pulse = Math.sin(world.gameTime * 8) * 0.5 + 0.5;
    R.text(t('hud.goal'), CW / 2, RADAR_H + 9,
      rgba(255, Math.floor(100 + pulse * 155), 0, 0.7 + pulse * 0.3), { align: 'center' });
  }

  if (score >= hiScore && score > 0) {
    // Sits above the achievement banner while it is showing
    R.text(t('hud.newRecord'), CW / 2, world.achievementBanner ? CH - 38 : CH - 9, '#ffd700', { align: 'center' });
  }
}

// ===== COMBO POPUPS =====
const COMBO_KEYS: Record<number, Key> = { 2: 'combo.2', 3: 'combo.3', 4: 'combo.4' };
const COMBO_COLORS = ['', '', '#ffd700', '#ff8c00', '#ff4444'];

export function showComboPopup(mult: number) {
  const key = COMBO_KEYS[mult];
  if (!key) return;
  world.comboPopups.push({
    text: t(key), x: CW / 2, y: 140,
    life: 1.2, maxLife: 1.2, vy: -20, color: COMBO_COLORS[mult],
  });
}

export function updateComboPopups(dt: number) {
  world.comboPopups = world.comboPopups.filter(p => {
    p.y += p.vy * dt;
    p.life -= dt;
    return p.life > 0;
  });
}

export function drawComboPopups() {
  for (const p of world.comboPopups) {
    R.save();
    R.alpha *= Math.min(1, p.life / p.maxLife * 2);
    R.text(p.text, p.x, p.y, p.color, { scale: 2, align: 'center', baseline: 'middle' });
    R.restore();
  }
}

// ===== ACHIEVEMENT BANNER =====
export function updateAchievementBanner(dt: number) {
  const b = world.achievementBanner;
  if (!b) return;
  b.life -= dt;
  if (b.life <= 0) world.achievementBanner = null;
}

export function drawAchievementBanner() {
  const b = world.achievementBanner;
  if (!b) return;
  R.save();
  R.alpha *= Math.min(1, b.life / b.maxLife * 3);
  R.rect(0, CH - 28, CW, 22, '#7c3aed');
  R.strokeRect(0, CH - 28, CW, 22, '#ffd700');
  R.text('★ ' + t('hud.achievement', { name: b.text }), CW / 2, CH - 17, '#ffffff', { align: 'center', baseline: 'middle' });
  R.restore();
}

// ===== LANE GUIDES (control feedback) =====
// Each lane's tap zone spans half the gap to its neighbours (laneAtY picks the nearest LANE_Y).
const zoneTop = (lane: number) => LANE_Y[lane] - LANE_GAP / 2;

// Brief glow over the tap zone of the lane just chosen.
export function drawLaneFlash() {
  const f = world.laneFlash;
  if (!f) return;
  R.rect(0, zoneTop(f.lane), CW, LANE_GAP, '#ffffff', 0.12 * (f.life / LANE_FLASH_DUR));
}

// Outline where the cube will land while a jump is in progress.
export function drawLandingGhost() {
  const p = world.player;
  if (p.laneT >= 1) return;
  const size = 9 * P;
  R.save();
  R.alpha *= 0.55;
  R.strokeRect(Math.floor(p.x - size / 2), Math.floor(LANE_Y[p.targetLane] - size / 2), size, size, '#e879f9');
  R.restore();
}

// Tabs on the right edge mark the three tappable lanes; the target lane is lit.
export function drawLaneMarkers() {
  const target = world.player.targetLane;
  for (let l = 0; l < LANE_COUNT; l++) {
    const y = LANE_Y[l], on = l === target;
    const c = on ? '#e879f9' : '#ffffff';
    R.save();
    R.alpha *= on ? 0.9 : 0.3;
    R.rect(CW - 6, y - 8, 4, 16, c);
    // Left-pointing chevron: "the cube goes here"
    R.rect(CW - 14, y - 1, 2, 2, c);
    R.rect(CW - 12, y - 3, 2, 2, c);
    R.rect(CW - 12, y + 1, 2, 2, c);
    R.restore();
  }
}

// ===== SPEED LINES =====
export function drawSpeedLines() {
  const { speedBoost, player, gameTime } = world;
  if (speedBoost < 1.6 || world.opts.reduceMotion) return;
  R.save();
  R.alpha *= Math.min(1, (speedBoost - 1.6) / 0.8) * 0.35;
  for (let i = 0; i < 10; i++) {
    const angle = (i / 10) * Math.PI * 2 + gameTime * 2;
    const len = 60 + Math.sin(gameTime * 3 + i) * 20;
    const c = Math.cos(angle), s = Math.sin(angle);
    R.line(player.x + c * 15, player.y + s * 15, player.x + c * len, player.y + s * len, 1, '#ffffff');
  }
  R.restore();
}
