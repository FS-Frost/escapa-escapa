import type { Options } from './storage';

// Procedural audio: SFX and music are synthesized with Web Audio, no files.
// The AudioContext is created lazily on the first user gesture; resume() also
// unlocks it on iOS Safari.
//
// Graph:
//   theme voices → themeGain[name] → musicBus → musicFilter (lowpass, closes on pause) → musicGain ┐
//   sfx voices → sfxGain ───────────────────────────────────────────────────────────────────────────┴→ master (mute) → compressor → out
//
// Music is a 16th-note step sequencer over a 4-bar progression. Every theme is
// scheduled on the same step clock, so switching themes crossfades in time.

export type MusicSection = 'off' | 'menu' | 'city' | 'forest' | 'sky';
export type Theme = Exclude<MusicSection, 'off'>;

const midiToHz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

const STEPS_PER_BAR = 16;
const BARS = 4;
const LOOKAHEAD_S = 0.12;
const SCHEDULER_MS = 25;
const OPEN_FILTER_HZ = 18000;
const PAUSED_FILTER_HZ = 500;

interface Bar { bass: number; chord: number[]; }

// All progressions stay in A minor so crossfades between themes blend.
const AM_F_C_G: Bar[] = [
  { bass: 45, chord: [57, 60, 64] },
  { bass: 41, chord: [53, 57, 60] },
  { bass: 48, chord: [55, 60, 64] },
  { bass: 43, chord: [55, 59, 62] },
];
const AM_EM_F_G: Bar[] = [
  { bass: 45, chord: [57, 60, 64] },
  { bass: 40, chord: [55, 59, 64] },
  { bass: 41, chord: [53, 57, 60] },
  { bass: 43, chord: [55, 59, 62] },
];
const FMAJ7_EM7_DM7_CMAJ7: Bar[] = [
  { bass: 41, chord: [57, 60, 64, 65] },
  { bass: 40, chord: [55, 59, 62, 64] },
  { bass: 38, chord: [53, 57, 60, 62] },
  { bass: 36, chord: [55, 59, 60, 64] },
];

const THEMES: Record<Theme, { bpm: number; bars: Bar[] }> = {
  menu: { bpm: 92, bars: AM_F_C_G },
  city: { bpm: 116, bars: AM_F_C_G },
  forest: { bpm: 104, bars: AM_EM_F_G },
  sky: { bpm: 96, bars: FMAJ7_EM7_DM7_CMAJ7 },
};

let ac: AudioContext | null = null;
let master: GainNode;
let sfxGain: GainNode;
let musicGain: GainNode;
let analyser: AnalyserNode;
let loopListener: (() => void) | null = null; // called when the 4-bar loop wraps
let musicFilter: BiquadFilterNode;
let noise: AudioBuffer;
const themeGains = {} as Record<Theme, GainNode>;
let opts: Options;

let section: MusicSection = 'off';
let intensity = 0;       // 0..1, speeds up game themes (goal approach)
let step = 0;
let nextStepTime = 0;
const audibleUntil: Partial<Record<Theme, number>> = {}; // keep scheduling while fading out

function getAC(): AudioContext {
  if (!ac) createGraph();
  if (ac!.state === 'suspended' && !document.hidden) void ac!.resume();
  return ac!;
}

function createGraph() {
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctor();
  ac = ctx;

  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -14;
  compressor.ratio.value = 4;
  compressor.connect(ctx.destination);

  master = ctx.createGain();
  master.connect(compressor);

  sfxGain = ctx.createGain();
  sfxGain.connect(master);

  musicGain = ctx.createGain();
  musicGain.connect(master);
  // Tap for the jukebox visualizer (post volume, so it follows the music slider)
  analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.75;
  musicGain.connect(analyser);
  musicFilter = ctx.createBiquadFilter();
  musicFilter.type = 'lowpass';
  musicFilter.frequency.value = OPEN_FILTER_HZ;
  musicFilter.connect(musicGain);
  const musicBus = ctx.createGain();
  musicBus.connect(musicFilter);

  for (const name of Object.keys(THEMES) as Theme[]) {
    const g = ctx.createGain();
    g.gain.value = name === section ? 1 : 0;
    g.connect(musicBus);
    themeGains[name] = g;
  }

  noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

  applyVolumes();
  nextStepTime = ctx.currentTime + 0.1;
  window.setInterval(schedule, SCHEDULER_MS);

  // Silence in background tabs (the run auto-pauses there anyway).
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) void ctx.suspend();
    else { void ctx.resume(); nextStepTime = ctx.currentTime + 0.05; }
  });
}

function applyVolumes() {
  if (!ac) return;
  const t = ac.currentTime;
  master.gain.setTargetAtTime(opts.mute ? 0 : 1, t, 0.02);
  sfxGain.gain.setTargetAtTime(opts.sfxVolume / 100, t, 0.02);
  // Squared curve: perceived loudness is closer to linear across the slider.
  musicGain.gain.setTargetAtTime((opts.musicVolume / 100) ** 2 * 0.5, t, 0.05);
}

// ===== MUSIC SEQUENCER =====
function schedule() {
  const ctx = ac;
  if (!ctx || ctx.state !== 'running') return;
  // After a stall, don't fire a burst of late notes.
  if (nextStepTime < ctx.currentTime - 0.2) nextStepTime = ctx.currentTime + 0.05;

  while (nextStepTime < ctx.currentTime + LOOKAHEAD_S) {
    const lead = section === 'off' ? null : section;
    for (const name of Object.keys(THEMES) as Theme[]) {
      if (name === lead || (audibleUntil[name] ?? 0) > nextStepTime) playStep(name, step, nextStepTime);
    }
    if (lead && intensity > 0) rushLayer(lead, step, nextStepTime);
    const bpm = lead ? THEMES[lead].bpm * (1 + intensity * 0.25) : 100;
    nextStepTime += 60 / bpm / 4;
    step = (step + 1) % (STEPS_PER_BAR * BARS);
    if (step === 0 && lead) loopListener?.();
  }
}

function playStep(name: Theme, stepIdx: number, t: number) {
  const out = themeGains[name];
  const { bpm, bars } = THEMES[name];
  const bar = bars[Math.floor(stepIdx / STEPS_PER_BAR)];
  const s = stepIdx % STEPS_PER_BAR;
  const six = 60 / bpm / 4;

  switch (name) {
    case 'menu': // calm: pad, soft bass on beats, triangle arpeggio in 8ths
      if (s === 0) pad(out, t, bar.chord, six * STEPS_PER_BAR, 0.05, 900);
      if (s % 4 === 0) bass(out, t, bar.bass, six * 3, 0.16, 'triangle');
      if (s % 2 === 0) arp(out, t, bar.chord[(s / 2) % bar.chord.length] + 12, six * 1.5, 0.035, 'triangle');
      break;

    case 'city': // driving synthwave: octave saw bass, 16th square arp, four-on-the-floor
      if (s % 2 === 0) bass(out, t, bar.bass + (s % 4 === 2 ? 12 : 0), six * 1.6, 0.22, 'sawtooth');
      arp(out, t, bar.chord[s % 3] + (s >= 8 ? 12 : 0), six * 0.9, 0.04, 'square');
      if (s % 4 === 0) kick(out, t, 0.8);
      if (s === 4 || s === 12) snare(out, t, 0.3);
      if (s % 2 === 1) hat(out, t, s % 4 === 3 ? 0.09 : 0.05);
      break;

    case 'forest': { // lighter: plucked up/down arpeggio, bouncy bass, shaker
      const pattern = [0, 1, 2, 1];
      if (s === 0 || s === 6 || s === 10) bass(out, t, bar.bass, six * 2.5, 0.2, 'triangle');
      if (s % 2 === 0) arp(out, t, bar.chord[pattern[(s / 2) % 4]] + 12, six * 2, 0.05, 'triangle');
      if (s === 0 || s === 8) kick(out, t, 0.5);
      if (s % 2 === 1) hat(out, t, 0.035);
      break;
    }

    case 'sky': // airy: wide pad every bar, sparkling high arp in threes, sparse beat
      if (s === 0) pad(out, t, bar.chord, six * STEPS_PER_BAR, 0.06, 1400);
      if (s === 0 || s === 8) bass(out, t, bar.bass, six * 6, 0.14, 'sine');
      if (s % 3 === 0) arp(out, t, bar.chord[(s / 3) % bar.chord.length] + 24, six * 3, 0.03, 'sine');
      if (s === 0) kick(out, t, 0.45);
      if (s === 8) hat(out, t, 0.05);
      break;
  }
}

// Goal-rush tension on top of the biome theme: a snare roll that thickens
// (8ths → 16ths) and gets louder as intensity rises.
function rushLayer(name: Theme, stepIdx: number, t: number) {
  const s = stepIdx % STEPS_PER_BAR;
  const dense = intensity > 0.6;
  if (!dense && s % 2 === 1) return;
  // Crescendo within each bar
  const level = (0.025 + intensity * 0.09) * (0.6 + 0.4 * (s / STEPS_PER_BAR));
  snare(themeGains[name], t, level);
}

// ===== VOICES =====
function bass(out: AudioNode, t: number, midi: number, dur: number, level: number, wave: OscillatorType) {
  const ctx = ac!;
  const osc = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const g = ctx.createGain();
  osc.type = wave;
  osc.frequency.value = midiToHz(midi);
  filter.type = 'lowpass';
  filter.Q.value = 6;
  filter.frequency.setValueAtTime(1400, t);
  filter.frequency.exponentialRampToValueAtTime(220, t + dur);
  g.gain.setValueAtTime(level, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(filter).connect(g).connect(out);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function arp(out: AudioNode, t: number, midi: number, dur: number, level: number, wave: OscillatorType) {
  const ctx = ac!;
  const osc = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const g = ctx.createGain();
  osc.type = wave;
  osc.frequency.value = midiToHz(midi);
  filter.type = 'lowpass';
  filter.frequency.value = 2400;
  g.gain.setValueAtTime(level, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(filter).connect(g).connect(out);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function pad(out: AudioNode, t: number, chord: number[], dur: number, level: number, cutoff: number) {
  const ctx = ac!;
  const filter = ctx.createBiquadFilter();
  const g = ctx.createGain();
  filter.type = 'lowpass';
  filter.frequency.value = cutoff;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(level, t + dur * 0.3);
  g.gain.linearRampToValueAtTime(0.0001, t + dur);
  filter.connect(g).connect(out);
  for (const midi of chord) {
    // Two detuned saws per note: classic wide synth pad
    for (const detune of [-8, 8]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = midiToHz(midi);
      osc.detune.value = detune;
      osc.connect(filter);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    }
  }
}

function kick(out: AudioNode, t: number, level: number) {
  const ctx = ac!;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.frequency.setValueAtTime(150, t);
  osc.frequency.exponentialRampToValueAtTime(40, t + 0.12);
  g.gain.setValueAtTime(level, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  osc.connect(g).connect(out);
  osc.start(t);
  osc.stop(t + 0.2);
}

const snare = (out: AudioNode, t: number, level: number) => noiseHit(out, t, 'bandpass', 1800, level, 0.16);
const hat = (out: AudioNode, t: number, level: number) => noiseHit(out, t, 'highpass', 7000, level, 0.04);

function noiseHit(out: AudioNode, t: number, type: BiquadFilterType, freq: number, level: number, decay: number) {
  const ctx = ac!;
  const src = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const g = ctx.createGain();
  src.buffer = noise;
  filter.type = type;
  filter.frequency.value = freq;
  g.gain.setValueAtTime(level, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + decay);
  src.connect(filter).connect(g).connect(out);
  src.start(t, Math.random() * 0.5);
  src.stop(t + decay + 0.02);
}

// ===== SFX =====
function tone(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.3, delay = 0) {
  const a = getAC();
  const t0 = a.currentTime + delay;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.connect(g); g.connect(sfxGain);
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.start(t0);
  osc.stop(t0 + dur + 0.01);
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
  goalAppear() { [659, 880, 1319].forEach((f, i) => tone(f, 0.22, 'triangle', 0.14, i * 0.09)); },
  countdown() { tone(784, 0.09, 'sine', 0.14); },
  combo() { tone(880, 0.08, 'sine', 0.22); tone(1100, 0.08, 'sine', 0.2, 0.06); },
  nearMiss() { tone(550, 0.05, 'sine', 0.12); },
  achievement() { [784, 1047, 1319].forEach((f, i) => tone(f, 0.18, 'sine', 0.25, i * 0.08)); },
};

export type SoundName = keyof typeof sounds;

export const audio = {
  bind(o: Options) { opts = o; },
  play(name: SoundName) { try { sounds[name](); } catch { /* audio unavailable */ } },
  setSfxVolume(v: number) { opts.sfxVolume = v; applyVolumes(); },
  setMusicVolume(v: number) { opts.musicVolume = v; applyVolumes(); },
  setMute(m: boolean) { opts.mute = m; applyVolumes(); },
  init() { try { getAC(); } catch { /* audio unavailable */ } },

  // Crossfade to a theme ('off' fades everything out). Idempotent.
  setMusic(next: MusicSection, fadeS = 0.6) {
    if (next === section) return;
    const prev = section;
    section = next;
    if (!ac) return; // gains are initialized from `section` when the graph is created
    const t = ac.currentTime;
    if (prev !== 'off') audibleUntil[prev] = t + fadeS * 1.5;
    for (const name of Object.keys(THEMES) as Theme[]) {
      themeGains[name].gain.setTargetAtTime(name === next ? 1 : 0, t, fadeS / 3);
    }
  },
  // 0..1, raises the tempo of game themes.
  setIntensity(v: number) { intensity = Math.max(0, Math.min(1, v)); },
  // Called each time the current theme completes its 4-bar loop (null to stop).
  onLoop(cb: (() => void) | null) { loopListener = cb; },
  // Fills `out` with music frequency levels (0..255); false if audio isn't running.
  getSpectrum(out: Uint8Array<ArrayBuffer>): boolean {
    if (!ac || ac.state !== 'running') return false;
    analyser.getByteFrequencyData(out);
    return true;
  },
  // Muffles the music like it plays in another room (pause).
  setMuffled(muffled: boolean) {
    if (!ac) return;
    musicFilter.frequency.setTargetAtTime(muffled ? PAUSED_FILTER_HZ : OPEN_FILTER_HZ, ac.currentTime, 0.12);
  },
};
