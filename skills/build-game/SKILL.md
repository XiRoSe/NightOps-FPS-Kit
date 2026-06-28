---
name: build-game
description: START HERE to build a new browser FPS game or level end-to-end on this Three.js + Vite kit, or to plan any substantial feature. The master playbook — it routes you to the right task skill at each step and states the non-negotiable gates. Invoke this first whenever the request is "build/make a game/level" or a big multi-part change.
---

# Build a game, end to end

This is the front door. This kit ships a complete FPS + a clean toolkit so you (an AI agent) can build a
**new game or level fast — as data + small modules, not new abstraction layers.** Follow the order below;
each step links the skill with the details.

## Non-negotiables (true at every step)

- **Tier rule (lint-enforced):** `engine/` imports nothing from `kit/` or `game/`; `kit/` may use `engine/`;
  `game/` may use both. New content goes in `game/`. → `engine-overview`
- **Gate before shipping anything:** `npm run lint` (0) + `npm run build` (`✓ built`) + page loads with **0
  console errors** + verified in-browser. → `verify-in-browser`, `ship-changes`
- Reuse the `vfx.js` pools, the **one** `level.colliders` list, and `terrainHeight` — don't special-case.

## The end-to-end pipeline

1. **Orient** — read `engine-overview` (tiers, the two damage scales, the collider list, the gotchas:
   light-count recompiles, no per-frame allocs).
2. **Design the game** — pick the objective + tuning. `config.objective.type` = `collect` / `defuse` / `exfil`
   (or a new one), set `scene` (sky/fog/fov), `player`, `intro`. → `add-objective`, `tuning-balance`
3. **Build the world** — a level module `{ id, name, config, build(b) }` + register it in `levels/index.js`;
   lay out the map with the `LevelBuilder`. → `add-level`. Sculpted ground / lakes / seating → `terrain`.
4. **Populate it** — enemies (`add-enemy`), the weapons the player gets or scavenges (`add-weapon`),
   shootable props (`add-destructible`).
5. **Make it feel alive** — sound (`add-audio`), explosions/beams + intro & victory cinematics
   (`vfx-and-cinematics`). Need models/audio? Find CC0 ones → `add-assets`.
6. **Verify** — drive `window.__game` headlessly with numerical assertions (`verify-in-browser`); run the
   full regression sweep across BOTH shipped games (`game-qa`).
7. **Ship** — lint → build → commit → deploy to Railway → confirm the new bundle is live (`ship-changes`).

## Fast path — a minimum playable game

```text
1. cp src/game/levels/desert-base.js → src/game/levels/my-game.js   (edit id/name/build)
2. register it in src/game/levels/index.js                          (add to `levels`)
3. in build(b): spawnAt + setBounds + ground + a few structures + b.enemy(...) + an objective marker
4. set config.objective.type + config.player.startLoadout
5. npm run dev → http://localhost:5180/?level=my-game
6. verify-in-browser → ship-changes
```

That's a shippable game. Then iterate: terrain, more weapons/enemies, audio, cinematics — each its own skill.

## Where things live (map)

`src/engine/` generic systems · `src/kit/` level-builder + destructibles + asset catalogs ·
`src/game/` config, combat, actors, objectives, levels · `main.js` the runner (state machine + per-frame loop,
exposes `window.__game`) · `public/` GLB/audio · `server.js` prod static server (+ `/crm` analytics).
Full map: `ARCHITECTURE.md`. Conventions + dev hooks: `AGENTS.md`.
