# NightOps FPS Kit

A small, hackable **first-person-shooter starter kit** for the web — built with
**Three.js** (r0.169) and **Vite**, no framework, no build magic beyond Vite. It ships a
complete, polished night military shooter and a clean toolkit so you (and your AI pair) can
build your **own** FPS level or game on top of it fast.

> **It's a *game-specific* kit, not a generic engine.** The toolkit knows about walls, towers,
> bunkers, vehicles, fuel barrels and desert dressing on purpose — that's what makes it
> batteries-included. If you want a different setting, you reskin the content, not the architecture.

**Live demo:** https://cswebdemo-production.up.railway.app

---

## What's in the box

- **First-person controller** — pointer-lock look, WASD, sprint, jump, duck, headbob.
- **Gunplay** — hitscan rifle (recoil, muzzle flash, tracers, impact sparks/decals, hitmarkers),
  a **missile launcher** (Q), and **grenades** (right-click).
- **Engine impact system** — distance-falloff blasts that damage enemies, knock back/ragdoll, and
  shove mass-aware physics props.
- **Destructibles** — shootable **fuel barrels**, **fuel tanks**, and **vehicles** (launched into the
  air on death) with chain-reaction cook-offs, on a clean **unit-damage** scale.
- **Rigged glTF enemies** — patrol → take-cover → peek-and-fire AI that paths around obstacles and
  respects wall line-of-sight.
- **An enemy gunship boss** — descends, strafes, and can be killed by rifle or one rocket.
- **Cinematic fast-rope insertion** intro, tactical HUD, win/lose flow.
- **Two objective types** — `exfil` (clear all + reach the flag) and `defuse` (crack a timed bomb
  code, including a self-working "mentalist" code puzzle).
- **Levels as data** — drop a module in `src/game/levels/`, register it, and it's selectable with
  `?level=<id>`. Two ship in the box: `compound` and `desert-base`.
- **Night rendering** — baked sky + IBL, a starfield, cel-shaded ink **OutlineEffect**, soft shadows,
  floodlights.

## Controls (desktop)

- **WASD** move · **Shift** sprint · **Space** jump · **C** duck
- **Mouse** look · **Left-click** fire (full-auto) · **R** reload
- **Q** toggle the missile launcher · **Right-click** throw a grenade
- Click **Deploy** to lock the mouse and start.

> **Desktop / laptop only for now.** The game gates phones & tablets with a "play on a computer"
> screen (mobile touch controls exist in `engine/touch.js` but are disabled — see
> [docs/BUILDING.md](docs/BUILDING.md#re-enabling-mobile)). Input is read by **physical key**
> (`event.code`), so non-Latin keyboard layouts (Hebrew, Russian, …) work without switching to English.

## Run it

```bash
npm install
npm run dev        # http://localhost:5180
```

Pick a level with a query param: `http://localhost:5180/?level=compound`

## Build & deploy

```bash
npm run build      # -> dist/
npm start          # serves dist/ on $PORT (default 8080) via server.js
```

Deploys as a static site behind a tiny Node server (`server.js`). The live demo runs on Railway.

## Build your own

- **[docs/BUILDING.md](docs/BUILDING.md)** — the hands-on guide: the `LevelBuilder` API, adding &
  registering a level, retuning via `config.js`, objectives, and adding weapons / enemies / destructibles.
- **[ARCHITECTURE.md](ARCHITECTURE.md)** — the map: what every module does and the one rule that
  keeps it clean.
- **[AGENTS.md](AGENTS.md)** — read this if you're building with **Claude / an AI agent**. It hands
  your agent the conventions, the dev hooks, and the in-browser verification workflow so it doesn't
  have to rediscover them.

## Tech

Three.js (PointerLockControls, GLTFLoader, SkeletonUtils, OutlineEffect), procedural geometry &
canvas textures, Web Audio. Single-page; no backend logic (just a static file server).

## Credits

- **Player operator (SWAT):** CC0 "Ultimate Modular Men" low-poly character pack.
- **Vehicles (truck/flatbed/SUV/van):** Kenney CC0 Car Kit (tinted military).
- **Ammo magazine pickup:** CC0 "Low Poly Weapons Pack".
- **Missile launcher viewmodel:** CC0 low-poly rocket launcher.
- **Attack & insertion helicopters:** built procedurally (no external model).
- **Rotor loop:** [w84death/the-complex-project](https://github.com/w84death/the-complex-project) (MIT).
- **"Enemy spotted" radio callout:** Counter-Strike radio sound.

## License

[MIT](LICENSE). Bundled third-party assets keep their own CC0/MIT terms (see Credits).
