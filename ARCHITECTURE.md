# Architecture

A small, flat FPS kit. Three tiers draw clean lines from generic infrastructure to this game's
content. No frameworks, no entity-component system — just plain ES modules and one config object.

```
src/
  engine/   generic, content-agnostic systems (render, controller, input, weapon viewmodel,
            projectiles+blast, vfx, hud, audio, assets, primitives, laser-sight, postfx)
  kit/      the military-FPS TOOLKIT built on the engine: the level-builder, the destructible
            system, and content/ (the vehicle/pickup/weapon asset catalogs)
  game/     THIS game only: config, combat, intro, actors/ (enemy, helicopter, operator),
            objectives/ (defuse, exfil), levels/ (one module per level + a registry)
  device.js mobile gate (desktop/laptop only, for now)
  main.js   the runner: picks a level, wires the tiers, owns the state machine + per-frame loop
public/     static assets (GLB models, audio) served as-is
server.js   tiny static server for production (serves dist/)
```

**The dependency rule (enforceable):** `engine/` imports nothing from `kit/` or `game/`;
`kit/` may use `engine/`; `game/` may use both. That gives two honest reuse tiers — take just the
`engine/`, or the whole `kit/` — and keeps the layers from rotting into each other.

## engine/ (generic)

| File | Role |
|------|------|
| `engine.js`        | renderer, baked night skybox + IBL, starfield, lights/shadows, cel-shade **OutlineEffect**, frame loop |
| `assets.js`        | `RiggedAsset` (skinned GLB → cloned scaled instances + bone cache) and `PropAsset` (static GLB) |
| `primitives.js`    | geometry/material helpers, `COLORS`, canvas textures, prop builders (crate/barrel/…), `noOutline()` |
| `controller.js`    | first-person controller — look, walk/sprint/jump/duck, headbob, AABB collision vs `level.colliders` |
| `projectiles.js`   | `Projectile` (ballistic, gravity, bounce, fuse, wall/structure hit) + the **blast system** (`blastAt`, `applyBlast`) |
| `vfx.js`           | pooled tracers / sparks / dust / decals / shockwave rings / debris / explosions (no per-shot allocs) |
| `laser-sight.js`   | the aim beam as a reusable class (caller supplies targets + visibility) |
| `input.js`         | keyboard + mouse state, read by **physical key** (`event.code`) so any keyboard layout works |
| `touch.js`         | mobile dual-stick touch controls (present but gated off for now) |
| `audio.js`, `voice.js` | synth + sampled SFX, looping rotor, radio callouts |
| `hud.js`           | tactical HUD, the bomb-defuse panel, start/pause/win/lose overlays |
| `postfx.js`        | small post helpers |

## kit/ (the military-FPS toolkit, built on engine)

| File | Role |
|------|------|
| `weapon.js`        | player viewmodels (rifle + missile launcher): recoil, muzzle flash, reload, `toggle()` |
| `level-builder.js` | **the level toolkit** — `wall/building/tower/bunker/vehicle/fuelTanks/barrels/floodlight/ammo/bomb/scatterDesert/…`, the collider list, the dynamics integrator, and `segmentBlocked` (line-of-sight). Reads destructible HP from injected `balance`. |
| `destructibles.js` | shootable barrels/tanks/vehicles: unit-damage explosions, launch-into-air wrecks, chain cook-offs (decoupled via a ctx of live refs) |
| `content/`         | this game's asset catalogs — `vehicles.js`, `pickups.js`, `weapons.js` (thin `PropAsset` loaders) |

## game/ (this game)

| File | Role |
|------|------|
| `config.js`        | the tuning/rules layer — health/fog/fov, gunship timing, intro, objective type, **`balance`** (all gameplay numbers), HUD messages. `mergeConfig(base, over)` lets levels override one level deep. |
| `combat.js`        | the shooting layer: builds the enemy roster, runs the hitscan ray, routes hits (enemy / heli / destructible) via hooks to `main.js` |
| `actors/`          | `enemy.js` (cover/peek AI), `helicopter.js` (gunship boss), `operator.js` (intro body) |
| `objectives/`      | `defuse.js`, `exfil.js`, and `index.js` (`makeObjective(type, game)`); each is `{ brief(), onPlayStart(), update(dt,t,presses) }` and decides the win/lose conditions |
| `intro.js`         | cinematic fast-rope insertion sequence |
| `levels/`          | one module per level (`{ id, name, config?, build(b) }`) + `index.js` (the `levels` map + `DEFAULT_LEVEL`) |

## main.js (the runner, ~460 lines)

Boots the engine, preloads assets (progress bar + a gunship warm-up shader compile so the first
spawn doesn't hitch), builds the chosen level, seats the player. Owns the **state machine**
(`loading → start → intro → play → win/lose/detonate`) and the per-frame `update(dt, t)`: movement,
firing, grenades & rockets, the bomb-detonation cinematic, HUD sync — and **delegates** the objective
(`this.objective.update`), the destructibles (`this.destructibles`), and the laser (`this.laser`) to
their modules. Exposes `window.__game` for debugging and in-browser verification (see [AGENTS.md](AGENTS.md)).

## The two damage scales (don't mix them)

- **Enemy/player scale** — rifle does ~34 dmg; enemies have ~100 HP. Grenades/rockets do big AoE damage
  to enemies via `applyBlast`.
- **Destructible/gunship "unit" scale** — rifle = 1, grenade = 5, rocket = 15. Object HP is in units
  (barrels 2–3, fuel tanks 4, cars 7–8, gunship 15). All of it lives in `config.balance`.

## Coordinates & collision

XZ is the ground plane, +Y up; units ≈ meters. `level.colliders` are XZ AABBs
`{minX,maxX,minZ,maxZ,top}` (`top` = the height you can stand on). The controller, enemy movement,
projectiles and line-of-sight (`segmentBlocked`) all read this one list — registering a collider is
what makes a thing solid for *everything* at once.

## Where to go next

- **[skills/](skills/)** — the AI-first task skills: build & register a level, add a
  weapon/enemy/audio, verify in-browser, and ship. Start with `engine-overview`.
- **[AGENTS.md](AGENTS.md)** — conventions + the in-browser verification workflow for AI agents.
