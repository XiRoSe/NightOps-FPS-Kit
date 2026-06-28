---
name: vfx-and-cinematics
description: Use when adding visual effects (explosions, tracers, beams, sparks, dust, shockwaves, lightning) or building cinematic sequences (the drop-pod/parachute intro, the story crawl, the victory shrink-world + end card). Covers the pooled vfx API, the blast system, and how the runner drives camera cinematics each frame.
---

# VFX & cinematics

Effects live in `engine/vfx.js` (pooled — **no per-shot/per-frame allocations**). Cinematics are driven by
`main.js` per frame while the engine renders the moving camera. Read `engine-overview` first.

## VFX API (pooled — reuse, never `new` in a hot path)

`g.vfx` methods: `tracer`, `muzzle`, `impact`, `hitPuff`, `explosion(pos, scale)`, `_fireball`, `_shockwave`,
`_spawnDebris`, `dustBurst`, `rocketTrail`, `plasmaTrail`, `laserBeam`, `energyBoom`, `bossBeam`, `enemyLaser`,
`lightning`, `_flash`, `_embers`, `_decal`. Call `g.vfx.update(dt)` each frame (the runner does this).

## The blast system (`engine/projectiles.js`)

- `Projectile(scene, mesh, pos, vel, opts)` — ballistic with `gravity`, `bounce`, `fuse`, `detonateOnHit`.
  It collides against `level.colliders` **and the real `terrainHeight`** (not a flat plane) + structures.
- `blastAt(center, pos, {radius, damage, power})` → distance-falloff damage + knockback impulse; `applyBlast`
  applies it to enemies + flings dynamics. Rocket/grenade radius+damage come from `config.balance`.

## Lightning / weather

`engine/skyStorm(dt)` (called every frame) fires periodic strikes: a forked bolt + a flash that pulses the
renderer **exposure** and the hemi/sun **intensity** (never adds/removes a light), then resets to the dark
baseline. Thunder is cued via the `engine.onThunder` callback → `audio.thunder()`. Scale the flash multipliers
to make storms brighter/dimmer; keep the reset so the mood returns to dark between strikes.

## Cinematics (camera sequences driven per frame)

- **Intros** (`game/drop-pod-intro.js`, `parachute-intro.js`): phases (`crawl → fall → reveal`) advanced in
  `update(dt)`; callbacks `onCrawl` / `onCrawlEnd` / `onImpact` let the runner cue music, the HUD story crawl,
  the whoosh, and the screen shake.
- **Victory** (`main._victoryStep`, state `winseq`): phase machine — **shrink the world** (`hud.collapseToDot`)
  → the Star-Wars **crawl** (`hud.showEndCrawl`) → the centered **end card** (`hud.showEndButton`, revealed only
  after the crawl animation finishes). The runner restarts the battle music from the start for the finale.
- Pattern: hold camera control in the runner; advance a `this._winT`/phase each frame; call HUD/audio at phase
  edges. For a precise "after the animation" trigger, use the Web Animations `.finished` promise, not a guessed
  timeout.

## Gotchas

- Pooled VFX only — adding lights for an effect causes the shader-recompile freeze. Use additive meshes/sprites.
- Verify timed cinematics by stepping `_victoryStep(1/60)` in a loop and asserting the phase timeline
  (see `verify-in-browser`).
