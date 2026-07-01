import { RiggedAsset } from "../../engine/assets.js";
import { preloadGunModels } from "./gunmodels.js";

// Rigged model pack for the Rick & Morty level. Rick is now a cleanly-rigged UE4-skeleton model (69 bones,
// professional skinning); its animations live in separate mesh-stripped files and retarget on by bone name:
//   Rick:     rick.glb (mesh + UE4 skeleton, no clips) + rick_walk.glb (Walk_Loop) + rick_shoot.glb (Pistol_Shoot)
//   Meeseeks: meeseeks.glb (Walk_Loop)
export const RICK_MODEL = new RiggedAsset("/models/rick.glb?v=ue4", 1.95); // ?v busts the 1-day CDN cache on the new mesh
export const RICK_WALK = new RiggedAsset("/models/rick_walk.glb?v=ue4", 1.95);
export const RICK_SHOOT = new RiggedAsset("/models/rick_shoot.glb?v=ue4", 1.95);
export const MEESEEKS_MODEL = new RiggedAsset("/models/meeseeks.glb", 2.0);
export const RM_HAND_BONE = "hand_r";

// individual preload promises so the loading bar advances per-file instead of stalling on one big job
export function rickMortyJobs() { return [RICK_MODEL.preload(), RICK_WALK.preload(), RICK_SHOOT.preload(), MEESEEKS_MODEL.preload(), preloadGunModels()]; }

// pull extra animation clips off an already-preloaded RiggedAsset (same skeleton → they retarget by bone name)
export function clipsOf(asset) { return (asset._asset && asset._asset.animations) || []; }
