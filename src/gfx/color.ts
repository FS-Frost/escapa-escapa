// RGBA with channels in 0..1. Strings are parsed once and cached.
export type RGBA = readonly [number, number, number, number];
export type Color = string | RGBA;

const cache = new Map<string, RGBA>();

export function rgba(r: number, g: number, b: number, a = 1): RGBA {
  return [r / 255, g / 255, b / 255, a];
}

export function parseColor(c: Color): RGBA {
  if (typeof c !== 'string') return c;
  let v = cache.get(c);
  if (!v) {
    v = parse(c);
    cache.set(c, v);
  }
  return v;
}

function parse(s: string): RGBA {
  if (s[0] === '#') {
    let h = s.slice(1);
    if (h.length === 3) h = h.split('').map(ch => ch + ch).join('');
    const n = parseInt(h, 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1];
  }
  const m = s.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const [r, g, b, a = '1'] = m[1].split(',').map(t => t.trim());
    return [+r / 255, +g / 255, +b / 255, +a];
  }
  throw new Error(`Unsupported color: ${s}`);
}
