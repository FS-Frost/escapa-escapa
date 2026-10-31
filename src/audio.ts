import type { Options } from './storage';

// Synthesized SFX via Web Audio. The AudioContext is created lazily on the
// first user gesture; resume() also unlocks it on iOS Safari.

let ac: AudioContext | null = null;
let master: GainNode | null = null;
let opts: Options;

function getAC(): AudioContext {
  if (!ac) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ac = new Ctor();
    master = ac.createGain();
    master.connect(ac.destination);
    applyVolume();
  }
  if (ac.state === 'suspended') void ac.resume();
  return ac;
}

function applyVolume() {
  if (master) master.gain.value = opts.mute ? 0 : opts.volume / 100;
}

function tone(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.3, delay = 0) {
  const a = getAC();
  const t0 = a.currentTime + delay;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.connect(g); g.connect(master!);
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
  goalAlarm() { tone(880, 0.12, 'square', 0.3); tone(440, 0.12, 'square', 0.25, 0.15); },
  combo() { tone(880, 0.08, 'sine', 0.22); tone(1100, 0.08, 'sine', 0.2, 0.06); },
  nearMiss() { tone(550, 0.05, 'sine', 0.12); },
  achievement() { [784, 1047, 1319].forEach((f, i) => tone(f, 0.18, 'sine', 0.25, i * 0.08)); },
};

export type SoundName = keyof typeof sounds;

export const audio = {
  bind(o: Options) { opts = o; },
  play(name: SoundName) { try { sounds[name](); } catch { /* audio unavailable */ } },
  setVolume(v: number) { opts.volume = v; applyVolume(); },
  setMute(m: boolean) { opts.mute = m; applyVolume(); },
  init() { try { getAC(); } catch { /* audio unavailable */ } },
};
