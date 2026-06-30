import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// Real CC0 low-poly gun models (Kenney "Blaster Kit", CC0) for the 3rd-person held weapons. Each blaster's
// barrel already points +Z, matching our hand-attach convention. We load the small set we use, then clone +
// normalize (center, scale to a held size) on demand. Falls back to procedural makeHeldGun if not loaded.
const MAP = { rifle: "blaster-p", burst: "blaster-m", minigun: "blaster-l", plasma: "blaster-q", launcher: "blaster-r", gun: "blaster-k", rocket: "blaster-r" };
const cache = {};
let loading = null;

export function preloadGunModels() {
  if (loading) return loading;
  const loader = new GLTFLoader();
  const files = [...new Set(Object.values(MAP))];
  loading = Promise.all(files.map((name) => new Promise((res) => {
    loader.load(`/models/guns/${name}.glb`, (g) => { cache[name] = g.scene; res(); }, undefined, () => res());
  })));
  return loading;
}

export function hasGunModel(mode) { const n = MAP[mode]; return !!(n && cache[n]); }

// returns a Group whose grip sits ~at the origin and barrel points +Z (forward), sized for a held weapon — or null
export function makeGunModel(mode) {
  const name = MAP[mode]; const src = name && cache[name];
  if (!src) return null;
  const inst = src.clone(true);
  const box = new THREE.Box3().setFromObject(inst); const size = new THREE.Vector3(); box.getSize(size); const center = new THREE.Vector3(); box.getCenter(center);
  const scale = 0.62 / (size.z || 1);                       // normalise to a ~0.62m-long held weapon
  inst.position.sub(center);                                 // recenter on origin
  const g = new THREE.Group(); g.add(inst); g.scale.setScalar(scale);
  g.position.z = size.z * scale * 0.28;                      // shift forward so the grip is near the hand, barrel ahead
  g.position.y = -size.y * scale * 0.15;                     // drop slightly so the hand meets the grip
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; if (o.material) o.material.userData.outlineParameters = { thickness: 0.004, color: 0x0a0c10 }; } });
  const wrap = new THREE.Group(); wrap.add(g);               // outer group so callers can set position/rotation freely
  return wrap;
}
