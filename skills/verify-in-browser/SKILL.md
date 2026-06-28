---
name: verify-in-browser
description: Use to TEST any gameplay change before shipping — the core AI-first capability. Drive the game headlessly via window.__game (Playwright or devtools), prefer numerical assertions over screenshots, jump straight into play, and avoid the RAF/state pitfalls. Invoke after editing anything that affects gameplay, placement, weapons, enemies, audio, or UI.
---

# Verify in the browser (window.__game)

The game exposes `window.__game`. Drive it from Playwright (or the devtools console) to assert behaviour
**before** committing. This is how you avoid shipping regressions in a kit with no unit tests.

## Standard setup — jump straight into play

```js
const g = window.__game;
// boot now WAITS for the music preload, so wait for combat to exist first:
await page.waitForFunction(() => window.__game && window.__game.combat, { timeout: 30000 });
if (g.intro && g.intro.dispose) g.intro.dispose(); g.intro = null;
g._introDone = true; g._disposeLobby && g._disposeLobby(); g._startPlay(); // skip menu/intro → "play"
g.controller.onUnlock = () => {};   // don't auto-pause when the pointer isn't locked
g._onPlayerHit = () => {};          // god-mode for stable tests
g.update = () => {};                // freeze the runner loop; you drive subsystems manually
```

Useful handles: `g.combat.enemies`, `g.combat.spawnEnemy(spec)`, `g.level` (`.colliders`, `.arcs`,
`.terrainHeight`, `._lakes`, `.solidMeshes`), `g.weapon`, `g.camera`, `g.vfx`, `g.audio`, `g.engine`.

## Prefer numerical assertions over screenshots

The `requestAnimationFrame` loop is **throttled** in a background tab, so screenshot timing is unreliable.
Assert numbers instead. Patterns that work well:

- **Placement:** raycast straight down onto `solidMeshes`, or read `mesh.getWorldPosition` / bbox math.
- **Collision/standing:** drop the controller from above (`feetY = gy+60`, loop `g.controller.update(1/60, fakeInput)`)
  and assert where it lands.
- **Weapons:** aim the camera at an enemy's hitbox world-position, fire N times, assert `enemy.hp` dropped.
  (Rifle = `canFire`/`combat.tryShoot`; dict-guns = `canFireGun`/`_fireGun` — see `add-weapon`.)
- **Light-count regressions:** count `o.isLight` in `scene.traverse` before vs after an action (must not grow).
- **Audio:** assert `audio.buffers.<name>` decoded; wrap `audio.playBuf` to confirm a method routes to the real clip.

`fakeInput = { isDown:(...k)=>k.some(x=>keys.has(x)), touch:null }`. To advance time deterministically,
call `g.update(dt, t)` (or step a subsystem: `g.combat.update`, `g.weapon.update`, `g.vfx.update`).

## When you DO screenshot

Set the camera explicitly, then force a frame: `g.engine.renderer.render(g.scene, g.camera);
g.engine.outline.render(g.scene, g.camera)`. The bg RAF won't repaint on its own after your `g.update=()=>{}`.

## Pitfalls (these cause false fails)

- **Prior evals persist on the same page** — `g.update=()=>{}` stays overridden; stale enemies linger in the
  line of fire. Reload to reset, or clean up (`g.combat.enemies.length = 0`).
- **Cooldowns/ammo carry over** between fire tests — reset `g.weapon._gunLast`, `A[mode].mag`, `reloading`.
- **Boot takes longer now** (it preloads the music tracks) — always `waitForFunction(... .combat)` first.
- Always finish with **0 console errors** (`browser_console_messages` level error).
