---
name: game-qa
description: Use to run a full regression QA pass on the game — before a release, after a big change, or when asked to "re-QA the common bugs". A headless checklist over window.__game covering weapons, enemies, collision, terrain, audio, objectives, performance, and the full win/lose flow. Builds on verify-in-browser.
---

# Game QA pass

A repeatable regression sweep. Drive it headlessly (see `verify-in-browser` for setup) and **assert numbers**.
Run it for BOTH shipped games (`?level=arcfall` and `?level=desert-base`) — a change to shared code can break
one while the other looks fine. Report PASS/FAIL per item; 0 console errors is mandatory.

## The checklist

**Boot & lighting**
- [ ] Boots to `state="start"` with **0 console errors** (wait for `g.combat` to exist — boot preloads music).
- [ ] Scene **light count** is stable; spawning enemies/effects does NOT grow it (light-count recompile = freeze).
- [ ] Exposure/mood stays correct over time (no permanent brighten — e.g. embedded GLB lights).

**Weapons** (per weapon the level grants)
- [ ] Each fires and deals damage to an enemy at center-mass. Rifle uses `canFire`/`combat.tryShoot`; dict-guns
      use `canFireGun`/`_fireGun`; sword/launcher/plasma/laser have their own `canFireX`/`_fireX` (see `add-weapon`).
- [ ] Reset `_gunLast`/`mag`/`reloading` between shots so cooldowns don't cause false 0-damage.
- [ ] Correct **starting loadout**: ARCFALL = sword only; NightOps/others = rifle + launcher.
- [ ] Projectiles (grenade/rocket/plasma) detonate on the **actual terrain** + structures (not a flat plane).

**Enemies & AI**
- [ ] Placed + reinforcement enemies spawn; they path, chase, and respect LOS (`segmentBlocked` — walls give cover).
- [ ] Hitboxes register hits (big mechs have a tall hitbox — aim center-mass); enemies die + clean up.

**Collision & terrain**
- [ ] No fall-through floors/roofs; standable surfaces are standable; no floating/sunk props.
- [ ] Water: swim over deep water, wade in lakes/ponds (with the wade sound); lake rims are level (not floating).

**Objective & flow**
- [ ] The objective progresses (collect arcs / defuse / exfil) and triggers `_win`; `_lose` works; the cinematic/
      crawl/end-card runs; **Redeploy** reloads.
- [ ] Music: opening track → gameplay loop → restart on victory → stops on loss (per `add-audio`).

**Performance**
- [ ] No per-frame allocation spikes; no first-use hitch (warm-ups in place); steady framerate under combat.

## Notes

- Many "failures" in a synthetic harness are **test artifacts**: stale enemies in the line of fire, carried-over
  cooldowns, the RAF throttle, or using the wrong fire API for the rifle. Confirm a failure reproduces in real play
  before treating it as a bug.
- Finish by checking `browser_console_messages` (level error) = 0 on each level.
