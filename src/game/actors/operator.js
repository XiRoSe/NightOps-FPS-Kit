import * as THREE from "three";
import { RiggedAsset } from "../../engine/assets.js";

// The player operator (realistic SWAT) — used for the third-person insertion + the hero lobby.
const OPERATOR = new RiggedAsset("/models/SWAT.glb", 1.85);
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

// a hero variant: the operator tinted toward a loadout color (Assault/Recon/Heavy/Marksman)
export function makeHero(tint) {
  const inst = OPERATOR.make(OPERATOR_BONES);
  if (!inst) return null;
  const c = tint != null ? new THREE.Color(tint) : null;
  inst.model.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true; o.frustumCulled = false;
    if (c) { o.material = o.material.clone(); o.material.color.lerp(c, 0.5); }
  });
  return { model: inst.model, bones: inst.bones, animations: inst.animations || [] };
}
