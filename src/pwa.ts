// PWA: service worker registration (production only) and install offer.
// - Chromium (Android/desktop) fires `beforeinstallprompt`: we keep the event
//   and show an "Install" button that calls prompt().
// - iOS Safari has no prompt: the same button opens Add-to-Home-Screen help.
// - Nothing is offered when already running as an installed app.

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;

const isStandalone = () =>
  matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

// iPhone/iPod/iPad, including iPadOS reporting itself as a Mac.
const isIOS = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export type InstallMode = 'prompt' | 'ios' | null;

export function installMode(): InstallMode {
  if (isStandalone()) return null;
  if (deferred) return 'prompt';
  return isIOS() ? 'ios' : null;
}

// `onChange` is called whenever installMode() may have changed.
export function initPwa(onChange: () => void) {
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(err => console.warn('SW registration failed', err));
    });
  }
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault(); // we show our own button instead of the mini-infobar
    deferred = e as BeforeInstallPromptEvent;
    onChange();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    onChange();
  });
  onChange();
}

// Shows the native prompt; resolves once the user answered.
export async function promptInstall() {
  if (!deferred) return;
  const e = deferred;
  deferred = null; // a prompt event can only be used once
  await e.prompt();
  await e.userChoice.catch(() => undefined);
}
