// Game definition for "Clear the Compound".
// This is the tuning/rules layer: edit these values to retune or reskin the game without
// touching the engine or the per-frame logic in main.js.
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
