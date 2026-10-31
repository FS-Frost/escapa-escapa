import { audio } from './audio';
import { storage } from './storage';
import { world, STATE, type State } from './game/world';
import { startGame } from './game/logic';

// DOM overlays (menus, pause, results). Gameplay is all on the canvas.

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const OVERLAYS: [string, State][] = [
  ['overlay-menu', STATE.MENU],
  ['overlay-pause', STATE.PAUSED],
  ['overlay-dead', STATE.DEAD],
  ['overlay-victory', STATE.VICTORY],
  ['overlay-hiscore', STATE.HISCORE],
];

export function setState(s: State) {
  world.state = s;
  for (const [id, st] of OVERLAYS) $(id).classList.toggle('hidden', s !== st);
  $('game-wrapper').classList.toggle('playing', s === STATE.PLAYING);
}

export function togglePause() {
  if (world.state === STATE.PLAYING) setState(STATE.PAUSED);
  else if (world.state === STATE.PAUSED) setState(STATE.PLAYING);
}

export function pauseIfPlaying() {
  if (world.state === STATE.PLAYING) setState(STATE.PAUSED);
}

// ===== SCREEN OVERLAYS =====
function el(tag: string, cls: string, text: string | number) {
  const e = document.createElement(tag);
  e.className = cls;
  e.textContent = String(text);
  return e;
}

function renderStats(target: HTMLElement) {
  const rows: [string, string | number][] = [
    ['Puntuación', world.score],
    ['Máx. racha', world.runStats.maxStreak ?? 0],
    ['Multiplicador', 'x' + (world.runStats.maxMult ?? 1)],
    ['Tiempo', Math.floor(world.gameTime) + 's'],
    ['Mundos', world.currentBiome + 1],
    ['Récord diario', storage.getDailyBest()],
  ];
  target.replaceChildren(...rows.map(([k, v]) => {
    const row = el('div', 'stat-row', '');
    row.append(el('span', 'stat-label', k), el('span', 'stat-value', v));
    return row;
  }));
}

function saveRun() {
  storage.saveDailyBest(world.score);
  storage.saveScore(world.playerName, world.score, world.runStats);
}

export function showDeadScreen() {
  saveRun();
  renderStats($('dead-stats'));
}

export function showVictoryScreen() {
  saveRun();
  renderStats($('victory-stats'));
  setTimeout(() => {
    // The player may have restarted or left during the delay
    if (world.state !== STATE.VICTORY) return;
    renderScoresList();
    setState(STATE.HISCORE);
  }, 2500);
}

function renderScoresList() {
  const scores = storage.getScores();
  const medals = ['🥇', '🥈', '🥉'];
  const list = $('scores-list');
  if (!scores.length) {
    list.replaceChildren(el('p', 'scores-empty', 'Sin récords aún'));
    return;
  }
  list.replaceChildren(...scores.map((s, i) => {
    const row = el('div', 'score-entry', '');
    row.append(
      el('span', 'score-rank', medals[i] ?? i + 1),
      el('span', 'score-name', s.name),
      el('span', 'score-pts', `${s.score}pts`),
    );
    return row;
  }));
}

// ===== BINDINGS =====
export function bindUI() {
  const nameInput = $<HTMLInputElement>('menu-name-input');
  nameInput.value = storage.getPlayerName();
  nameInput.addEventListener('input', () => {
    world.playerName = nameInput.value.trim() || 'Jugador';
    storage.savePlayerName(nameInput.value.trim());
  });
  nameInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') $('btn-start').click();
  });

  const toMenu = () => setState(STATE.MENU);
  $('btn-start').addEventListener('click', () => {
    audio.init();
    world.playerName = nameInput.value.trim() || 'Jugador';
    storage.savePlayerName(world.playerName);
    nameInput.blur();
    startGame();
  });
  $('btn-hiscores-menu').addEventListener('click', () => {
    audio.init();
    renderScoresList();
    setState(STATE.HISCORE);
  });

  $('btn-resume').addEventListener('click', togglePause);
  $('btn-restart-pause').addEventListener('click', startGame);
  $('btn-menu-pause').addEventListener('click', toMenu);
  $('btn-restart-dead').addEventListener('click', startGame);
  $('btn-menu-dead').addEventListener('click', toMenu);
  $('btn-restart-victory').addEventListener('click', startGame);
  $('btn-menu-victory').addEventListener('click', toMenu);
  $('btn-close-hiscores').addEventListener('click', toMenu);
  $('pause-btn').addEventListener('click', () => { audio.init(); togglePause(); });

  const { opts } = world;
  audio.bind(opts);
  const vol = $<HTMLInputElement>('vol-slider');
  vol.value = String(opts.volume);
  vol.addEventListener('input', () => { audio.setVolume(parseInt(vol.value, 10)); storage.saveOptions(opts); });

  const mute = $<HTMLInputElement>('chk-mute');
  mute.checked = opts.mute;
  mute.addEventListener('change', () => { audio.setMute(mute.checked); storage.saveOptions(opts); });

  const radar = $<HTMLInputElement>('chk-radar');
  radar.checked = opts.showRadar;
  radar.addEventListener('change', () => { opts.showRadar = radar.checked; storage.saveOptions(opts); });
}
