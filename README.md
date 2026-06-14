# Escapa Escapa

A colorful pixel-art HTML5 auto-scroller game. Player — a cute lavender cube — must dodge obstacles across three lanes and reach the finish line.

## Play

Open `index.html` in any modern browser. No server, build step, or internet connection required.

```
open index.html        # macOS
start index.html       # Windows
xdg-open index.html    # Linux
```

Or serve locally if you prefer:

```
python3 -m http.server 5500
# then open http://localhost:5500
```

## Controls

| Action | Keyboard | Mobile |
|--------|----------|--------|
| Move up one lane | `↑` or `Space` | Swipe up |
| Move down one lane | `↓` | Swipe down |
| Pause / Resume | `P` or `Esc` | Tap ⏸ button |

## How to Play

1. Obstacles scroll in from the right across three lanes (top, mid, bottom).
2. Switch lanes to avoid them. Each avoided obstacle earns **1 point × your current multiplier**.
3. Avoid 5 obstacles in a row to bump your multiplier: **×1 → ×2 → ×3 → ×4**.
4. Reach **100 points** and the goal flag appears on the radar — it will arrive on screen in **30 seconds** (pace accelerates).
5. Reach the goal to win. **¡Player escapó!**

## Obstacles

| Name | Lane(s) | Description |
|------|---------|-------------|
| Zombie | Bottom, Mid | Animated walking enemy |
| Spike | Bottom | Static sharp trap |
| Bat | Mid, Top | Sine-wave flying enemy |
| Ghost | Top | Translucent, sine-wave drifter |
| Pit | Bottom | Gap in the floor — be in lane 1 or 2 |
| Big M Orb | Any | Power-up: grants +1 HP (max 2) |

## Features

- **3-lane system** with smooth arc animation when switching
- **Radar strip** at the top showing color-coded incoming hazards and the goal beacon
- **Combo multiplier** up to ×4 with milestone popups
- **Screen shake + hit flash** on damage
- **Particle effects** — sparkles on avoids, hit stars on damage, speed trail near the goal
- **Player expressions** — reacts to shield status, near-misses, and the goal rush
- **3 biomes** — City → Forest → Sky — with smooth parallax crossfades
- **Synthesized audio** via Web Audio API (no external sound files)
- **Achievements** tracked in localStorage
- **High scores** — top 5 with name entry, plus daily best
- **Pause menu** — volume, mute, radar toggle
- **Mobile-ready** — touch swipe controls, on-screen pause button, scales to any screen

## Achievements

| Achievement | Condition |
|-------------|-----------|
| ¡Primera escapada! | Win a run |
| Intocable x10 | Reach a 10-obstacle streak |
| Combo máximo | Reach the ×4 multiplier |
| Demonio de velocidad | Survive 10 seconds at max speed |
| Regreso épico | Win with only 1 HP remaining |

## Files

```
index.html   — Game shell and DOM overlays (menus, pause, victory, scores)
style.css    — Canvas scaling, overlay panels, button styles
game.js      — All game logic (~1600 lines, no dependencies)
```

## Browser Compatibility

Tested on Chrome 120+, Firefox 122+, Safari 17+, and mobile Chrome/Safari. Requires Canvas 2D and Web Audio API — both are baseline in all modern browsers.
