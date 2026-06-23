# Refactor & Organization Plan

A plan to **fix and organize the existing code** so NightOps FPS Kit is clean for others to build
on. **No new gameplay features** — every step is "same behavior, better shape." Each phase is
independently shippable, ordered so earlier phases de-risk later ones.

**Guiding constraints**
- *Behavior must not change.* Verify after every phase: `npm run build` is green, the game loads with
  **0 console errors**, and the in-browser checks below still pass.
- Keep it **flat** — no new frameworks/abstraction layers; split by responsibility, not by pattern.
- Preserve the **`engine/` never imports `game/`** rule (and make it enforceable).
- Small, single-purpose commits so anything can be reverted cleanly.

**Standing verification (run after each phase, via `window.__game`)**
- Walls block line-of-sight (gunship + soldiers can't shoot through them).
- Unit-damage shot counts hold: barrel 2–3, fuel tank 4, car 7–8, gunship 15; grenade=5, rocket=15.
- The mentalist bomb code always solves; 3 wrong tries → detonation launches the player.
- Mobile UAs gated, desktop/laptop allowed.

---

## Phase 0 — Hygiene & tooling (no code-behavior change)

The cheapest, highest-leverage cleanup; do it first so everything after is consistent.

- [ ] **`.gitattributes`** with `* text=auto eol=lf` — ends the CRLF warning spam and normalizes diffs
      across OSes. (Re-normalize once: `git add --renormalize .`.)
- [ ] **`.editorconfig`** — 2-space indent, LF, trim trailing whitespace, final newline.
- [ ] **`jsconfig.json`** with `checkJs: true` + `strict`-ish options — turns the editor into a type
      checker for plain JS, no TS migration.
- [ ] **ESLint (flat config)** with a single custom rule (or `no-restricted-imports`) enforcing
      **no `engine/` → `game/` imports**, plus `no-unused-vars`. This makes the architecture's core
      rule mechanical instead of aspirational.
- [ ] **Prettier** (optional) for consistent formatting; wire `npm run lint` / `npm run format`.

*Acceptance:* build green, lint passes, no behavior change, no more line-ending warnings on commit.

---

## Phase 1 — One tuning surface (move data out of code)

Right now gameplay constants are hardcoded across `main.js`, `helicopter.js`, `level-builder.js`.
Centralize them so designers/peers tune **data, not code**.

- [ ] Add a **`balance`** block to `game/config.js` (or `game/balance.js`):
  - `weapons`: grenade `{radius:7, damage:320, power:11, count:5}`, rocket `{radius:9, damage:900,
    power:16, reload:3}`, rifle `{damage:34, fireRate, spread}`.
  - `units`: `{ rifle:1, grenade:5, rocket:15 }` (the destructible scale).
  - `destructibles`: barrel `{hp:[2,3], scale, radius, damage}`, fuelTank `{hp:4, …}`,
    vehicle `{hp:[7,8], launch, vanishDelay}`.
  - `gunship`: `{ hp:15, fireRate, … }`, `detonation`: `{ duration, launchUp, launchOut }`.
- [ ] Replace the literals at the sites found in the inventory (main.js lines ~270/290/320/355,
      helicopter.js hp, level-builder.js barrel/car/tank HP) with reads from `balance`.
- [ ] Keep the **two-scale rule** explicit and commented in one place (enemy/player scale vs unit scale).

*Acceptance:* identical numbers, now sourced from config; shot-count checks unchanged.

---

## Phase 2 — Decompose the `main.js` god-object (664 lines → thin runner)

`main.js` currently mixes five responsibilities. Extract them into cohesive modules that `main`
*orchestrates*. Pure moves — copy logic out, call into it, verify parity. Target: `main.js` ≈ 200
lines (construct systems, run the state machine, delegate).

- [ ] **`engine/laser-sight.js`** ← `_updateLaser` (+ its scratch vectors). Reusable aiming gear.
- [ ] **`engine/destructibles.js`** ← `_explodeBarrel`, `_explodeVehicle`, and the
      barrel/vehicle/tank blast loops inside `_updateProjectiles`. Owns the unit-damage application and
      chain/cook-off. `main` calls `destructibles.applyBlast(center, units, …)`. (This is engine-level
      kit behavior that's currently misfiled in `game/`.)
- [ ] **`game/objectives/`** — an **objective interface** `{ init(game), update(dt,t,presses),
      hud(), isComplete() }`, with `defuse.js` (← `_updateDefuse`, `_detonate`, and the bomb-code
      generation now inlined in the constructor) and `exfil.js` (← the clear-and-reach-flag branch in
      `update`). `main` selects one by `config.objective.type`. **This is the change that makes the kit
      truly extensible** — a peer adds an objective module instead of editing the runner.
- [ ] **`game/detonation.js`** (or fold into defuse) ← the player-launch cinematic in `update`'s
      `detonate` branch.
- [ ] **`device.js`** ← `isMobileOrTablet` + `showDesktopOnlyScreen`; `boot.js` (optional) ← the
      asset-preload + warm-up sequence.

*Acceptance:* `main.js` is a thin runner; all four standing checks pass; no console errors.

---

## Phase 3 — Make the boundary real

- [ ] With Phase 2 done, `engine/` should hold the reusable systems (incl. destructibles, laser) and
      `game/` the rules/content (objectives, enemy, heli, levels). Turn on the ESLint boundary rule from
      Phase 0 and fix any remaining violations.
- [ ] Sanity-pass each `engine/*` file: does it reference *this* map/roster/rules? If so, it belongs in
      `game/`. Document any deliberate exception inline.

*Acceptance:* `npm run lint` enforces the boundary; no engine→game imports remain.

---

## Phase 4 — Consistency & cleanup

- [ ] **Fix config drift**: base `config.js` defaults to `objective:"exfil"` + flag wording and the
      "Clear the Compound" comment, while the shipped default level is the desert defuse. Align
      comments/defaults/messages so the base config isn't misleading.
- [ ] **JSDoc typedefs** for the shared shapes — `LevelModule`, `EnemySpec`, `Collider`,
      `Config`/`Balance`, the destructible `rec`. With Phase 0's `checkJs`, these become real checks and
      give peers autocomplete in `build(b)`.
- [ ] **Naming/convention pass**: consistent `_private` usage, kill dead/duplicated scratch vars,
      group related fields in the constructor with short section comments.
- [ ] Confirm **no per-frame allocations** crept into hot paths during the refactor (reuse `vfx.js`
      pools and scratch vectors).

*Acceptance:* clean type-check, consistent style, accurate config comments.

---

## Phase 5 — Protect the work (lightweight, not new features)

So future edits don't silently break the things we just verified by hand all along.

- [ ] **Smoke-test harness** — formalize the standing checks into `npm test` (headless Playwright
      driving `window.__game`): LOS-through-walls, unit-damage shot counts, mentalist-code solves,
      mobile-gate matrix. ~5 assertions, fast.
- [ ] **GitHub Actions CI** — run `npm ci && npm run build` (catches the dropped-brace class of bug)
      and the smoke tests on PRs.
- [ ] **`CONTRIBUTING.md`** — the boundary rule, "run build + 0 console errors", how to add a level,
      and the verification workflow (points at `AGENTS.md`).

*Acceptance:* `npm test` + CI green; a contributor PR is checked automatically.

---

## Definition of done

- `main.js` is a thin orchestrator; engine and game each hold only what they should; the boundary is
  lint-enforced.
- All gameplay tuning lives in one config/balance surface.
- The four standing checks pass, the build is green, and CI guards them.
- A newcomer can read `ARCHITECTURE.md` → `docs/BUILDING.md`, copy a level, and ship — and their agent
  has `AGENTS.md` + types to work from.

## Explicitly out of scope (this is fix/organize, not feature work)

New objective types, a second example game, quality/graphics toggles, mobile re-enable, new weapons or
enemies. Those are *easier and safer to add after* this cleanup — but they are not part of it.
