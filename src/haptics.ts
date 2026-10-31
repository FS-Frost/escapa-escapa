import type { Options } from './storage';

// Vibration API feedback. Only available where navigator.vibrate exists
// (Android browsers); iOS Safari has no equivalent, so the option is hidden there.

const PATTERNS = {
  jump: 8,
  hit: [40, 30, 60],
  death: [80, 40, 160],
  powerup: [15, 30, 15],
  combo: 20,
  achievement: [20, 30, 20],
  victory: [30, 40, 30, 40, 120],
} satisfies Record<string, number | number[]>;

export type HapticName = keyof typeof PATTERNS;

let opts: Options;

export const haptics = {
  supported: typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function',
  bind(o: Options) { opts = o; },
  play(name: HapticName) {
    if (!this.supported || !opts?.vibration) return;
    try { navigator.vibrate(PATTERNS[name]); } catch { /* blocked without user activation */ }
  },
};
