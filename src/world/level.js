import * as THREE from "three";
import { COLORS, mat, box, cyl, texMat, groundTexture, makeCrate, makeBarrel, makeSandbags, makeBollard, makeExfilPad, makeFlag } from "../util/builders.js";

// Builds the compound and exposes colliders / spawns / objective data.
export class Level {
  constructor(scene) {
    this.scene = scene;
    this.colliders = []; // AABB {minX,maxX,minZ,maxZ} in the XZ plane
    this.solidMeshes = []; // occluders for bullet raycasts (walls, crates, etc.)
    this.enemySpawns = []; // { x, z, patrol: [{x,z}...] }
    this.spots = []; // perimeter floodlights (for the slow sweep)
    this.playerSpawn = new THREE.Vector3(0, 0, 16);
    this.exfil = { x: 0, z: -16, r: 3.0 };
    this.bounds = { minX: -16.4, maxX: 16.4, minZ: -19.4, maxZ: 18.4 };
    this._build();
  }

  _collide(x, z, w, d, top = 3.4) {
    // `top` = height you can stand on (low props are mountable, tall walls aren't)
    this.colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, top });
  }

  _wall(x, z, w, d, h = 3.4, color = COLORS.concrete) {
    // tile the concrete ~ every 3.4 units so texel density is consistent
    const span = Math.max(w, d);
    const mat = texMat(color, "concrete", { repeat: [Math.max(1, Math.round(span / 3.4)), Math.max(1, Math.round(h / 3.4)) + 1], roughness: 0.95 });
    const m = box(w, h, d, color, { mat });
    m.position.set(x, h / 2, z);
    this.scene.add(m);
    this._collide(x, z, w, d, h);
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
      this._collide(cx, cz, s, s, cy + s); // top = mountable surface height
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
      this._collide(bx, bz, 0.8, 0.8, 1.1);
    }
  }

  _sandbags(x, z, len, rot = 0) {
    const s = makeSandbags(len);
    s.position.set(x, 0, z);
    s.rotation.y = rot;
    this.scene.add(s);
    // collider aligned to rotation (axis-aligned approx); ~0.9m tall (mountable)
    if (Math.abs(rot) < 0.4) this._collide(x, z, len, 0.6, 0.9);
    else this._collide(x, z, 0.6, len, 0.9);
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

    // a couple of watchtowers (visual height + landmark) with a guard posted on each
    this._tower(-15, -17);
    this._tower(15, 12);
    this.enemySpawns.push({ x: -15, z: -17, y: 4, patrol: [{ x: -15, z: -17 }] }); // watchtower sniper
    this.enemySpawns.push({ x: 15, z: 12, y: 4, patrol: [{ x: 15, z: 12 }] });

    // ---- perimeter floodlights (searchlight beams into the compound) ----
    this._floodlight(-16, 16, 5.2, -4, 8);
    this._floodlight(16, -18, 5.2, 4, -10);
    this._floodlight(-15, -17, 6.2, 0, -8, true);  // watchtower searchlight (sweeps)
    this._floodlight(15, 12, 6.2, 2, 4, true);     // watchtower searchlight (sweeps)

    // ---- perimeter utility poles + sagging wires ----
    const poles = [
      [-16, 17], [-16, 4], [-16, -10], [-16, -18],
      [16, 17], [16, 4], [16, -10], [16, -18],
    ];
    const tops = poles.map((p) => this._utilityPole(p[0], p[1]));
    for (let i = 0; i < 4 - 1; i++) { this._wire(tops[i], tops[i + 1]); this._wire(tops[i + 4], tops[i + 5]); }
  }

  _utilityPole(x, z) {
    const h = 5.4;
    const pole = cyl(0.12, 0.16, h, COLORS.woodDark, 8, { roughness: 0.9 });
    pole.position.set(x, h / 2, z); this.scene.add(pole);
    const arm = box(1.8, 0.14, 0.14, COLORS.woodDark, { flat: true });
    arm.position.set(x, h - 0.5, z); this.scene.add(arm);
    // small insulators
    for (const dx of [-0.7, 0, 0.7]) {
      const ins = cyl(0.05, 0.05, 0.18, COLORS.metal, 6); ins.position.set(x + dx, h - 0.35, z); this.scene.add(ins);
    }
    this._collide(x, z, 0.4, 0.4); // thin pole, full blocker
    return new THREE.Vector3(x, h - 0.32, z);
  }

  _wire(a, b) {
    const mid = a.clone().add(b).multiplyScalar(0.5);
    mid.y -= Math.min(0.9, a.distanceTo(b) * 0.12); // catenary sag
    const curve = new THREE.CatmullRomCurve3([a, mid, b]);
    const geo = new THREE.TubeGeometry(curve, 12, 0.025, 4, false);
    const wire = new THREE.Mesh(geo, mat(0x0c0d0f, { roughness: 0.8 }));
    this.scene.add(wire);
  }

  _floodlight(x, z, h, aimX, aimZ, sweep = false) {
    // pole + lamp housing
    const pole = cyl(0.1, 0.14, h, COLORS.metalDark, 8, { metalness: 0.4 });
    pole.position.set(x, h / 2, z); this.scene.add(pole);
    this._collide(x, z, 0.4, 0.4);
    const fix = new THREE.Vector3(x, h, z);
    const tgt = new THREE.Vector3(aimX, 0.2, aimZ);
    const dir = tgt.clone().sub(fix);
    const len = dir.length();
    const head = box(0.5, 0.32, 0.42, COLORS.metalDark, { metalness: 0.5, roughness: 0.5 });
    head.position.copy(fix); head.lookAt(tgt); this.scene.add(head);
    // glowing lens
    const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.24), new THREE.MeshBasicMaterial({ color: 0xfff3d0 }));
    lens.position.copy(fix).addScaledVector(dir.clone().normalize(), 0.24); lens.lookAt(tgt); this.scene.add(lens);
    // the actual light (no shadows -> cheap)
    const angle = 0.36;
    // strong + low decay so the beam clearly lights the wall/floor it hits (not just a faint cone)
    const light = new THREE.SpotLight(0xfff2cc, 40, 70, angle, 0.45, 1.0);
    light.position.copy(fix);
    light.target.position.copy(tgt);
    light.castShadow = false;
    this.scene.add(light, light.target);
    // visible beam — a UNIT cone (apex at lamp); length is clipped to the first wall each frame
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(1, 1, 18, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff2cc, transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    cone.material.userData.outlineParameters = { visible: false };
    cone.frustumCulled = false;
    this.scene.add(cone);
    this.spots.push({ light, cone, fix, baseDir: dir.clone().normalize(), maxLen: len, angle, sweep, phase: this.spots.length * 1.3 });
  }

  // aim the spotlights (tower ones sweep); beams run well past the ground and just pass softly
  // through walls via their additive alpha (no hard cutoff)
  _updateSpots(t) {
    const up = this._upY || (this._upY = new THREE.Vector3(0, 1, 0));
    const tmp = this._spotDir || (this._spotDir = new THREE.Vector3());
    for (const s of this.spots) {
      tmp.copy(s.baseDir);
      if (s.sweep) tmp.applyAxisAngle(up, Math.sin(t * 0.5 + s.phase) * 0.7); // ±0.7 rad swing
      s.light.target.position.copy(s.fix).addScaledVector(tmp, s.maxLen);
      s.light.target.updateMatrixWorld();
      const len = s.maxLen * 3.2; // long beam that runs well past the ground (no cutoff look)
      const r = Math.tan(s.angle) * len * 0.9;
      s.cone.position.copy(s.fix).addScaledVector(tmp, len / 2);
      s.cone.quaternion.setFromUnitVectors(up, tmp.clone().negate());
      s.cone.scale.set(r, len, r);
    }
  }

  // wave the objective flag + swing the tower searchlights
  update(t) {
    this._updateSpots(t);
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
      // ignore a collider the shooter is standing inside (e.g. a tower guard on its own tower)
      if (ax >= c.minX && ax <= c.maxX && az >= c.minZ && az <= c.maxZ) continue;
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
    // walls with a front opening + a window on the left and back walls
    const t = 0.4;
    const con = (W, H, D) => box(W, H, D, COLORS.concreteDark, { flat: true });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x2a3a44, metalness: 0.4, roughness: 0.25, transparent: true, opacity: 0.4 });
    const Ww = 1.5, wy0 = 1.0, wy1 = 2.0, wMidY = (wy0 + wy1) / 2, wH = wy1 - wy0; // window opening

    const back = con(w, h, t); back.position.set(0, h / 2, -d / 2);
    const roof = box(w + 0.4, t, d + 0.4, COLORS.metalDark, { flat: true }); roof.position.set(0, h, 0);
    const frontL = con(w / 2 - 0.6, h, t); frontL.position.set(-(w / 4 + 0.3), h / 2, d / 2);
    const frontR = frontL.clone(); frontR.position.x = w / 4 + 0.3;
    g.add(back, roof, frontL, frontR);

    // windows on the two OPPOSITE side walls (left -X and right +X), each opening faces ±X
    for (const sx of [-w / 2, w / 2]) {
      const jw = (d - Ww) / 2;
      const sill = con(t, wy0, d); sill.position.set(sx, wy0 / 2, 0);
      const head = con(t, h - wy1, d); head.position.set(sx, (h + wy1) / 2, 0);
      const jf = con(t, wH, jw); jf.position.set(sx, wMidY, Ww / 2 + jw / 2);
      const jb = con(t, wH, jw); jb.position.set(sx, wMidY, -(Ww / 2 + jw / 2));
      const pane = new THREE.Mesh(new THREE.BoxGeometry(0.08, wH, Ww), glassMat); pane.position.set(sx, wMidY, 0);
      pane.raycast = () => {}; // shoot-through glass (renders, but bullets/laser pass; wall still blocks walking)
      g.add(sill, head, jf, jb, pane);
    }
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
    const roof = box(2.8, 0.25, 2.8, COLORS.olive, { flat: true }); roof.position.y = 6.5; // raised so a standing guard fits
    // corner posts holding the roof up
    for (const sx of [-1.0, 1.0]) for (const sz of [-1.0, 1.0]) {
      const post = cyl(0.07, 0.07, 2.3, legC, 6); post.position.set(sx, 5.25, sz); g.add(post);
    }
    g.add(rail, roof);
    g.position.set(x, 0, z);
    this.scene.add(g);
    this._collide(x, z, 2.0, 2.0);
    this.solidMeshes.push(g);
  }
}
