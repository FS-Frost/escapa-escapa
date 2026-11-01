import { CH, PORTRAIT } from './constants';
import { audio } from './audio';
import { world, STATE } from './game/world';
import { moveToLane, laneAtY } from './game/player';
import { tutorialConsumesInput } from './game/tutorial';
import { togglePause, pauseIfPlaying, handleEscape } from './ui';

// Keyboard: ↑/Space and ↓ step one lane. Touch/mouse: press anywhere and the
// player jumps straight to the lane nearest to the pointer's Y.

export function bindInput(canvas: HTMLCanvasElement) {
  const held = new Set<string>();
  window.addEventListener('keydown', e => {
    if (held.has(e.key)) return;
    held.add(e.key);
    const gameKey = ['ArrowUp', 'ArrowDown', ' ', 'Enter'].includes(e.key);
    if (gameKey) world.inputMode = 'keys';
    if (world.state === STATE.PLAYING && gameKey && tutorialConsumesInput()) { e.preventDefault(); return; }
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
    world.inputMode = 'touch';
    if (tutorialConsumesInput()) return;
    const rect = canvas.getBoundingClientRect();
    // In portrait the area below the game belongs to the pad (gaps included)
    if (PORTRAIT && e.clientY > rect.bottom) return;
    const y = (e.clientY - rect.top) / rect.height * CH;
    moveToLane(laneAtY(y));
  }, { passive: false });

  // Portrait lane pad: ▲ / ▼ move one lane per press (twice to cross two lanes).
  for (const btn of document.querySelectorAll<HTMLButtonElement>('.pad-btn')) {
    btn.addEventListener('pointerdown', e => {
      e.preventDefault();
      if (world.state !== STATE.PLAYING) return;
      world.inputMode = 'touch';
      if (tutorialConsumesInput()) return;
      moveToLane(world.player.targetLane + Number(btn.dataset.dir));
    });
  }

  // iOS only unlocks audio on pointerup/touchend/click, not pointerdown.
  window.addEventListener('pointerup', () => audio.init());

  // Stop the run when the app is backgrounded. Rotation just re-lays out.
  document.addEventListener('visibilitychange', () => { if (document.hidden) pauseIfPlaying(); });
}
