// All localStorage access goes through here. Keys are kept from v1 so existing
// records, achievements and options survive the migration.

import { detectLang, type Lang } from './i18n';

export interface Options {
  sfxVolume: number;   // 0..100
  musicVolume: number; // 0..100
  showRadar: boolean;
  mute: boolean;
  lang: Lang;
  vibration: boolean;
  reduceMotion: boolean;
}
export interface RunStats { maxStreak?: number; maxMult?: number; }
export interface ScoreEntry { name: string; score: number; stats: RunStats; date: number; }

const KH = 'player2_hiscores', KD = 'player2_daily',
  KA = 'player2_achievements', KO = 'player2_options', KN = 'escapa_playername',
  KT = 'escapa_tutorial_seen';

function load<T>(k: string, d: T): T {
  try { return JSON.parse(localStorage.getItem(k) ?? 'null') ?? d; } catch { return d; }
}
function save(k: string, v: unknown) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ }
}
const today = () => new Date().toISOString().slice(0, 10);

export const storage = {
  getScores: (): ScoreEntry[] => load<ScoreEntry[]>(KH, []),
  saveScore(name: string, score: number, stats: RunStats) {
    const list = this.getScores();
    list.push({ name, score, stats, date: Date.now() });
    list.sort((a, b) => b.score - a.score);
    save(KH, list.slice(0, 5));
  },
  getDailyBest: (): number => load<Record<string, number>>(KD, {})[today()] || 0,
  saveDailyBest(score: number) {
    const d = load<Record<string, number>>(KD, {});
    if (score > (d[today()] || 0)) { d[today()] = score; save(KD, d); }
  },
  getAchievements: () => load<Record<string, number>>(KA, {}),
  unlockAchievement(id: string): boolean {
    const a = this.getAchievements();
    if (a[id]) return false;
    a[id] = Date.now(); save(KA, a); return true;
  },
  // v1 saved only { volume, showRadar, mute }; newer fields fall back to defaults
  // and the old single `volume` becomes the SFX volume.
  getOptions(): Options {
    const { volume, ...saved } = load<Partial<Options> & { volume?: number }>(KO, {});
    return {
      sfxVolume: volume ?? 70, musicVolume: 60, showRadar: true, mute: false,
      lang: detectLang(),
      vibration: true,
      reduceMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      ...saved,
    };
  },
  saveOptions(o: Options) { save(KO, o); },
  getPlayerName(): string { try { return localStorage.getItem(KN) || ''; } catch { return ''; } },
  // Set once the tutorial was offered and accepted, skipped or finished.
  getTutorialSeen(): boolean { try { return localStorage.getItem(KT) === '1'; } catch { return true; } },
  setTutorialSeen() { try { localStorage.setItem(KT, '1'); } catch { /* storage unavailable */ } },
  savePlayerName(n: string) { try { localStorage.setItem(KN, n); } catch { /* storage unavailable */ } },
};
