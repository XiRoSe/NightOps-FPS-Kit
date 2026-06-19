# CS_WEB_DEMO — "Clear the Compound"

A browser FPS demo built with **Three.js** + **Vite**. Night-time military
compound: push through, eliminate the hostiles, and reach the extraction flag.

Playable on desktop and mobile (on-screen touch controls).

## Controls

**Desktop**
- **WASD** move · **Shift** sprint · **Space** jump · **C** duck
- **Mouse** look · **Click** fire (full-auto) · **R** reload
- Click **Deploy** to lock the mouse and start.

**Mobile**
- Left side: virtual joystick (move) · Right side: drag to look
- On-screen **FIRE / JUMP / RELOAD / DUCK** buttons

## Features

- First-person controller (pointer-lock on desktop, touch on mobile): jump, duck, sprint, headbob.
- Rigged glTF soldier enemies with patrol → take-cover → peek-and-fire AI, plus random jump/duck dodges.
- Raycast gunplay: recoil, muzzle flash, additive tracers, soft impact sparks/dust, bullet decals, hitmarkers.
- Health regen, damage vignette, screen shake.
- Night sky (gradient + stars + billboard moon), procedural lighting, soft shadows.
- Tactical HUD, win/lose flow, objective flag at the extraction zone.
- Audio: M4/AK gunfire, reload, and radio callouts.

## Run locally

```bash
npm install
npm run dev        # http://localhost:5180
```

## Production

```bash
npm run build      # -> dist/
npm start          # serves dist/ on $PORT (default 8080)
```

## Tech

Three.js (PointerLockControls, GLTFLoader, SkeletonUtils), procedural geometry &
textures, Web Audio. Single-page; no backend.
