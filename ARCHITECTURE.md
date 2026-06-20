# Architecture

A small, flat FPS engine. Two folders draw the line between **reusable infrastructure**
and **this game's content**. No frameworks, no entity-component system — just plain
modules and one config object.

```
src/
  engine/    this game's reusable systems (render, controller, weapon, combat actors, level toolkit)
  game/      content + rules: actors, config, and one module per level
  main.js    the runner: picks a level, wires engine + game, owns the state machine + per-frame loop
```

This is a **game-specific** engine (a night military-FPS), not a generic one — the toolkit
knows about walls, towers, bunkers, vehicles and desert dressing on purpose.

## engine/ (reusable)

| File | Role |
|------|------|
| `engine.js`   | renderer, night skybox/IBL, lights, cel-shade **OutlineEffect**, frame loop |
| `actor.js`    | `RiggedAsset` — load a GLB once, clone scaled instances, cache named bones |
| `controller.js` | first-person controller (pointer-lock + walk/jump/duck/headbob) |
| `weapon.js`   | viewmodel, recoil, muzzle flash, reload |
| `vfx.js`      | pooled tracers / sparks / dust / decals / rings / debris |
| `input.js`, `touch.js` | keyboard+mouse and mobile dual-stick input |
| `audio.js`, `voice.js` | synth + sampled SFX, looping rotor, radio callouts |
| `hud.js`      | tactical HUD, start/pause/win/lose overlays |
| `builders.js` | geometry/material helpers, textures, `noOutline()` |

**Rule:** nothing in `engine/` imports from `game/`. If it references this map, this
roster, or these rules, it belongs in `game/`.

## game/ (this game)

| File | Role |
|------|------|
| `config.js`    | **the tuning/rules layer** — health, regen, FOV, fog, heli timing, intro, HUD messages |
| `level.js`     | the compound: walls, props, lights, enemy spawn list, exfil flag, desert dressing |
| `enemy.js`     | soldier AI (patrol → see → advance → burst-fire), built on `RiggedAsset` |
| `operator.js`  | the player SWAT model (intro only), built on `RiggedAsset` |
| `helicopter.js`| the gunship boss |
| `combat.js`    | spawns the roster, player hitscan, hitmarkers/kills |
| `intro.js`     | third-person fast-rope insertion cinematic |

## Building a new game

1. Copy `engine/` as-is.
2. Write a new `game/`: a `level.js` (or level builder), a `config.js`, and any
   actors (each a thin wrapper over `RiggedAsset` + behavior).
3. Point `main.js` at the new `game/` modules.

Keep it flat: prefer data in `config.js` and small modules over new abstraction layers.
