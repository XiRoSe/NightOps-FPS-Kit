# Ember Town — Design (MVP demo)

_Date: 2026-06-18. Built autonomously per owner request ("build a small 3D
Pokemon-like demo in the messenger.abeto.co animation style, Pallet-Town RED
feel in color, strong MVP, decide everything yourself, don't block")._

## Goal

A polished, impressive, fun vertical slice that captures the monster-catching
fantasy in miniature, with the charming low-poly painterly aesthetic of
messenger.abeto.co and the cozy starting-town feel of Pokemon RED's first town.

## Reference study (messenger.abeto.co)

Confirmed Three.js. Signature traits we emulate cheaply: tiny storybook world,
hand-painted/imperfect surfaces, soft cel look, gentle follow camera, doodle UI,
ambient charm (clouds, butterflies, swaying grass). The real game uses a heavy
asset pipeline (Draco geometry, KTX2 textures, web workers, LOD, skeletal rigs);
we reproduce the *feel* with procedural geometry and toon shading instead.

## Scope (MVP)

In:
- Title screen over a live town backdrop.
- Explorable 3D town: 2 houses, professor's lab, NPCs, signs, pond, flora.
- Third-person trainer with walk animation + smooth follow camera + collision.
- Tall-grass random encounters.
- Turn-based battle: Fight (2 moves), Catch (ball throw + wobble), Run.
- Type effectiveness, HP bars, typewriter messages, faint/catch animations.
- Catch grows your party.
- Synthesized chiptune music + SFX. Screen transitions.

Out (YAGNI for the demo): XP/levelling, party switching UI, saving, multiplayer,
mobile touch, overworld trainer battles.

## Architecture

State machine in `main.js`: `title → town → transition → battle → town`.
One WebGL renderer; the engine renders whichever (scene, camera) is active, so the
town and battle are independent Three scenes swapped on encounter. UI is a DOM
overlay (crisp text, easy layout) layered over the canvas. Each module has a single
clear job (see README structure). Builders centralize the art language (toon
materials + vertex "wobble") so the whole world looks cohesive.

## Risks / decisions

- No 3D assets → everything procedural. Keeps it self-contained and instantly
  runnable; limits visual fidelity vs. the reference, which is acceptable for a demo.
- Encounter rate tuned to ~16% per half-step in grass with a post-battle cooldown
  so it feels alive but not punishing.
- Catch chance scales with missing HP so the Catch button is satisfying even at
  full HP (≈45-50%) but clearly better after chipping the wild creature down.

## Verification

Driven end-to-end in a real browser (Playwright): title → intro → walk → grass
encounter → Fight (damage + counterattack + HP bars) → Catch (throw, wobble,
"Gotcha!", joins team) → return to town. Zero JS console errors.
