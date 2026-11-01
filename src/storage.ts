import { detectLang, type Lang } from './i18n';
import type { Difficulty } from './game/difficulty';

// All localStorage access goes through here. Keys are kept from v1 so existing
// records, achievements and options survive the migration.

export interface Options {
  sfxVolume: number;   // 0..100
  musicVolume: number; // 0..100
  showRadar: boolean;
  mute: boolean;
  lang: Lang;
  vibration: boolean;
  reduceMotion: boolean;
  difficulty: Difficulty;
}
export interface RunStats { maxStreak?: number; maxMult?: number; stars?: number; }
export interface ScoreEntry { name: string; score: number; stats: RunStats; date: number; }

const KH = 'player2_hiscores', KD = 'player2_daily',
  KA = 'player2_achievements', KO = 'player2_options', KN = 'escapa_playername',
  KT = 'escapa_tutorial_seen', KM = 'escapa_music_unlocked',
  KS = 'escapa_stage_stars', KG = 'escapa_gems', KSK = 'escapa_skin', KSO = 'escapa_skins_owned',
  KDC = 'escapa_daily_challenge';

export const todayKey = () => new Date().toISOString().slice(0, 10);

// Records and daily bests are per difficulty. v1 played with hard rules, so
// hard keeps the original keys; easy/normal get suffixed ones.
const scoresKey = (d: Difficulty) => d === 'hard' ? KH : `${KH}_${d}`;
const dailyKey = (d: Difficulty) => d === 'hard' ? KD : `${KD}_${d}`;

function load<T>(k: string, d: T): T {
  try { return JSON.parse(localStorage.getItem(k) ?? 'null') ?? d; } catch { return d; }
}
function save(k: string, v: unknown) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ }
}
const today = todayKey;

export const storage = {
  getScores: (d: Difficulty): ScoreEntry[] => load<ScoreEntry[]>(scoresKey(d), []),
  saveScore(d: Difficulty, name: string, score: number, stats: RunStats) {
    const list = this.getScores(d);
    list.push({ name, score, stats, date: Date.now() });
    list.sort((a, b) => b.score - a.score);
    save(scoresKey(d), list.slice(0, 5));
  },
  getDailyBest: (d: Difficulty): number => load<Record<string, number>>(dailyKey(d), {})[today()] || 0,
  saveDailyBest(d: Difficulty, score: number) {
    const all = load<Record<string, number>>(dailyKey(d), {});
    if (score > (all[today()] || 0)) { all[today()] = score; save(dailyKey(d), all); }
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
      difficulty: 'normal',
      ...saved,
    };
  },
  saveOptions(o: Options) { save(KO, o); },
  getPlayerName(): string { try { return localStorage.getItem(KN) || ''; } catch { return ''; } },
  // Set once the tutorial was offered and accepted, skipped or finished.
  getTutorialSeen(): boolean { try { return localStorage.getItem(KT) === '1'; } catch { return true; } },
  setTutorialSeen() { try { localStorage.setItem(KT, '1'); } catch { /* storage unavailable */ } },
  // Stages: best stars per stage id.
  getStageStars: (): Record<number, number> => load<Record<number, number>>(KS, {}),
  saveStageStars(id: number, stars: number) {
    const all = this.getStageStars();
    if (stars > (all[id] ?? 0)) { all[id] = stars; save(KS, all); }
  },
  // Gems: persistent currency for skins.
  getGems: (): number => load<number>(KG, 0),
  addGems(n: number) { if (n) save(KG, this.getGems() + n); },
  // Skins: selected id + ids bought with gems.
  getSkin: (): string => load<string>(KSK, 'classic'),
  setSkin(id: string) { save(KSK, id); },
  getOwnedSkins: (): string[] => load<string[]>(KSO, []),
  buySkin(id: string, price: number): boolean {
    const gems = this.getGems(), owned = this.getOwnedSkins();
    if (owned.includes(id) || gems < price) return false;
    save(KG, gems - price);
    save(KSO, [...owned, id]);
    return true;
  },
  // Daily challenge: best score per UTC date (same seed for everyone that day).
  getDailyChallengeBest: (): number => load<Record<string, number>>(KDC, {})[today()] || 0,
  saveDailyChallenge(score: number): boolean {
    const all = load<Record<string, number>>(KDC, {});
    if (score <= (all[today()] || 0)) return false;
    all[today()] = score; save(KDC, all); return true;
  },
  // Jukebox: tracks unlocked by reaching their biome (menu and city from the start).
  getUnlockedTracks: (): string[] => load<string[]>(KM, ['menu', 'city']),
  unlockTrack(id: string) {
    const list = this.getUnlockedTracks();
    if (!list.includes(id)) save(KM, [...list, id]);
  },
  savePlayerName(n: string) { try { localStorage.setItem(KN, n); } catch { /* storage unavailable */ } },
};
