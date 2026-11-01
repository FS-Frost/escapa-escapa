import { CW, LANE_Y, LANE_GAP, PLAYER_X, SPAWN_AHEAD, RADAR_H } from '../constants';
import { R } from '../gfx/renderer';
import { t, type Key } from '../i18n';
import { audio } from '../audio';
import { storage } from '../storage';
import { world } from './world';
import { makeObs } from './obstacles';
import { spawnSparkles } from './particles';

// Interactive first-run tutorial, played inside a normal PLAYING run with the
// spawner off. Each step advances when the player does the action:
//   up → down → radar (any input continues) → dodge (practice zombie) → done.
// Hits during the tutorial cost no HP; the zombie just comes back.

export type TutorialStep = 'up' | 'down' | 'radar' | 'dodge' | 'done';
export interface Tutorial {
  step: TutorialStep;
  t: number;      // time in the current step
  retry: number;  // >0 while showing the "try again" message
}

const RADAR_MIN_TIME = 1.2; // radar explanation stays at least this long
const DONE_TIME = 1.8;

let onFinish: () => void = () => {};

// `finish` resets the run so the real game starts clean.
export function startTutorial(finish: () => void) {
  onFinish = finish;
  world.obstacles = []; // drop the opening obstacles of the run
  world.tutorial = { step: 'up', t: 0, retry: 0 };
}

export function endTutorial() {
  storage.setTutorialSeen();
  world.tutorial = null;
  onFinish();
}

function go(step: TutorialStep) {
  const tut = world.tutorial!;
  tut.step = step;
  tut.t = 0;
  if (step === 'radar') {
    // Decoys far ahead so the radar has something to show
    world.obstacles = [
      makeObs('zombie', 0, PLAYER_X + SPAWN_AHEAD * 0.6),
      makeObs('bat', 2, PLAYER_X + SPAWN_AHEAD * 0.8),
      makeObs('ghost', 2, PLAYER_X + SPAWN_AHEAD),
    ];
  }
  if (step === 'dodge') spawnPractice();
}

function spawnPractice() {
  world.obstacles = [makeObs('zombie', world.player.targetLane, CW + 20)];
}

const landedOn = (lane: number) => world.player.targetLane === lane && world.player.laneT >= 1;

export function updateTutorial(dt: number) {
  const tut = world.tutorial!;
  tut.t += dt;
  if (tut.retry > 0 && (tut.retry -= dt) <= 0) spawnPractice();

  if (tut.step === 'up' && landedOn(2)) go('down');
  else if (tut.step === 'down' && landedOn(0)) go('radar');
  else if (tut.step === 'done' && tut.t >= DONE_TIME) endTutorial();
}

// Input during the radar step only advances the tutorial (no lane change).
export function tutorialConsumesInput(): boolean {
  const tut = world.tutorial;
  if (!tut || tut.step !== 'radar') return false;
  if (tut.t >= RADAR_MIN_TIME) go('dodge');
  return true;
}

export function tutorialObstaclePassed(obs: { x: number; y: number }) {
  const tut = world.tutorial!;
  if (tut.step !== 'dodge' || tut.retry > 0) return;
  spawnSparkles(obs.x, obs.y, 12);
  audio.play('powerup');
  go('done');
}

export function tutorialHit() {
  const tut = world.tutorial!;
  world.obstacles = [];
  world.player.hitFlash = 0.3;
  audio.play('hit');
  tut.retry = 1.4;
}

// ===== DRAW =====
const PROMPTS: Record<TutorialStep, [Key, Key]> = { // [touch, keys]
  up: ['tut.up.touch', 'tut.up.keys'],
  down: ['tut.down.touch', 'tut.down.keys'],
  radar: ['tut.radar', 'tut.radar'],
  dodge: ['tut.dodge', 'tut.dodge'],
  done: ['tut.done', 'tut.done'],
};

function caption(text: string, y: number, color = '#ffffff') {
  R.rect(0, y - 4, CW, 15, '#000000', 0.45);
  R.text(text, CW / 2, y, color, { align: 'center' });
}

// Pulsing glow over a lane's tap zone, plus a tap ripple for touch players.
function highlightLane(lane: number, time: number, touch: boolean) {
  const pulse = 0.5 + 0.5 * Math.sin(time * 6);
  R.rect(0, LANE_Y[lane] - LANE_GAP / 2, CW, LANE_GAP, '#e879f9', 0.06 + 0.08 * pulse);
  if (!touch) return;
  const k = (time % 1.2) / 1.2;
  R.save();
  R.alpha *= 1 - k;
  R.circle(CW * 0.7, LANE_Y[lane], 4 + k * 14, '#ffffff');
  R.restore();
  R.circle(CW * 0.7, LANE_Y[lane], 3, '#ffffff');
}

export function drawTutorial() {
  const tut = world.tutorial;
  if (!tut) return;
  const touch = world.inputMode === 'touch';
  const [touchKey, keysKey] = PROMPTS[tut.step];
  const y = 64;

  if (tut.step === 'up') highlightLane(2, tut.t, touch);
  if (tut.step === 'down') highlightLane(0, tut.t, touch);

  if (tut.retry > 0) {
    caption(t('tut.retry'), y, '#fca5a5');
    return;
  }
  caption(t(touch ? touchKey : keysKey), y, tut.step === 'done' ? '#ffd700' : '#ffffff');

  if (tut.step === 'radar') {
    // Bouncing arrows pointing up at the radar
    const bob = Math.round(Math.sin(tut.t * 6) * 2);
    for (const x of [CW * 0.3, CW * 0.5, CW * 0.7]) {
      R.text('↑', x, RADAR_H + 6 + bob, '#ffd700', { align: 'center', scale: 2 });
    }
    if (tut.t >= RADAR_MIN_TIME) {
      R.text(t(touch ? 'tut.continue.touch' : 'tut.continue.keys'), CW / 2, y + 16, '#aaaacc', { align: 'center' });
    }
  }
}
