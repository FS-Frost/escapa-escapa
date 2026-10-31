import { CH } from './constants';
import { audio } from './audio';
import { world, STATE } from './game/world';
import { moveToLane, laneAtY } from './game/player';
import { togglePause, pauseIfPlaying, handleEscape } from './ui';

// Keyboard: ↑/Space and ↓ step one lane. Touch/mouse: press anywhere and the
// player jumps straight to the lane nearest to the pointer's Y.

export function bindInput(canvas: HTMLCanvasElement) {
  const held = new Set<string>();
  window.addEventListener('keydown', e => {
    if (held.has(e.key)) return;
    held.add(e.key);
    if (world.state === STATE.PLAYING) {
      if (e.key === 'ArrowUp' || e.key === ' ') { moveToLane(world.player.targetLane + 1); e.preventDefault(); }
      if (e.key === 'ArrowDown') { moveToLane(world.player.targetLane - 1); e.preventDefault(); }
    }
    if (e.key === 'Escape') { handleEscape(); e.preventDefault(); }
    if ((e.key === 'p' || e.key === 'P') && !(e.target instanceof HTMLInputElement)) togglePause();
  });
  window.addEventListener('keyup', e => { held.delete(e.key); });
  window.addEventListener('blur', () => held.clear());

  // Listen on window so taps on the letterbox bars beside the canvas count too.
  window.addEventListener('pointerdown', e => {
    if (world.state !== STATE.PLAYING) return;
    if ((e.target as Element).closest('button, input, .overlay')) return;
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const y = (e.clientY - rect.top) / rect.height * CH;
    moveToLane(laneAtY(y));
  }, { passive: false });

  // iOS only unlocks audio on pointerup/touchend/click, not pointerdown.
  window.addEventListener('pointerup', () => audio.init());

  // Mobile: stop the run when the app is backgrounded or rotated to portrait.
  document.addEventListener('visibilitychange', () => { if (document.hidden) pauseIfPlaying(); });
  const portrait = matchMedia('(orientation: portrait) and (pointer: coarse)');
  portrait.addEventListener('change', () => { if (portrait.matches) pauseIfPlaying(); });
}
