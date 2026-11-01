// Difficulty presets. "hard" equals the original v1 rules (1 life, an orb can
// raise it to 2), so v1 records belong to it.

export type Difficulty = 'easy' | 'normal' | 'hard';
export const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];

export interface DifficultyRules {
  lives: number;      // starting hearts
  maxLives: number;   // cap that health orbs can refill to
  speed: number;      // × BASE_SPEED
  interval: number;   // × spawn interval (higher = fewer obstacles)
}

export const RULES: Record<Difficulty, DifficultyRules> = {
  easy: { lives: 5, maxLives: 5, speed: 0.85, interval: 1.25 },
  normal: { lives: 3, maxLives: 3, speed: 1, interval: 1 },
  hard: { lives: 1, maxLives: 2, speed: 1.15, interval: 0.82 },
};
