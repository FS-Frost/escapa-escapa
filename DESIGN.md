# Design Document — Escapa Escapa

## Overview

Single-file HTML5 canvas game. No build tools, no npm, no frameworks. Everything runs from `index.html` + `game.js` + `style.css` opened directly in a browser.

---

## Architecture

### Canvas vs DOM

The game uses a hybrid approach:

- **Canvas (`480×270` logical pixels)** renders all live gameplay — background, obstacles, player, particles, HUD, radar.
- **DOM overlays** (`position: absolute` over the canvas) render all text-heavy menus — main menu, pause, game over, victory, high scores.

This avoids reimplementing text layout on canvas (hard to make accessible and readable at small sizes) while keeping the game loop simple.

### Coordinate System

Fixed logical resolution of `480×270` (16:9). The canvas element is always this size internally. CSS scales it to fill the viewport using `Math.min(vw/480, vh/270)` with `image-rendering: pixelated` to preserve the crisp pixel look.

Screen shake is applied via `ctx.translate(shakeX, shakeY)` inside `render()` — never CSS `transform`, which would break pixel alignment.

### Game Loop

```
requestAnimationFrame loop
  ├── update(dt)   — only when STATE.PLAYING
  └── render()     — always (animates menu background)
```

`dt` is capped at 50 ms (0.05 s) to prevent spiral-of-death when the tab is backgrounded. All physics and scroll use `dt`-scaled values, so the game runs correctly at any refresh rate.

---

## State Machine

```
MENU → PLAYING ←→ PAUSED
         ↓
        DEAD → HISCORE → MENU
         ↓
      VICTORY → HISCORE → MENU
```

Implemented as a plain integer constant object (`STATE`). `setState(s)` toggles `.hidden` on the five overlay `<div>`s and adds/removes the `.playing` class on the wrapper (which shows the mobile pause button).

---

## Lane System

Three fixed Y positions:

| Lane | Y (canvas px) | Typical hazards |
|------|---------------|-----------------|
| 0 (bottom) | 210 | Zombies, spikes, pits, orbs |
| 1 (mid)    | 160 | Zombies, bats, orbs |
| 2 (top)    | 110 | Bats, ghosts |

Lane switching uses ease-in-out cubic interpolation over `LANE_ANIM_DUR = 0.15 s`. During the transition a parabolic arc offset (`-25 * sin(laneT * π)`) gives the illusion of a jump. Input is locked while `laneT < 0.85` to prevent spam.

`player.lane` lags behind `player.targetLane` until `laneT >= 1`. Collision detection uses `targetLane` for the lane-match check so the player commits to the new lane as soon as they initiate the move.

---

## Entity System

All entities (obstacles, particles, goal) follow a duck-typed interface:

```js
{
  x, y, w, h,   // bounding box
  active,        // false = remove this frame
  update(dt),
  draw(),
}
```

Arrays (`obstacles[]`, `particles[]`) are filtered each frame: `arr = arr.filter(e => e.active)`. No object pooling — GC pressure is negligible at this entity count.

### Obstacle Factory

`makeObs(type, lane, x)` returns a complete entity object. Per-type behavior (sine-wave Y for bats/ghosts, animation frames for zombies/bats) is encoded inline in the returned `update()` closure, capturing `type` and `lane` from the factory scope.

### Spawner

Weighted random pattern selection. `SPAWN_PATTERNS` is an array of `{ weight, fn }` objects. A single weighted pick runs each spawn tick, whose interval shrinks from 1.2 s → 0.45 s as score increases: `interval = max(0.45, 1.2 - score * 0.005)`.

When the player's HP is below max and RNG fires (15% chance), a Big M Orb is spawned instead of a hazard pattern.

---

## Collision Detection

AABB with an 18% inset shrink on the player rect:

```js
ax = player.x + w*0.18,  aw = w * 0.64
ay = player.y + h*0.18,  ah = h * 0.64
```

This gives forgiving "feel" without per-pixel precision. Pits are a special case: collision is only checked when `player.targetLane === 0`, and scoring (avoiding) only when `player.targetLane > 0`.

Invincibility frames (`player.invincible`) last 1.2 s after a hit, preventing multi-hit from a single obstacle.

---

## Scoring & Combo

- Each avoided obstacle scores `player.comboMultiplier` points.
- Streak = consecutive obstacles/pits avoided without a hit.
- Multiplier bumps at streak milestones: 5 → ×2, 10 → ×3, 15 → ×4 (max).
- A hit resets both streak and multiplier to ×1.
- Near-miss (adjacent lane, tight horizontal overlap) triggers `scared` expression and a tiny blip sound but does not break the combo.

---

## Goal Sequence

1. When `score >= 100` (checked in `onObstacleAvoided`), `spawnGoal()` is called once.
2. Goal spawns at `player.x + scrollSpeed * GOAL_TRAVEL_TIME` — exactly 30 seconds away at current speed.
3. `goalApproaching = true` starts the speed ramp: `speedBoost` climbs toward 2.5× over the 30-second window.
4. Goal alarm sound fires every ~3 seconds.
5. Speed lines particle effect activates above `speedBoost > 1.6`.
6. When the goal's `x` reaches `player.x`, `triggerVictory()` fires.

Because `speedBoost` increases over time, the actual travel distance covered is more than the initial estimate, so the goal typically arrives in slightly less than 30 s — this is intentional (it accelerates toward you).

---

## Biome System

Three biomes with score thresholds:

| Biome | Threshold | Palette |
|-------|-----------|---------|
| City  | 0 | Dark blue sky, neon buildings, yellow road markings |
| Forest | 34 | Dark green, mushrooms, firefly particles |
| Sky   | 67 | Deep space, aurora bands, star blink, cloud floor |

Each biome's `drawBiome()` function takes a scroll offset and draws three conceptual parallax layers with hardcoded multipliers (0.12 × / 0.3 × / 0.6 × scroll speed). The layers are baked into a single function rather than composited separately to keep draw calls minimal.

Crossfade: when `score` crosses a threshold, a `biomeTransition` object is created with `{ from, to, t, dur: 3.0 }`. Each frame the old biome renders at α=1, the new biome at `globalAlpha = t`. After `t >= 1`, the transition object is cleared and `currentBiome` is updated.

---

## Sprites

All sprites are drawn programmatically with `ctx.fillRect` at 2 px per art pixel. No image files. Sprite definitions are inline in their draw functions:

| Sprite | Art size | Notes |
|--------|----------|-------|
| Player | 9×9 | 5 expression variants; shine/shadow on cube faces |
| Zombie | 6×10 | 2-frame walk cycle |
| Spike | 8×8 | Two triangles, shine pixel |
| Bat | 10×7 | 2-frame wing flap |
| Ghost | 8×9 | Semi-transparent, wavy bottom |
| Big M Orb | — | Radial gradient + canvas `arc` + text "M" |
| Goal flag | — | Pole + rect + "★" text |

---

## Particles

All effects share the `particles[]` array. Each particle is a plain object with `update(dt)`, `draw()`, and `active`. Four types:

| Type | Trigger | Visual |
|------|---------|--------|
| Sparkles | Obstacle avoided | 8 gold/orange pixels burst outward |
| Hit stars | Player hit | 10 white/pink pixels burst outward |
| Trail | High speed (goal approach) | Fading purple cube behind player |
| Lane arc | Lane switch | 6 pink pixels along the arc path |

---

## Audio

All sound is synthesized via Web Audio API. No external files. `AudioContext` is created lazily on first user gesture (required by browser autoplay policy).

A master `GainNode` sits between all oscillators and `destination`, implementing the volume slider and mute toggle.

Each sound is a function that creates `OscillatorNode` → `GainNode` → master, with an exponential gain ramp to silence. Multiple tones are staggered with `delay` offsets to create chords and arpeggios.

| Sound | Waveform | Character |
|-------|----------|-----------|
| jump | square, two-tone | Quick ascending chirp |
| hit | sawtooth | Low crunch |
| powerup | sine, 4-note | Ascending arpeggio |
| death | sawtooth, 4-note | Descending fall |
| victory | sine, 6-note + chord | Fanfare |
| pass | square | Tiny blip per obstacle |
| goalAlarm | square, two-tone | Alternating alert |
| combo | sine, two-tone | Brief shine |
| nearMiss | sine | Subtle whoosh |
| achievement | sine, 3-note | Rising unlock jingle |

---

## Persistence (localStorage)

| Key | Type | Contents |
|-----|------|----------|
| `player2_hiscores` | Array (max 5) | `{ name, score, stats, date }` sorted by score desc |
| `player2_daily` | Object | `{ "YYYY-MM-DD": bestScore }` — auto-expires by key |
| `player2_achievements` | Object | `{ achievementId: timestamp }` |
| `player2_options` | Object | `{ volume, showRadar, mute }` |

All access goes through the `storage` module, which wraps `localStorage` in try/catch to silently degrade in private-browsing or storage-restricted environments.

---

## Key Constants

```js
CW = 480, CH = 270          // canvas logical resolution
RADAR_H = 26                // radar strip height (px)
LANE_Y = [210, 160, 110]    // Y center per lane
BASE_SPEED = 110            // px/s at score 0
GOAL_SCORE = 100            // points needed to spawn goal
GOAL_TRAVEL_TIME = 30       // seconds from goal spawn to arrival
LANE_ANIM_DUR = 0.15        // seconds per lane transition
```

---

## Known Design Trade-offs

- **No object pooling** — fine at this entity density; GC pauses are not measurable.
- **Background redraws every frame** — building windows use `Math.random()` inline for their lit/unlit state, causing flicker. Fix: seed per-building state at spawn time instead.
- **Single JS file** — all game logic in `game.js`. Easy to read and ship; would need splitting for a larger project.
- **Biome parallax layers are baked into one function per biome** — efficient but harder to add new layers without touching `drawBiome`.
