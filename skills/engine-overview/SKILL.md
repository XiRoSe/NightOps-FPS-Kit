---
name: engine-overview
description: Read FIRST when working anywhere in this Three.js + Vite FPS kit. Establishes the engine/kit/game tier rule, the two damage scales, the single collider list, the per-frame runner, and the core gotchas (shader recompiles, no per-frame allocations). Invoke before adding a level, weapon, enemy, audio, or any gameplay change.
---

# Engine overview — the rules that keep this kit clean

This is a **game-specific FPS kit** (Three.js r0.169 + Vite, vanilla ES modules, no framework, no ECS).
It is **data + small modules**, not abstraction layers. Keep everything flat.

## The three tiers (dependency rule — lint-enforced)

```
src/engine/   generic, content-agnostic (render, controller, input, vfx, audio, hud, projectiles, assets)
src/kit/      the military-FPS TOOLKIT on top (level-builder, destructibles, content/ asset catalogs)
src/game/     THIS game (config, combat, actors/, objectives/, levels/) + main.js runner
```

**Hard rule:** `engine/` imports **nothing** from `kit/` or `game/`. `kit/` may use `engine/`.
`game/` may use both. If code references the map/roster/rules, it belongs in `game/`. ESLint enforces
this — a cross-tier import fails the build.

## main.js is the runner

State machine: `loading → start → intro → play → pause → win/lose/winseq/detonate`. The per-frame
`update(dt, t)` does movement, firing, projectiles, cinematics, HUD sync, and **delegates** to
`objective.update`, `destructibles`, `combat`, `laser`. Anything spanning engine+game per frame lives here.

## Things that will bite you (memorize these)

- **Changing the scene light COUNT recompiles every shader → multi-second freeze.** Never add/remove a
  light or toggle a light's `.visible` at runtime — keep a persistent light and change its `intensity`.
  (Hiding a *mesh* is fine; hiding a *light* is not. A real bug this caused: a drone GLB shipped embedded
  `DirectionalLight`s that brightened the whole level on every spawn — strip stray lights from loaded models.)
- **Two separate damage scales — never mix them.** (1) Enemy/player: rifle ≈34 dmg, enemy HP ~100.
  (2) Destructibles/gunship "units": rifle 1, grenade 5, rocket 15; barrels 2–3, tanks 4, cars 7–8, gunship 15.
  All unit numbers live in `config.balance`.
- **One collider list is solidity for EVERYTHING.** Register `level.collide(...)`; the controller, enemy
  AI, projectiles, and line-of-sight all read `level.colliders` (XZ AABBs `{minX,maxX,minZ,maxZ,top,baseY}`).
  `top` = the height you can stand on. Don't special-case collision anywhere.
- **Line-of-sight = `level.segmentBlocked(ax,az,bx,bz,minTop)`** (2D XZ). Call it before any "can this
  hurt the player" check so walls provide cover.
- **Terrain height = `level.terrainHeight(x,z)`** (pure math) for sculpted levels like ARCFALL; flat for others.
- **Input is read by physical key (`event.code`)**, not `event.key` — add binds by code (`"KeyG"`).
- **No per-shot/per-frame allocations** in hot paths — reuse the `vfx.js` pools and scratch vectors.
- **Heavy assets:** instance repeated props, preload GLBs at boot, warm up anything whose first use hitches.

## Coordinates

XZ is the ground plane, +Y up, units ≈ meters.

## When you change anything

`npm run build` must end `✓ built`, `npm run lint` must be 0, and the page must load with **0 console
errors**. Verify gameplay in-browser (see the `verify-in-browser` skill) before shipping (see `ship-changes`).
