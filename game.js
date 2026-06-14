'use strict';
// ===== CONSTANTS =====
const CW = 480, CH = 270;
const RADAR_H = 26;
const LANE_Y = [210, 160, 110];
const LANE_COUNT = 3;
const BASE_SPEED = 110;
const GOAL_SCORE = 100;
const GOAL_TRAVEL_TIME = 30; // seconds from spawn to arrival
const LANE_ANIM_DUR = 0.15;
const NEAR_MISS_DIST = 6;

// ===== CANVAS SETUP =====
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

function resizeCanvas() {
  const scale = Math.min(window.innerWidth / CW, window.innerHeight / CH);
  canvas.style.width = (CW * scale) + 'px';
  canvas.style.height = (CH * scale) + 'px';
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ===== STATE MACHINE =====
const STATE = { MENU: 0, PLAYING: 1, PAUSED: 2, DEAD: 3, VICTORY: 4, HISCORE: 5 };
let state = STATE.MENU;
const wrapper = document.getElementById('game-wrapper');

function setState(s) {
  state = s;
  const ids = ['overlay-menu', 'overlay-pause', 'overlay-dead', 'overlay-victory', 'overlay-hiscore'];
  const active = [STATE.MENU, STATE.PAUSED, STATE.DEAD, STATE.VICTORY, STATE.HISCORE];
  ids.forEach((id, i) => {
    const el = document.getElementById(id);
    el.classList.toggle('hidden', state !== active[i]);
  });
  wrapper.classList.toggle('playing', state === STATE.PLAYING);
}

// ===== STORAGE =====
const storage = (() => {
  const KH = 'player2_hiscores', KD = 'player2_daily',
    KA = 'player2_achievements', KO = 'player2_options';
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } };
  return {
    getScores: () => load(KH, []),
    saveScore(name, score, stats) {
      const list = this.getScores();
      list.push({ name, score, stats, date: Date.now() });
      list.sort((a, b) => b.score - a.score);
      const trimmed = list.slice(0, 5);
      save(KH, trimmed);
      return trimmed.findIndex(e => e.name === name && e.score === score && e.date === list.find(x => x.name === name && x.score === score)?.date);
    },
    isTopFive(score) { const l = this.getScores(); return l.length < 5 || score > l[l.length - 1].score; },
    getDailyBest() {
      const today = new Date().toISOString().slice(0, 10);
      return (load(KD, {}))[today] || 0;
    },
    saveDailyBest(score) {
      const today = new Date().toISOString().slice(0, 10);
      const d = load(KD, {});
      if (score > (d[today] || 0)) { d[today] = score; save(KD, d); }
    },
    getAchievements: () => load(KA, {}),
    unlockAchievement(id) {
      const a = this.getAchievements();
      if (a[id]) return false;
      a[id] = Date.now(); save(KA, a); return true;
    },
    getOptions: () => load(KO, { volume: 70, showRadar: true, mute: false }),
    saveOptions(o) { save(KO, o); },
    getPlayerName: () => { try { return localStorage.getItem('escapa_playername') || ''; } catch { return ''; } },
    savePlayerName(n) { try { localStorage.setItem('escapa_playername', n); } catch { } },
  };
})();

// ===== OPTIONS STATE =====
let opts = storage.getOptions();
let playerName = storage.getPlayerName() || 'Jugador';

// ===== AUDIO =====
const audio = (() => {
  let ac = null;
  let masterGain = null;
  function getAC() {
    if (!ac) {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ac.createGain();
      masterGain.connect(ac.destination);
      applyVolume();
    }
    return ac;
  }
  function applyVolume() {
    if (!masterGain) return;
    masterGain.gain.value = opts.mute ? 0 : opts.volume / 100;
  }
  function tone(freq, dur, type = 'square', vol = 0.3, delay = 0, slide = null) {
    const a = getAC();
    const osc = a.createOscillator();
    const g = a.createGain();
    osc.connect(g); g.connect(masterGain);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, a.currentTime + delay);
    if (slide) osc.frequency.linearRampToValueAtTime(slide, a.currentTime + delay + dur);
    g.gain.setValueAtTime(0, a.currentTime + delay);
    g.gain.linearRampToValueAtTime(vol, a.currentTime + delay + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + delay + dur);
    osc.start(a.currentTime + delay);
    osc.stop(a.currentTime + delay + dur + 0.01);
  }
  const sounds = {
    jump() { tone(330, 0.06, 'square', 0.2); tone(660, 0.06, 'square', 0.15, 0.04); },
    hit() { tone(180, 0.25, 'sawtooth', 0.45); tone(90, 0.2, 'sawtooth', 0.3, 0.05); },
    powerup() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.12, 'sine', 0.28, i * 0.07)); },
    death() { [400, 300, 200, 130].forEach((f, i) => tone(f, 0.18, 'sawtooth', 0.4, i * 0.1)); },
    victory() {
      [523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, 0.15, 'sine', 0.3, i * 0.1));
      [523, 659, 784].forEach((f, i) => tone(f, 0.5, 'sine', 0.2, 0.7 + i * 0.02));
    },
    pass() { tone(660, 0.04, 'square', 0.1); },
    goalAlarm() { tone(880, 0.12, 'square', 0.3); tone(440, 0.12, 'square', 0.25, 0.15); },
    combo() { tone(880, 0.08, 'sine', 0.22); tone(1100, 0.08, 'sine', 0.2, 0.06); },
    nearMiss() { tone(550, 0.05, 'sine', 0.12); },
    achievement() { [784, 1047, 1319].forEach((f, i) => tone(f, 0.18, 'sine', 0.25, i * 0.08)); },
  };
  return {
    play(name) { try { sounds[name]?.(); } catch { } },
    setVolume(v) { opts.volume = v; applyVolume(); },
    setMute(m) { opts.mute = m; applyVolume(); },
    init() { getAC(); },
  };
})();

// ===== INPUT =====
const keys = {};
window.addEventListener('keydown', e => {
  if (!keys[e.key]) {
    keys[e.key] = true;
    if (state === STATE.PLAYING) {
      if (e.key === 'ArrowUp' || e.key === ' ') { tryMoveLane(1); e.preventDefault(); }
      if (e.key === 'ArrowDown') { tryMoveLane(-1); e.preventDefault(); }
    }
    if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
      if (state === STATE.PLAYING) togglePause();
      else if (state === STATE.PAUSED) togglePause();
      e.preventDefault();
    }
  }
});
window.addEventListener('keyup', e => { keys[e.key] = false; });

let touchStartY = null, touchStartX = null;
canvas.addEventListener('touchstart', e => {
  touchStartY = e.touches[0].clientY;
  touchStartX = e.touches[0].clientX;
  audio.init();
  e.preventDefault();
}, { passive: false });
canvas.addEventListener('touchend', e => {
  if (touchStartY === null) return;
  const dy = touchStartY - e.changedTouches[0].clientY;
  const dx = e.changedTouches[0].clientX - touchStartX;
  if (state === STATE.PLAYING) {
    if (Math.abs(dy) > Math.abs(dx)) {
      if (dy > 25) tryMoveLane(1);
      else if (dy < -25) tryMoveLane(-1);
    }
  }
  touchStartY = null; touchStartX = null;
}, { passive: false });

// ===== SPRITES =====
// All pixel art drawn at 2px per "art pixel"
const P = 2; // pixel scale

function px(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x * P, y * P, w * P, h * P);
}

// Player: 9x9 art pixels centered, expressions vary the face
function drawPlayer(cx, cy, expr, flash, shield) {
  const ox = Math.floor(cx - 9 * P / 2);
  const oy = Math.floor(cy - 9 * P / 2);
  ctx.save();
  ctx.translate(ox, oy);

  // Body gradient (lavender cube)
  const bodyColor = flash > 0 ? '#ffffff' : (shield ? '#e879f9' : '#c084fc');
  const shadowColor = flash > 0 ? '#dddddd' : (shield ? '#a855f7' : '#7c3aed');
  const shineColor = flash > 0 ? '#ffffff' : (shield ? '#f0abfc' : '#e9d5ff');

  // Main body
  for (let row = 1; row <= 7; row++) {
    for (let col = 1; col <= 7; col++) {
      let c = bodyColor;
      if (row === 1 || col === 1) c = shineColor;
      if (row === 7 || col === 7) c = shadowColor;
      ctx.fillStyle = c;
      ctx.fillRect(col * P, row * P, P, P);
    }
  }

  // Shield glow ring
  if (shield && flash === 0) {
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, 9 * P, 9 * P);
  }

  // Face expressions
  ctx.fillStyle = '#1a0a2e';
  if (expr === 'normal') {
    // Eyes
    ctx.fillRect(2 * P, 3 * P, P, P);
    ctx.fillRect(5 * P, 3 * P, P, P);
    // Smile
    ctx.fillRect(2 * P, 6 * P, P, P);
    ctx.fillRect(3 * P, 7 * P, 3 * P, P);
    ctx.fillRect(6 * P, 6 * P, P, P);
  } else if (expr === 'hurt') {
    // X eyes
    ctx.fillRect(2 * P, 3 * P, P, P); ctx.fillRect(4 * P, 3 * P, P, P);
    ctx.fillRect(3 * P, 4 * P, P, P); ctx.fillRect(5 * P, 4 * P, P, P);
    ctx.fillRect(2 * P, 5 * P, P, P); ctx.fillRect(4 * P, 5 * P, P, P);
    // Frown
    ctx.fillRect(2 * P, 7 * P, P, P);
    ctx.fillRect(3 * P, 6 * P, 3 * P, P);
    ctx.fillRect(6 * P, 7 * P, P, P);
  } else if (expr === 'scared') {
    // O eyes
    ctx.fillRect(2 * P, 3 * P, P, 2 * P);
    ctx.fillRect(5 * P, 3 * P, P, 2 * P);
    // Open mouth
    ctx.fillRect(3 * P, 6 * P, P, P);
    ctx.fillRect(4 * P, 6 * P, P, 2 * P);
    ctx.fillRect(5 * P, 6 * P, P, P);
    // Sweat drop (white)
    ctx.fillStyle = '#88ddff';
    ctx.fillRect(7 * P, 2 * P, P, 2 * P);
  } else if (expr === 'rush') {
    // Squint
    ctx.fillRect(2 * P, 4 * P, 2 * P, P);
    ctx.fillRect(5 * P, 4 * P, 2 * P, P);
    // Determined line mouth
    ctx.fillRect(3 * P, 6 * P, 4 * P, P);
  } else if (expr === 'happy') {
    // Big shining eyes
    ctx.fillRect(2 * P, 3 * P, 2 * P, 2 * P);
    ctx.fillRect(5 * P, 3 * P, 2 * P, 2 * P);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(2 * P, 3 * P, P, P);
    ctx.fillRect(5 * P, 3 * P, P, P);
    ctx.fillStyle = '#1a0a2e';
    // Wide smile
    ctx.fillRect(2 * P, 6 * P, P, P);
    ctx.fillRect(3 * P, 7 * P, P, P);
    ctx.fillRect(4 * P, 7 * P, P, P);
    ctx.fillRect(5 * P, 7 * P, P, P);
    ctx.fillRect(6 * P, 6 * P, P, P);
  }

  ctx.restore();
}

function drawZombie(cx, cy, frame) {
  // 6x10 art pixels
  const ox = Math.floor(cx - 3 * P);
  const oy = Math.floor(cy - 5 * P);
  ctx.save(); ctx.translate(ox, oy);
  // Body
  ctx.fillStyle = '#4ade80';
  ctx.fillRect(P, 3 * P, 4 * P, 5 * P);
  // Head
  ctx.fillStyle = '#86efac';
  ctx.fillRect(P, 0, 4 * P, 3 * P);
  // Eyes (red)
  ctx.fillStyle = '#ff2222';
  ctx.fillRect(2 * P, P, P, P);
  ctx.fillRect(4 * P, P, P, P);
  // Arms (animate)
  ctx.fillStyle = '#4ade80';
  if (frame === 0) {
    ctx.fillRect(0, 3 * P, P, 3 * P);
    ctx.fillRect(5 * P, 4 * P, P, 3 * P);
  } else {
    ctx.fillRect(0, 4 * P, P, 3 * P);
    ctx.fillRect(5 * P, 3 * P, P, 3 * P);
  }
  // Legs
  ctx.fillStyle = '#166534';
  if (frame === 0) {
    ctx.fillRect(P, 8 * P, P, 2 * P);
    ctx.fillRect(3 * P, 8 * P, P, 2 * P);
  } else {
    ctx.fillRect(2 * P, 8 * P, P, 2 * P);
    ctx.fillRect(4 * P, 8 * P, P, 2 * P);
  }
  ctx.restore();
}

function drawSpike(cx, cy) {
  // Triangle cluster 12x8
  const ox = Math.floor(cx - 6 * P);
  const oy = Math.floor(cy - 4 * P);
  ctx.save(); ctx.translate(ox, oy);
  const c1 = '#ff4444', c2 = '#ff8888', c3 = '#cc2222';
  // Spike 1 (left)
  ctx.fillStyle = c1;
  ctx.fillRect(0, 6 * P, 4 * P, 2 * P);
  ctx.fillRect(P, 4 * P, 2 * P, 2 * P);
  ctx.fillRect(2 * P, 2 * P, P, 2 * P);
  // Spike 2 (right)
  ctx.fillRect(4 * P, 6 * P, 4 * P, 2 * P);
  ctx.fillRect(5 * P, 4 * P, 2 * P, 2 * P);
  ctx.fillRect(6 * P, 2 * P, P, 2 * P);
  // Shine
  ctx.fillStyle = c2;
  ctx.fillRect(2 * P, 3 * P, P, P);
  ctx.fillRect(6 * P, 3 * P, P, P);
  ctx.restore();
}

function drawBat(cx, cy, frame) {
  // 10x7
  const ox = Math.floor(cx - 5 * P);
  const oy = Math.floor(cy - 3 * P);
  ctx.save(); ctx.translate(ox, oy);
  ctx.fillStyle = '#7c3aed';
  // Body
  ctx.fillRect(4 * P, 2 * P, 2 * P, 3 * P);
  // Eyes
  ctx.fillStyle = '#ff4444';
  ctx.fillRect(4 * P, 2 * P, P, P);
  ctx.fillRect(5 * P, 2 * P, P, P);
  // Wings
  ctx.fillStyle = '#a855f7';
  if (frame === 0) {
    ctx.fillRect(0, P, 4 * P, 3 * P);
    ctx.fillRect(6 * P, P, 4 * P, 3 * P);
  } else {
    ctx.fillRect(0, 3 * P, 4 * P, 3 * P);
    ctx.fillRect(6 * P, 3 * P, 4 * P, 3 * P);
  }
  // Wing membrane
  ctx.fillStyle = '#6d28d9';
  if (frame === 0) {
    ctx.fillRect(P, 0, 2 * P, P);
    ctx.fillRect(7 * P, 0, 2 * P, P);
  } else {
    ctx.fillRect(P, 5 * P, 2 * P, P);
    ctx.fillRect(7 * P, 5 * P, 2 * P, P);
  }
  ctx.restore();
}

function drawGhost(cx, cy, frame, alpha) {
  // 8x9
  const ox = Math.floor(cx - 4 * P);
  const oy = Math.floor(cy - 4 * P);
  ctx.save();
  ctx.globalAlpha = alpha * 0.75;
  ctx.translate(ox, oy);
  ctx.fillStyle = '#88ddff';
  // Head
  ctx.fillRect(P, 0, 6 * P, 5 * P);
  // Body
  ctx.fillRect(0, 3 * P, 8 * P, 4 * P);
  // Wavy bottom
  if (frame === 0) {
    ctx.fillRect(0, 7 * P, 2 * P, 2 * P);
    ctx.fillRect(4 * P, 7 * P, 2 * P, 2 * P);
  } else {
    ctx.fillRect(2 * P, 7 * P, 2 * P, 2 * P);
    ctx.fillRect(6 * P, 7 * P, 2 * P, 2 * P);
  }
  // Eyes (dark)
  ctx.fillStyle = '#1a3a5e';
  ctx.fillRect(2 * P, 2 * P, P, P);
  ctx.fillRect(5 * P, 2 * P, P, P);
  ctx.restore();
}

function drawOrb(cx, cy, pulse) {
  const r = (5 + pulse) * P;
  ctx.save();
  // Glow
  const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 1.5);
  grd.addColorStop(0, 'rgba(255,215,0,0.9)');
  grd.addColorStop(0.5, 'rgba(255,165,0,0.5)');
  grd.addColorStop(1, 'rgba(255,120,0,0)');
  ctx.fillStyle = grd;
  ctx.beginPath(); ctx.arc(cx, cy, r * 1.5, 0, Math.PI * 2); ctx.fill();
  // Core
  ctx.fillStyle = '#ffd700';
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  // M letter
  ctx.fillStyle = '#7c3aed';
  ctx.font = `bold ${6 * P}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('M', cx, cy + P);
  ctx.restore();
}

function drawGoalFlag(cx, cy, flash) {
  ctx.save();
  ctx.translate(Math.floor(cx), Math.floor(cy));
  // Pole
  ctx.fillStyle = '#aaaaaa';
  ctx.fillRect(-P, -20 * P, 2 * P, 20 * P);
  // Flag
  ctx.fillStyle = flash ? '#ffd700' : '#ff6600';
  ctx.fillRect(P, -20 * P, 10 * P, 7 * P);
  // Star on flag
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${8 * P}px monospace`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('★', P * 2, -20 * P);
  // Base
  ctx.fillStyle = '#555';
  ctx.fillRect(-3 * P, 0, 6 * P, 2 * P);
  ctx.restore();
}

// ===== PARTICLES =====
let particles = [];

function spawnSparkles(x, y, count = 8) {
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const spd = 30 + Math.random() * 50;
    const colors = ['#ffd700', '#ffa500', '#ffff44', '#ff8800'];
    particles.push({
      x, y,
      vx: Math.cos(angle) * spd,
      vy: Math.sin(angle) * spd,
      life: 0.45, maxLife: 0.45,
      color: colors[i % colors.length],
      size: 3,
      active: true,
      update(dt) { this.x += this.vx * dt; this.y += this.vy * dt; this.vy += 60 * dt; this.life -= dt; this.active = this.life > 0; },
      draw() {
        const a = Math.max(0, this.life / this.maxLife);
        ctx.globalAlpha = a;
        ctx.fillStyle = this.color;
        ctx.fillRect(Math.floor(this.x), Math.floor(this.y), this.size, this.size);
        ctx.globalAlpha = 1;
      }
    });
  }
}

function spawnHitStars(x, y) {
  for (let i = 0; i < 10; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 50 + Math.random() * 80;
    particles.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: 0.35, maxLife: 0.35, color: i % 2 === 0 ? '#ffffff' : '#ff8888', size: 4, active: true,
      update(dt) { this.x += this.vx * dt; this.y += this.vy * dt; this.life -= dt; this.active = this.life > 0; },
      draw() {
        ctx.globalAlpha = Math.max(0, this.life / this.maxLife);
        ctx.fillStyle = this.color;
        ctx.fillRect(Math.floor(this.x), Math.floor(this.y), this.size, this.size);
        ctx.globalAlpha = 1;
      }
    });
  }
}

function spawnTrail(x, y, color) {
  particles.push({
    x, y, vx: 0, vy: 0, life: 0.18, maxLife: 0.18, color, size: 8, active: true,
    update(dt) { this.life -= dt; this.active = this.life > 0; },
    draw() {
      ctx.globalAlpha = Math.max(0, this.life / this.maxLife) * 0.5;
      ctx.fillStyle = this.color;
      ctx.fillRect(Math.floor(this.x - 4), Math.floor(this.y - 4), this.size, this.size);
      ctx.globalAlpha = 1;
    }
  });
}

function spawnLaneTrailArc(fromY, toY, x) {
  const steps = 6;
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    const y = fromY + (toY - fromY) * t - 20 * Math.sin(t * Math.PI);
    const delay = i * 0.02;
    particles.push({
      x: x - 10 - i * 3, y,
      vx: -20, vy: 0,
      life: 0.3 - delay, maxLife: 0.3,
      color: '#e879f9', size: 4, active: true,
      update(dt) { this.x += this.vx * dt; this.life -= dt; this.active = this.life > 0; },
      draw() {
        ctx.globalAlpha = Math.max(0, this.life / this.maxLife) * 0.6;
        ctx.fillStyle = this.color;
        ctx.fillRect(Math.floor(this.x), Math.floor(this.y), this.size, this.size);
        ctx.globalAlpha = 1;
      }
    });
  }
}

// ===== PLAYER =====
let player;

function createPlayer() {
  return {
    lane: 0,
    prevLane: 0,
    targetLane: 0,
    laneT: 1.0,
    x: 80,
    y: LANE_Y[0],
    w: 16, h: 16,
    hp: 1, maxHp: 1,
    hitFlash: 0,
    invincible: 0,
    expression: 'normal',
    comboStreak: 0,
    comboMultiplier: 1,
    nearMissTimer: 0,
    trailTimer: 0,
    speedDemonTimer: 0,
  };
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

function getLaneY(lane) { return LANE_Y[Math.max(0, Math.min(2, lane))]; }

function updatePlayerY() {
  const fromY = getLaneY(player.prevLane);
  const toY = getLaneY(player.targetLane);
  const arc = -25 * Math.sin(player.laneT * Math.PI);
  const t = easeInOut(player.laneT);
  player.y = fromY + (toY - fromY) * t + arc;
}

function tryMoveLane(dir) {
  if (state !== STATE.PLAYING) return;
  if (player.laneT < 0.85) return;
  const next = Math.max(0, Math.min(2, player.targetLane + dir));
  if (next === player.targetLane) return;
  spawnLaneTrailArc(player.y, getLaneY(next), player.x);
  player.prevLane = player.targetLane;
  player.targetLane = next;
  player.laneT = 0;
  audio.play('jump');
}

// ===== GAME STATE VARS =====
let score = 0;
let hiScore = 0;
let scrollSpeed = BASE_SPEED;
let worldX = 0;
let gameTime = 0;
let obstacles = [];
let goal = null;
let goalSpawned = false;
let goalApproaching = false;
let goalAlarmTimer = 0;
let speedBoost = 1.0;
let shakeX = 0, shakeY = 0;
let shakeDur = 0;
let comboPopups = [];
let achievementBanner = null;
let biomeTransition = null;
let currentBiome = 0;
let runStats = {};
let sessionStart = 0;

// ===== OBSTACLES =====
function obsW(type) {
  return { zombie: 12, spike: 16, bat: 20, ghost: 16, pit: 36, orb: 12 }[type] || 12;
}
function obsH(type) {
  return { zombie: 20, spike: 10, bat: 14, ghost: 16, pit: 20, orb: 12 }[type] || 12;
}

function makeObs(type, lane, x) {
  const w = obsW(type), h = obsH(type);
  const laneY = LANE_Y[lane];
  const yOff = { zombie: 0, spike: 5, bat: -4, ghost: -3, pit: 0, orb: -5 }[type] || 0;
  return {
    type, lane, x,
    y: laneY + yOff,
    w, h,
    active: true,
    frame: 0,
    frameTimer: 0,
    animSpeed: 0.2,
    sineOffset: Math.random() * Math.PI * 2,
    passed: false,
    scored: false,
    update(dt, spd) {
      this.x -= spd * dt;
      this.frameTimer += dt;
      if (this.frameTimer >= this.animSpeed) { this.frame = 1 - this.frame; this.frameTimer = 0; }
      if (type === 'bat') this.y = LANE_Y[lane] - 4 + Math.sin(gameTime * 3 + this.sineOffset) * 6;
      if (type === 'ghost') this.y = LANE_Y[lane] - 3 + Math.sin(gameTime * 2 + this.sineOffset) * 8;
      if (this.x < -60) this.active = false;
    },
    draw() {
      const cx = Math.floor(this.x + this.w / 2);
      const cy = Math.floor(this.y);
      if (type === 'zombie') drawZombie(cx, cy, this.frame);
      else if (type === 'spike') drawSpike(cx, cy);
      else if (type === 'bat') drawBat(cx, cy, this.frame);
      else if (type === 'ghost') drawGhost(cx, cy, this.frame, 1);
      else if (type === 'pit') drawPit(this);
      else if (type === 'orb') drawOrb(cx, cy, Math.sin(gameTime * 4) * 0.5 + 0.5);
    },
  };
}

function drawPit(obs) {
  // Jagged hole in ground
  ctx.fillStyle = '#111111';
  ctx.fillRect(Math.floor(obs.x), Math.floor(obs.y - 4), Math.floor(obs.w), 24);
  ctx.fillStyle = '#ff4400';
  for (let i = 0; i < obs.w; i += 6) {
    ctx.fillRect(Math.floor(obs.x + i), Math.floor(obs.y + 16), 3, 4);
  }
}

// ===== SPAWNER =====
let spawner = { timer: 0, minInterval: 1.2 };

const SPAWN_PATTERNS = [
  { weight: 3, fn: () => [makeObs('zombie', 0, CW + 10)] },
  { weight: 2, fn: () => [makeObs('zombie', 1, CW + 10)] },
  { weight: 2, fn: () => [makeObs('bat', 2, CW + 10)] },
  { weight: 2, fn: () => [makeObs('bat', 1, CW + 10)] },
  { weight: 2, fn: () => [makeObs('spike', 0, CW + 10)] },
  { weight: 1, fn: () => [makeObs('ghost', 2, CW + 10)] },
  { weight: 1, fn: () => [makeObs('pit', 0, CW + 10)] },
  { weight: 1, fn: () => [makeObs('zombie', 1, CW + 10), makeObs('bat', 2, CW + 20)] },
  { weight: 1, fn: () => [makeObs('spike', 0, CW + 10), makeObs('ghost', 2, CW + 10)] },
];
const TOTAL_WEIGHT = SPAWN_PATTERNS.reduce((s, p) => s + p.weight, 0);

function spawnOrb() {
  const lane = Math.floor(Math.random() * 3);
  obstacles.push(makeObs('orb', lane, CW + 10));
}

function pickPattern() {
  let r = Math.random() * TOTAL_WEIGHT;
  for (const p of SPAWN_PATTERNS) { r -= p.weight; if (r <= 0) return p.fn(); }
  return SPAWN_PATTERNS[0].fn();
}

function updateSpawner(dt) {
  spawner.timer -= dt;
  if (spawner.timer <= 0) {
    const interval = Math.max(0.45, spawner.minInterval - score * 0.005);
    spawner.timer = interval + Math.random() * 0.3;
    // Occasionally spawn an orb instead when HP < maxHp
    if (player.hp < player.maxHp && Math.random() < 0.15) {
      spawnOrb();
    } else {
      pickPattern().forEach(o => obstacles.push(o));
    }
  }
}

// ===== GOAL =====
function spawnGoal() {
  const speed = scrollSpeed * speedBoost;
  const dist = speed * GOAL_TRAVEL_TIME;
  goal = {
    x: CW + dist,
    y: LANE_Y[0],
    w: 20, h: 40,
    active: true,
    flash: false,
    flashTimer: 0,
    update(dt, spd) {
      this.x -= spd * dt;
      this.flashTimer += dt;
      if (this.flashTimer > 0.4) { this.flash = !this.flash; this.flashTimer = 0; }
    },
    draw() {
      drawGoalFlag(Math.floor(this.x), Math.floor(this.y), this.flash);
    }
  };
  goalAlarmTimer = 0;
}

// ===== BIOMES =====
const BIOMES = [
  { scoreStart: 0, name: 'city' },
  { scoreStart: 34, name: 'forest' },
  { scoreStart: 67, name: 'sky' },
];

let biomeAlpha = 1.0;

function drawBiome(name, offsetFar, offsetMid, offsetNear, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;

  if (name === 'city') {
    // Sky gradient
    const sky = ctx.createLinearGradient(0, RADAR_H, 0, CH);
    sky.addColorStop(0, '#1a1a2e');
    sky.addColorStop(1, '#16213e');
    ctx.fillStyle = sky;
    ctx.fillRect(0, RADAR_H, CW, CH - RADAR_H);

    // Far buildings (layer 1)
    ctx.fillStyle = '#0f3460';
    for (let i = 0; i < 12; i++) {
      const bx = ((i * 50 - offsetFar * 0.12) % (CW + 50) + CW + 50) % (CW + 50) - 50;
      const bh = 30 + (i % 4) * 18;
      ctx.fillRect(Math.floor(bx), CH - bh - 28, 28, bh);
      // Windows
      ctx.fillStyle = Math.random() > 0.7 ? '#ffd700' : '#1a3a5e';
      for (let wy = CH - bh - 24; wy < CH - 32; wy += 10) {
        for (let wx = Math.floor(bx) + 4; wx < Math.floor(bx) + 24; wx += 8) {
          ctx.fillRect(wx, wy, 4, 4);
        }
      }
      ctx.fillStyle = '#0f3460';
    }

    // Mid buildings (layer 2)
    ctx.fillStyle = '#e94560';
    for (let i = 0; i < 8; i++) {
      const bx = ((i * 70 + 20 - offsetMid * 0.3) % (CW + 70) + CW + 70) % (CW + 70) - 70;
      const bh = 20 + (i % 3) * 12;
      ctx.fillRect(Math.floor(bx), CH - bh - 28, 35, bh);
      ctx.fillStyle = '#c0392b';
      ctx.fillRect(Math.floor(bx), CH - bh - 28, 35, 4);
      ctx.fillStyle = '#e94560';
    }

    // Ground / road
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, CH - 28, CW, 28);
    ctx.fillStyle = '#333';
    ctx.fillRect(0, CH - 28, CW, 3);
    // Road markings
    ctx.fillStyle = '#ffff00';
    const markOff = Math.floor(offsetNear * 0.7) % 50;
    for (let i = -1; i < CW / 50 + 1; i++) {
      ctx.fillRect(i * 50 - markOff, CH - 15, 20, 3);
    }
    // Streetlights
    ctx.fillStyle = '#888';
    for (let i = 0; i < 8; i++) {
      const lx = ((i * 80 - offsetNear * 0.6) % (CW + 80) + CW + 80) % (CW + 80) - 80;
      ctx.fillRect(Math.floor(lx), CH - 55, 3, 27);
      ctx.fillRect(Math.floor(lx) - 5, CH - 55, 13, 3);
      ctx.fillStyle = '#fffaaa';
      ctx.fillRect(Math.floor(lx) - 5, CH - 52, 13, 4);
      ctx.fillStyle = '#888';
    }

  } else if (name === 'forest') {
    // Sky
    const sky = ctx.createLinearGradient(0, RADAR_H, 0, CH);
    sky.addColorStop(0, '#0d2b1a');
    sky.addColorStop(1, '#1a4a2e');
    ctx.fillStyle = sky;
    ctx.fillRect(0, RADAR_H, CW, CH - RADAR_H);

    // Far trees
    ctx.fillStyle = '#1a4a2e';
    for (let i = 0; i < 10; i++) {
      const tx = ((i * 60 - offsetFar * 0.1) % (CW + 60) + CW + 60) % (CW + 60) - 60;
      ctx.fillRect(Math.floor(tx) + 10, CH - 85, 8, 57);
      ctx.fillStyle = '#1a4a2e';
      ctx.beginPath();
      ctx.moveTo(Math.floor(tx) + 14, CH - 110);
      ctx.lineTo(Math.floor(tx) + 2, CH - 72);
      ctx.lineTo(Math.floor(tx) + 26, CH - 72);
      ctx.fill();
      ctx.fillStyle = '#1a4a2e';
    }

    // Mid layer mushrooms + glowing plants
    ctx.fillStyle = '#2d6e3a';
    for (let i = 0; i < 14; i++) {
      const mx = ((i * 40 + 10 - offsetMid * 0.35) % (CW + 40) + CW + 40) % (CW + 40) - 40;
      const mh = 8 + (i % 3) * 6;
      ctx.fillRect(Math.floor(mx), CH - 28 - mh, 10, mh);
      ctx.fillStyle = i % 2 === 0 ? '#e53e3e' : '#ff69b4';
      ctx.beginPath();
      ctx.arc(Math.floor(mx) + 5, CH - 28 - mh, 8, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = '#2d6e3a';
    }

    // Ground
    ctx.fillStyle = '#2d5a27';
    ctx.fillRect(0, CH - 28, CW, 28);
    ctx.fillStyle = '#3d7a37';
    ctx.fillRect(0, CH - 28, CW, 4);
    // Grass tufts
    ctx.fillStyle = '#4caf50';
    for (let i = 0; i < CW; i += 12) {
      const gx = (i - Math.floor(offsetNear * 0.65) % 12 + 12) % (CW + 12) - 12;
      ctx.fillRect(Math.floor(gx), CH - 32, 3, 4);
      ctx.fillRect(Math.floor(gx) + 5, CH - 31, 3, 3);
    }

    // Fireflies
    ctx.fillStyle = '#aaff44';
    const fireCount = 12;
    for (let i = 0; i < fireCount; i++) {
      const ft = (gameTime * 0.8 + i * 1.1) % (Math.PI * 2);
      const fx = ((i * 43 - offsetNear * 0.2) % CW + CW) % CW;
      const fy = CH - 60 - (i % 4) * 20 + Math.sin(ft * 2 + i) * 8;
      ctx.globalAlpha = alpha * (0.5 + 0.5 * Math.sin(ft * 3 + i));
      ctx.fillRect(Math.floor(fx), Math.floor(fy), 2, 2);
      ctx.globalAlpha = alpha;
    }

  } else if (name === 'sky') {
    // Night sky
    const sky = ctx.createLinearGradient(0, RADAR_H, 0, CH);
    sky.addColorStop(0, '#050520');
    sky.addColorStop(0.5, '#0a0a3a');
    sky.addColorStop(1, '#1a0a3a');
    ctx.fillStyle = sky;
    ctx.fillRect(0, RADAR_H, CW, CH - RADAR_H);

    // Stars (far, slow)
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 40; i++) {
      const sx = ((i * 37 + 5 - offsetFar * 0.05) % (CW + 4) + CW + 4) % (CW + 4) - 4;
      const sy = RADAR_H + 5 + (i * 17) % (CH - RADAR_H - 60);
      const blink = Math.sin(gameTime * 1.5 + i * 0.7);
      ctx.globalAlpha = alpha * (0.4 + 0.4 * (blink * 0.5 + 0.5));
      ctx.fillRect(Math.floor(sx), Math.floor(sy), i % 4 === 0 ? 2 : 1, i % 4 === 0 ? 2 : 1);
      ctx.globalAlpha = alpha;
    }

    // Aurora bands
    for (let band = 0; band < 3; band++) {
      const colors = ['rgba(0,200,150,', 'rgba(100,0,200,', 'rgba(0,100,255,'];
      const gy = RADAR_H + 30 + band * 25;
      const gAlpha = 0.15 + 0.1 * Math.sin(gameTime * 0.5 + band * 1.2);
      ctx.fillStyle = colors[band] + gAlpha + ')';
      const waveOff = Math.sin(gameTime * 0.3 + band) * 20;
      ctx.fillRect(0, Math.floor(gy + waveOff), CW, 15);
    }

    // Mid clouds
    ctx.fillStyle = '#1a2060';
    for (let i = 0; i < 6; i++) {
      const cx2 = ((i * 90 + 15 - offsetMid * 0.25) % (CW + 90) + CW + 90) % (CW + 90) - 90;
      const cy2 = RADAR_H + 40 + (i % 3) * 25;
      ctx.globalAlpha = alpha * 0.7;
      ctx.beginPath();
      ctx.arc(Math.floor(cx2) + 20, Math.floor(cy2), 18, 0, Math.PI * 2);
      ctx.arc(Math.floor(cx2) + 38, Math.floor(cy2) - 8, 12, 0, Math.PI * 2);
      ctx.arc(Math.floor(cx2) + 50, Math.floor(cy2), 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = alpha;
    }

    // Near platform clouds (decorative ground-level)
    ctx.fillStyle = '#2a1a4a';
    ctx.fillRect(0, CH - 28, CW, 28);
    // Cloud floor
    ctx.fillStyle = '#3a2a6a';
    ctx.fillRect(0, CH - 28, CW, 4);
    for (let i = 0; i < 10; i++) {
      const px2 = ((i * 55 - offsetNear * 0.55) % (CW + 55) + CW + 55) % (CW + 55) - 55;
      ctx.globalAlpha = alpha * 0.6;
      ctx.beginPath();
      ctx.arc(Math.floor(px2) + 12, CH - 30, 12, Math.PI, 0);
      ctx.fill();
      ctx.globalAlpha = alpha;
    }
  }

  ctx.restore();
}

function getBiomeName(index) { return BIOMES[Math.min(index, BIOMES.length - 1)].name; }

function drawBackground() {
  const off = worldX;

  if (biomeTransition) {
    drawBiome(getBiomeName(biomeTransition.from), off, off, off, 1.0);
    drawBiome(getBiomeName(biomeTransition.to), off, off, off, biomeTransition.t);
  } else {
    drawBiome(getBiomeName(currentBiome), off, off, off, 1.0);
  }

  // Lane guide lines
  for (let lane = 0; lane < LANE_COUNT; lane++) {
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 8]);
    ctx.beginPath();
    ctx.moveTo(0, LANE_Y[lane] + 10);
    ctx.lineTo(CW, LANE_Y[lane] + 10);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

// ===== RADAR =====
const RADAR_COLORS = {
  zombie: '#7CFC00', spike: '#FF4444', bat: '#AA88FF',
  ghost: '#88DDFF', pit: '#FF8800', orb: '#FFD700',
};
const LANE_ROW_Y = [18, 11, 4]; // bottom/mid/top within radar strip

function drawRadar() {
  if (!opts.showRadar) return;

  // Background
  ctx.fillStyle = '#0a0a18';
  ctx.fillRect(0, 0, CW, RADAR_H);

  // Lane row bands
  const rowH = 6;
  for (let l = 0; l < LANE_COUNT; l++) {
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    ctx.fillRect(0, LANE_ROW_Y[l], CW, rowH);
  }

  const LOOK = 2800;

  // Player marker
  ctx.fillStyle = '#c084fc';
  for (let l = 0; l < LANE_COUNT; l++) {
    if (l === player.targetLane) {
      ctx.fillRect(Math.floor(player.x / CW * 0), 0, 3, RADAR_H);
    }
  }
  ctx.fillStyle = '#e879f9';
  ctx.fillRect(0, 0, 3, RADAR_H);

  // Obstacles
  obstacles.forEach(obs => {
    const dist = obs.x - player.x;
    if (dist < 0 || dist > LOOK) return;
    const rx = Math.floor((dist / LOOK) * (CW - 4)) + 4;
    const lane = obs.lane ?? 0;
    ctx.fillStyle = RADAR_COLORS[obs.type] || '#aaaaaa';
    ctx.fillRect(rx, LANE_ROW_Y[lane], 3, 6);
  });

  // Goal beacon
  if (goal && goal.active) {
    const dist = goal.x - player.x;
    if (dist >= 0 && dist < LOOK * 3) {
      const rx = Math.min(CW - 4, Math.floor((dist / LOOK) * (CW - 4)) + 4);
      ctx.fillStyle = goal.flash ? '#FFD700' : '#FF8C00';
      ctx.fillRect(rx, 0, 4, RADAR_H);
    }
  }

  // Divider
  ctx.fillStyle = '#a855f7';
  ctx.fillRect(0, RADAR_H - 1, CW, 1);
}

// ===== HUD =====
function drawHUD() {
  // Score
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold 14px "Courier New"`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(`${score}`, 6, RADAR_H + 4);

  // Multiplier
  if (player.comboMultiplier > 1) {
    ctx.fillStyle = ['', '', '#ffd700', '#ff8c00', '#ff4500'][player.comboMultiplier];
    ctx.font = `bold 10px "Courier New"`;
    ctx.fillText(`x${player.comboMultiplier}`, 6, RADAR_H + 20);
  }

  // Streak
  if (player.comboStreak > 0) {
    ctx.fillStyle = '#88ddff';
    ctx.font = `9px "Courier New"`;
    ctx.fillText(`${player.comboStreak} streak`, 6, RADAR_H + 30);
  }

  // HP hearts + player name
  ctx.textAlign = 'right';
  ctx.font = `12px "Courier New"`;
  for (let i = 0; i < player.maxHp; i++) {
    ctx.fillStyle = i < player.hp ? '#ff4466' : '#442233';
    ctx.fillText('♥', CW - 6 - i * 18, RADAR_H + 4);
  }
  ctx.fillStyle = '#8888aa';
  ctx.font = `8px "Courier New"`;
  ctx.fillText(playerName, CW - 6 - player.maxHp * 18 - 4, RADAR_H + 6);

  // Goal warning
  if (goalApproaching) {
    const pulse = Math.sin(gameTime * 8) * 0.5 + 0.5;
    ctx.fillStyle = `rgba(255,${Math.floor(100 + pulse * 155)},0,${0.7 + pulse * 0.3})`;
    ctx.font = `bold 10px "Courier New"`;
    ctx.textAlign = 'center';
    ctx.fillText('¡LA META SE ACERCA!', CW / 2, RADAR_H + 4);
    ctx.textAlign = 'left';
  }

  // High score
  ctx.fillStyle = '#666688';
  ctx.font = `8px "Courier New"`;
  ctx.textAlign = 'center';
  if (score >= hiScore && score > 0) {
    ctx.fillStyle = '#ffd700';
    ctx.fillText('¡NUEVO RÉCORD!', CW / 2, CH - 8);
  }
  ctx.textAlign = 'left';
}

// ===== COMBO SYSTEM =====
function onObstacleAvoided(obs) {
  const pts = player.comboMultiplier;
  score += pts;
  player.comboStreak++;
  audio.play('pass');

  // Bump multiplier every 5
  const newMult = Math.min(4, 1 + Math.floor(player.comboStreak / 5));
  if (newMult > player.comboMultiplier) {
    player.comboMultiplier = newMult;
    showComboPopup(newMult);
    audio.play('combo');
  }
  if (player.comboStreak === 10) { achievementsCheck('untouchable_10'); }
  if (player.comboMultiplier === 4) { achievementsCheck('max_combo'); }

  spawnSparkles(obs.x + obs.w / 2, obs.y, 6);

  // Check goal spawn
  if (!goalSpawned && score >= GOAL_SCORE) {
    goalSpawned = true;
    spawnGoal();
    goalApproaching = true;
    audio.play('goalAlarm');
  }
}

function showComboPopup(mult) {
  const msgs = { 2: 'x2 COMBO!', 3: 'x3 COMBO!', 4: 'UNTOUCHABLE!' };
  comboPopups.push({
    text: msgs[mult] || '',
    x: CW / 2,
    y: 140,
    life: 1.2, maxLife: 1.2,
    vy: -20,
    color: ['', '', '#ffd700', '#ff8c00', '#ff4444'][mult],
  });
}

function updateComboPopups(dt) {
  comboPopups = comboPopups.filter(p => {
    p.y += p.vy * dt;
    p.life -= dt;
    return p.life > 0;
  });
}

function drawComboPopups() {
  comboPopups.forEach(p => {
    const a = Math.min(1, p.life / p.maxLife * 2);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    ctx.font = `bold 14px "Courier New"`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(p.text, p.x, p.y);
    ctx.restore();
  });
}

// ===== ACHIEVEMENTS =====
const ACHIEVEMENT_DEFS = {
  first_escape: { name: '¡Primera escapada!', icon: '🎉' },
  untouchable_10: { name: 'Intocable x10', icon: '🛡' },
  max_combo: { name: 'Combo máximo', icon: '🔥' },
  speed_demon: { name: 'Demonio de velocidad', icon: '⚡' },
  comeback: { name: 'Regreso épico', icon: '💜' },
};

function achievementsCheck(id) {
  if (storage.unlockAchievement(id)) {
    const def = ACHIEVEMENT_DEFS[id];
    achievementBanner = {
      text: `${def.icon} ${def.name}`,
      life: 2.5, maxLife: 2.5,
    };
    audio.play('achievement');
  }
}

function updateAchievementBanner(dt) {
  if (!achievementBanner) return;
  achievementBanner.life -= dt;
  if (achievementBanner.life <= 0) achievementBanner = null;
}

function drawAchievementBanner() {
  if (!achievementBanner) return;
  const a = Math.min(1, achievementBanner.life / achievementBanner.maxLife * 3);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = '#7c3aed';
  ctx.fillRect(0, CH - 28, CW, 22);
  ctx.strokeStyle = '#ffd700';
  ctx.lineWidth = 1;
  ctx.strokeRect(0, CH - 28, CW, 22);
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold 10px "Courier New"`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('LOGRO: ' + achievementBanner.text, CW / 2, CH - 17);
  ctx.restore();
}

// ===== SPEED LINES =====
function drawSpeedLines() {
  if (speedBoost < 1.6) return;
  const intensity = Math.min(1, (speedBoost - 1.6) / 0.8);
  ctx.save();
  ctx.globalAlpha = intensity * 0.35;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  const cx2 = player.x;
  const cy2 = player.y;
  for (let i = 0; i < 10; i++) {
    const angle = (i / 10) * Math.PI * 2 + gameTime * 2;
    const len = 60 + Math.sin(gameTime * 3 + i) * 20;
    ctx.beginPath();
    ctx.moveTo(cx2 + Math.cos(angle) * 15, cy2 + Math.sin(angle) * 15);
    ctx.lineTo(cx2 + Math.cos(angle) * len, cy2 + Math.sin(angle) * len);
    ctx.stroke();
  }
  ctx.restore();
}

// ===== GAME LOGIC =====
function rectOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  const shrink = 0.18;
  const ax2 = ax + aw * shrink, aw2 = aw * (1 - 2 * shrink), ay2 = ay + ah * shrink, ah2 = ah * (1 - 2 * shrink);
  return ax2 < bx + bw && ax2 + aw2 > bx && ay2 < by + bh && ay2 + ah2 > by;
}

function hitPlayer() {
  if (player.invincible > 0) return;
  player.hp--;
  player.hitFlash = 0.3;
  player.invincible = 1.2;
  player.comboStreak = 0;
  player.comboMultiplier = 1;
  shakeDur = 0.25;
  audio.play('hit');
  spawnHitStars(player.x, player.y);
  if (player.hp <= 0) {
    triggerDeath();
  }
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
  if (player.hp === 1 && player.maxHp > 1) achievementsCheck('comeback');
  showVictoryScreen();
}

function checkCollisions() {
  const px = player.x - player.w / 2;
  const py = player.y - player.h / 2;

  obstacles.forEach(obs => {
    if (!obs.active) return;
    if (obs.type === 'pit') {
      // Award point when pit passes player while player is safe (not in bottom lane)
      if (!obs.passed && obs.x + obs.w < player.x - player.w / 2) {
        obs.passed = true;
        if (!obs.scored) {
          obs.scored = true;
          if (player.targetLane > 0) onObstacleAvoided(obs); // safe
        }
      }
      // Collision only while in bottom lane
      if (player.targetLane === 0) {
        if (player.x + player.w / 2 > obs.x && player.x - player.w / 2 < obs.x + obs.w) {
          hitPlayer();
        }
      }
      return;
    }
    if (obs.type === 'orb') {
      if (rectOverlap(px, py, player.w, player.h, obs.x, obs.y - obs.h / 2, obs.w, obs.h)) {
        if (player.hp < 2) {
          player.hp = Math.min(2, player.hp + 1);
          player.maxHp = Math.max(player.maxHp, 2);
          audio.play('powerup');
          spawnSparkles(obs.x, obs.y, 12);
        }
        obs.active = false;
      }
      return;
    }

    const obsLaneMatch = obs.lane === player.targetLane;
    if (!obsLaneMatch) {
      if (!obs.passed && obs.x + obs.w < player.x - player.w / 2) {
        obs.passed = true;
        if (!obs.scored) { obs.scored = true; onObstacleAvoided(obs); }
        // Near miss: adjacent lane, close horizontal proximity
        if (Math.abs(obs.lane - player.targetLane) === 1 &&
          obs.x + obs.w > player.x - player.w) {
          player.nearMissTimer = 0.3;
          audio.play('nearMiss');
        }
      }
      return;
    }

    if (rectOverlap(px, py, player.w, player.h, obs.x, obs.y - obs.h / 2, obs.w, obs.h)) {
      hitPlayer();
      obs.active = false;
    } else if (!obs.passed && obs.x + obs.w < player.x - player.w / 2) {
      obs.passed = true;
      if (!obs.scored) { obs.scored = true; onObstacleAvoided(obs); }
    }
  });

  // Goal collision
  if (goal && goal.active) {
    if (goal.x <= player.x + player.w / 2 + 10) {
      goal.active = false;
      triggerVictory();
    }
  }
}

// ===== SCREEN OVERLAYS =====
function buildStatsHTML(statsObj) {
  const rows = [
    ['Puntuación', statsObj.score],
    ['Máx. racha', statsObj.maxStreak],
    ['Multiplicador', 'x' + statsObj.maxMult],
    ['Tiempo', statsObj.time + 's'],
    ['Mundos', statsObj.biomes],
    ['Récord diario', statsObj.dailyBest],
  ];
  return rows.map(([k, v]) =>
    `<div class="stat-row"><span class="stat-label">${k}</span><span class="stat-value">${v}</span></div>`
  ).join('');
}

function collectStats() {
  return {
    score,
    maxStreak: runStats.maxStreak || 0,
    maxMult: runStats.maxMult || 1,
    time: Math.floor(gameTime),
    biomes: currentBiome + 1,
    dailyBest: storage.getDailyBest(),
  };
}

function showDeadScreen() {
  const stats = collectStats();
  storage.saveDailyBest(score);
  storage.saveScore(playerName, score, runStats);
  document.getElementById('dead-stats').innerHTML = buildStatsHTML(stats);
}

function showVictoryScreen() {
  const stats = collectStats();
  storage.saveDailyBest(score);
  storage.saveScore(playerName, score, runStats);
  document.getElementById('victory-stats').innerHTML = buildStatsHTML(stats);
  setTimeout(() => {
    renderScoresList();
    setState(STATE.HISCORE);
  }, 2500);
}

function renderScoresList() {
  const scores = storage.getScores();
  const medals = ['🥇', '🥈', '🥉', '  ', '  '];
  const html = scores.map((s, i) =>
    `<div class="score-entry">
      <span class="score-rank">${medals[i] || i + 1}</span>
      <span class="score-name">${s.name}</span>
      <span class="score-pts">${s.score}pts</span>
    </div>`
  ).join('') || '<p style="color:#666;font-size:11px;padding:8px">Sin récords aún</p>';
  document.getElementById('scores-list').innerHTML = html;
}

function togglePause() {
  if (state === STATE.PLAYING) {
    setState(STATE.PAUSED);
  } else if (state === STATE.PAUSED) {
    setState(STATE.PLAYING);
  }
}

// ===== RESET / START =====
let maxStreakThisRun = 0;
let maxMultThisRun = 1;

function startGame() {
  audio.init();
  player = createPlayer();
  score = 0;
  hiScore = storage.getScores()[0]?.score || 0;
  scrollSpeed = BASE_SPEED;
  worldX = 0;
  gameTime = 0;
  sessionStart = 0;
  obstacles = [];
  goal = null;
  goalSpawned = false;
  goalApproaching = false;
  goalAlarmTimer = 0;
  speedBoost = 1.0;
  shakeX = 0; shakeY = 0; shakeDur = 0;
  comboPopups = [];
  achievementBanner = null;
  biomeTransition = null;
  currentBiome = 0;
  spawner.timer = 1.5;
  particles = [];
  runStats = {};
  maxStreakThisRun = 0;
  maxMultThisRun = 1;
  setState(STATE.PLAYING);
}

// ===== GAME LOOP =====
let lastTs = 0;

function update(dt) {
  gameTime += dt;
  worldX += scrollSpeed * speedBoost * dt;

  // Biome transitions
  const newBiome = BIOMES.reduce((cur, b, i) => score >= b.scoreStart ? i : cur, 0);
  if (newBiome !== currentBiome && !biomeTransition) {
    biomeTransition = { from: currentBiome, to: newBiome, t: 0, dur: 3.0 };
  }
  if (biomeTransition) {
    biomeTransition.t += dt / biomeTransition.dur;
    if (biomeTransition.t >= 1) {
      currentBiome = biomeTransition.to;
      biomeTransition = null;
    }
  }

  // Speed boost when goal approaching
  if (goalApproaching) {
    goalAlarmTimer += dt;
    if (goalAlarmTimer > 3.0 && Math.floor(goalAlarmTimer) !== Math.floor(goalAlarmTimer - dt)) {
      audio.play('goalAlarm');
    }
    speedBoost = Math.min(2.5, 1.0 + (goalAlarmTimer / GOAL_TRAVEL_TIME) * 1.5);

    // Speed demon achievement
    if (speedBoost >= 2.4) {
      player.speedDemonTimer = (player.speedDemonTimer || 0) + dt;
      if (player.speedDemonTimer >= 10) achievementsCheck('speed_demon');
    }
  }

  // Screen shake
  if (shakeDur > 0) {
    shakeDur -= dt;
    shakeX = (Math.random() - 0.5) * 6;
    shakeY = (Math.random() - 0.5) * 6;
  } else { shakeX = 0; shakeY = 0; }

  // Player
  if (player.laneT < 1) {
    player.laneT = Math.min(1, player.laneT + dt / LANE_ANIM_DUR);
    if (player.laneT >= 1) player.lane = player.targetLane;
  }
  updatePlayerY();
  if (player.hitFlash > 0) player.hitFlash -= dt;
  if (player.invincible > 0) player.invincible -= dt;
  if (player.nearMissTimer > 0) player.nearMissTimer -= dt;

  // Expression
  if (player.hp === 0) player.expression = 'hurt';
  else if (player.hitFlash > 0) player.expression = 'hurt';
  else if (player.nearMissTimer > 0) player.expression = 'scared';
  else if (goalApproaching && speedBoost > 1.8) player.expression = 'rush';
  else player.expression = 'normal';

  // Trail at high speed
  if (goalApproaching && speedBoost > 1.5) {
    player.trailTimer -= dt;
    if (player.trailTimer <= 0) {
      spawnTrail(player.x, player.y, player.invincible > 0 ? '#e879f9' : '#7c3aed');
      player.trailTimer = 0.05;
    }
  }

  // Track run stats
  if (player.comboStreak > maxStreakThisRun) maxStreakThisRun = player.comboStreak;
  if (player.comboMultiplier > maxMultThisRun) maxMultThisRun = player.comboMultiplier;
  runStats.maxStreak = maxStreakThisRun;
  runStats.maxMult = maxMultThisRun;

  // Obstacles
  const spd = scrollSpeed * speedBoost;
  obstacles.forEach(o => o.update(dt, spd));
  obstacles = obstacles.filter(o => o.active);

  if (goal) {
    goal.update(dt, spd);
    if (!goal.active && !goalSpawned) goal = null;
  }

  updateSpawner(dt);
  checkCollisions();
  updateComboPopups(dt);
  updateAchievementBanner(dt);

  // Particles
  particles.forEach(p => p.update(dt));
  particles = particles.filter(p => p.active);
}

function render() {
  ctx.save();
  ctx.translate(Math.floor(shakeX), Math.floor(shakeY));

  // Background
  drawBackground();

  if (state === STATE.PLAYING || state === STATE.PAUSED) {
    // Obstacles behind player
    obstacles.forEach(o => {
      if (o.lane < player.targetLane) o.draw();
    });

    // Player
    const flash = player.hitFlash > 0 && Math.floor(player.hitFlash * 12) % 2 === 0;
    const shield = player.maxHp > 1;
    drawPlayer(player.x, player.y, player.expression, flash, shield);

    // Obstacles in front of/at player lane
    obstacles.forEach(o => {
      if (o.lane >= player.targetLane) o.draw();
    });
  }

  // Goal
  if (goal && goal.active) goal.draw();

  // Speed lines
  drawSpeedLines();

  // Particles
  particles.forEach(p => p.draw());

  // Combo popups
  drawComboPopups();

  // Achievement banner
  drawAchievementBanner();

  // HUD
  drawHUD();

  // Radar
  drawRadar();

  ctx.restore();
}

function loop(ts) {
  const dt = Math.min((ts - lastTs) / 1000, 0.05);
  lastTs = ts;
  if (state === STATE.PLAYING) update(dt);
  render();
  requestAnimationFrame(loop);
}

// ===== INIT =====
function readMenuName() {
  const input = document.getElementById('menu-name-input');
  const name = input.value.trim();
  return name || 'Jugador';
}

function bindUI() {
  // Menu name input — populate with saved name
  const menuNameInput = document.getElementById('menu-name-input');
  menuNameInput.value = playerName !== 'Jugador' ? playerName : storage.getPlayerName();
  menuNameInput.addEventListener('input', () => {
    playerName = menuNameInput.value.trim() || 'Jugador';
    storage.savePlayerName(menuNameInput.value.trim());
  });
  menuNameInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('btn-start').click();
  });

  // Menu
  document.getElementById('btn-start').addEventListener('click', () => {
    audio.init();
    playerName = readMenuName();
    storage.savePlayerName(playerName);
    startGame();
  });
  document.getElementById('btn-hiscores-menu').addEventListener('click', () => {
    audio.init(); renderScoresList();
    setState(STATE.HISCORE);
  });

  // Pause
  document.getElementById('btn-resume').addEventListener('click', togglePause);
  document.getElementById('btn-restart-pause').addEventListener('click', startGame);
  document.getElementById('btn-menu-pause').addEventListener('click', () => setState(STATE.MENU));

  // Dead
  document.getElementById('btn-restart-dead').addEventListener('click', startGame);
  document.getElementById('btn-menu-dead').addEventListener('click', () => setState(STATE.MENU));

  // Victory
  document.getElementById('btn-restart-victory').addEventListener('click', startGame);
  document.getElementById('btn-menu-victory').addEventListener('click', () => setState(STATE.MENU));

  // High scores
  document.getElementById('btn-close-hiscores').addEventListener('click', () => setState(STATE.MENU));

  // Mobile pause
  document.getElementById('pause-btn').addEventListener('click', () => { audio.init(); togglePause(); });

  // Options
  const volSlider = document.getElementById('vol-slider');
  volSlider.value = opts.volume;
  volSlider.addEventListener('input', () => {
    audio.setVolume(parseInt(volSlider.value));
    storage.saveOptions(opts);
  });

  const chkMute = document.getElementById('chk-mute');
  chkMute.checked = opts.mute;
  chkMute.addEventListener('change', () => {
    audio.setMute(chkMute.checked);
    storage.saveOptions(opts);
  });

  const chkRadar = document.getElementById('chk-radar');
  chkRadar.checked = opts.showRadar;
  chkRadar.addEventListener('change', () => {
    opts.showRadar = chkRadar.checked;
    storage.saveOptions(opts);
  });
}

bindUI();
player = createPlayer();
setState(STATE.MENU);
requestAnimationFrame(ts => { lastTs = ts; requestAnimationFrame(loop); });
