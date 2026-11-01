import { BASE_SPEED, PLAYER_X } from '../constants';
import { R } from '../gfx/renderer';
import { audio } from '../audio';
import { haptics } from '../haptics';
import { t } from '../i18n';
import { storage, todayKey } from '../storage';
import { world, STATE, type PowerKind } from './world';
import { createPlayer, updatePlayerMotion } from './player';
import { RULES } from './difficulty';
import { STAGES, STAGE_GOAL_TRAVEL_S, starsFor, type RunMode } from './stages';
import { seedRng, randomSeed, stringSeed } from './rng';
import {
  type Obstacle, updateObstacle, drawObstacle, updateSpawner, spawnGoal, updateGoal, drawGoal, seedOpening,
  baseScrollSpeed, isPickup,
} from './obstacles';
import { updateBeams, drawBeams, beamFiring, stormPhase, drawStorm } from './hazards';
import { spawnSparkles, spawnHitStars, spawnTrail, updateParticles, drawParticles } from './particles';
import { drawPlayer, drawShieldBubble } from './sprites';
import { skinById, skinColors } from './skins';
import { drawBackground, updateBiomes, biomeTheme, biomeWeight, targetBiome, enterBiome } from './biomes';
import {
  drawRadar, drawHUD, showComboPopup, updateComboPopups, drawComboPopups,
  updateAchievementBanner, drawAchievementBanner, drawSpeedLines,
  drawLaneFlash, drawLandingGhost, drawLaneMarkers, drawCaption,
} from './hud';
import { startTutorial, updateTutorial, drawTutorial, tutorialObstaclePassed, tutorialHit } from './tutorial';
import { setState, showDeadScreen, showVictoryScreen } from '../ui';

// ===== COMBO SYSTEM =====
function onAvoided(x: number, y: number) {
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
    haptics.play('combo');
  }
  if (p.comboStreak === 10) achievementsCheck('untouchable_10');
  if (p.comboMultiplier === 4) achievementsCheck('max_combo');

  spawnSparkles(x, y, 6);

  // Stages: the goal appears once enough points are scored
  const stage = world.stage;
  if (stage && !world.goalSpawned && world.score >= stage.goalScore) {
    world.goalSpawned = true;
    spawnGoal(STAGE_GOAL_TRAVEL_S);
    world.goalApproaching = true;
    audio.play('goalAppear'); // once; the music carries the tension from here
  }
}

function onObstacleAvoided(obs: Obstacle) {
  if (world.tutorial) { tutorialObstaclePassed(obs); return; } // no score while learning
  onAvoided(obs.x + obs.w / 2, obs.y);
}

// ===== ACHIEVEMENTS =====
// Names live in i18n under `ach.<id>`.
type AchievementId = 'first_escape' | 'untouchable_10' | 'max_combo' | 'speed_demon' | 'comeback'
  | 'perfect_stage' | 'all_stages' | 'collector';

function achievementsCheck(id: AchievementId) {
  if (!storage.unlockAchievement(id)) return;
  world.achievementBanner = { text: t(`ach.${id}`), life: 2.5, maxLife: 2.5 };
  audio.play('achievement');
  haptics.play('achievement');
}

// ===== GAME LOGIC =====
function rectOverlap(ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number) {
  const shrink = 0.18;
  const ax2 = ax + aw * shrink, aw2 = aw * (1 - 2 * shrink);
  const ay2 = ay + ah * shrink, ah2 = ah * (1 - 2 * shrink);
  return ax2 < bx + bw && ax2 + aw2 > bx && ay2 < by + bh && ay2 + ah2 > by;
}

const INVINCIBLE_S = 1.5; // grace period after a hit (the cube blinks)
const SHIELD_GRACE_S = 1.0;
const POWER_DUR: Record<Exclude<PowerKind, 'shield'>, number> = { magnet: 8, slowmo: 5 };
const SLOWMO_FACTOR = 0.6;

function hitPlayer() {
  const p = world.player;
  if (p.invincible > 0) return;
  if (world.shield) {
    // The shield takes the hit instead of a heart
    world.shield = false;
    p.invincible = SHIELD_GRACE_S;
    audio.play('shieldBreak');
    haptics.play('hit');
    spawnSparkles(p.x, p.y, 14);
    return;
  }
  p.hp--;
  p.hitsTaken++;
  p.hitFlash = 0.3;
  p.invincible = INVINCIBLE_S;
  p.comboStreak = 0;
  p.comboMultiplier = 1;
  world.shakeDur = 0.25;
  audio.play('hit');
  haptics.play('hit');
  spawnHitStars(p.x, p.y);
  if (p.hp <= 0) triggerDeath();
}

// Gems collected this run go into the persistent wallet when the run ends.
function bankGems() {
  storage.addGems(world.runGems);
  if (storage.getGems() >= 100) achievementsCheck('collector');
}

function triggerDeath() {
  audio.play('death');
  haptics.play('death');
  bankGems();
  setState(STATE.DEAD);
  showDeadScreen();
}

function triggerVictory() {
  audio.play('victory');
  haptics.play('victory');
  bankGems();
  const p = world.player, stage = world.stage!;
  const stars = starsFor(p.hitsTaken, world.runStats.maxMult ?? 1);
  world.runStats.stars = stars;
  storage.saveStageStars(stage.id, stars);
  setState(STATE.VICTORY);
  achievementsCheck('first_escape');
  if (p.hp === 1 && p.hitsTaken > 0) achievementsCheck('comeback'); // won on the last heart after losing some
  if (stars === 3) achievementsCheck('perfect_stage');
  const all = storage.getStageStars();
  if (STAGES.every(s => (all[s.id] ?? 0) > 0)) achievementsCheck('all_stages');
  showVictoryScreen();
}

function markPassed(obs: Obstacle, award: boolean) {
  obs.passed = true;
  if (!obs.scored) {
    obs.scored = true;
    if (award) onObstacleAvoided(obs);
  }
}

function collect(obs: Obstacle) {
  const p = world.player;
  obs.active = false;
  if (obs.type === 'orb') {
    if (p.hp < p.maxHp) {
      p.hp++;
      audio.play('powerup');
      haptics.play('powerup');
      spawnSparkles(obs.x, obs.y, 12);
    }
  } else if (obs.type === 'gem') {
    world.runGems++;
    audio.play('gem');
    spawnSparkles(obs.x, obs.y, 4);
  } else if (obs.type === 'power') {
    const kind = obs.kind!;
    if (kind === 'shield') world.shield = true;
    else world.power = { kind, t: 0, dur: POWER_DUR[kind] };
    audio.play('powerup');
    haptics.play('powerup');
    spawnSparkles(obs.x, obs.y, 12);
    world.caption = { title: t(`power.${kind}`), sub: '', life: 1.4, maxLife: 1.4, color: '#7df9ff' };
  }
}

function checkCollisions() {
  const p = world.player;
  const px = p.x - p.w / 2, py = p.y - p.h / 2;
  const behind = (obs: Obstacle) => !obs.passed && obs.x + obs.w < p.x - p.w / 2;
  const xOverlap = (obs: Obstacle) => p.x + p.w / 2 > obs.x && p.x - p.w / 2 < obs.x + obs.w;

  for (const obs of world.obstacles) {
    if (!obs.active) continue;
    if (world.state !== STATE.PLAYING) return;

    if (isPickup(obs)) {
      if (rectOverlap(px, py, p.w, p.h, obs.x, obs.y - obs.h / 2, obs.w, obs.h)) collect(obs);
      continue;
    }

    if (obs.type === 'pit') {
      // Scores only if the player is out of the bottom lane when it passes
      if (behind(obs)) markPassed(obs, p.targetLane > 0);
      if (p.targetLane === 0 && xOverlap(obs)) hitPlayer();
      continue;
    }

    if (obs.type === 'geyser') {
      // Once erupted it blocks both of its lanes
      if (obs.erupted && obs.lanes!.includes(p.targetLane) && xOverlap(obs) && !obs.scored) {
        if (world.tutorial) { tutorialHit(); return; }
        obs.scored = true; // a geyser that hit you doesn't score
        hitPlayer();
      } else if (behind(obs)) {
        markPassed(obs, true);
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
      if (world.tutorial) { tutorialHit(); return; }
      hitPlayer();
      obs.active = false;
    } else if (behind(obs)) {
      markPassed(obs, true);
    }
  }

  // Beams hit whoever is in their lane while firing
  for (const b of world.beams) {
    if (world.state !== STATE.PLAYING) return;
    if (!b.hit && beamFiring(b) && b.lane === p.targetLane && p.invincible <= 0) {
      b.hit = true;
      hitPlayer();
    }
  }

  const g = world.goal;
  if (g && g.active && world.state === STATE.PLAYING && g.x <= p.x + p.w / 2 + 10) {
    g.active = false;
    triggerVictory();
  }
}

// ===== RESET / START =====
export interface RunConfig { mode: RunMode; stageId?: number; tutorial?: boolean; }
let lastConfig: RunConfig = { mode: 'stage', stageId: 1 };

export function startGame(config: RunConfig = lastConfig) {
  audio.init();
  lastConfig = config;
  world.mode = config.mode;
  world.stage = config.mode === 'stage' ? STAGES.find(s => s.id === config.stageId) ?? STAGES[0] : null;
  resetRun();
  if (config.tutorial) startTutorial(resetRun);
  setState(STATE.PLAYING);
}

export const restartRun = () => startGame(lastConfig);
export const currentConfig = () => lastConfig;

function resetRun() {
  // The daily challenge is the same for everyone: fixed difficulty and seed.
  const daily = world.mode === 'daily';
  world.difficulty = daily ? 'normal' : world.opts.difficulty;
  world.seed = daily ? stringSeed(todayKey()) : randomSeed();
  seedRng(world.seed);
  const rules = RULES[world.difficulty];
  Object.assign(world, {
    player: createPlayer(rules.lives, rules.maxLives),
    score: 0,
    hiScore: daily ? storage.getDailyChallengeBest() : world.mode === 'endless' ? storage.getScores(world.difficulty)[0]?.score || 0 : Infinity,
    scrollSpeed: BASE_SPEED,
    worldX: 0,
    gameTime: 0,
    obstacles: [],
    goal: null,
    goalSpawned: false,
    goalApproaching: false,
    goalTimer: 0,
    goalCountdown: 0,
    speedBoost: 1,
    shakeX: 0, shakeY: 0, shakeDur: 0,
    comboPopups: [],
    achievementBanner: null,
    biomeTransition: null,
    particles: [],
    laneFlash: null,
    tutorial: null,
    beams: [],
    power: null,
    shield: false,
    runGems: 0,
    caption: null,
    seenBiomes: new Set<number>(),
    skin: storage.getSkin(),
    nextSpawnX: BASE_SPEED * 1.5,
    runStats: { maxStreak: 0, maxMult: 1 },
  });
  world.scrollSpeed = baseScrollSpeed();
  world.currentBiome = targetBiome();
  enterBiome(world.currentBiome);
  seedOpening();
}

// ===== GAME LOOP =====
let stormWas = 0;

export function update(dt: number) {
  const w = world, p = w.player;
  w.gameTime += dt;
  w.scrollSpeed = baseScrollSpeed();
  const slow = w.power?.kind === 'slowmo' ? SLOWMO_FACTOR : 1;
  const spd = w.scrollSpeed * w.speedBoost * slow;
  w.worldX += spd * dt;

  updateBiomes(dt);
  // Theme crossfade follows the 3 s visual biome crossfade; tempo rises with the goal rush.
  audio.setMusic(biomeTheme(), 3);
  audio.setIntensity(w.goalApproaching ? (w.speedBoost - 1) : 0);

  if (w.goalApproaching) {
    w.goalTimer += dt;
    // Soft 3-2-1 beeps right before arrival
    if (w.goal?.active) {
      const eta = (w.goal.x - (p.x + p.w / 2 + 10)) / spd;
      const sec = Math.ceil(eta);
      if (sec >= 1 && sec <= 3 && sec !== w.goalCountdown) {
        w.goalCountdown = sec;
        audio.play('countdown');
      }
    }
    w.speedBoost = Math.min(2, 1 + w.goalTimer / STAGE_GOAL_TRAVEL_S);
  }

  // Endless top speed achievement: 10 s at ≥ 1.8× the starting pace
  if (!w.stage && w.scrollSpeed >= BASE_SPEED * RULES[w.difficulty].speed * 1.8) {
    p.speedDemonTimer += dt;
    if (p.speedDemonTimer >= 10) achievementsCheck('speed_demon');
  }

  if (w.shakeDur > 0) w.shakeDur -= dt;
  if (w.shakeDur > 0 && !w.opts.reduceMotion) {
    w.shakeX = (Math.random() - 0.5) * 6;
    w.shakeY = (Math.random() - 0.5) * 6;
  } else { w.shakeX = 0; w.shakeY = 0; }

  updatePlayerMotion(dt);
  if (p.hitFlash > 0) p.hitFlash -= dt;
  if (p.invincible > 0) p.invincible -= dt;
  if (p.nearMissTimer > 0) p.nearMissTimer -= dt;
  if (w.power && (w.power.t += dt) >= w.power.dur) w.power = null;
  if (w.caption && (w.caption.life -= dt) <= 0) w.caption = null;

  if (p.hp === 0 || p.hitFlash > 0) p.expression = 'hurt';
  else if (p.nearMissTimer > 0) p.expression = 'scared';
  else if (w.goalApproaching && w.speedBoost > 1.5) p.expression = 'rush';
  else p.expression = 'normal';

  if ((w.goalApproaching && w.speedBoost > 1.3) || slow < 1) {
    p.trailTimer -= dt;
    if (p.trailTimer <= 0) {
      spawnTrail(p.x, p.y, slow < 1 ? '#a3e635' : p.invincible > 0 ? '#e879f9' : '#7c3aed');
      p.trailTimer = 0.05;
    }
  }

  // Desert: announce each sandstorm as it rolls in
  const storm = stormLevel();
  if (storm > 0 && stormWas === 0) {
    w.caption = { title: t('storm.title'), sub: t('storm.sub'), life: 2.2, maxLife: 2.2, color: '#f5deb3' };
  }
  stormWas = storm;

  w.runStats.maxStreak = Math.max(w.runStats.maxStreak ?? 0, p.comboStreak);
  w.runStats.maxMult = Math.max(w.runStats.maxMult ?? 1, p.comboMultiplier);

  for (const o of w.obstacles) updateObstacle(o, dt, spd);
  w.obstacles = w.obstacles.filter(o => o.active);
  if (w.goal) updateGoal(w.goal, dt, spd);
  for (const b of updateBeams(dt)) {
    if (!b.hit && !w.tutorial) onAvoided(PLAYER_X + 40, 0);
  }

  if (w.tutorial) updateTutorial(dt);
  else updateSpawner(w.biomeTransition?.to ?? w.currentBiome);
  checkCollisions();
  updateComboPopups(dt);
  updateAchievementBanner(dt);
  updateParticles(dt);
}

const stormLevel = () => biomeWeight('desert') * stormPhase(world.worldX);

export function render() {
  const w = world, p = w.player;
  R.begin();
  R.save();
  R.translate(Math.floor(w.shakeX), Math.floor(w.shakeY));

  drawBackground();

  const inRun = w.state === STATE.PLAYING || w.state === STATE.PAUSED || w.state === STATE.DEAD || w.state === STATE.VICTORY;
  if (inRun) {
    drawLaneFlash();
    drawBeams();
    for (const o of w.obstacles) if (o.lane < p.targetLane) drawObstacle(o);
    drawLandingGhost();
    const flash = p.hitFlash > 0 && !w.opts.reduceMotion && Math.floor(p.hitFlash * 12) % 2 === 0;
    // Blink + gold border during the post-hit grace period
    const blink = p.invincible > 0 && p.hitFlash <= 0 && !w.opts.reduceMotion && Math.floor(p.invincible * 10) % 2 === 0;
    R.save();
    if (blink) R.alpha *= 0.35;
    drawPlayer(p.x, p.y, p.expression, flash, p.invincible > 0, skinColors(skinById(w.skin), w.gameTime));
    R.restore();
    if (w.shield) drawShieldBubble(p.x, p.y, w.gameTime);
    for (const o of w.obstacles) if (o.lane >= p.targetLane) drawObstacle(o);
  }

  if (w.goal && w.goal.active) drawGoal(w.goal);
  drawSpeedLines();
  drawParticles();
  if (inRun) {
    // Biome atmospheres go over the world but under the HUD
    drawStorm(stormLevel());
    const dark = biomeWeight('cave');
    if (dark > 0) R.darkness(p.x, p.y, 80 + Math.sin(w.gameTime * 7) * 3, 0.93 * dark);
    drawLaneMarkers();
    drawTutorial();
  }
  drawComboPopups();
  drawCaption();
  drawAchievementBanner();
  drawHUD();
  drawRadar();

  R.restore();
  R.end();
}
