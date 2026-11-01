import { BASE_SPEED } from '../constants';
import { storage, type RunStats } from '../storage';
import { createPlayer, type Player } from './player';
import type { Obstacle, Goal } from './obstacles';
import type { Particle } from './particles';
import type { Tutorial } from './tutorial';
import type { RunMode, StageDef } from './stages';
import type { Difficulty } from './difficulty';
import type { Color } from '../gfx/color';
import { t } from '../i18n';

export const STATE = { MENU: 0, PLAYING: 1, PAUSED: 2, DEAD: 3, VICTORY: 4, HISCORE: 5 } as const;
export type State = typeof STATE[keyof typeof STATE];

export interface ComboPopup { text: string; x: number; y: number; life: number; maxLife: number; vy: number; color: Color; }
export interface Banner { text: string; life: number; maxLife: number; }
export interface BiomeTransition { from: number; to: number; t: number; dur: number; }
export interface LaneFlash { lane: number; life: number; }
export interface Beam { lane: number; t: number; hit: boolean; done: boolean; }
export type PowerKind = 'shield' | 'magnet' | 'slowmo';
export interface ActivePower { kind: Exclude<PowerKind, 'shield'>; t: number; dur: number; }
export interface Caption { title: string; sub: string; life: number; maxLife: number; color: string; }

// Single mutable game state shared by all game modules.
export const world = {
  state: STATE.MENU as State,
  player: createPlayer() as Player,
  score: 0,
  hiScore: 0,
  scrollSpeed: BASE_SPEED,
  worldX: 0,
  gameTime: 0,
  obstacles: [] as Obstacle[],
  goal: null as Goal | null,
  goalSpawned: false,
  goalApproaching: false,
  goalTimer: 0,          // seconds since the goal appeared
  goalCountdown: 0,      // last 3-2-1 beep played
  speedBoost: 1,
  shakeX: 0,
  shakeY: 0,
  shakeDur: 0,
  comboPopups: [] as ComboPopup[],
  achievementBanner: null as Banner | null,
  biomeTransition: null as BiomeTransition | null,
  currentBiome: 0,
  particles: [] as Particle[],
  laneFlash: null as LaneFlash | null, // highlight of the lane just chosen
  tutorial: null as Tutorial | null,
  // Last input kind, so prompts say "tap" or show keys.
  inputMode: (matchMedia('(pointer: coarse)').matches ? 'touch' : 'keys') as 'touch' | 'keys',
  // Run setup
  mode: 'stage' as RunMode,
  difficulty: storage.getOptions().difficulty as Difficulty, // effective for this run (daily forces normal)
  stage: null as StageDef | null,
  seed: 0,
  nextSpawnX: 0,          // worldX at which the spawner fires next (distance-based)
  // Biome mechanics / pickups
  beams: [] as Beam[],    // sky: telegraphed lane lasers
  power: null as ActivePower | null,
  shield: false,
  runGems: 0,
  caption: null as Caption | null, // biome intro / storm warning text
  seenBiomes: new Set<number>(),   // biomes introduced this run
  skin: storage.getSkin(),
  runStats: {} as RunStats,
  opts: storage.getOptions(),
  playerName: storage.getPlayerName(), // raw input; may be empty
};

// Name shown in HUD, titles and records; falls back to the localized default.
export const displayName = () => world.playerName || t('defaultName');
