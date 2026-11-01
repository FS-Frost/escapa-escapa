import './style.css';
import { CH, MIN_CW, MAX_CW, setView } from './constants';
import { initRenderer, type Renderer } from './gfx/renderer';
import { world, STATE } from './game/world';
import { update, render } from './game/logic';
import { bindUI, setState, syncPad } from './ui';
import { bindInput } from './input';
import { setLang } from './i18n';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const wrapper = document.getElementById('game-wrapper')!;

// Portrait keeps at least this share of the height for the lane pad.
const PAD_MIN_SHARE = 0.38;
const PAUSE_BTN_MARGIN = 10; // css px: its right offset + a little air

// Fit the game to the safe area. Logical height stays CH; logical width
// follows the screen aspect (clamped), so landscape phones see more road
// instead of black bars. Portrait puts the game on top (MIN_CW wide) and the
// lane pad below. The canvas is backed at device resolution so the present
// pass upscales the CW×CH frame with crisp nearest filtering.
function layout(r: Renderer) {
  const cs = getComputedStyle(document.body);
  const availW = window.innerWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const availH = window.innerHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  const portrait = availH > availW;

  let logicalW: number, w: number, h: number;
  if (portrait) {
    logicalW = MIN_CW;
    w = availW;
    h = w * CH / logicalW;
    if (h > availH * (1 - PAD_MIN_SHARE)) {
      h = availH * (1 - PAD_MIN_SHARE);
      w = h * logicalW / CH;
    }
  } else {
    logicalW = Math.min(MAX_CW, Math.max(MIN_CW, Math.round(CH * availW / availH)));
    const scale = Math.min(availW / logicalW, availH / CH);
    w = logicalW * scale;
    h = CH * scale;
  }

  w = Math.floor(w); h = Math.floor(h);
  const pauseBtn = document.getElementById('pause-btn')!;
  // Button is hidden in menus (offsetWidth 0): fall back to its CSS min size.
  const pauseCss = (pauseBtn.offsetWidth || 44) + PAUSE_BTN_MARGIN;
  setView(logicalW, portrait, Math.ceil(pauseCss * logicalW / w));
  document.body.classList.toggle('portrait', portrait);
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
  // Rotation / resize adapts the layout live; the run keeps going.
  window.addEventListener('resize', () => layout(r));
  setState(STATE.MENU);

  let last = performance.now();
  const loop = (ts: number) => {
    const dt = Math.max(0, Math.min((ts - last) / 1000, 0.05));
    last = ts;
    if (world.state === STATE.PLAYING) update(dt);
    wrapper.classList.toggle('tutorial', !!world.tutorial); // shows the skip button
    syncPad();
    if (!r.lost) render();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

boot();
