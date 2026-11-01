import { CW, CH, RADAR_H, LANE_COUNT, LANE_GAP, LANE_Y, P, SPAWN_AHEAD, PAUSE_INSET, UI_SCALE } from '../constants';
import { LANE_FLASH_DUR } from './player';
import { R } from '../gfx/renderer';
import { world, displayName } from './world';
import { t, type Key } from '../i18n';
import { laneSet, type ObsType } from './obstacles';
import { BEAM_CHARGE } from './hazards';
import { drawPowerIcon } from './sprites';

// ===== RADAR =====
const RADAR_COLORS: Record<ObsType, string> = {
  zombie: '#7CFC00', spike: '#FF4444', bat: '#AA88FF',
  ghost: '#88DDFF', pit: '#FF8800', orb: '#FFD700',
  swoop: '#f97316', geyser: '#ff5a1f', gem: '#67e8f9', power: '#ffffff',
};
const LANE_ROW_Y = [18, 11, 4]; // bottom/mid/top within radar strip
const RADAR_X0 = 4;
const radarW = () => CW - RADAR_X0 - PAUSE_INSET; // CW changes with the screen

// Distance ahead of the player (0..SPAWN_AHEAD) → radar x across the full strip.
const radarX = (dist: number) => RADAR_X0 + Math.floor(Math.min(1, Math.max(0, dist / SPAWN_AHEAD)) * radarW());

export function drawRadar() {
  if (!world.opts.showRadar && !world.tutorial) return; // the tutorial explains it
  const { player, obstacles, goal, beams } = world;

  R.rect(0, 0, CW, RADAR_H, '#0a0a18');
  // Portion of the radar that is already visible on screen
  R.rect(RADAR_X0, 0, radarX(CW - player.x) - RADAR_X0, RADAR_H - 1, '#ffffff', 0.05);
  for (let l = 0; l < LANE_COUNT; l++) R.rect(0, LANE_ROW_Y[l], CW, 6, '#ffffff', 0.03);
  // Charging beams light up their whole row (blinking faster as they charge)
  for (const b of beams) {
    const on = b.t >= BEAM_CHARGE || Math.floor(b.t * (6 + b.t / BEAM_CHARGE * 14)) % 2 === 0;
    if (on) R.rect(0, LANE_ROW_Y[b.lane], CW, 6, '#7df9ff', b.t >= BEAM_CHARGE ? 0.8 : 0.4);
  }
  R.rect(0, LANE_ROW_Y[player.targetLane], 3, 6, '#e879f9');

  for (const obs of obstacles) {
    const dist = obs.x - player.x;
    if (dist < 0 || dist > SPAWN_AHEAD) continue;
    const x = radarX(dist), c = RADAR_COLORS[obs.type];
    if (obs.type === 'geyser') {
      // Two-lane hazard: one tall mark over both rows
      const [lo, hi] = obs.lanes!;
      R.rect(x, LANE_ROW_Y[hi], 3, LANE_ROW_Y[lo] - LANE_ROW_Y[hi] + 6, c, obs.erupted ? 1 : 0.6);
    } else if (obs.type === 'swoop' && obs.switchT === undefined) {
      // Not switched yet: dot in its lane + a thin line toward where it will go
      const [from, to] = laneSet(obs);
      R.rect(x, LANE_ROW_Y[from], 3, 6, c);
      const y0 = Math.min(LANE_ROW_Y[from], LANE_ROW_Y[to]) + 3, y1 = Math.max(LANE_ROW_Y[from], LANE_ROW_Y[to]) + 3;
      R.rect(x + 1, y0, 1, y1 - y0, c, 0.8);
      R.rect(x, LANE_ROW_Y[to] + 2, 3, 2, c, 0.8);
    } else if (obs.type === 'gem') {
      R.rect(x, LANE_ROW_Y[obs.lane] + 2, 2, 2, c);
    } else {
      R.rect(x, LANE_ROW_Y[obs.lane], 3, 6, c);
    }
  }

  // Goal stays pinned to the right edge until it enters radar range
  if (goal && goal.active && goal.x >= player.x) {
    R.rect(radarX(goal.x - player.x), 0, 4, RADAR_H, goal.flash ? '#FFD700' : '#FF8C00');
  }

  R.rect(0, RADAR_H - 1, CW, 1, '#a855f7');
}

// ===== HUD =====
const MULT_COLORS = ['', '', '#ffd700', '#ff8c00', '#ff4500'];
const HEART_STEP = 16;
const NAME_MIN_CW = 420;
const SCORE_AREA_W = 76; // left HUD column (score, multiplier, streak)
const heartsLeftX = () => CW - PAUSE_INSET - (world.player.maxHp - 1) * HEART_STEP - 14;

export function drawHUD() {
  const { player, score, hiScore } = world;
  const s = UI_SCALE;
  R.text(`${score}`, 6, RADAR_H + 5, '#ffffff', { scale: 2 });

  const multY = RADAR_H + 23, streakY = multY + 7 * s + 3;
  if (player.comboMultiplier > 1) {
    R.text(`x${player.comboMultiplier}`, 6, multY, MULT_COLORS[player.comboMultiplier], { scale: s });
  }
  if (player.comboStreak > 0) {
    R.text(t('hud.streak', { n: player.comboStreak }), 6, streakY, '#88ddff', { scale: s });
  }

  const hx = CW - PAUSE_INSET;
  for (let i = 0; i < player.maxHp; i++) {
    R.text('♥', hx - i * HEART_STEP, RADAR_H + 5, i < player.hp ? '#ff4466' : '#442233', { scale: 2, align: 'right' });
  }
  const heartsLeft = heartsLeftX();
  // Narrow screens (portrait) drop the name before it collides with the goal bar
  if (CW >= NAME_MIN_CW) {
    R.text(displayName(), heartsLeft - 4, RADAR_H + 12 - 3.5 * s, '#aaaacc', { align: 'right', scale: s, maxWidth: 100 });
  }

  // Right column under the hearts: gems this run, active power / shield
  if (!world.tutorial) {
    const rowY = RADAR_H + 23;
    R.text(`◆${world.runGems}`, hx, rowY, '#67e8f9', { align: 'right', scale: s });
    let iconX = hx - 6;
    const iconY = rowY + 7 * s + 10;
    if (world.shield) { drawPowerIcon(iconX, iconY, 'shield'); iconX -= 16; }
    if (world.power) {
      drawPowerIcon(iconX, iconY, world.power.kind);
      const k = 1 - world.power.t / world.power.dur;
      R.rect(iconX - 6, iconY + 8, 12, 2, '#ffffff', 0.2);
      R.rect(iconX - 6, iconY + 8, Math.round(12 * k), 2, '#ffffff', 0.8);
    }
  }

  drawProgress(heartsLeft);

  if (score >= hiScore && score > 0) {
    // Sits above the achievement banner while it is showing
    const y = world.achievementBanner ? CH - 31 - 7 * s : CH - 2 - 7 * s;
    R.text(t('hud.newRecord'), CW / 2, y, '#ffd700', { align: 'center', scale: s, maxWidth: CW - 16 });
  }
}

// ===== PROGRESS (top center) =====
const GOAL_NOTICE_S = 2.5;
const BAR_Y = RADAR_H + 6;

// Stages: a bar filling toward the goal score, then (goal spawned) toward the
// flag, with a brief notice. Endless/daily: distance run in metres.
function drawProgress(heartsLeft: number) {
  const { goal, player, goalTimer, stage } = world;
  if (world.tutorial) return;
  const space = heartsLeft - 14 - SCORE_AREA_W; // keep room for the flag
  const BAR_W = Math.max(40, Math.min(140, space));
  const BAR_X = Math.round(SCORE_AREA_W + (space - BAR_W) / 2);
  const mid = BAR_X + BAR_W / 2;

  if (!stage) {
    const label = world.mode === 'daily' ? t('mode.daily') : t('mode.endless');
    R.text(`${Math.floor(world.worldX / 10)} m`, mid, BAR_Y - 2, '#ffffff', { align: 'center', scale: UI_SCALE, maxWidth: space });
    R.text(label, mid, BAR_Y + 7 * UI_SCALE + 1, '#a0a0c0', { align: 'center', maxWidth: space });
    return;
  }

  const k = goal
    ? Math.min(1, Math.max(0, 1 - (goal.x - player.x) / goal.startDist))
    : Math.min(1, world.score / stage.goalScore);
  R.rect(BAR_X, BAR_Y, BAR_W, 4, '#ffffff', 0.15);
  R.rect(BAR_X, BAR_Y, Math.round(BAR_W * k), 4, goal ? '#ffb000' : '#a855f7');
  // Tiny flag at the end
  R.rect(BAR_X + BAR_W + 3, BAR_Y - 4, 1, 9, '#aaaaaa');
  R.rect(BAR_X + BAR_W + 4, BAR_Y - 4, 5, 4, goal?.flash ? '#ffd700' : '#ff6600');

  if (goal && goalTimer < GOAL_NOTICE_S) {
    R.save();
    R.alpha *= Math.min(1, (GOAL_NOTICE_S - goalTimer) / 0.5);
    R.text(t('hud.goal'), mid, BAR_Y + 9, '#ffb000', { align: 'center', scale: UI_SCALE, maxWidth: space });
    R.restore();
  } else if (!goal) {
    R.text(t('stage.short', { n: stage.id }), mid, BAR_Y + 8, '#a0a0c0', { align: 'center', maxWidth: space });
  }
}

// ===== CAPTION (biome intro, storm warning, power picked) =====
export function drawCaption() {
  const c = world.caption;
  if (!c) return;
  const s = UI_SCALE;
  const a = Math.min(1, c.life / 0.4, (c.maxLife - c.life) / 0.2 + 0.2);
  const y = 72;
  R.save();
  R.alpha *= a;
  const h = c.sub ? 7 * (s + 1) + 7 * s + 14 : 7 * (s + 1) + 8;
  R.rect(0, y - 5, CW, h, '#000000', 0.5);
  R.text(c.title, CW / 2, y, c.color, { align: 'center', scale: s + 1, maxWidth: CW - 8 });
  if (c.sub) R.text(c.sub, CW / 2, y + 7 * (s + 1) + 5, '#ffffff', { align: 'center', scale: s, maxWidth: CW - 8 });
  R.restore();
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
    R.text(p.text, p.x, p.y, p.color, { scale: 1 + UI_SCALE, align: 'center', baseline: 'middle', maxWidth: CW - 16 });
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
  R.text('★ ' + t('hud.achievement', { name: b.text }), CW / 2, CH - 17, '#ffffff', { align: 'center', baseline: 'middle', scale: UI_SCALE, maxWidth: CW - 8 });
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
