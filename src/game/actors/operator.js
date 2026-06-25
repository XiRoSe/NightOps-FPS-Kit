import { RiggedAsset } from "../../engine/assets.js";

// The player operator (realistic SWAT) — used for the third-person insertion + the hero lobby.
const OPERATOR = new RiggedAsset("/models/SWAT.glb", 1.85);
// distinct hero models (Quaternius modular men) — a different character per loadout
const HERO_MODELS = {
  assault: new RiggedAsset("/models/heroes/Swat.glb", 1.85),
  recon: new RiggedAsset("/models/heroes/Adventurer.glb", 1.85),
  heavy: new RiggedAsset("/models/heroes/Spacesuit.glb", 1.92),
  marksman: new RiggedAsset("/models/heroes/Suit.glb", 1.85),
};
export function preloadOperator() { return Promise.all([OPERATOR.preload(), ...Object.values(HERO_MODELS).map((a) => a.preload())]); }

const OPERATOR_BONES = {
  rArm: "UpperArmR", lArm: "UpperArmL",
  rFore: "LowerArmR", lFore: "LowerArmL",
  rWrist: "WristR",
  lUpLeg: "UpperLegL", rUpLeg: "UpperLegR",
};

export function makeOperator() {
  const inst = OPERATOR.make(OPERATOR_BONES);
  if (!inst) return null;
  inst.model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
  return { model: inst.model, bones: inst.bones };
}

// a distinct hero per loadout id (Assault=Swat, Recon=Adventurer, Heavy=Spacesuit, Marksman=Suit).
// The modular-men models import in a T-pose, so we drop the arms into a natural standing stance.
export function makeHero(heroId) {
  const asset = HERO_MODELS[heroId] || OPERATOR; // distinct look per loadout (gameplay is identical — all start with the staff)
  const inst = asset.make(OPERATOR_BONES);
  if (!inst) return null;
  inst.model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
  const b = inst.bones || {};
  if (b.lArm) b.lArm.rotation.z = -1.32; if (b.rArm) b.rArm.rotation.z = 1.32;   // T-pose → arms at the sides
  if (b.lFore) b.lFore.rotation.z = -0.25; if (b.rFore) b.rFore.rotation.z = 0.25; // slight elbow bend
  return { model: inst.model, bones: inst.bones, animations: inst.animations || [] };
}
