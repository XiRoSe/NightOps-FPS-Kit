import * as THREE from "three";

// Low-poly HELD weapon props for 3rd-person characters (Rick + Meeseeks). Each returns a group whose
// barrel points +Z (forward), origin at the grip, so it can be parented at a hand and aim with the body.
// Every game weapon mode gets its own distinct silhouette so swapping weapons visibly changes Rick's gun.
export function makeHeldGun(kind = "rifle") {
  const g = new THREE.Group();
  const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, metalness: 0.55, roughness: 0.45, flatShading: true, ...o });
  const metal = M(0x2b2f36), dark = M(0x16181c), wood = M(0x6b4a2e);
  const glow = (c, e) => M(c, { emissive: e, emissiveIntensity: 1.8, metalness: 0.2, roughness: 0.3 });
  const cyl = (r1, r2, h, mat, z, seg = 10) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), mat); m.rotation.x = Math.PI / 2; m.position.z = z; return m; };
  const box = (w, h, d, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); return m; };
  const orb = (r, mat, z) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), mat); m.position.z = z; return m; };
  const grip = (z = -0.02) => box(0.07, 0.18, 0.1, dark, 0, -0.14, z);

  switch (kind) {
    case "launcher": case "rocket": {                          // fat tube + rocket nose — a bazooka
      g.add(cyl(0.13, 0.13, 0.95, M(0x4b5a3a), 0.28)); g.add(cyl(0.17, 0.13, 0.16, dark, -0.12));
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.26, 8), M(0xc23a2a, { emissive: 0x551006, emissiveIntensity: 0.5 })); nose.rotation.x = Math.PI / 2; nose.position.z = 0.78; g.add(nose);
      g.add(box(0.05, 0.12, 0.18, metal, 0, 0.16, 0.2)); g.add(box(0.09, 0.24, 0.12, dark, 0, -0.2, 0.18)); break;
    }
    case "minigun": {                                          // bulky body + rotary barrel cluster + ammo box
      g.add(box(0.2, 0.22, 0.4, metal, 0, 0, 0.1));
      for (let a = 0; a < 6; a++) { const m = cyl(0.025, 0.025, 0.6, dark, 0.55, 6); m.position.x = Math.cos(a / 6 * Math.PI * 2) * 0.07; m.position.y = Math.sin(a / 6 * Math.PI * 2) * 0.07; g.add(m); }
      g.add(cyl(0.1, 0.1, 0.12, M(0x3a3f47), 0.46)); g.add(box(0.16, 0.16, 0.16, M(0x55402a), 0, -0.02, -0.2)); g.add(box(0.1, 0.26, 0.12, dark, 0, -0.22, 0.0)); break;
    }
    case "smg": {                                              // short + compact
      g.add(box(0.1, 0.14, 0.36, metal, 0, 0, 0.08)); g.add(cyl(0.03, 0.03, 0.26, dark, 0.34, 8));
      g.add(box(0.06, 0.2, 0.08, dark, 0, -0.16, 0.06)); g.add(grip(0.0)); break;
    }
    case "burst": {                                            // rifle + a chunky optic on top
      g.add(box(0.11, 0.15, 0.58, metal, 0, 0, 0.14)); g.add(cyl(0.035, 0.035, 0.46, dark, 0.56, 8));
      g.add(box(0.06, 0.1, 0.22, metal, 0, 0.13, 0.18)); g.add(box(0.07, 0.2, 0.1, dark, 0, -0.16, 0.14)); g.add(grip(-0.02)); break;
    }
    case "railgun": {                                          // long sleek body + glowing blue rails
      g.add(box(0.09, 0.12, 0.82, metal, 0, 0, 0.3));
      g.add(box(0.03, 0.05, 0.72, glow(0x3aa0ff, 0x1a66cc), 0.06, 0.08, 0.34)); g.add(box(0.03, 0.05, 0.72, glow(0x3aa0ff, 0x1a66cc), -0.06, 0.08, 0.34));
      g.add(orb(0.05, glow(0x99ccff, 0x4488ff), 0.74)); g.add(box(0.08, 0.2, 0.22, dark, 0, -0.12, -0.18)); g.add(grip(-0.04)); break;
    }
    case "flak": case "shotgun": {                             // chunky twin-barrel + wood stock
      g.add(box(0.16, 0.16, 0.5, M(0x3a3f47), 0, 0, 0.16));
      const b1 = cyl(0.06, 0.07, 0.44, dark, 0.5, 10); b1.position.x = -0.07; g.add(b1);
      const b2 = cyl(0.06, 0.07, 0.44, dark, 0.5, 10); b2.position.x = 0.07; g.add(b2);
      g.add(box(0.12, 0.14, 0.24, wood, 0, -0.02, -0.24)); g.add(grip(-0.04)); break;
    }
    case "laser": {                                            // sleek cyan energy rifle
      g.add(box(0.1, 0.14, 0.44, metal, 0, 0, 0.16)); g.add(cyl(0.04, 0.04, 0.4, dark, 0.5, 8));
      g.add(cyl(0.05, 0.05, 0.5, glow(0x33e0ff, 0x22bbff), 0.2, 8)); g.add(orb(0.05, glow(0x99f0ff, 0x55ddff), 0.72)); g.add(grip(0.0)); break;
    }
    case "plasma": {                                           // bulbous purple body + glowing orb
      g.add(box(0.14, 0.16, 0.4, M(0x3a2f4a), 0, 0, 0.14)); g.add(orb(0.1, glow(0x9b5cff, 0x7a33ff), 0.36));
      g.add(orb(0.05, glow(0xccaaff, 0xaa66ff), 0.56)); g.add(grip(0.0)); break;
    }
    case "sword": {                                            // the Arc Blade
      g.add(box(0.06, 0.08, 1.0, M(0xcfd6e6, { metalness: 0.8, roughness: 0.25, emissive: 0x223344, emissiveIntensity: 0.4 }), 0, 0, 0.5));
      g.add(box(0.26, 0.06, 0.06, metal)); g.add(cyl(0.04, 0.04, 0.22, wood, -0.13, 8)); break;
    }
    default: {                                                 // RIFLE: receiver + barrel + stock + mag
      g.add(box(0.11, 0.15, 0.62, metal, 0, 0, 0.16)); g.add(cyl(0.035, 0.035, 0.5, dark, 0.6, 8));
      g.add(box(0.09, 0.13, 0.24, dark, 0, 0, -0.22)); g.add(box(0.07, 0.22, 0.1, dark, 0, -0.17, 0.16)); g.add(grip(-0.02));
    }
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// map a game weapon mode → a held-gun kind. Pass the mode straight through so each weapon looks distinct;
// makeHeldGun falls back to the rifle silhouette for anything it doesn't special-case.
export function gunKindForMode(mode) { return mode || "rifle"; }
