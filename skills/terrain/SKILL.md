---
name: terrain
description: Use when working with sculpted terrain — the island ground, hills, beaches, lakes/ponds, the surrounding sea, or seating any structure/prop/enemy/standable on uneven ground. Covers islandTerrain, the pure terrainHeight(x,z) function, lake leveling, _lowGround/_roofTop seating helpers, and the flat-vs-sculpted distinction.
---

# Terrain (sculpted ground, lakes, sea, seating)

Military levels use **flat ground** (`desertFloor`); ARCFALL uses **sculpted terrain** (`islandTerrain`).
Read `engine-overview` first. The single source of truth for height is `level.terrainHeight(x,z)`.

## The terrainHeight contract

- `level.terrainHeight(x, z)` is a **pure math function** (hills → beach → sea → distant mountains). Flat
  levels return a constant; the island returns the sculpted height. **Everything that sits on the ground must
  query it** — props, structures, enemies, pickups, projectiles, the player controller.
- `level.seaLevel` is the water height; below `seaLevel - 1` the controller switches to swimming.
- `level._lakes` = `[{x, z, r, level, depth}]` — shallow wadeable ponds carved into the terrain.

## Building sculpted terrain (in a level's `build(b)`)

```js
b.lake(-46, 20, 18, 1.5);          // carve lakes FIRST (x, z, radius, depth) — they level the basin
b.islandTerrain({ size: 460 });    // then the island: hills, beach, sea, mountains
b.scatterTrees(110, 20, 198);      // foliage seats itself on terrainHeight
```

Lakes carve a **fully level-rimmed bowl** (rim = `L.level`) and ease back to natural terrain *outside* the
rim, so the flat water disc never floats on a slope. The disc sits just below the rim.

## Seating things on uneven ground (the usual bug source)

- **Props/enemies/pickups:** set `y = terrainHeight(x, z)` (or build them to query it). Floating or sunk
  props mean a missing `terrainHeight` lookup.
- **Big structures** that span a slope: seat at `_lowGround(x, z, halfFootprint)` (the LOWEST terrain under
  the footprint) so the base never floats on the downhill side; the collider's `baseY = gy`.
- **Standable roofs:** the visual roof has no collider by default — players fall through. Add a collider whose
  `top` is the roof height (use `_roofTop(group, cx, cz, half)` — a spike-rejected raycast grid — to find the
  true broad roof surface, so the player neither floats on a chimney/spire nor sinks into the eaves). Note: a
  full-footprint roof collider also blocks ground-level entry — that turns the structure into a "stand on top"
  monument; carve an entry or accept the trade.
- **Water-surface placement:** a lake disc sits at `terrainHeight(L.x,L.z) + L.depth - 0.28`.

## Verify (always)

Use the in-browser harness (`verify-in-browser`): raycast down onto `solidMeshes` to compare a structure's
collider `top` vs its real roof; drop the controller from above and assert where it lands; check a lake's rim
height at the 4 compass points is level. Floating stones and fall-through roofs are caught here, not by eye.
