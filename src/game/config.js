// The tuning/rules layer: edit these values to retune or reskin the game without touching the
// engine/kit systems or the per-frame logic in main.js. Levels override sections via mergeConfig.
export const config = {
  scene: {
    fog: { color: 0x0e1626, near: 32, far: 120 },
    fov: 70,
  },
  player: {
    maxHealth: 100,
    regenInterval: 2, // seconds between health-regen ticks
    regenAmount: 1,   // HP restored per tick
    grenades: 5,      // grenades carried at start (right-click to throw)
  },
  helicopter: {
    spawnDelay: 5,    // seconds into the fight the enemy gunship arrives
  },
  objective: {
    type: "exfil",    // "exfil" = clear all + reach the flag; "defuse" = disarm the bomb (timed)
  },
  // All the gameplay tuning in one place. Two damage scales (kept separate on purpose):
  //  - enemy/player scale: the rifle does weapons.rifleDamage vs ~100-HP enemies (in kit/weapon.js).
  //  - "unit" scale: destructibles + the gunship take whole units (rifle 1 / grenade 5 / rocket 15);
  //    their HP is in units below. Tune "how many shots to blow up a car" here, not in code.
  balance: {
    units: { rifle: 1, grenade: 5, rocket: 15 },          // damage dealt to destructibles + gunship
    grenade: { radius: 7, damage: 320, power: 11 },        // AoE damage to enemies + knockback impulse
    rocket: { radius: 9, damage: 900, power: 16 },
    plasma: { radius: 8, damage: 520, power: 14, units: 8 },   // sci-fi plasma cannon: big blue blast
    laser: { damage: 26 },                                     // rapid laser rifle (hitscan, 200 shots)
    sword: { damage: 110, reach: 4.6 },                        // heavy melee arc blade (wide swing + knockback)
    gunship: { hp: 15 },                                   // in units (rifle=1 -> 15 shots; one rocket=15)
    vehicle: { blastRadius: 11, blastDamage: 320, blastPower: 20 }, // a destroyed car's explosion (vs enemies)
    destructibles: { barrelHp: [2, 3], fuelTankHp: 4, vehicleHp: [7, 8] }, // HP in units
    detonation: { duration: 4.2, launchUp: 46, launchOut: 30 },    // bomb blast: how long + how hard it hurls the player
  },
  intro: {
    enabled: true,
    spottedCalloutAt: 2.0, // seconds into the intro the "enemy spotted" radio call plays
  },
  messages: {
    deployHint: "FAST-ROPE INSERTION — click to skip",
    hostileDown: "HOSTILE DOWN",
    gunshipInbound: "⚠ ENEMY GUNSHIP INBOUND",
    gunshipDown: "GUNSHIP DESTROYED",
    objective: "Eliminate all hostiles",
    objectiveCleared: 'All hostiles down — reach the <span class="arrow">FLAG ▲</span>',
  },
};

// Merge a level's per-section overrides on top of the base config (one level deep).
export function mergeConfig(base, over = {}) {
  const out = {};
  for (const k of Object.keys(base)) {
    out[k] = (base[k] && typeof base[k] === "object" && !Array.isArray(base[k]))
      ? { ...base[k], ...(over[k] || {}) }
      : (k in over ? over[k] : base[k]);
  }
  for (const k of Object.keys(over)) if (!(k in out)) out[k] = over[k];
  return out;
}
