import { audio, type Theme } from './audio';
import { storage } from './storage';
import { t, type Key } from './i18n';

// Fonoteca: listen to the game's procedural soundtrack from the main menu.
// Tracks unlock by reaching their biome (storage.unlockTrack in biomes.ts).
// Options: rush mode (goal-rush tempo + snare roll), visualizer (music
// spectrum as pixel bars) and continuous play (next unlocked track every
// LOOPS_PER_TRACK loops). Closing returns to the menu theme.

const TRACKS: { id: Theme; name: Key; lockHint?: Key }[] = [
  { id: 'menu', name: 'track.menu' },
  { id: 'city', name: 'track.city' },
  { id: 'forest', name: 'track.forest', lockHint: 'juke.lockedForest' },
  { id: 'sky', name: 'track.sky', lockHint: 'juke.lockedSky' },
];
const LOOPS_PER_TRACK = 4;
const VIZ_BARS = 16;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

let current: Theme = 'menu';
let playing = false;
let loops = 0;
let raf = 0;
const spectrum = new Uint8Array(128);

export const isJukeboxOpen = () => !$('overlay-jukebox').classList.contains('hidden');

const unlocked = () => storage.getUnlockedTracks();
const rush = () => $<HTMLInputElement>('chk-juke-rush').checked;
const continuous = () => $<HTMLInputElement>('chk-juke-continuous').checked;

function play(id: Theme) {
  current = id;
  playing = true;
  loops = 0;
  audio.setIntensity(rush() ? 1 : 0);
  audio.setMusic(id, 0.6);
  render();
}

function togglePlay() {
  if (playing) {
    playing = false;
    audio.setMusic('off', 0.3);
    render();
  } else {
    play(current);
  }
}

// Continuous mode: after a few loops move on to the next unlocked track.
function onLoop() {
  if (!playing || !continuous() || ++loops < LOOPS_PER_TRACK) return;
  const list = TRACKS.filter(tr => unlocked().includes(tr.id));
  const i = list.findIndex(tr => tr.id === current);
  play(list[(i + 1) % list.length].id);
}

function render() {
  const open = unlocked();
  $('juke-list').replaceChildren(...TRACKS.map((tr, i) => {
    const b = document.createElement('button');
    const isOpen = open.includes(tr.id);
    b.className = 'juke-track';
    b.disabled = !isOpen;
    b.setAttribute('aria-pressed', String(isOpen && tr.id === current && playing));
    b.textContent = isOpen ? `${i + 1}. ${t(tr.name)}` : `${i + 1}. ??? · ${t(tr.lockHint!)}`;
    if (isOpen) b.addEventListener('click', () => play(tr.id));
    return b;
  }));
  $('btn-juke-play').textContent = t(playing ? 'juke.pause' : 'juke.play');
}

// Spectrum → bars, sampling low/mid frequencies on a roughly log scale.
function drawViz() {
  const bars = $('juke-viz').children;
  const on = playing && audio.getSpectrum(spectrum);
  for (let i = 0; i < bars.length; i++) {
    const from = Math.floor(2 * 1.25 ** i), to = Math.max(from + 1, Math.floor(2 * 1.25 ** (i + 1)));
    let v = 0;
    for (let k = from; k < to && k < spectrum.length; k++) v = Math.max(v, spectrum[k]);
    (bars[i] as HTMLElement).style.height = `${on ? 6 + (v / 255) * 94 : 6}%`;
  }
  raf = requestAnimationFrame(drawViz);
}

export function openJukebox() {
  audio.init();
  $('overlay-jukebox').classList.remove('hidden');
  audio.onLoop(onLoop);
  play(current);
  if ($<HTMLInputElement>('chk-juke-viz').checked) raf = requestAnimationFrame(drawViz);
}

export function closeJukebox() {
  $('overlay-jukebox').classList.add('hidden');
  cancelAnimationFrame(raf);
  audio.onLoop(null);
  audio.setIntensity(0);
  playing = false;
  audio.setMusic('menu');
}

export function bindJukebox() {
  const viz = $('juke-viz');
  viz.replaceChildren(...Array.from({ length: VIZ_BARS }, () => document.createElement('span')));
  $('btn-juke-play').addEventListener('click', togglePlay);
  $('btn-juke-close').addEventListener('click', closeJukebox);
  $('chk-juke-rush').addEventListener('change', () => { if (playing) audio.setIntensity(rush() ? 1 : 0); });
  $<HTMLInputElement>('chk-juke-viz').addEventListener('change', e => {
    const on = (e.target as HTMLInputElement).checked;
    viz.classList.toggle('hidden', !on);
    cancelAnimationFrame(raf);
    if (on && isJukeboxOpen()) raf = requestAnimationFrame(drawViz);
  });
}
