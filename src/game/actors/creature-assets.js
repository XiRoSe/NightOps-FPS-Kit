import { RiggedAsset } from "../../engine/assets.js";

// Animated CC0 enemies (Quaternius). Dinos charge + bite; the cyberpunk robots walk/fly + shoot.
// Each is a rigged GLB with Idle/Walk/Run/Attack/Shoot/Death clips driven by an AnimationMixer.
export const CREATURES = {
  // dinosaurs (melee)
  raptor: new RiggedAsset("/models/creatures/velociraptor.glb", 2.4),
  spider: new RiggedAsset("/models/creatures/spider.glb", 1.5),
  trex:   new RiggedAsset("/models/creatures/trex.glb", 7.0),
  // robots (ranged)
  mech:   new RiggedAsset("/models/creatures/mech.glb", 7.2),
  sentry: new RiggedAsset("/models/creatures/Enemy_2Legs_Gun.glb", 2.5),  // walking gun-bot
  drone:  new RiggedAsset("/models/creatures/Enemy_Flying_Gun.glb", 1.9), // hovering gun-drone
  heavy:  new RiggedAsset("/models/creatures/Enemy_Large_Gun.glb", 3.6),  // heavy gun-bot
};

export function preloadCreatures() { return Promise.all(Object.values(CREATURES).map((a) => a.preload())); }

// Playable heroes — realistic military operators in 4 loadouts (tint + starting weapon). The operator
// model itself is preloaded via preloadOperator(); makeHero(tint) builds the tinted instance.
export const HERO_LIST = [
  { id: "assault", label: "Assault", tag: "Balanced · MK-4 Carbine", tint: 0x55603e, weapon: "rifle" },
  { id: "recon", label: "Recon", tag: "Agile · Laser Rifle", tint: 0x35505e, weapon: "laser" },
  { id: "heavy", label: "Heavy", tag: "Tanky · Missile Launcher", tint: 0x4a382c, weapon: "launcher" },
  { id: "marksman", label: "Marksman", tag: "Precision · Plasma Cannon", tint: 0x2c2c34, weapon: "plasma" },
];
export const HERO_TINT = Object.fromEntries(HERO_LIST.map((h) => [h.id, h.tint]));
export const HERO_WEAPON = Object.fromEntries(HERO_LIST.map((h) => [h.id, h.weapon]));
