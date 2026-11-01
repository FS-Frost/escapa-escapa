// Cube skins: palettes for drawPlayer. Unlocked by total stage stars or bought
// with gems. `rainbow` cycles its hue every frame.

export interface Skin {
  id: string;
  body: string;
  shine: string;
  shadow: string;
  face: string;
  stars?: number; // unlocks at this many total stars
  gems?: number;  // or costs this many gems
  rainbow?: boolean;
}

export const SKINS: Skin[] = [
  { id: 'classic', body: '#c084fc', shine: '#e9d5ff', shadow: '#7c3aed', face: '#1a0a2e' },
  { id: 'mint', body: '#5eead4', shine: '#ccfbf1', shadow: '#0f766e', face: '#042f2e', stars: 4 },
  { id: 'ember', body: '#fb923c', shine: '#fed7aa', shadow: '#c2410c', face: '#431407', stars: 9 },
  { id: 'ocean', body: '#60a5fa', shine: '#dbeafe', shadow: '#1d4ed8', face: '#0c1a3a', gems: 60 },
  { id: 'candy', body: '#f9a8d4', shine: '#fdf2f8', shadow: '#db2777', face: '#500724', gems: 120 },
  { id: 'gold', body: '#facc15', shine: '#fef9c3', shadow: '#a16207', face: '#422006', stars: 15 },
  { id: 'shadow', body: '#3f3f46', shine: '#71717a', shadow: '#18181b', face: '#f87171', gems: 250 },
  { id: 'rainbow', body: '#ff0000', shine: '#ffffff', shadow: '#000000', face: '#111111', stars: 24, rainbow: true },
];

export const skinById = (id: string) => SKINS.find(s => s.id === id) ?? SKINS[0];

function hsl(h: number, s: number, l: number): string {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  const to = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${to(f(0))}${to(f(8))}${to(f(4))}`;
}

// Colors for this frame (rainbow animates with time).
export function skinColors(skin: Skin, time: number): { body: string; shine: string; shadow: string; face: string } {
  if (!skin.rainbow) return skin;
  const h = (time * 90) % 360;
  return { body: hsl(h, 0.85, 0.65), shine: hsl(h, 0.9, 0.85), shadow: hsl(h, 0.8, 0.4), face: skin.face };
}

export function isSkinUnlocked(skin: Skin, stars: number, owned: string[]): boolean {
  if (skin.stars !== undefined) return stars >= skin.stars;
  if (skin.gems !== undefined) return owned.includes(skin.id);
  return true;
}
