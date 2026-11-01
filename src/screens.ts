import { t, type Key } from './i18n';
import { storage } from './storage';
import { audio } from './audio';
import { STAGES, MAX_STARS, isStageUnlocked, totalStars } from './game/stages';
import { BIOMES } from './game/biomes';
import { SKINS, skinColors, isSkinUnlocked, type Skin } from './game/skins';
import { world } from './game/world';
import type { RunConfig } from './game/logic';

// Menu screens added on top of the main menu: mode select, stage select and
// skins. All are DOM overlays (overlay-top) and never change the game state.

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const show = (id: string, on: boolean) => $(id).classList.toggle('hidden', !on);
const isOpen = (id: string) => !$(id).classList.contains('hidden');

let start: (c: RunConfig) => void = () => {};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

export const starString = (n: number, max = 3) => '★'.repeat(n) + '☆'.repeat(max - n);

// ===== MODES =====
export function openModes() {
  const stars = totalStars(storage.getStageStars());
  $('modes-stages-sub').textContent = t('modes.stagesSub', { n: stars, max: MAX_STARS });
  $('modes-endless-sub').textContent = t('modes.endlessSub', { n: storage.getScores(world.opts.difficulty)[0]?.score ?? 0 });
  $('modes-daily-sub').textContent = t('modes.dailySub', { n: storage.getDailyChallengeBest() });
  show('overlay-modes', true);
}

// ===== STAGES =====
export function openStages() {
  const stars = storage.getStageStars();
  $('stage-grid').replaceChildren(...STAGES.map(s => {
    const unlocked = isStageUnlocked(s.id, stars);
    const b = el('button', 'stage-card');
    b.disabled = !unlocked;
    b.dataset.biome = BIOMES[s.biome].name;
    b.append(
      el('span', 'stage-num', String(s.id)),
      el('span', 'stage-name', unlocked ? t(`stage.${s.id}` as Key) : '🔒'),
      el('span', 'stage-stars', unlocked ? starString(stars[s.id] ?? 0) : t('stages.locked')),
    );
    if (unlocked) b.addEventListener('click', () => { closeAll(); start({ mode: 'stage', stageId: s.id }); });
    return b;
  }));
  show('overlay-modes', false);
  show('overlay-stages', true);
}

// ===== SKINS =====
// 9×9 cube preview on a small 2D canvas (DOM only; the game itself is WebGL).
function drawSkinPreview(canvas: HTMLCanvasElement, skin: Skin) {
  const ctx = canvas.getContext('2d')!;
  const c = skinColors(skin, 3.2);
  const p = canvas.width / 9;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let row = 1; row <= 7; row++) {
    for (let col = 1; col <= 7; col++) {
      ctx.fillStyle = row === 7 || col === 7 ? c.shadow : row === 1 || col === 1 ? c.shine : c.body;
      ctx.fillRect(col * p, row * p, p, p);
    }
  }
  ctx.fillStyle = c.face;
  for (const [col, row, w] of [[2, 3, 1], [5, 3, 1], [2, 6, 1], [3, 7, 3], [6, 6, 1]]) ctx.fillRect(col * p, row * p, w * p, p);
}

export function openSkins() {
  const stars = totalStars(storage.getStageStars());
  const owned = storage.getOwnedSkins();
  const gems = storage.getGems();
  const current = storage.getSkin();
  $('skins-wallet').textContent = `${t('skins.wallet', { n: gems })} · ★ ${stars}`;
  $('skin-grid').replaceChildren(...SKINS.map(skin => {
    const unlocked = isSkinUnlocked(skin, stars, owned);
    const b = el('button', 'skin-card');
    b.setAttribute('aria-pressed', String(skin.id === current));
    const cv = el('canvas');
    cv.width = cv.height = 36;
    drawSkinPreview(cv, skin);
    let status = t('skins.inUse');
    if (!unlocked) status = skin.stars !== undefined ? t('skins.needStars', { n: skin.stars }) : t('skins.buy', { n: skin.gems! });
    else if (skin.id !== current) status = '';
    b.append(cv, el('span', 'skin-name', t(`skin.${skin.id}` as Key)), el('span', 'skin-status', status));
    const buyable = !unlocked && skin.gems !== undefined && gems >= skin.gems;
    b.disabled = !unlocked && !buyable;
    b.addEventListener('click', () => {
      if (!unlocked && !storage.buySkin(skin.id, skin.gems!)) return;
      if (!unlocked) audio.play('achievement');
      storage.setSkin(skin.id);
      world.skin = skin.id;
      openSkins();
    });
    return b;
  }));
  show('overlay-skins', true);
}

export function closeAll() {
  for (const id of ['overlay-modes', 'overlay-stages', 'overlay-skins']) show(id, false);
}

// Esc support: true if a screen was open and got closed.
export function closeTopScreen(): boolean {
  if (isOpen('overlay-stages')) { show('overlay-stages', false); openModes(); return true; }
  for (const id of ['overlay-modes', 'overlay-skins']) if (isOpen(id)) { show(id, false); return true; }
  return false;
}

export function bindScreens(startGame: (c: RunConfig) => void) {
  start = startGame;
  const click = (id: string, fn: () => void) => $(id).addEventListener('click', fn);
  click('btn-mode-stages', openStages);
  click('btn-mode-endless', () => { closeAll(); start({ mode: 'endless' }); });
  click('btn-mode-daily', () => { closeAll(); start({ mode: 'daily' }); });
  click('btn-modes-back', closeAll);
  click('btn-stages-back', () => { show('overlay-stages', false); openModes(); });
  click('btn-skins-menu', openSkins);
  click('btn-skins-back', closeAll);
}
