---
name: add-audio
description: Use when adding or changing sound — a weapon/impact/creature SFX, a footstep, or background music. Covers the audio.js clip loader, the real-clip-with-synth-fallback pattern, playBuf vs playSlice, the looping music system (per-track start/stop + decode-aware "wanted" flag), and the licensing rule for committed audio.
---

# Add / change audio

All audio is in `src/engine/audio.js`. Real clips live in `public/audio/`. The house pattern is
**real clip first, synth fallback if it fails to load** — so the game is never silent.

## A one-shot SFX (gun, impact, creature, pickup)

1. Drop the file in `public/audio/foo.mp3` (or .ogg/.wav).
2. Add it to the `clips` map in `_loadClips()`: `foo: "/audio/foo.mp3"`.
3. Write/extend the method, real clip first:
   ```js
   foo() { if (this.playBuf("foo", 0.6, 0.95 + Math.random()*0.1)) return; /* ...synth fallback... */ }
   ```
   `playBuf(name, vol, rate)` plays the whole buffer (returns false if not loaded → falls through to synth).
4. **Long recording, want one hit per call** (e.g. a multi-second "walking on wet ground" clip used per
   footstep): use `playSlice(name, vol, dur, rate)` — plays a short **random window** with a tail fade, so
   one recording yields varied footsteps without overlap. (wade/swim use this.)

## Looping background music (two-track system)

Music tracks are large — they decode slowly, so the loader is **decode-aware**: `start*Music()` sets a
`_*Wanted` flag and stays **silent** until the buffer decodes; the loader then auto-starts it. Never play a
synth bridge while a real track is still decoding (it glitches).

- `startBattleMusic()` / `stopBattleMusic()` — `battle_theme` (the cinematic/opening/finale track), looped.
- `startGameMusic()` / `stopGameMusic()` — `game_theme` (the in-gameplay loop), looped.
- The runner wires them: opening crawl → battle; gameplay (`_startPlay`) → game loop; victory → restart
  battle from the start; loss → stop both. A fresh `BufferSource` always starts at offset 0 ("from the start").
- **Preload for the opening:** `main._boot` awaits `audio.clipsReady` so music is decoded before play begins
  (otherwise the opening/finale can be silent if you reach them before the big mp3 loads).

## Rules

- **Licensing (open-source blocker):** only commit **CC0 / royalty-free** audio. Do NOT commit copyrighted
  commercial tracks — they break the MIT license and risk takedowns. Credit every clip's source/license.
- Synthesis helpers for fallbacks: `_tone(freq,dur,type,vol,slideTo)`, `_noiseBurst(dur,freq,q,vol,type)`.
- The AudioContext is created suspended and resumes on the first user gesture — UI music won't play until then.
