// Logical height is fixed; logical width follows the screen's aspect ratio
// (set by layout() in main.ts). `export let` is a live binding: importers
// always read the current value, so read CW at runtime, never cache it.
export const CH = 270;
export const MIN_CW = 320, MAX_CW = 640;
export let CW = 480;
export let PORTRAIT = false; // game view on top + lane pad below
// Logical px covered by the DOM pause button at the top-right corner; canvas
// HUD (radar scale, hearts) stays left of it. Depends on the CSS scale.
export let PAUSE_INSET = 40;
// Multiplier for small HUD text: 2 when logical pixels are small on screen
// (phones), so 7px pixel-font text stays readable.
export let UI_SCALE = 1;
export function setView(width: number, portrait: boolean, pauseInset: number, uiScale: number) {
  CW = width;
  PORTRAIT = portrait;
  PAUSE_INSET = pauseInset;
  UI_SCALE = uiScale;
}
export const RADAR_H = 26;
export const LANE_Y = [210, 160, 110] as const;
export const LANE_COUNT = 3;
export const LANE_GAP = 50;          // px between adjacent lanes
export const BASE_SPEED = 110;
export const GOAL_SCORE = 100;
export const GOAL_TRAVEL_TIME = 30;  // seconds from spawn to arrival
export const LANE_ANIM_DUR = 0.15;   // seconds for a one-lane jump
export const LANE_ARC = 25;          // arc height (px) for a one-lane jump
export const P = 2;                  // one art pixel = 2×2 logical pixels
export const PLAYER_X = 80;
// Obstacles spawn this far ahead of the player (off-screen) and the radar maps
// exactly this range to its full width, so it previews what is coming.
export const SPAWN_AHEAD = 1200;
