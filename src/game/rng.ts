// Seeded PRNG (mulberry32) for everything that shapes a run's layout:
// patterns, lanes, gems, power-ups. Visual noise (particles, shake) keeps
// using Math.random. The daily challenge seeds it from the date so everyone
// gets the same obstacles.

let state = 1;

export function seedRng(seed: number) {
  state = (seed >>> 0) || 1;
}

export function rand(): number {
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const randInt = (n: number) => Math.floor(rand() * n);

export const randomSeed = () => (Math.random() * 2 ** 32) >>> 0;

// FNV-1a over a string (e.g. "2026-11-01" for the daily challenge).
export function stringSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}
