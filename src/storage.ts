// All localStorage access goes through here. Keys are kept from v1 so existing
// records, achievements and options survive the migration.

export interface Options { volume: number; showRadar: boolean; mute: boolean; }
export interface RunStats { maxStreak?: number; maxMult?: number; }
export interface ScoreEntry { name: string; score: number; stats: RunStats; date: number; }

const KH = 'player2_hiscores', KD = 'player2_daily',
  KA = 'player2_achievements', KO = 'player2_options', KN = 'escapa_playername';

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
  getOptions: (): Options => ({ volume: 70, showRadar: true, mute: false, ...load<Partial<Options>>(KO, {}) }),
  saveOptions(o: Options) { save(KO, o); },
  getPlayerName(): string { try { return localStorage.getItem(KN) || ''; } catch { return ''; } },
  savePlayerName(n: string) { try { localStorage.setItem(KN, n); } catch { /* storage unavailable */ } },
};
