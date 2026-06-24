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
// each hero carries a DISTINCT weapon loadout (cycle with Q); loadout[0] is equipped on deploy
export const HERO_LIST = [
  { id: "assault", label: "Assault", tag: "Carbine + Arc Blade", tint: 0x55603e, loadout: ["rifle", "sword"] },
  { id: "recon", label: "Recon", tag: "Laser Rifle + Arc Blade", tint: 0x35505e, loadout: ["laser", "sword"] },
  { id: "heavy", label: "Heavy", tag: "Missile Launcher + Plasma", tint: 0x4a382c, loadout: ["launcher", "plasma"] },
  { id: "marksman", label: "Marksman", tag: "Plasma Cannon + Laser", tint: 0x2c2c34, loadout: ["plasma", "laser"] },
];
export const HERO_TINT = Object.fromEntries(HERO_LIST.map((h) => [h.id, h.tint]));
export const HERO_LOADOUT = Object.fromEntries(HERO_LIST.map((h) => [h.id, h.loadout]));
