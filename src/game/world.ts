import { BASE_SPEED } from '../constants';
import { storage, type RunStats } from '../storage';
import { createPlayer, type Player } from './player';
import type { Obstacle, Goal } from './obstacles';
import type { Particle } from './particles';
import type { Color } from '../gfx/color';
import { t } from '../i18n';

export const STATE = { MENU: 0, PLAYING: 1, PAUSED: 2, DEAD: 3, VICTORY: 4, HISCORE: 5 } as const;
export type State = typeof STATE[keyof typeof STATE];

export interface ComboPopup { text: string; x: number; y: number; life: number; maxLife: number; vy: number; color: Color; }
export interface Banner { text: string; life: number; maxLife: number; }
export interface BiomeTransition { from: number; to: number; t: number; dur: number; }

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
  goalAlarmTimer: 0,
  speedBoost: 1,
  shakeX: 0,
  shakeY: 0,
  shakeDur: 0,
  comboPopups: [] as ComboPopup[],
  achievementBanner: null as Banner | null,
  biomeTransition: null as BiomeTransition | null,
  currentBiome: 0,
  particles: [] as Particle[],
  spawnTimer: 0,
  runStats: {} as RunStats,
  opts: storage.getOptions(),
  playerName: storage.getPlayerName(), // raw input; may be empty
};

// Name shown in HUD, titles and records; falls back to the localized default.
export const displayName = () => world.playerName || t('defaultName');
