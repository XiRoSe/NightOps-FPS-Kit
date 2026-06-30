import { RiggedAsset } from "../../engine/assets.js";
import { preloadGunModels } from "./gunmodels.js";

// Rigged model pack for the Rick & Morty level (Mesh2Motion human skeleton, bone "hand_r" = right hand).
//   Rick:     rick.glb (Walk_Loop mesh) + rick_shoot.glb (animation-ONLY: Pistol_Shoot — mesh stripped, ~19KB)
//   Meeseeks: meeseeks.glb (Walk_Loop)
// rick_shoot's clip retargets onto rick.glb's identical skeleton by bone name, so it needs no mesh of its own.
export const RICK_MODEL = new RiggedAsset("/models/rick.glb", 1.95);
export const RICK_SHOOT = new RiggedAsset("/models/rick_shoot.glb", 1.95);
export const MEESEEKS_MODEL = new RiggedAsset("/models/meeseeks.glb", 2.0);
export const RM_HAND_BONE = "hand_r";

// individual preload promises so the loading bar advances per-file instead of stalling on one big job
export function rickMortyJobs() { return [RICK_MODEL.preload(), RICK_SHOOT.preload(), MEESEEKS_MODEL.preload(), preloadGunModels()]; }

// pull extra animation clips off an already-preloaded RiggedAsset (same skeleton → they retarget by bone name)
export function clipsOf(asset) { return (asset._asset && asset._asset.animations) || []; }
