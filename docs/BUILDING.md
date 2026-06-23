# Building your own FPS

This kit is designed so that **adding content is data, not plumbing**. The fastest path to "my own
game" is: write a level module, register it, retune `config.js`, and (optionally) add a weapon,
enemy type, or destructible. Read [../ARCHITECTURE.md](../ARCHITECTURE.md) first for the map.

---

## 1. Add a level

A level is a plain module `{ id, name, config?, build(b) }`. `build(b)` receives a `LevelBuilder`
and lays out the world by calling toolkit methods.

Create `src/game/levels/my-base.js`:

```js
import { COLORS } from "../../engine/primitives.js";

export const myBase = {
  id: "my-base",
  name: "RAID THE OUTPOST",
  config: {
    // per-level overrides, merged one level deep onto game/config.js
    objective: { type: "defuse", timeLimit: 150, codeLength: 3, maxTries: 3 },
    helicopter: { spawnDelay: 20 },
  },

  build(b) {
    b.spawnAt(0, 40);                                  // where the player starts (x, z)
    b.setBounds({ minX: -200, maxX: 200, minZ: -200, maxZ: 220 }); // walkable area

    b.desertFloor(120, 12, 60, 1200);                  // ground + far desert + dirt patches
    b.road(6, 120, 0, 0);

    // perimeter (leave a gate gap so the player can get in)
    b.wall(-20, 50, 36, 1, 3.6);
    b.wall( 20, 50, 36, 1, 3.6);
    b.wall(-40, 0, 1, 100, 3.6);
    b.wall( 40, 0, 1, 100, 3.6);

    // cover + props
    b.crateStack(-8, 20, "pyramid");
    b.barrels(10, 18, 3);                              // shootable, explode
    b.vehicle(-24, 0, Math.PI / 2, "truck");           // shootable, launches on death
    b.fuelTanks(28, -10, 2);                           // shootable, big boom
    b.tower(-34, -30);                                 // elevated guard post
    b.floodlight(0, 30, 7, 0, 0, true, 90);            // sweeping light

    // objective + enemies
    b.bomb(0, -50);                                    // for a "defuse" objective
    b.enemy({ x: -10, z: 10, patrol: [{ x: -14, z: 12 }, { x: -6, z: 8 }] });
    b.enemy({ x: 10, z: 10, hp: 140, speed: 2.6 });
    b.enemy({ x: -34, z: -30, y: 4 });                 // y>0 = a tower/elevated guard
  },
};
```

Register it in `src/game/levels/index.js`:

```js
import { myBase } from "./my-base.js";
export const levels = { compound, "desert-base": desertBase, "my-base": myBase };
export const DEFAULT_LEVEL = "my-base";   // or keep desert-base
```

Play it: `http://localhost:5180/?level=my-base`

### LevelBuilder toolkit (cheat-sheet)

All coordinates are world XZ (meters), +Y up. Anything that should block movement/bullets registers
a collider automatically.

| Call | Makes |
|------|-------|
| `spawnAt(x, z)` / `setBounds({minX,maxX,minZ,maxZ})` | player start / walkable box |
| `enemy(spec)` | queue an enemy spawn (see below) |
| `desertFloor(size, patchN, patchSpread, surround)` | ground plane + far desert + dirt patches |
| `scatterDesert(rMin, rMax, bushes, rocks)` | instanced bushes/rocks ring (cheap — 2 draw calls) |
| `road(w, len, x, z)` | a dirt road strip |
| `wall(x, z, w, d, h, color)` | solid wall (collider, tall) |
| `building(x, z, w, d, h, color)` / `bunker(x, z)` / `tower(x, z)` | structures |
| `crateStack(x, z, conf)` | crates (`"single"`/`"pyramid"`/…) — low cover |
| `sandbags(x, z, len, rot)` / `bollard(x, z)` / `fence(x1,z1,x2,z2,h)` | dressing/cover |
| `barrels(x, z, n)` | **shootable** explosive fuel barrels |
| `vehicle(x, z, rot, type)` | **shootable** vehicle (`"truck"/"flatbed"/"suv"/"van"`) — launches on death |
| `fuelTanks(x, z, n)` | **shootable** industrial tanks (big explosion) |
| `floodlight(x, z, h, aimX, aimZ, sweep, range)` | spotlight (+ optional sweep) |
| `powerLine([[x,z],…])` / `utilityPole(x, z)` | poles + sagging wires |
| `ammo(x, z, rounds)` | glowing ammo pickup |
| `bomb(x, z, r)` | the defuse objective |
| `objective(x, z, r)` | the exfil flag |
| `collide(x, z, w, d, top)` | register a bare collider (advanced) |

**Enemy spec:** `{ x, z, y?, patrol?: [{x,z}, …], hp?, speed? }`. `y > 0` makes an elevated, stationary
tower guard. Omit `patrol` for a guard that holds position. Defaults: `hp 100`, `speed 2.4`.

---

## 2. Retune the game (`src/game/config.js`)

The base rules live in `config`. Levels override one level deep via their `config` field
(`mergeConfig` handles the merge). Knobs you'll touch most:

- `player.maxHealth / regenInterval / regenAmount / grenades`
- `scene.fov`, `scene.fog`
- `helicopter.spawnDelay`
- `objective.type` — `"exfil"` (clear all + reach `objective()` flag) or `"defuse"` (timed bomb code;
  add `timeLimit`, `codeLength`, `maxTries`)
- `intro.enabled`, `messages.*` (HUD text)

---

## 3. Objectives

- **`exfil`** — clear every enemy, then walk into the `objective(x, z, r)` flag radius. Win.
- **`defuse`** — reach the `bomb(x, z)`, a panel opens, enter the code before the timer expires. The
  default desert raid uses a self-working "mentalist" code (the player's secret number cancels out
  and everyone lands on the real code) — see `game/objectives/defuse.js`. A wrong-attempt limit calls
  the runner's `_detonate()` (which hurls the player into the sky).

Each objective is a small module — `{ brief(), onPlayStart(), update(dt, t, presses) }` — that decides
the win/lose **conditions** (the runner owns the state transitions, `_win`/`_lose`, and the detonation
cinematic). To add a new type: create `game/objectives/<type>.js` and add a line to
`game/objectives/index.js` (`makeObjective`). No edits to the runner needed.

---

## 4. Add a weapon

Weapons are viewmodels in `kit/weapon.js`. The rifle is procedural; the launcher loads a GLB via
`kit/content/weapons.js`. To add one:

1. Build/​load the viewmodel group in `weapon.js`, give it a `mode` and add it to `toggle()`.
2. Wire a key in `main.js` (input is read by `event.code` — e.g. `KeyG`) to switch/fire it.
3. For a hitscan weapon, route through `combat.tryShoot`; for a projectile, spawn a `Projectile`
   (see `_fireRocket` / `_throwGrenade`) and let `_updateProjectiles` + `applyBlast` do the rest.

---

## 5. Add a destructible (barrel/vehicle pattern)

Destructibles are registered by the `LevelBuilder` and use the **unit-damage** scale (rifle 1,
grenade 5, rocket 15). The pattern (see `barrels()` / `vehicle()`):

1. Build the mesh; `this.collide(...)` for it; optionally `this._addDynamic(mesh, restY, mass)` so a
   blast can fling it.
2. Tag every child mesh `o.userData.explosive = rec` (or `userData.vehicle`) and push `rec` to
   `this.explosives` / `this.vehicles`. `rec = { mesh, x, z, hp, exploded, collider, dyn }`.
3. `combat.js` detects the tagged hit and calls a hook (`onExplosive` / `onVehicleHit`) with **1**
   unit; the runner routes it to `kit/destructibles.js`, which decrements `rec.hp` and explodes at 0.
4. Grenade/rocket blasts also apply units to anything in radius (`destructibles.blastUnits`).

---

## 6. Assets

Drop GLB/audio under `public/` and load them lazily:

- **Skinned character** → `new RiggedAsset("/models/x.glb", {...})` (`engine/assets.js`), then
  `.preload()` during boot and `.make()` per instance.
- **Static prop** → `new PropAsset("/models/x.glb", { length })`.

Keep models low-poly to match the cel-shaded look. Use **CC0/MIT** assets and credit them in the
README. (poly.pizza, Kenney, Polyhaven, Quaternius are good CC0 sources.)

---

## Re-enabling mobile

Mobile is gated in `src/device.js` (`isMobileOrTablet()` → a desktop-only screen; the check runs at
the bottom of `main.js`). The touch controls in `engine/touch.js` are intact. To bring mobile back,
make the boot call `new Game()` unconditionally (or relax the gate) and verify the sticks/buttons wire up.

---

## House style

- Keep it **flat**: prefer data in `config.js` + small modules over new abstraction layers.
- Respect the boundary: **`engine/` never imports `game/`**.
- One `level.colliders` list is the single source of truth for "solid" — register colliders rather
  than special-casing collision anywhere.
- Reuse the pools in `vfx.js`; don't allocate per shot/frame.
