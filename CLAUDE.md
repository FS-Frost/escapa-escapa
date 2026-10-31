# CLAUDE.md — Escapa Escapa

## Project at a Glance

Pure HTML5 canvas game. Three files, zero dependencies, zero build step.

```
index.html   — Shell + all DOM menu overlays
style.css    — Canvas scaling + overlay/button styles
game.js      — Everything else (~1600 lines)
```

Open `index.html` in a browser to run. No server needed.

## game.js Structure

The file uses `// ===== SECTION NAME =====` banners. In order:

```
CONSTANTS          — CW/CH, lane Y positions, timing values
CANVAS SETUP       — canvas element, imageSmoothingEnabled, resize handler
STATE MACHINE      — STATE enum, setState(), overlay toggling
STORAGE            — localStorage module (scores, daily, achievements, options)
AUDIO              — Web Audio API synth sounds, master gain
INPUT              — keydown/keyup, touchstart/touchend, swipe detection
SPRITES            — drawPlayer, drawZombie, drawSpike, drawBat, drawGhost, drawOrb, drawGoalFlag
PARTICLES          — spawnSparkles, spawnHitStars, spawnTrail, spawnLaneTrailArc
PLAYER             — createPlayer(), tryMoveLane(), updatePlayerY(), easeInOut()
GAME STATE VARS    — score, obstacles[], goal, speedBoost, biome state, etc.
OBSTACLES          — makeObs() factory, drawPit()
SPAWNER            — SPAWN_PATTERNS[], updateSpawner()
GOAL               — spawnGoal()
BIOMES             — drawBiome() for 'city'/'forest'/'sky', drawBackground()
RADAR              — drawRadar() — top 26px HUD strip
HUD                — drawHUD() — score, HP hearts, multiplier, goal warning
COMBO SYSTEM       — onObstacleAvoided(), showComboPopup(), updateComboPopups()
ACHIEVEMENTS       — ACHIEVEMENT_DEFS, achievementsCheck(), drawAchievementBanner()
SPEED LINES        — drawSpeedLines()
GAME LOGIC         — rectOverlap(), hitPlayer(), triggerDeath(), triggerVictory(), checkCollisions()
SCREEN OVERLAYS    — buildStatsHTML(), collectStats(), showDeadScreen(), showVictoryScreen(), renderScoresList()
RESET/START        — startGame()
GAME LOOP          — update(dt), render()
INIT               — bindUI(), player init, setState(MENU), requestAnimationFrame start
```

## Important Invariants

- **`player` must be initialized before the game loop starts.** It is set with `player = createPlayer()` in the INIT section before `setState(STATE.MENU)`. Do not move or remove this line.
- **`render()` runs in all states** (it animates the menu background). Player/obstacle drawing is guarded: `if (state === STATE.PLAYING || state === STATE.PAUSED)`.
- **`update(dt)` only runs in `STATE.PLAYING`.** Never call update logic outside of this guard.
- **`dt` is capped at 0.05 s** in the loop. All physics must use `dt`-scaled values — never assume 60 fps.
- **`player.targetLane`** is the lane the player is moving toward. **`player.lane`** lags behind until `laneT >= 1`. Collision and expression logic should use `targetLane`, not `lane`.
- **`obs.passed` / `obs.scored`** flags prevent double-counting when an obstacle exits the screen.

## Redesign Decisions (agreed 2026-10-31, in progress)

- **Target stack:** Vite + TypeScript + WebGL2 (own shaders, no engine). Pixel-art look kept (480×270 logical, pixelated) — shaders add effects, not a new style. Deploy: GitHub Pages via GitHub Actions on push to `main`. Double-click `index.html` no longer a requirement once migrated.
- **Delivery in phases:** Phase 1 = feature-parity port + new touch input + deploy. New mechanics, generative music, and post-processing/shader effects are Phase 2+.
- **Touch input = tap-to-lane:** `pointerdown` anywhere maps to the lane whose Y is nearest to the touch. No drag, no swipe. Keyboard ↑/↓/Space keeps one-lane steps.
- **Multi-lane jumps** (0→2) are one arc; the player does not collide with lanes crossed in transit — only the target lane (consistent with `targetLane` rule above).
- **Retargeting mid-jump is allowed:** a new input redirects from the current Y; no `laneT` input lock.
- **Orientation:** landscape 16:9; portrait shows a "rotate device" notice.
- **Targets:** Android Chrome + iOS Safari.
- **Persistence:** existing localStorage keys (`player2_*`, `escapa_playername`) must be preserved or migrated transparently — never drop player records.

## Adding a New Obstacle Type

1. Add draw function `drawMyObs(cx, cy)` in the SPRITES section.
2. Add width/height entries in `obsW()` and `obsH()` in OBSTACLES.
3. Add a `yOff` entry in `makeObs()` if the sprite needs vertical centering adjustment.
4. Call `o.draw()` inside `makeObs()`'s returned `draw()` method.
5. Add a `RADAR_COLORS['mytype']` entry in RADAR.
6. Add weighted pattern(s) to `SPAWN_PATTERNS` in SPAWNER.

## Adding a New Achievement

1. Add an entry to `ACHIEVEMENT_DEFS` in ACHIEVEMENTS.
2. Call `achievementsCheck('my_id')` at the right event site.
3. That's it — the banner, localStorage, and jingle are handled automatically.

## Adding a New Biome

1. Add an entry to `BIOMES` with `{ scoreStart, name }`.
2. Add a `name === 'mybiome'` branch inside `drawBiome()` following the same pattern as city/forest/sky.
3. The crossfade and parallax offset are handled automatically by `drawBackground()`.

## Audio

All sounds are in the `sounds` object inside the `audio` IIFE. Each sound is a closure that calls `tone(freq, duration, waveType, volume, delay)`. Add new sounds there and call `audio.play('mySound')` from anywhere.

`AudioContext` is created lazily on first user gesture — `audio.init()` is called at the top of `startGame()`, `bindUI()` click handlers, and touch handlers. Do not create it at module load time.

## localStorage Keys

| Key | Purpose |
|-----|---------|
| `escapa_playername` | Last entered player name (plain string) |
| `player2_hiscores` | Top-5 scores array |
| `player2_daily` | Daily best by `YYYY-MM-DD` key |
| `player2_achievements` | Unlocked achievement timestamps |
| `player2_options` | `{ volume, showRadar, mute }` |

All access goes through the `storage` module. Never call `localStorage` directly elsewhere.

## Pixel Art Conventions

- `P = 2` — one "art pixel" = 2×2 screen pixels.
- All sprite drawing uses `ctx.fillRect(col*P, row*P, P, P)` with `ctx.translate` to the sprite origin.
- `imageSmoothingEnabled = false` is set once at init; never re-enable it.
- Canvas logical resolution is always 480×270. Never change `canvas.width` / `canvas.height` at runtime.

## Known Issues / TODOs

- Building window flicker: `drawBiome('city')` calls `Math.random()` each frame for lit/unlit windows. Fix by seeding per-building state at startup.
- `NEAR_MISS_DIST` constant (line 11) is declared but not used — near-miss detection uses a manual X-overlap check instead. Can be cleaned up.
- `sessionStart` variable is initialized in `startGame()` but never read. Intended for a future "time alive" stat.
