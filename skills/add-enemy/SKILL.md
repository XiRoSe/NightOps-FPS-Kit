---
name: add-enemy
description: Use when adding, tuning, or debugging enemies — soldiers, dinosaurs, robots/mechs, drones, or the gunship boss. Covers the three actor families, the CREATURES spec table, spawnEnemy at runtime, hitboxes, AI/LOS, sky-drop reinforcements, and the embedded-GLB-light gotcha.
---

# Add / tune an enemy

Three actor families under `src/game/actors/` (+ the gunship). Read `engine-overview` first.

| File | Enemies | Notes |
|------|---------|-------|
| `enemy.js`   | human soldiers | cover → peek → fire AI, paths around obstacles, respects `segmentBlocked` LOS |
| `monster.js` | dinosaurs (trex, raptor, spider) | chase/melee; `this.speed` per kind — bump for faster hunters |
| `robot.js`   | mechs (`robot`/heavy/sentry/drone) | `CREATURES` spec table; drones fly; `boss`/`scale` for the giant mech |
| `helicopter.js` | gunship boss | reuses ONE shared spotlight (never changes the light count) |

## robot.js CREATURES spec (per kind)

```js
robot:  { asset:"mech",  hp:600, hbW:3.2, hbH:7.2, gun:[0,5.2,2.4], fly:0, speed:1.6, range:16, dmg:[10,18], rate:1.8, boom:1.9 },
sentry: { asset:"sentry",hp:130, hbW:1.5, hbH:2.6, ... },
heavy:  { asset:"heavy", hp:320, hbW:2.4, hbH:3.8, ... },
drone:  { asset:"drone", hp:80,  hbW:1.6, hbH:1.8, fly:8, ... },
```
`hbW/hbH` = hitbox box size; `scale` multiplies model + hitbox (a `scale:2` boss mech has a tall hitbox
centered high — players must aim center-mass). `boss:true` marks the finale guardian.

## Spawning

- **At build time** (in a level's `build(b)`): `b.enemy({ kind:"robot", x, z, hp?, speed?, scale?, boss?, patrol?:[{x,z}], y? })`.
  `y>0` = elevated/stationary tower guard. Soldiers default `hp 100, speed 2.4`.
- **At runtime:** `g.combat.spawnEnemy(spec)` adds an enemy live (used by ARCFALL's sky-drop reinforcements
  in `main._dropReinforcement` — a pod falls every N seconds into a rotating section, with a boom on impact).

## Gotchas

- **Embedded GLB lights (real bug):** the drone model ships with `DirectionalLight`s baked in. Added to the
  scene per spawn, they globally brighten the level AND recompile shaders. **Strip stray lights when building
  the model** (`model.traverse(o => o.isLight && o.parent.remove(o))`). Watch for this on any new GLB.
- **Walking-anim speed** should match `this.speed`. Stuck enemies (>2s same spot) re-path to a random point —
  keep that guard (`if (this._roam) ...`) when editing movement.
- **LOS before damage:** gate "can shoot the player" on `segmentBlocked` so cover works. (ARCFALL also caps
  enemy fire above ~20m player altitude.)
- Verify a new enemy with the in-browser harness: spawn it, fire at its hitbox world-position, assert HP drops
  (see `verify-in-browser`). Confirm the scene light count is unchanged after spawning it.
