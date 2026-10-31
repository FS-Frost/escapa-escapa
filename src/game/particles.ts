import { R } from '../gfx/renderer';
import { world } from './world';

// Square particles that fade out over their life.
export interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  gravity: number;
  life: number; maxLife: number;
  color: string;
  size: number;
  opacity: number;   // peak alpha
  centered: boolean; // draw centered on (x, y) instead of top-left
}

function add(p: Partial<Particle> & Pick<Particle, 'x' | 'y' | 'life' | 'color' | 'size'>) {
  world.particles.push({ vx: 0, vy: 0, gravity: 0, maxLife: p.life, opacity: 1, centered: false, ...p });
}

export function updateParticles(dt: number) {
  for (const p of world.particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += p.gravity * dt;
    p.life -= dt;
  }
  world.particles = world.particles.filter(p => p.life > 0);
}

export function drawParticles() {
  for (const p of world.particles) {
    const off = p.centered ? p.size / 2 : 0;
    R.rect(Math.floor(p.x - off), Math.floor(p.y - off), p.size, p.size, p.color,
      Math.max(0, p.life / p.maxLife) * p.opacity);
  }
}

const SPARKLE_COLORS = ['#ffd700', '#ffa500', '#ffff44', '#ff8800'];

export function spawnSparkles(x: number, y: number, count = 8) {
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const spd = 30 + Math.random() * 50;
    add({
      x, y, vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd, gravity: 60,
      life: 0.45, color: SPARKLE_COLORS[i % SPARKLE_COLORS.length], size: 3,
    });
  }
}

export function spawnHitStars(x: number, y: number) {
  for (let i = 0; i < 10; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 50 + Math.random() * 80;
    add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.35, color: i % 2 === 0 ? '#ffffff' : '#ff8888', size: 4 });
  }
}

export function spawnTrail(x: number, y: number, color: string) {
  add({ x, y, life: 0.18, color, size: 8, opacity: 0.5, centered: true });
}

export function spawnLaneTrailArc(fromY: number, toY: number, x: number) {
  const steps = 6;
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    const y = fromY + (toY - fromY) * t - 20 * Math.sin(t * Math.PI);
    add({ x: x - 10 - i * 3, y, vx: -20, life: 0.3 - i * 0.02, maxLife: 0.3, color: '#e879f9', size: 4, opacity: 0.6 });
  }
}
