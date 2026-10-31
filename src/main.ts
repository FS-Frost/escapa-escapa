import './style.css';
import { CW, CH } from './constants';
import { initRenderer, type Renderer } from './gfx/renderer';
import { world, STATE } from './game/world';
import { update, render } from './game/logic';
import { bindUI, setState } from './ui';
import { bindInput } from './input';
import { setLang } from './i18n';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const wrapper = document.getElementById('game-wrapper')!;

// Fit the 16:9 game inside the safe area; back the canvas at device resolution
// so the present pass upscales the CW×CH frame with crisp nearest filtering.
function layout(r: Renderer) {
  const cs = getComputedStyle(document.body);
  const availW = window.innerWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const availH = window.innerHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  const scale = Math.min(availW / CW, availH / CH);
  const w = Math.floor(CW * scale), h = Math.floor(CH * scale);
  wrapper.style.width = w + 'px';
  wrapper.style.height = h + 'px';
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  r.canvas.width = Math.round(w * dpr);
  r.canvas.height = Math.round(h * dpr);
}

function boot() {
  setLang(world.opts.lang);
  let r: Renderer;
  try {
    r = initRenderer(canvas);
  } catch (err) {
    console.error(err);
    document.getElementById('no-webgl')!.classList.remove('hidden');
    return;
  }

  bindUI();
  bindInput(canvas);
  layout(r);
  window.addEventListener('resize', () => layout(r));
  setState(STATE.MENU);

  let last = performance.now();
  const loop = (ts: number) => {
    const dt = Math.max(0, Math.min((ts - last) / 1000, 0.05));
    last = ts;
    if (world.state === STATE.PLAYING) update(dt);
    if (!r.lost) render();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

boot();
