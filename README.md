# NightOps FPS Kit

A small, hackable **first-person-shooter starter kit** for the web — built with
**Three.js** (r0.169) and **Vite**, no framework, no build magic beyond Vite. It ships a
complete, polished night military shooter and a clean toolkit so you (and your AI pair) can
build your **own** FPS level or game on top of it fast.

> **A themed kit, not a blank engine — with two honest reuse tiers.** `engine/` is generic FPS
> infrastructure; `kit/` is a batteries-included *military-FPS toolkit* built on it (it knows about
> walls, towers, vehicles, fuel barrels on purpose); `game/` is one shipped game. Reuse just the
> engine, or the whole kit, or fork the game — see [Architecture](#architecture-at-a-glance).

## Two games, one engine

**▶ [Play ARCFALL](https://nightops-first-fps.up.railway.app/?level=arcfall)** — a *daytime* island survival hunt: drop onto a time-fractured island, recover the **12 lost Arcs**, and survive the dinosaurs and giant mechs that guard them.

| | |
|:-:|:-:|
| ![ARCFALL — action](media/arcfall-1.jpg) | ![ARCFALL — the island](media/arcfall-2.jpg) |

**▶ [Play NightOps](https://nightops-first-fps.up.railway.app/?level=desert-base)** — a *night* military raid: infiltrate the desert base and **reach & disarm the bomb** before detonation.

| | |
|:-:|:-:|
| ![NightOps — the gate](media/nightops-1.jpg) | ![NightOps — the base](media/nightops-2.jpg) |

> Both ship on the same engine + kit — proof it generalizes (reuse just `engine/`, the whole `kit/`, or fork a `game/`).

---

## What's in the box

- **First-person controller** — pointer-lock look, WASD, sprint, jump, duck, headbob.
- **Gunplay** — hitscan rifle (recoil, muzzle flash, tracers, impact sparks/decals, hitmarkers),
  a **missile launcher** (Q), and **grenades** (right-click).
- **Engine impact system** — distance-falloff blasts that damage enemies, knock back/ragdoll, and
  shove mass-aware physics props.
- **Destructibles** — shootable **fuel barrels**, **fuel tanks**, and **vehicles** (launched into the
  air on death) with chain-reaction cook-offs, on a clean **unit-damage** scale.
- **Rigged glTF enemies** — patrol → take-cover → peek-and-fire AI that paths around obstacles and
  respects wall line-of-sight.
- **An enemy gunship boss** — descends, strafes, and can be killed by rifle or one rocket.
- **Cinematic fast-rope insertion** intro, tactical HUD, win/lose flow.
- **Two objective types** — `exfil` (clear all + reach the flag) and `defuse` (crack a timed bomb
  code, including a self-working "mentalist" code puzzle).
- **Levels as data** — drop a module in `src/game/levels/`, register it, and it's selectable with
  `?level=<id>`. Two ship in the box: `compound` and `desert-base`.
- **Night rendering** — baked sky + IBL, a starfield, cel-shaded ink **OutlineEffect**, soft shadows,
  floodlights.

## Controls (desktop)

- **WASD** move · **Shift** sprint · **Space** jump · **C** duck
- **Mouse** look · **Left-click** fire (full-auto) · **R** reload
- **Q** toggle the missile launcher · **Right-click** throw a grenade
- Click **Deploy** to lock the mouse and start.

> **Desktop / laptop only for now.** The game gates phones & tablets with a "play on a computer"
> screen (mobile touch controls exist in `engine/touch.js` but are disabled — the gate lives in
> `src/device.js`, called at the bottom of `main.js`). Input is read by **physical key**
> (`event.code`), so non-Latin keyboard layouts (Hebrew, Russian, …) work without switching to English.

## Run it

```bash
npm install
npm run dev        # http://localhost:5180
```

Pick a level with a query param: `http://localhost:5180/?level=compound`

## Build & deploy

```bash
npm run build      # -> dist/
npm start          # serves dist/ on $PORT (default 8080) via server.js
```

Deploys as a static site behind a tiny Node server (`server.js`). The live demo runs on Railway.

## Architecture at a glance

Three tiers, flat and framework-free (~4.4k lines). The arrows show what may import what — a lint rule
(`npm run lint`) enforces it, so the layers can't rot into each other:

```
engine/  ← generic, content-agnostic FPS systems
   ▲       render • controller • input • weapon viewmodel • projectiles+blast • vfx • hud • audio • assets
   │
kit/     ← the military-FPS TOOLKIT (uses engine, never game)
   ▲       level-builder (walls/towers/vehicles/barrels…) • destructibles • content/ (model catalogs)
   │
game/    ← THIS game only (uses engine + kit)
           config+balance • combat • actors/ (enemy, helicopter) • objectives/ (defuse, exfil) • levels/

main.js  ← the runner: wires the tiers, owns the state machine + per-frame loop
```

**The rule:** `engine/` imports nothing from `kit/` or `game/`; `kit/` may use `engine/`; `game/`
may use both. That's why there are two clean reuse tiers — take just `engine/`, or the whole `kit/`.

- **Tuning is data** — all gameplay numbers live in `game/config.js` → `balance` (HP, damage, the
  unit scale, blast radii, timings). Levels override per-section via `mergeConfig`.
- **Content is data** — a level is a module `{ id, name, config?, build(b) }`; an objective and a
  weapon are small modules behind a registry. Adding them doesn't touch the runner.

## Build your own

**Recommended path:** clone → `npm run dev` → copy `src/game/levels/compound.js` to a new module and
register it in `levels/index.js` → lay out your map with the `LevelBuilder` calls → retune
`config.balance` → (optionally) add an objective or weapon module. Then `npm run lint && npm run build`.

- **[skills/](skills/)** — the AI-first task skills: the `LevelBuilder` cheat-sheet,
  adding a level/weapon/enemy/audio, verifying in-browser, and shipping. Start with `engine-overview`.
- **[ARCHITECTURE.md](ARCHITECTURE.md)** — the full module map + the dependency rule.
- **[CONTRIBUTING.md](CONTRIBUTING.md)** — the boundary rule, where-things-go table, house style, CI.
- **[AGENTS.md](AGENTS.md)** — building with **Claude / an AI agent**? This hands your agent the
  conventions, the `window.__game` dev hooks, and the in-browser verification workflow.

## Roadmap / follow-ups

- **Add CI** — paste the workflow from [CONTRIBUTING.md](CONTRIBUTING.md) into `.github/workflows/ci.yml`
  (via the GitHub web UI) to run lint + build on every PR.
- **A `npm test` smoke harness** — formalize the `window.__game` checks (LOS, shot counts, code solves).
- **Grow "The Lost Arcs"** — more weapons/monsters, a robot boss fight, biomes, day/night cycle.
- **Re-enable mobile** — the touch controls (`engine/touch.js`) are intact, just gated off in
  `src/device.js` (called at the bottom of `main.js`).
- Known nit: a few enemies can settle slightly into the ground on death (cosmetic).

## Tech

Three.js (PointerLockControls, GLTFLoader, SkeletonUtils, OutlineEffect), procedural geometry &
canvas textures, Web Audio. Single-page; no backend logic (just a static file server).

## Credits

- **Player operator (SWAT):** CC0 "Ultimate Modular Men" low-poly character pack.
- **Vehicles (truck/flatbed/SUV/van):** Kenney CC0 Car Kit (tinted military).
- **Ammo magazine pickup:** CC0 "Low Poly Weapons Pack".
- **Missile launcher viewmodel:** CC0 low-poly rocket launcher.
- **Attack & insertion helicopters:** built procedurally (no external model).
- **Rotor loop:** [w84death/the-complex-project](https://github.com/w84death/the-complex-project) (MIT).
- **"Enemy spotted" radio callout:** Counter-Strike radio sound.

## License

[MIT](LICENSE). Bundled third-party assets keep their own CC0/MIT terms (see Credits).
