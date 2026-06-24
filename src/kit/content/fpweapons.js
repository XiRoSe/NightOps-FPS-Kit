import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// Real CC0 weapon models (Quaternius) used as first-person viewmodels — scaled + recentered to origin.
const DEFS = {
  laser: { url: "/models/weapons/laser.glb", len: 0.62 },
  plasma: { url: "/models/weapons/plasma.glb", len: 0.58 },
  shotgun: { url: "/models/weapons/shotgun.glb", len: 0.66 },
  smg: { url: "/models/weapons/smg.glb", len: 0.6 },
  minigun: { url: "/models/weapons/minigun.glb", len: 0.7 },
  railgun: { url: "/models/weapons/railgun.glb", len: 0.72 },
  sword: { url: "/models/weapons/sword.glb", len: 0.7 },
  medkit: { url: "/models/firstaidkit.glb", len: 0.6 },
};
const cache = {};

export function preloadFpWeapons() {
  const loader = new GLTFLoader();
  return Promise.all(Object.entries(DEFS).map(([k, d]) => new Promise((resolve) => {
    loader.load(d.url, (gltf) => {
      const root = gltf.scene, bb = new THREE.Box3().setFromObject(root), size = new THREE.Vector3();
      bb.getSize(size);
      cache[k] = { scene: root, scale: d.len / Math.max(size.x, size.y, size.z) };
      resolve();
    }, undefined, () => resolve());
  })));
}

// a fresh clone, scaled to its target length and recentered on the origin (caller orients/places it)
export function makeFpWeapon(k) {
  const a = cache[k]; if (!a) return null;
  const m = a.scene.clone(true); m.scale.setScalar(a.scale);
  const bb = new THREE.Box3().setFromObject(m), c = new THREE.Vector3(); bb.getCenter(c); m.position.sub(c);
  m.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = false; } });
  return m;
}
