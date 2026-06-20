import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

// Lean pipeline: just a threshold bloom so muzzle flashes, tracers, and the
// exfil beacon glow cinematically. One extra pass — stays light.
export function buildComposer(renderer, scene, camera) {
  const size = renderer.getSize(new THREE.Vector2());
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.45, 0.6, 0.82);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  return {
    setSceneCamera(s, c) { renderPass.scene = s; renderPass.camera = c; },
    setSize(w, h) { composer.setSize(w, h); bloom.setSize(w, h); },
    render() { composer.render(); },
  };
}
