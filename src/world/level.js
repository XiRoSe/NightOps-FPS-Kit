import * as THREE from "three";
import { COLORS, mat, box, cyl, texMat, groundTexture, makeCrate, makeBarrel, makeSandbags, makeBollard, makeExfilPad, makeFlag } from "../util/builders.js";

// Builds the compound and exposes colliders / spawns / objective data.
export class Level {
  constructor(scene) {
    this.scene = scene;
    this.colliders = []; // AABB {minX,maxX,minZ,maxZ} in the XZ plane
    this.solidMeshes = []; // occluders for bullet raycasts (walls, crates, etc.)
    this.enemySpawns = []; // { x, z, patrol: [{x,z}...] }
    this.playerSpawn = new THREE.Vector3(0, 0, 16);
    this.exfil = { x: 0, z: -16, r: 3.0 };
    this.bounds = { minX: -16.4, maxX: 16.4, minZ: -19.4, maxZ: 18.4 };
    this._build();
  }

  _collide(x, z, w, d) {
    this.colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
  }

  _wall(x, z, w, d, h = 3.4, color = COLORS.concrete) {
    // tile the concrete ~ every 3.4 units so texel density is consistent
    const span = Math.max(w, d);
    const mat = texMat(color, "concrete", { repeat: [Math.max(1, Math.round(span / 3.4)), Math.max(1, Math.round(h / 3.4)) + 1], roughness: 0.95 });
    const m = box(w, h, d, color, { mat });
    m.position.set(x, h / 2, z);
    this.scene.add(m);
    this._collide(x, z, w, d);
    this.solidMeshes.push(m);
    // dark cap along the top for a finished, defined edge
    const cap = box(w + 0.1, 0.25, d + 0.1, COLORS.metalDark, { roughness: 0.8 });
    cap.position.set(x, h + 0.02, z);
    this.scene.add(cap);
    return m;
  }

  _crateStack(x, z, conf = "single") {
    const place = (cx, cz, s, cy = 0) => {
      const c = makeCrate(s);
      c.position.set(cx, cy + s / 2, cz);
      c.rotation.y = (Math.random() - 0.5) * 0.2;
      this.scene.add(c);
      this._collide(cx, cz, s, s);
      this.solidMeshes.push(c);
    };
    if (conf === "single") place(x, z, 1.1);
    else if (conf === "pair") { place(x, z, 1.1); place(x + 1.15, z + 0.2, 1.0); }
    else if (conf === "stack") { place(x, z, 1.2); place(x, z, 0.9, 1.2); place(x + 1.2, z - 0.3, 1.0); }
  }

  _barrels(x, z, n = 3) {
    for (let i = 0; i < n; i++) {
      const b = makeBarrel(Math.random() > 0.5 ? COLORS.rust : COLORS.olive);
      const bx = x + (i % 2) * 0.85 - 0.4, bz = z + Math.floor(i / 2) * 0.85 - 0.2;
      b.position.set(bx, 0.55, bz);
      this.scene.add(b);
      this._collide(bx, bz, 0.8, 0.8);
    }
  }

  _sandbags(x, z, len, rot = 0) {
    const s = makeSandbags(len);
    s.position.set(x, 0, z);
    s.rotation.y = rot;
    this.scene.add(s);
    // collider aligned to rotation (axis-aligned approx)
    if (Math.abs(rot) < 0.4) this._collide(x, z, len, 0.6);
    else this._collide(x, z, 0.6, len);
  }

  _build() {
    // ground (procedural sandy texture)
    const groundMat = mat(COLORS.sand, { roughness: 1 });
    groundMat.map = groundTexture();
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // subtle dirt patches for variation
    for (let i = 0; i < 10; i++) {
      const r = 2 + Math.random() * 4;
      const p = new THREE.Mesh(new THREE.CircleGeometry(r, 10), mat(Math.random() > 0.5 ? COLORS.sandDark : COLORS.dirt, { roughness: 1 }));
      p.rotation.x = -Math.PI / 2;
      p.position.set((Math.random() - 0.5) * 30, 0.02, (Math.random() - 0.5) * 36 - 2);
      p.receiveShadow = true;
      this.scene.add(p);
    }

    // central dirt road down the middle (visual guide to exfil)
    const road = new THREE.Mesh(new THREE.PlaneGeometry(5, 40), mat(COLORS.dirt, { roughness: 1 }));
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.03, -1);
    road.receiveShadow = true;
    this.scene.add(road);

    // ---- perimeter walls ----
    this._wall(0, 19, 34, 1, 3.4, COLORS.concrete);     // south (behind spawn)
    this._wall(0, -19.5, 34, 1, 3.4, COLORS.concrete);  // north
    this._wall(-16.5, 0, 1, 39, 3.4, COLORS.concrete);  // west
    this._wall(16.5, 0, 1, 39, 3.4, COLORS.concrete);   // east

    // ---- zone divider 1 (z=8) with doorway on the right ----
    this._wall(-7.5, 8, 17, 1, 3.2, COLORS.wall);       // left segment
    this._wall(11, 8, 11, 1, 3.2, COLORS.wall);         // right segment (gap x≈2..5.5)
    // ---- zone divider 2 (z=-6) with doorway on the left ----
    this._wall(7.5, -6, 17, 1, 3.2, COLORS.wall);       // right segment
    this._wall(-11, -6, 11, 1, 3.2, COLORS.wall);       // left segment (gap x≈-5.5..-2)

    // doorway posts (hazard) to read the openings clearly
    for (const [x, z] of [[2, 8], [5.5, 8], [-5.5, -6], [-2, -6]]) {
      const b = makeBollard(); b.position.set(x, 0, z); this.scene.add(b);
    }

    // ================= ZONE A: START (z 8..18) =================
    this._crateStack(-9, 13, "stack");
    this._crateStack(9, 14, "pair");
    this._barrels(-11, 10, 3);
    this._sandbags(-2, 11.5, 4, 0);
    this.enemySpawns.push({ x: -6, z: 11, patrol: [{ x: -10, z: 12 }, { x: -2, z: 10 }, { x: -6, z: 14 }] });
    this.enemySpawns.push({ x: 8, z: 11, patrol: [{ x: 11, z: 12 }, { x: 5, z: 10 }] });

    // ================= ZONE B: YARD (z -6..8) =================
    // a small bunker building as a landmark + cover
    this._bunker(-9, 1);
    this._crateStack(7, 3, "stack");
    this._crateStack(-2, -2, "pair");
    this._barrels(11, 0, 4);
    this._sandbags(2, 5, 5, 0);
    this._sandbags(-6, -3, 4, Math.PI / 2);
    this.enemySpawns.push({ x: 5, z: 4, patrol: [{ x: 9, z: 5 }, { x: 2, z: 2 }, { x: 6, z: -2 }] });
    this.enemySpawns.push({ x: -3, z: -1, patrol: [{ x: -6, z: 2 }, { x: 0, z: -3 }, { x: -2, z: 4 }] });
    this.enemySpawns.push({ x: 11, z: -3, patrol: [{ x: 13, z: -1 }, { x: 9, z: -4 }] });

    // ================= ZONE C: EXFIL (z -19..-6) =================
    const pad = makeExfilPad();
    pad.position.set(this.exfil.x, 0, this.exfil.z);
    this.scene.add(pad);
    this._exfilBeacon = pad;
    // objective flag at the extraction circle (raise the flag = win)
    this.flag = makeFlag();
    this.flag.position.set(this.exfil.x, 0, this.exfil.z);
    this.scene.add(this.flag);
    // guard cover around the pad
    this._sandbags(0, -10, 6, 0);
    this._crateStack(-9, -13, "pair");
    this._crateStack(9, -14, "stack");
    this._barrels(-12, -16, 3);
    this._barrels(12, -10, 2);
    this.enemySpawns.push({ x: -7, z: -12, patrol: [{ x: -10, z: -10 }, { x: -4, z: -13 }, { x: -8, z: -16 }] });
    this.enemySpawns.push({ x: 7, z: -12, patrol: [{ x: 10, z: -10 }, { x: 4, z: -13 }, { x: 8, z: -16 }] });
    this.enemySpawns.push({ x: 0, z: -17, patrol: [{ x: -3, z: -17 }, { x: 3, z: -17 }] });

    // a couple of watchtowers (visual height + landmark)
    this._tower(-15, -17);
    this._tower(15, 12);
  }

  // wave the objective flag
  update(t) {
    if (!this.flag) return;
    const cloth = this.flag.userData.cloth;
    const base = this.flag.userData.base;
    const W = this.flag.userData.flagW;
    const pos = cloth.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3];
      const f = x / W; // 0 at pole, 1 at free edge
      pos.setZ(i, base[i * 3 + 2] + Math.sin(x * 3.2 - t * 6) * 0.14 * f);
      pos.setY(i, base[i * 3 + 1] + Math.sin(x * 2.2 - t * 5) * 0.05 * f);
    }
    pos.needsUpdate = true;
    cloth.geometry.computeVertexNormals();
    this.flag.rotation.y = Math.sin(t * 0.4) * 0.12; // gentle swivel
  }

  // 2D segment-vs-AABB occlusion test for enemy line-of-sight
  segmentBlocked(ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az;
    for (const c of this.colliders) {
      let t0 = 0, t1 = 1;
      const p = [-dx, dx, -dz, dz];
      const q = [ax - c.minX, c.maxX - ax, az - c.minZ, c.maxZ - az];
      let ok = true;
      for (let i = 0; i < 4; i++) {
        if (Math.abs(p[i]) < 1e-8) { if (q[i] < 0) { ok = false; break; } }
        else {
          const r = q[i] / p[i];
          if (p[i] < 0) { if (r > t1) { ok = false; break; } if (r > t0) t0 = r; }
          else { if (r < t0) { ok = false; break; } if (r < t1) t1 = r; }
        }
      }
      if (ok && t0 <= t1) return true;
    }
    return false;
  }

  _bunker(x, z) {
    const g = new THREE.Group();
    const w = 5, d = 4, h = 3;
    // four walls with a front opening
    const t = 0.4;
    const back = box(w, h, t, COLORS.concreteDark, { flat: true }); back.position.set(0, h / 2, -d / 2);
    const left = box(t, h, d, COLORS.concreteDark, { flat: true }); left.position.set(-w / 2, h / 2, 0);
    const right = box(t, h, d, COLORS.concreteDark, { flat: true }); right.position.set(w / 2, h / 2, 0);
    const roof = box(w + 0.4, t, d + 0.4, COLORS.metalDark, { flat: true }); roof.position.set(0, h, 0);
    const frontL = box(w / 2 - 0.6, h, t, COLORS.concreteDark, { flat: true }); frontL.position.set(-(w / 4 + 0.3), h / 2, d / 2);
    const frontR = frontL.clone(); frontR.position.x = w / 4 + 0.3;
    g.add(back, left, right, roof, frontL, frontR);
    g.position.set(x, 0, z);
    this.scene.add(g);
    this.solidMeshes.push(g);
    // colliders for the walls
    this._collide(x, z - d / 2, w, t);
    this._collide(x - w / 2, z, t, d);
    this._collide(x + w / 2, z, t, d);
    this._collide(x - (w / 4 + 0.3), z + d / 2, w / 2 - 0.6, t);
    this._collide(x + (w / 4 + 0.3), z + d / 2, w / 2 - 0.6, t);
  }

  _tower(x, z) {
    const g = new THREE.Group();
    const legC = COLORS.metalDark;
    for (const sx of [-0.8, 0.8]) for (const sz of [-0.8, 0.8]) {
      const leg = cyl(0.12, 0.12, 4, legC, 8, { metalness: 0.3 });
      leg.position.set(sx, 2, sz);
      g.add(leg);
    }
    const platform = box(2.4, 0.3, 2.4, COLORS.woodDark, { flat: true });
    platform.position.y = 4;
    g.add(platform);
    const rail = box(2.4, 0.8, 0.1, COLORS.metalDark, { flat: true }); rail.position.set(0, 4.5, -1.15);
    const roof = box(2.8, 0.25, 2.8, COLORS.olive, { flat: true }); roof.position.y = 5.6;
    const post = cyl(0.08, 0.08, 1.4, legC, 6); post.position.y = 5;
    g.add(rail, roof, post);
    g.position.set(x, 0, z);
    this.scene.add(g);
    this._collide(x, z, 2.0, 2.0);
    this.solidMeshes.push(g);
  }
}
