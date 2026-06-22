# Architecture

A small, flat FPS kit. Two folders draw the line between **reusable infrastructure** and
**this game's content**. No frameworks, no entity-component system — just plain ES modules and
one config object.

```
src/
  engine/    reusable systems (render, controller, weapon, projectiles, vfx, level toolkit, hud, input, audio)
  game/      content + rules: actors (enemy, helicopter, operator), config, and one module per level
  main.js    the runner: picks a level, wires engine + game, owns the state machine + per-frame loop
public/      static assets (GLB models, audio) served as-is
server.js    tiny static server for production (serves dist/)
```

This is a **game-specific** kit (a night military-FPS), not a generic engine — the toolkit knows
about walls, towers, bunkers, vehicles, fuel tanks and desert dressing on purpose.

## engine/ (reusable — never imports from `game/`)

| File | Role |
|------|------|
| `engine.js`        | renderer, baked night skybox + IBL, starfield, lights/shadows, cel-shade **OutlineEffect**, the frame loop |
| `actor.js`         | `RiggedAsset` (skinned GLB → cloned scaled instances + bone cache) and `PropAsset` (static GLB) |
| `controller.js`    | first-person controller — pointer-lock look, walk/sprint/jump/duck, headbob, AABB collision vs `level.colliders` |
| `weapon.js`        | viewmodels (rifle + missile launcher), recoil, muzzle flash, reload, `toggle()` |
| `weapons.js`       | weapon-model asset loaders (the launcher GLB) |
| `projectiles.js`   | `Projectile` (ballistic, gravity, bounce, fuse, wall/structure hit) + the **blast system** (`blastAt`, `applyBlast`) — distance falloff, damage, knockback, mass-aware prop shove |
| `vfx.js`           | pooled tracers / sparks / dust / decals / shockwave rings / debris / explosions (no per-shot allocations) |
| `pickups.js`       | pickup asset loaders (ammo magazine) |
| `level-builder.js` | **the level toolkit** — `wall/building/tower/bunker/vehicle/fuelTanks/barrels/sandbags/floodlight/ammo/bomb/objective/scatterDesert/...`, the collider list, the dynamics integrator, and `segmentBlocked` (line-of-sight) |
| `builders.js`      | geometry/material helpers, `COLORS`, canvas textures, `noOutline()` |
| `input.js`         | keyboard + mouse state, read by **physical key** (`event.code`) so any keyboard layout works |
| `touch.js`         | mobile dual-stick touch controls (present but gated off for now) |
| `audio.js`, `voice.js` | synth + sampled SFX, looping rotor, radio callouts |
| `hud.js`           | tactical HUD (panels, kill-feed, hitmarkers), the bomb-defuse panel, start/pause/win/lose overlays |
| `postfx.js`        | small post helpers |

**Rule:** nothing in `engine/` imports from `game/`. If a module references *this* map, *this*
roster, or *these* rules, it belongs in `game/`. (The reverse is fine: `game/` imports freely from `engine/`.)

## game/ (this game)

| File | Role |
|------|------|
| `config.js`        | **the tuning/rules layer** — health/regen, FOV, fog, grenade count, gunship timing, intro, objective type, HUD messages. `mergeConfig(base, over)` lets each level override one level deep. |
| `levels/`          | one module per level + an `index.js` **registry**. Each module is `{ id, name, config?, build(b) }`. |
| `levels/index.js`  | the `levels` map + `DEFAULT_LEVEL`. Add a level here to make it selectable via `?level=<id>`. |
| `enemy.js`         | soldier AI (patrol → see → run-to-cover → peek → burst-fire), obstacle avoidance, blast-death; built on `RiggedAsset` |
| `helicopter.js`    | attack gunship boss (descend → hover/strafe → minigun, LOS-aware) and the procedural airframe |
| `operator.js`      | the player's body used during the intro |
| `intro.js`         | cinematic fast-rope insertion sequence |
| `combat.js`        | the shooting layer: builds the enemy roster, runs the hitscan ray, routes hits (enemy / heli / destructible) via hooks back to `main.js` |

## main.js (the runner)

- Boots the engine, preloads assets (progress bar + a gunship "warm-up" shader compile so the first
  spawn doesn't hitch), builds the chosen level, seats the player.
- Owns the **state machine** (`loading → start → intro → play → win/lose/detonate`) and the
  per-frame `update(dt, t)`.
- Owns everything that spans engine + game per frame: firing, grenades & rockets (`_updateProjectiles`),
  the **blast → destructible** routing, the bomb objective (`_updateDefuse` / `_detonate`), the
  helicopter, HUD sync.
- Exposes `window.__game` for debugging and in-browser verification (see [AGENTS.md](AGENTS.md)).

## The two damage scales (don't mix them)

- **Enemy/player scale** — rifle does `weapon.damage` (≈34); enemies have ~100 HP. Grenades/rockets do
  big AoE damage to enemies via `applyBlast`.
- **Destructible/gunship "unit" scale** — rifle = **1**, grenade = **5**, rocket = **15**. Object HP is
  in units (barrels 2–3, fuel tanks 4, cars 7–8, gunship 15). Intentionally separate so you can tune
  "how many shots to blow up a car" without disturbing enemy balance.

## Coordinates & collision

- XZ is the ground plane, +Y up. Level units ≈ meters.
- `level.colliders` are XZ AABBs `{minX,maxX,minZ,maxZ,top}` — `top` is the height you can stand on
  (low props are mountable, tall walls aren't). The controller, enemy movement, projectiles and
  line-of-sight (`segmentBlocked`) all read this one list, so registering a collider is what makes a
  thing solid for *everything* at once.

## Where to go next

- **[docs/BUILDING.md](docs/BUILDING.md)** — build & register a level, retune via config, add objectives,
  weapons, enemies, destructibles, assets.
- **[AGENTS.md](AGENTS.md)** — conventions + the in-browser verification workflow for AI agents.
