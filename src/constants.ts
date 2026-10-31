export const CW = 480, CH = 270;
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
