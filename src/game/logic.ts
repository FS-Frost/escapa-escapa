import { BASE_SPEED, GOAL_SCORE, GOAL_TRAVEL_TIME } from '../constants';
import { R } from '../gfx/renderer';
import { audio } from '../audio';
import { storage } from '../storage';
import { world, STATE } from './world';
import { createPlayer, updatePlayerMotion } from './player';
import { type Obstacle, updateObstacle, drawObstacle, updateSpawner, spawnGoal, updateGoal, drawGoal } from './obstacles';
import { spawnSparkles, spawnHitStars, spawnTrail, updateParticles, drawParticles } from './particles';
import { drawPlayer } from './sprites';
import { drawBackground, updateBiomes } from './biomes';
import {
  drawRadar, drawHUD, showComboPopup, updateComboPopups, drawComboPopups,
  updateAchievementBanner, drawAchievementBanner, drawSpeedLines,
} from './hud';
import { setState, showDeadScreen, showVictoryScreen } from '../ui';

// ===== COMBO SYSTEM =====
function onObstacleAvoided(obs: Obstacle) {
  const p = world.player;
  world.score += p.comboMultiplier;
  p.comboStreak++;
  audio.play('pass');

  // Bump multiplier every 5
  const newMult = Math.min(4, 1 + Math.floor(p.comboStreak / 5));
  if (newMult > p.comboMultiplier) {
    p.comboMultiplier = newMult;
    showComboPopup(newMult);
    audio.play('combo');
  }
  if (p.comboStreak === 10) achievementsCheck('untouchable_10');
  if (p.comboMultiplier === 4) achievementsCheck('max_combo');

  spawnSparkles(obs.x + obs.w / 2, obs.y, 6);

  if (!world.goalSpawned && world.score >= GOAL_SCORE) {
    world.goalSpawned = true;
    spawnGoal();
    world.goalApproaching = true;
    audio.play('goalAlarm');
  }
}

// ===== ACHIEVEMENTS =====
const ACHIEVEMENT_DEFS: Record<string, { name: string }> = {
  first_escape: { name: '¡Primera escapada!' },
  untouchable_10: { name: 'Intocable x10' },
  max_combo: { name: 'Combo máximo' },
  speed_demon: { name: 'Demonio de velocidad' },
  comeback: { name: 'Regreso épico' },
};

function achievementsCheck(id: keyof typeof ACHIEVEMENT_DEFS) {
  if (!storage.unlockAchievement(id)) return;
  const def = ACHIEVEMENT_DEFS[id];
  world.achievementBanner = { text: def.name, life: 2.5, maxLife: 2.5 };
  audio.play('achievement');
}

// ===== GAME LOGIC =====
function rectOverlap(ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number) {
  const shrink = 0.18;
  const ax2 = ax + aw * shrink, aw2 = aw * (1 - 2 * shrink);
  const ay2 = ay + ah * shrink, ah2 = ah * (1 - 2 * shrink);
  return ax2 < bx + bw && ax2 + aw2 > bx && ay2 < by + bh && ay2 + ah2 > by;
}

function hitPlayer() {
  const p = world.player;
  if (p.invincible > 0) return;
  p.hp--;
  p.hitFlash = 0.3;
  p.invincible = 1.2;
  p.comboStreak = 0;
  p.comboMultiplier = 1;
  world.shakeDur = 0.25;
  audio.play('hit');
  spawnHitStars(p.x, p.y);
  if (p.hp <= 0) triggerDeath();
}

function triggerDeath() {
  audio.play('death');
  setState(STATE.DEAD);
  showDeadScreen();
}

function triggerVictory() {
  audio.play('victory');
  setState(STATE.VICTORY);
  achievementsCheck('first_escape');
  const p = world.player;
  if (p.hp === 1 && p.maxHp > 1) achievementsCheck('comeback');
  showVictoryScreen();
}

function markPassed(obs: Obstacle, award: boolean) {
  obs.passed = true;
  if (!obs.scored) {
    obs.scored = true;
    if (award) onObstacleAvoided(obs);
  }
}

function checkCollisions() {
  const p = world.player;
  const px = p.x - p.w / 2, py = p.y - p.h / 2;
  const behind = (obs: Obstacle) => !obs.passed && obs.x + obs.w < p.x - p.w / 2;

  for (const obs of world.obstacles) {
    if (!obs.active) continue;
    if (world.state !== STATE.PLAYING) return;

    if (obs.type === 'pit') {
      // Scores only if the player is out of the bottom lane when it passes
      if (behind(obs)) markPassed(obs, p.targetLane > 0);
      if (p.targetLane === 0 && p.x + p.w / 2 > obs.x && p.x - p.w / 2 < obs.x + obs.w) hitPlayer();
      continue;
    }

    if (obs.type === 'orb') {
      if (rectOverlap(px, py, p.w, p.h, obs.x, obs.y - obs.h / 2, obs.w, obs.h)) {
        if (p.hp < 2) {
          p.hp = Math.min(2, p.hp + 1);
          p.maxHp = Math.max(p.maxHp, 2);
          audio.play('powerup');
          spawnSparkles(obs.x, obs.y, 12);
        }
        obs.active = false;
      }
      continue;
    }

    // Only the target lane collides; lanes crossed mid-jump are ignored.
    if (obs.lane !== p.targetLane) {
      if (behind(obs)) {
        markPassed(obs, true);
        if (Math.abs(obs.lane - p.targetLane) === 1 && obs.x + obs.w > p.x - p.w) {
          p.nearMissTimer = 0.3;
          audio.play('nearMiss');
        }
      }
      continue;
    }

    if (rectOverlap(px, py, p.w, p.h, obs.x, obs.y - obs.h / 2, obs.w, obs.h)) {
      hitPlayer();
      obs.active = false;
    } else if (behind(obs)) {
      markPassed(obs, true);
    }
  }

  const g = world.goal;
  if (g && g.active && world.state === STATE.PLAYING && g.x <= p.x + p.w / 2 + 10) {
    g.active = false;
    triggerVictory();
  }
}

// ===== RESET / START =====
export function startGame() {
  audio.init();
  Object.assign(world, {
    player: createPlayer(),
    score: 0,
    hiScore: storage.getScores()[0]?.score || 0,
    scrollSpeed: BASE_SPEED,
    worldX: 0,
    gameTime: 0,
    obstacles: [],
    goal: null,
    goalSpawned: false,
    goalApproaching: false,
    goalAlarmTimer: 0,
    speedBoost: 1,
    shakeX: 0, shakeY: 0, shakeDur: 0,
    comboPopups: [],
    achievementBanner: null,
    biomeTransition: null,
    currentBiome: 0,
    spawnTimer: 1.5,
    particles: [],
    runStats: { maxStreak: 0, maxMult: 1 },
  });
  setState(STATE.PLAYING);
}

// ===== GAME LOOP =====
export function update(dt: number) {
  const w = world, p = w.player;
  w.gameTime += dt;
  w.worldX += w.scrollSpeed * w.speedBoost * dt;

  updateBiomes(dt);

  if (w.goalApproaching) {
    w.goalAlarmTimer += dt;
    if (w.goalAlarmTimer > 3.0 && Math.floor(w.goalAlarmTimer) !== Math.floor(w.goalAlarmTimer - dt)) {
      audio.play('goalAlarm');
    }
    w.speedBoost = Math.min(2.5, 1.0 + (w.goalAlarmTimer / GOAL_TRAVEL_TIME) * 1.5);
    if (w.speedBoost >= 2.4) {
      p.speedDemonTimer += dt;
      if (p.speedDemonTimer >= 10) achievementsCheck('speed_demon');
    }
  }

  if (w.shakeDur > 0) {
    w.shakeDur -= dt;
    w.shakeX = (Math.random() - 0.5) * 6;
    w.shakeY = (Math.random() - 0.5) * 6;
  } else { w.shakeX = 0; w.shakeY = 0; }

  updatePlayerMotion(dt);
  if (p.hitFlash > 0) p.hitFlash -= dt;
  if (p.invincible > 0) p.invincible -= dt;
  if (p.nearMissTimer > 0) p.nearMissTimer -= dt;

  if (p.hp === 0 || p.hitFlash > 0) p.expression = 'hurt';
  else if (p.nearMissTimer > 0) p.expression = 'scared';
  else if (w.goalApproaching && w.speedBoost > 1.8) p.expression = 'rush';
  else p.expression = 'normal';

  if (w.goalApproaching && w.speedBoost > 1.5) {
    p.trailTimer -= dt;
    if (p.trailTimer <= 0) {
      spawnTrail(p.x, p.y, p.invincible > 0 ? '#e879f9' : '#7c3aed');
      p.trailTimer = 0.05;
    }
  }

  w.runStats.maxStreak = Math.max(w.runStats.maxStreak ?? 0, p.comboStreak);
  w.runStats.maxMult = Math.max(w.runStats.maxMult ?? 1, p.comboMultiplier);

  const spd = w.scrollSpeed * w.speedBoost;
  for (const o of w.obstacles) updateObstacle(o, dt, spd);
  w.obstacles = w.obstacles.filter(o => o.active);
  if (w.goal) updateGoal(w.goal, dt, spd);

  updateSpawner(dt);
  checkCollisions();
  updateComboPopups(dt);
  updateAchievementBanner(dt);
  updateParticles(dt);
}

export function render() {
  const w = world, p = w.player;
  R.begin();
  R.save();
  R.translate(Math.floor(w.shakeX), Math.floor(w.shakeY));

  drawBackground();

  if (w.state === STATE.PLAYING || w.state === STATE.PAUSED) {
    for (const o of w.obstacles) if (o.lane < p.targetLane) drawObstacle(o);
    const flash = p.hitFlash > 0 && Math.floor(p.hitFlash * 12) % 2 === 0;
    drawPlayer(p.x, p.y, p.expression, flash, p.maxHp > 1);
    for (const o of w.obstacles) if (o.lane >= p.targetLane) drawObstacle(o);
  }

  if (w.goal && w.goal.active) drawGoal(w.goal);
  drawSpeedLines();
  drawParticles();
  drawComboPopups();
  drawAchievementBanner();
  drawHUD();
  drawRadar();

  R.restore();
  R.end();
}
