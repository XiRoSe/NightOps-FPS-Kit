import { RiggedAsset } from "../engine/actor.js";

// The player operator (black SWAT) — used for the intro insertion (third-person).
const OPERATOR = new RiggedAsset("/models/SWAT.glb", 1.8);
export function preloadOperator() { return OPERATOR.preload(); }

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
