---
name: tuning-balance
description: Use when changing gameplay numbers — weapon damage, blast radius, enemy HP, player health/regen, grenades, fog/fov, gunship timing, or destructible HP. Explains config.js, the balance block, the two damage scales, and per-level overrides via mergeConfig.
---

# Tuning & balance

All gameplay numbers live in `src/game/config.js`. Levels override one level deep via their `config` field
(`mergeConfig(base, over)`). Don't scatter magic numbers in logic — put them here. Read `engine-overview` first.

## Two damage scales — NEVER mix them

1. **Enemy/player scale** — rifle ≈34 dmg, enemy HP ~100. Grenades/rockets do big AoE to enemies via `applyBlast`.
2. **Destructible/gunship "unit" scale** — `balance.units = { rifle: 1, grenade: 5, rocket: 15 }`. Object HP is in
   units (barrels 2–3, fuel tanks 4, cars 7–8, `gunship.hp: 15`).

## The `balance` block (where the knobs are)

```js
balance: {
  units:   { rifle: 1, grenade: 5, rocket: 15 },   // damage to destructibles + gunship
  grenade: { radius: 7,  damage: 320, power: 11 },  // AoE to enemies + knockback impulse
  rocket:  { radius: 9,  damage: 900, power: 16 },
  gunship: { hp: 15 },
  // ...weapon fire rates, enemy stats, etc.
}
```

## Common knobs outside `balance`

- `player.maxHealth / regenInterval / regenAmount / grenades / startLoadout`
- `scene.fov`, `scene.fog` (`{color, near, far}`), `scene.sky` (`"day"`/night)
- `helicopter.spawnDelay` (set huge to disable the gunship boss)
- `objective.type` + its fields (`count` / `timeLimit, codeLength, maxTries`)
- `intro.enabled` / `intro.style`, `messages.*` (HUD text)

## Per-level overrides

A level's `config` is merged onto the base one level deep — so ARCFALL sets its own `scene`, `objective`,
`intro`, and `player.startLoadout` without touching the base. Keep shared defaults in `config.js`; put
level-specific values in the level's `config`.

## Verify

After retuning, sanity-check in-browser: fire the weapon and assert the new damage/HP/radius behaves as
intended (e.g. "one rocket kills the boss" or "a barrel pops in N rifle shots") — see `verify-in-browser`.
