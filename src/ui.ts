import { audio } from './audio';
import { haptics } from './haptics';
import { storage } from './storage';
import { t, setLang, LANGS, type Key, type Lang } from './i18n';
import { world, displayName, STATE, type State } from './game/world';
import { startGame } from './game/logic';
import { endTutorial } from './game/tutorial';
import { biomeTheme } from './game/biomes';

// DOM overlays (menus, pause, options, results). Gameplay is all on the canvas.

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const show = (id: string, visible: boolean) => $(id).classList.toggle('hidden', !visible);

const OVERLAYS: [string, State][] = [
  ['overlay-menu', STATE.MENU],
  ['overlay-pause', STATE.PAUSED],
  ['overlay-dead', STATE.DEAD],
  ['overlay-victory', STATE.VICTORY],
  ['overlay-hiscore', STATE.HISCORE],
];

export function setState(s: State) {
  world.state = s;
  for (const [id, st] of OVERLAYS) show(id, s === st);
  $('game-wrapper').classList.toggle('playing', s === STATE.PLAYING);
  hideConfirm();
  if (s === STATE.PLAYING) closeOptions();
  syncMusic(s);
}

// Menu theme on menus, biome theme in a run (muffled while paused), silence on results.
function syncMusic(s: State) {
  if (s === STATE.MENU || s === STATE.HISCORE) audio.setMusic('menu');
  else if (s === STATE.PLAYING || s === STATE.PAUSED) audio.setMusic(biomeTheme());
  else audio.setMusic('off', 0.3);
  audio.setMuffled(s === STATE.PAUSED);
}

export function togglePause() {
  if (world.state === STATE.PLAYING) setState(STATE.PAUSED);
  else if (world.state === STATE.PAUSED) setState(STATE.PLAYING);
}

export function pauseIfPlaying() {
  if (world.state === STATE.PLAYING) setState(STATE.PAUSED);
}

// Escape backs out of the innermost layer: tutorial offer / options → confirm → pause toggle.
export function handleEscape() {
  if (!$('overlay-tutorial-offer').classList.contains('hidden')) show('overlay-tutorial-offer', false);
  else if (isOptionsOpen()) closeOptions();
  else if (!$('pause-confirm').classList.contains('hidden')) hideConfirm();
  else togglePause();
}

// ===== OPTIONS PANEL =====
const isOptionsOpen = () => !$('overlay-options').classList.contains('hidden');
function openOptions() {
  syncFullscreenLabel();
  show('btn-tutorial', world.state === STATE.MENU); // from pause it would throw away the run
  show('overlay-options', true);
}
function closeOptions() { show('overlay-options', false); }

const fullscreenSupported = () => !!document.fullscreenEnabled;

function syncFullscreenLabel() {
  $('btn-fullscreen').textContent = t(document.fullscreenElement ? 'opts.exitFullscreen' : 'opts.fullscreen');
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      // Android lets fullscreen pages lock orientation; ignore where unsupported.
      const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
      await orientation.lock?.('landscape').catch(() => {});
    }
  } catch { /* denied or unsupported */ }
}

// ===== PAUSE CONFIRMATION =====
let pendingAction: (() => void) | null = null;

function askConfirm(textKey: Key, action: () => void) {
  pendingAction = action;
  $('pause-confirm-text').textContent = t(textKey);
  show('pause-main', false);
  show('pause-confirm', true);
}

function hideConfirm() {
  pendingAction = null;
  show('pause-main', true);
  show('pause-confirm', false);
}

// ===== SCREEN OVERLAYS =====
function el(tag: string, cls: string, text: string | number) {
  const e = document.createElement(tag);
  e.className = cls;
  e.textContent = String(text);
  return e;
}

function renderStats(target: HTMLElement) {
  const rows: [Key, string | number][] = [
    ['stats.score', world.score],
    ['stats.maxStreak', world.runStats.maxStreak ?? 0],
    ['stats.mult', 'x' + (world.runStats.maxMult ?? 1)],
    ['stats.time', Math.floor(world.gameTime) + 's'],
    ['stats.worlds', world.currentBiome + 1],
    ['stats.daily', storage.getDailyBest()],
  ];
  target.replaceChildren(...rows.map(([k, v]) => {
    const row = el('div', 'stat-row', '');
    row.append(el('span', 'stat-label', t(k)), el('span', 'stat-value', v));
    return row;
  }));
}

function saveRun() {
  storage.saveDailyBest(world.score);
  storage.saveScore(displayName(), world.score, world.runStats);
}

export function showDeadScreen() {
  saveRun();
  $('dead-title').textContent = t('dead.title', { name: displayName() });
  renderStats($('dead-stats'));
}

export function showVictoryScreen() {
  saveRun();
  $('victory-title').textContent = t('victory.title', { name: displayName() });
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
    list.replaceChildren(el('p', 'scores-empty', t('records.empty')));
    return;
  }
  list.replaceChildren(...scores.map((s, i) => {
    const row = el('div', 'score-entry', '');
    row.append(
      el('span', 'score-rank', medals[i] ?? i + 1),
      el('span', 'score-name', s.name),
      el('span', 'score-pts', t('records.pts', { n: s.score })),
    );
    return row;
  }));
}

// ===== BINDINGS =====
const click = (id: string, fn: () => void) => $(id).addEventListener('click', fn);

export function bindUI() {
  const { opts } = world;
  audio.bind(opts);
  haptics.bind(opts);
  const saveOpts = () => storage.saveOptions(opts);

  const nameInput = $<HTMLInputElement>('menu-name-input');
  nameInput.value = world.playerName;
  nameInput.addEventListener('input', () => {
    world.playerName = nameInput.value.trim();
    storage.savePlayerName(world.playerName);
  });
  nameInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') $('btn-start').click();
  });

  const toMenu = () => setState(STATE.MENU);
  const play = () => startGame();
  click('btn-start', () => {
    audio.init();
    nameInput.blur();
    // First time only: offer the tutorial before the first run
    if (storage.getTutorialSeen()) play();
    else show('overlay-tutorial-offer', true);
  });
  const answerOffer = (withTutorial: boolean) => {
    storage.setTutorialSeen();
    show('overlay-tutorial-offer', false);
    startGame(withTutorial);
  };
  click('btn-tutorial-yes', () => answerOffer(true));
  click('btn-tutorial-no', () => answerOffer(false));
  click('btn-tutorial', () => { closeOptions(); startGame(true); });
  click('tutorial-skip', endTutorial);
  click('btn-hiscores-menu', () => {
    audio.init();
    renderScoresList();
    setState(STATE.HISCORE);
  });
  click('btn-options-menu', () => { audio.init(); openOptions(); });

  // Pause: destructive actions ask first
  click('btn-resume', togglePause);
  click('btn-restart-pause', () => askConfirm('pause.confirmRestart', play));
  click('btn-menu-pause', () => askConfirm('pause.confirmMenu', toMenu));
  click('btn-options-pause', openOptions);
  click('btn-confirm-yes', () => { const a = pendingAction; hideConfirm(); a?.(); });
  click('btn-confirm-no', hideConfirm);

  click('btn-restart-dead', play);
  click('btn-menu-dead', toMenu);
  click('btn-restart-victory', play);
  click('btn-menu-victory', toMenu);
  click('btn-close-hiscores', toMenu);
  click('pause-btn', () => { audio.init(); togglePause(); });

  // Options
  const lang = $<HTMLSelectElement>('sel-lang');
  lang.replaceChildren(...Object.entries(LANGS).map(([code, label]) => new Option(label, code)));
  lang.value = opts.lang;
  lang.addEventListener('change', () => {
    opts.lang = lang.value as Lang;
    setLang(opts.lang);
    syncFullscreenLabel();
    saveOpts();
  });

  const slider = (id: string, get: () => number, set: (v: number) => void) => {
    const el = $<HTMLInputElement>(id);
    el.value = String(get());
    el.addEventListener('input', () => { set(parseInt(el.value, 10)); saveOpts(); });
  };
  slider('music-slider', () => opts.musicVolume, v => audio.setMusicVolume(v));
  slider('sfx-slider', () => opts.sfxVolume, v => audio.setSfxVolume(v));

  const toggle = (id: string, get: () => boolean, set: (v: boolean) => void) => {
    const chk = $<HTMLInputElement>(id);
    chk.checked = get();
    chk.addEventListener('change', () => { set(chk.checked); saveOpts(); });
  };
  toggle('chk-mute', () => opts.mute, v => audio.setMute(v));
  toggle('chk-radar', () => opts.showRadar, v => { opts.showRadar = v; });
  toggle('chk-reduce-motion', () => opts.reduceMotion, v => { opts.reduceMotion = v; });
  toggle('chk-vibration', () => opts.vibration, v => {
    opts.vibration = v;
    if (v) haptics.play('powerup'); // preview
  });
  show('row-vibration', haptics.supported);

  show('btn-fullscreen', fullscreenSupported());
  click('btn-fullscreen', () => void toggleFullscreen());
  document.addEventListener('fullscreenchange', syncFullscreenLabel);
  click('btn-close-options', closeOptions);
}
