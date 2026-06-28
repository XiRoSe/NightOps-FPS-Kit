---
name: add-assets
description: Use when you need a 3D model, texture, sound, or music and must find one (WHERE to search for free/CC0 assets) and wire it in. Covers the vetted asset sources, the licensing rule, and how to load GLBs (RiggedAsset/PropAsset) and audio into this kit.
---

# Add assets (find + load)

This kit is cel-shaded low-poly. Match that look, and **only use CC0 / royalty-free assets you can legally
redistribute under MIT** — credit every one in the README. Read `engine-overview` first.

## WHERE to search (free / CC0, vetted)

**3D models (low-poly, match the style):**
- **Quaternius** (quaternius.com) — CC0 modular characters, weapons, nature, mechs. *This kit's main source.*
- **Kenney** (kenney.nl) — CC0 kits (vehicles, props, weapons). Clean low-poly.
- **Poly Pizza** (poly.pizza) — huge CC0/CC-BY low-poly library; check each item's license.
- **Sketchfab** — filter **Downloadable + CC0/CC-BY**; verify per-model.

**Textures / HDRI / IBL:**
- **Poly Haven** (polyhaven.com) — CC0 HDRIs, textures, models.

**Audio (SFX + music):**
- **Freesound** (freesound.org) — filter by license; **CC0** = no attribution, **CC-BY** = attribution required.
- **Pixabay / Mixkit** — royalty-free SFX & music.
- ⚠️ **Never commit copyrighted commercial tracks** (e.g. a named artist's song or a film score arrangement) —
  it breaks the MIT license and risks takedowns. Use a CC0/royalty-free equivalent or the synth fallback.

## Loading a model (lazy, preloaded at boot)

GLBs live in `public/models/`. Use the loaders in `engine/assets.js`:

```js
// skinned character (animations) — clone per instance
const hero = new RiggedAsset("/models/x.glb", { scale: 1, /* anim name maps */ });
await hero.preload();             // call during main._boot (it joins the progress bar)
const inst = hero.make();         // inst.model + inst.animations per spawn

// static prop
const rock = new PropAsset("/models/rock.glb", { length: 2 });
```

Preload new models in `main._boot`'s `jobs` array so they're ready before play (and the loading bar reflects
them). **Strip any embedded lights** from a loaded model (`model.traverse(o => o.isLight && o.parent.remove(o))`)
— a stray GLB light recompiles shaders + brightens the whole scene per instance (a real bug we hit with a drone).

## Loading audio

Drop the file in `public/audio/`, add it to the `clips` map in `engine/audio.js` `_loadClips()`, and play it
with the real-clip-with-synth-fallback pattern — see the **`add-audio`** skill for `playBuf`/`playSlice` and music.

## After adding any asset

Keep it low-poly, preload it, verify in-browser (no hitch, light count unchanged), and **add a CREDITS entry**
(source + license).
