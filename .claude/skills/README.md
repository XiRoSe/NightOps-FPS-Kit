# Skills — AI-first guide to the FPS kit

These are **agent skills** for building on this Three.js + Vite browser game engine. An AI agent loads
the relevant one on demand (each `SKILL.md` has a `description` saying *when* to use it). They replace the
old prose docs with task-scoped, verified, actionable knowledge.

Start with **`engine-overview`** (the tier rule + gotchas), then reach for the task skill:

| Skill | Use when |
|-------|----------|
| `engine-overview`   | **read first** — tiers, damage scales, colliders, the runner, the gotchas |
| `add-level`         | adding/editing a level + the LevelBuilder toolkit |
| `add-weapon`        | adding/debugging a weapon (note: the rifle is the *primary*, not a dict-gun) |
| `add-enemy`         | soldiers, dinos, mechs, drones, the gunship boss |
| `add-audio`         | SFX, footsteps, and the two-track music system (real clip + synth fallback) |
| `verify-in-browser` | **test any change** headlessly via `window.__game` (the core AI-first loop) |
| `ship-changes`      | lint → build → commit → deploy to Railway, and confirm it's live |

House rule: every change keeps `engine/ → kit/ → game/` imports one-directional, passes `npm run lint`
and `npm run build`, loads with 0 console errors, and is verified in-browser before shipping.
