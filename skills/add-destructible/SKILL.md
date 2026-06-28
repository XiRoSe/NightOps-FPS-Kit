---
name: add-destructible
description: Use when adding a shootable/explodable object — fuel barrels, vehicles, fuel tanks, or any prop that takes damage and explodes or launches. Covers the unit-damage scale, the tag+register pattern, the combat hook, and the launch-into-air dynamics.
---

# Add a destructible

Destructibles use the **"unit" damage scale** (NOT the enemy scale): rifle = 1, grenade = 5, rocket = 15.
Object HP is in units (barrels 2–3, fuel tanks 4, cars 7–8, gunship 15) — all in `config.balance`. Read
`engine-overview` (the two scales) first. The toolkit already ships `barrels()`, `vehicle()`, `fuelTanks()`.

## The pattern (mirror `LevelBuilder.barrels()` / `vehicle()`)

1. **Build the mesh** + register its collider: `this.collide(x, z, w, d, top)`. Optionally make it flingable:
   `this._addDynamic(mesh, restY, mass)` so a blast launches it.
2. **Tag every child mesh** with the record + push the record to the right list:
   ```js
   rec = { mesh, x, z, hp, exploded: false, collider, dyn };
   mesh.traverse(o => { if (o.isMesh) o.userData.explosive = rec; });  // or userData.vehicle = rec
   this.explosives.push(rec);                                          // or this.vehicles.push(rec)
   ```
3. **`combat.js`** detects a tagged hit and calls a hook with **1 unit**: `onExplosive(rec, 1)` /
   `onVehicleHit(rec, 1)`. The runner routes it to `kit/destructibles.js`, which decrements `rec.hp` and
   explodes at 0 (VFX explosion + `applyBlast` damage to nearby enemies + a launch impulse for vehicles).
4. **AoE:** grenade/rocket blasts also apply units to everything in radius via `destructibles.blastUnits`,
   so chain cook-offs work for free (one barrel pops its neighbours).

## Notes

- Keep collision in the **one** `level.colliders` list — don't special-case it. The wreck stays solid via its
  collider; only its `hp`/`exploded` state changes.
- Tune HP/radius/damage in `config.balance` (per-level overridable via `mergeConfig`) — see `tuning-balance`.
- Verify in-browser: fire N rifle shots (or one rocket) at the object and assert it `exploded` and that a nearby
  enemy took blast damage (see `verify-in-browser`).
