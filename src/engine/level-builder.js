import * as THREE from "three";
import { COLORS, mat, box, cyl, texMat, groundTexture, makeCrate, makeBarrel, makeSandbags, makeBollard, makeExfilPad, makeFlag } from "./builders.js";

// The level toolkit for THIS game (a night military-compound FPS). A level module calls these
// methods on a builder instance to lay out its map; the builder accumulates colliders, occluders,
// enemy spawns, floodlights and the objective, and animates the flag + searchlights each frame.
export class LevelBuilder {
  constructor(scene) {
    this.scene = scene;
    this.colliders = [];   // AABB {minX,maxX,minZ,maxZ,top} in the XZ plane
    this.solidMeshes = []; // occluders for bullet raycasts (walls, crates, buildings…)
    this.enemySpawns = []; // { x, z, [y], patrol:[{x,z}], [hp], [speed] }
    this.spots = [];       // floodlights (for the sweep + beam update)
    this.playerSpawn = new THREE.Vector3(0, 0, 16);
    this.exfil = { x: 0, z: -16, r: 3.0 };
    this.bounds = { minX: -16.4, maxX: 16.4, minZ: -19.4, maxZ: 18.4 };
  }

  // ---- level-definition helpers ----
  spawnAt(x, z) { this.playerSpawn.set(x, 0, z); return this; }
  setBounds(b) { this.bounds = b; return this; }
  enemy(spec) { this.enemySpawns.push(spec); return this; }

  collide(x, z, w, d, top = 3.4) {
    // `top` = height you can stand on (low props are mountable, tall walls aren't)
    this.colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, top });
  }

  // ground + vast surrounding desert + scattered bushes/rocks + dirt patches
  desertFloor(size = 80, patchN = 10, patchSpread = 30) {
    const groundMat = mat(COLORS.sand, { roughness: 1 });
    groundMat.map = groundTexture();
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(size, size), groundMat);
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; this.scene.add(ground);

    const desert = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), mat(COLORS.sand, { roughness: 1 }));
    desert.rotation.x = -Math.PI / 2; desert.position.y = -0.05; desert.receiveShadow = true; this.scene.add(desert);

    this.scatterDesert(size * 0.45, size * 2.2);

    for (let i = 0; i < patchN; i++) {
      const r = 2 + Math.random() * 4;
      const p = new THREE.Mesh(new THREE.CircleGeometry(r, 10), mat(Math.random() > 0.5 ? COLORS.sandDark : COLORS.dirt, { roughness: 1 }));
      p.rotation.x = -Math.PI / 2;
      p.position.set((Math.random() - 0.5) * patchSpread, 0.02, (Math.random() - 0.5) * patchSpread - 2);
      p.receiveShadow = true; this.scene.add(p);
    }
  }

  road(w, len, x = 0, z = 0) {
    const r = new THREE.Mesh(new THREE.PlaneGeometry(w, len), mat(COLORS.dirt, { roughness: 1 }));
    r.rotation.x = -Math.PI / 2; r.position.set(x, 0.03, z); r.receiveShadow = true; this.scene.add(r);
  }

  // low-poly desert dressing scattered in a ring around the play area
  scatterDesert(rMin = 36, rMax = 170, bushes = 70, rocks = 55) {
    const bushCols = [0x4a5436, 0x3d4a2c, 0x55603f];
    const rockCols = [0x6b6457, 0x595347, 0x746b5c];
    const ring = () => { const a = Math.random() * Math.PI * 2, r = rMin + Math.random() * (rMax - rMin); return [Math.cos(a) * r, Math.sin(a) * r]; };
    const bush = (x, z, s) => {
      const g = new THREE.Group();
      const m = mat(bushCols[Math.floor(Math.random() * 3)], { roughness: 1, flat: true });
      const n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        const r = (0.35 + Math.random() * 0.5) * s;
        const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), m);
        blob.position.set((Math.random() - 0.5) * 0.7 * s, r * 0.55, (Math.random() - 0.5) * 0.7 * s);
        blob.scale.y = 0.65; blob.castShadow = true; g.add(blob);
      }
      g.position.set(x, 0, z); g.rotation.y = Math.random() * 6.28; this.scene.add(g);
    };
    const rock = (x, z, s) => {
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry((0.45 + Math.random() * 0.9) * s, 0), mat(rockCols[Math.floor(Math.random() * 3)], { roughness: 1, flat: true }));
      r.position.set(x, 0.12 * s, z);
      r.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      r.scale.y = 0.6 + Math.random() * 0.4; r.castShadow = true; r.receiveShadow = true; this.scene.add(r);
    };
    for (let i = 0; i < bushes; i++) { const [x, z] = ring(); bush(x, z, 0.8 + Math.random() * 1.4); }
    for (let i = 0; i < rocks; i++) { const [x, z] = ring(); rock(x, z, 0.7 + Math.random() * 1.6); }
  }

  wall(x, z, w, d, h = 3.4, color = COLORS.concrete) {
    const span = Math.max(w, d);
    const m = box(w, h, d, color, { mat: texMat(color, "concrete", { repeat: [Math.max(1, Math.round(span / 3.4)), Math.max(1, Math.round(h / 3.4)) + 1], roughness: 0.95 }) });
    m.position.set(x, h / 2, z); this.scene.add(m);
    this.collide(x, z, w, d, h); this.solidMeshes.push(m);
    const cap = box(w + 0.1, 0.25, d + 0.1, COLORS.metalDark, { roughness: 0.8 });
    cap.position.set(x, h + 0.02, z); this.scene.add(cap);
    return m;
  }

  crateStack(x, z, conf = "single") {
    const place = (cx, cz, s, cy = 0) => {
      const c = makeCrate(s); c.position.set(cx, cy + s / 2, cz);
      c.rotation.y = (Math.random() - 0.5) * 0.2; this.scene.add(c);
      this.collide(cx, cz, s, s, cy + s); this.solidMeshes.push(c);
    };
    if (conf === "single") place(x, z, 1.1);
    else if (conf === "pair") { place(x, z, 1.1); place(x + 1.15, z + 0.2, 1.0); }
    else if (conf === "stack") { place(x, z, 1.2); place(x, z, 0.9, 1.2); place(x + 1.2, z - 0.3, 1.0); }
  }

  barrels(x, z, n = 3) {
    for (let i = 0; i < n; i++) {
      const b = makeBarrel(Math.random() > 0.5 ? COLORS.rust : COLORS.olive);
      const bx = x + (i % 2) * 0.85 - 0.4, bz = z + Math.floor(i / 2) * 0.85 - 0.2;
      b.position.set(bx, 0.55, bz); this.scene.add(b);
      this.collide(bx, bz, 0.8, 0.8, 1.1);
    }
  }

  sandbags(x, z, len, rot = 0) {
    const s = makeSandbags(len); s.position.set(x, 0, z); s.rotation.y = rot; this.scene.add(s);
    if (Math.abs(rot) < 0.4) this.collide(x, z, len, 0.6, 0.9);
    else this.collide(x, z, 0.6, len, 0.9);
  }

  bollard(x, z) { const b = makeBollard(); b.position.set(x, 0, z); this.scene.add(b); }

  // objective: extraction pad + waving flag at (x,z); also records the win circle
  objective(x, z, r = 3.0) {
    this.exfil = { x, z, r };
    const pad = makeExfilPad(); pad.position.set(x, 0, z); this.scene.add(pad); this._exfilBeacon = pad;
    this.flag = makeFlag(); this.flag.position.set(x, 0, z); this.scene.add(this.flag);
  }

  bunker(x, z) {
    const g = new THREE.Group();
    const w = 5, d = 4, h = 3, t = 0.4;
    const con = (W, H, D) => box(W, H, D, COLORS.concreteDark, { flat: true });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x2a3a44, metalness: 0.4, roughness: 0.25, transparent: true, opacity: 0.4 });
    const Ww = 1.5, wy0 = 1.0, wy1 = 2.0, wMidY = (wy0 + wy1) / 2, wH = wy1 - wy0;
    const back = con(w, h, t); back.position.set(0, h / 2, -d / 2);
    const roof = box(w + 0.4, t, d + 0.4, COLORS.metalDark, { flat: true }); roof.position.set(0, h, 0);
    const frontL = con(w / 2 - 0.6, h, t); frontL.position.set(-(w / 4 + 0.3), h / 2, d / 2);
    const frontR = frontL.clone(); frontR.position.x = w / 4 + 0.3;
    g.add(back, roof, frontL, frontR);
    for (const sx of [-w / 2, w / 2]) {
      const jw = (d - Ww) / 2;
      const sill = con(t, wy0, d); sill.position.set(sx, wy0 / 2, 0);
      const head = con(t, h - wy1, d); head.position.set(sx, (h + wy1) / 2, 0);
      const jf = con(t, wH, jw); jf.position.set(sx, wMidY, Ww / 2 + jw / 2);
      const jb = con(t, wH, jw); jb.position.set(sx, wMidY, -(Ww / 2 + jw / 2));
      const pane = new THREE.Mesh(new THREE.BoxGeometry(0.08, wH, Ww), glassMat); pane.position.set(sx, wMidY, 0);
      pane.raycast = () => {}; // shoot-through glass (wall still blocks walking)
      g.add(sill, head, jf, jb, pane);
    }
    g.position.set(x, 0, z); this.scene.add(g); this.solidMeshes.push(g);
    this.collide(x, z - d / 2, w, t);
    this.collide(x - w / 2, z, t, d);
    this.collide(x + w / 2, z, t, d);
    this.collide(x - (w / 4 + 0.3), z + d / 2, w / 2 - 0.6, t);
    this.collide(x + (w / 4 + 0.3), z + d / 2, w / 2 - 0.6, t);
  }

  tower(x, z) {
    const g = new THREE.Group();
    const legC = COLORS.metalDark;
    for (const sx of [-0.8, 0.8]) for (const sz of [-0.8, 0.8]) {
      const leg = cyl(0.12, 0.12, 4, legC, 8, { metalness: 0.3 }); leg.position.set(sx, 2, sz); g.add(leg);
    }
    const platform = box(2.4, 0.3, 2.4, COLORS.woodDark, { flat: true }); platform.position.y = 4; g.add(platform);
    const rail = box(2.4, 0.8, 0.1, COLORS.metalDark, { flat: true }); rail.position.set(0, 4.5, -1.15);
    const roof = box(2.8, 0.25, 2.8, COLORS.olive, { flat: true }); roof.position.y = 6.5;
    for (const sx of [-1.0, 1.0]) for (const sz of [-1.0, 1.0]) {
      const post = cyl(0.07, 0.07, 2.3, legC, 6); post.position.set(sx, 5.25, sz); g.add(post);
    }
    g.add(rail, roof);
    g.position.set(x, 0, z); this.scene.add(g);
    this.collide(x, z, 2.0, 2.0); this.solidMeshes.push(g);
  }

  // a solid building (walls + roof) with a central doorway on the +Z (front) face — enterable cover
  building(x, z, w, d, h = 3.6, color = COLORS.wall) {
    const t = 0.5;
    this.wall(x, z - d / 2, w, t, h, color);        // back
    this.wall(x - w / 2, z, t, d, h, color);        // left
    this.wall(x + w / 2, z, t, d, h, color);        // right
    const gap = 2.2, seg = (w - gap) / 2;           // front split by a doorway
    this.wall(x - (gap / 2 + seg / 2), z + d / 2, seg, t, h, color);
    this.wall(x + (gap / 2 + seg / 2), z + d / 2, seg, t, h, color);
    const roof = box(w + 0.4, 0.3, d + 0.4, COLORS.metalDark, { flat: true });
    roof.position.set(x, h + 0.05, z); this.scene.add(roof);
  }

  // a military vehicle (truck with canopy, or open jeep) — tall cover that blocks ground line-of-sight
  vehicle(x, z, rot = 0, type = "truck") {
    const g = new THREE.Group();
    const c = COLORS.oliveDark;
    const chassis = box(2.0, 0.9, 4.2, c, { metalness: 0.3, roughness: 0.7 }); chassis.position.y = 0.9; g.add(chassis);
    const cab = box(1.9, 1.0, 1.4, c, { metalness: 0.3 }); cab.position.set(0, 1.7, 1.2); g.add(cab);
    const glass = box(1.7, 0.55, 0.1, 0x223038, { metalness: 0.6, roughness: 0.2 }); glass.position.set(0, 1.95, 1.92); g.add(glass);
    if (type === "truck") { const bed = box(2.0, 1.3, 2.4, COLORS.olive, { flat: true }); bed.position.set(0, 1.95, -1.0); g.add(bed); }
    const wheel = () => { const w = cyl(0.45, 0.45, 0.35, 0x15171a, 10, { roughness: 0.9 }); w.rotation.z = Math.PI / 2; return w; };
    for (const wx of [-0.95, 0.95]) for (const wz of [-1.4, 1.4]) { const w = wheel(); w.position.set(wx, 0.45, wz); g.add(w); }
    g.position.set(x, 0, z); g.rotation.y = rot; this.scene.add(g); this.solidMeshes.push(g);
    if (Math.abs(Math.cos(rot)) > 0.5) this.collide(x, z, 2.2, 4.4, 2.0); else this.collide(x, z, 4.4, 2.2, 2.0);
  }

  // a run of large horizontal fuel tanks on stands (industrial cover), lined up along +X
  fuelTanks(x, z, n = 2) {
    const g = new THREE.Group();
    for (let i = 0; i < n; i++) {
      const tank = cyl(0.9, 0.9, 3.0, COLORS.metal, 16, { metalness: 0.5, roughness: 0.4 });
      tank.rotation.x = Math.PI / 2; tank.position.set(i * 2.4, 1.0, 0); g.add(tank);
      for (const sz of [-1.5, 1.5]) { const cap = cyl(0.92, 0.92, 0.12, COLORS.metalDark, 16); cap.rotation.x = Math.PI / 2; cap.position.set(i * 2.4, 1.0, sz); g.add(cap); }
    }
    g.position.set(x, 0, z); this.scene.add(g); this.solidMeshes.push(g);
    this.collide(x + (n - 1) * 1.2, z, (n - 1) * 2.4 + 1.8, 3.2, 2.0);
  }

  // a decorative chain-link fence run between two points (visual perimeter; not a bullet/▲ blocker)
  fence(x1, z1, x2, z2, h = 2.0) {
    const dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz), ang = Math.atan2(dx, dz);
    const g = new THREE.Group();
    const posts = Math.max(2, Math.round(len / 3));
    for (let i = 0; i <= posts; i++) {
      const p = cyl(0.06, 0.06, h, COLORS.metalDark, 6);
      p.position.set(x1 + dx * i / posts, h / 2, z1 + dz * i / posts); g.add(p);
    }
    for (const ry of [h - 0.1, h * 0.5]) {
      const rail = box(0.05, 0.05, len, COLORS.metalDark); rail.position.set((x1 + x2) / 2, ry, (z1 + z2) / 2); rail.rotation.y = ang; g.add(rail);
    }
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(len, h), new THREE.MeshBasicMaterial({ color: 0x3a3f3a, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }));
    panel.material.userData.outlineParameters = { visible: false };
    panel.position.set((x1 + x2) / 2, h / 2, (z1 + z2) / 2); panel.rotation.y = ang; g.add(panel);
    this.scene.add(g);
  }

  floodlight(x, z, h, aimX, aimZ, sweep = false) {
    const pole = cyl(0.1, 0.14, h, COLORS.metalDark, 8, { metalness: 0.4 });
    pole.position.set(x, h / 2, z); this.scene.add(pole); this.collide(x, z, 0.4, 0.4);
    const fix = new THREE.Vector3(x, h, z);
    const tgt = new THREE.Vector3(aimX, 0.2, aimZ);
    const dir = tgt.clone().sub(fix); const len = dir.length();
    const head = box(0.5, 0.32, 0.42, COLORS.metalDark, { metalness: 0.5, roughness: 0.5 });
    head.position.copy(fix); head.lookAt(tgt); this.scene.add(head);
    const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.24), new THREE.MeshBasicMaterial({ color: 0xfff3d0 }));
    lens.position.copy(fix).addScaledVector(dir.clone().normalize(), 0.24); lens.lookAt(tgt); this.scene.add(lens);
    const angle = 0.36;
    const light = new THREE.SpotLight(0xfff2cc, 40, 70, angle, 0.45, 1.0);
    light.position.copy(fix); light.target.position.copy(tgt); light.castShadow = false;
    this.scene.add(light, light.target);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 18, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff2cc, transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    cone.material.userData.outlineParameters = { visible: false }; cone.frustumCulled = false; this.scene.add(cone);
    this.spots.push({ light, cone, fix, baseDir: dir.clone().normalize(), maxLen: len, angle, sweep, phase: this.spots.length * 1.3 });
  }

  utilityPole(x, z) {
    const h = 5.4;
    const pole = cyl(0.12, 0.16, h, COLORS.woodDark, 8, { roughness: 0.9 }); pole.position.set(x, h / 2, z); this.scene.add(pole);
    const arm = box(1.8, 0.14, 0.14, COLORS.woodDark, { flat: true }); arm.position.set(x, h - 0.5, z); this.scene.add(arm);
    for (const dx of [-0.7, 0, 0.7]) { const ins = cyl(0.05, 0.05, 0.18, COLORS.metal, 6); ins.position.set(x + dx, h - 0.35, z); this.scene.add(ins); }
    this.collide(x, z, 0.4, 0.4);
    return new THREE.Vector3(x, h - 0.32, z);
  }

  _wire(a, b) {
    const mid = a.clone().add(b).multiplyScalar(0.5);
    mid.y -= Math.min(0.9, a.distanceTo(b) * 0.12);
    const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([a, mid, b]), 12, 0.025, 4, false);
    this.scene.add(new THREE.Mesh(geo, mat(0x0c0d0f, { roughness: 0.8 })));
  }

  // a run of utility poles connected by sagging wires
  powerLine(positions) {
    const tops = positions.map(([x, z]) => this.utilityPole(x, z));
    for (let i = 0; i < tops.length - 1; i++) this._wire(tops[i], tops[i + 1]);
  }

  // ---- per-frame: sweep searchlights + wave the objective flag ----
  _updateSpots(t) {
    const up = this._upY || (this._upY = new THREE.Vector3(0, 1, 0));
    const tmp = this._spotDir || (this._spotDir = new THREE.Vector3());
    for (const s of this.spots) {
      tmp.copy(s.baseDir);
      if (s.sweep) tmp.applyAxisAngle(up, Math.sin(t * 0.5 + s.phase) * 0.7);
      s.light.target.position.copy(s.fix).addScaledVector(tmp, s.maxLen);
      s.light.target.updateMatrixWorld();
      const len = s.maxLen * 3.2;
      const r = Math.tan(s.angle) * len * 0.9;
      s.cone.position.copy(s.fix).addScaledVector(tmp, len / 2);
      s.cone.quaternion.setFromUnitVectors(up, tmp.clone().negate());
      s.cone.scale.set(r, len, r);
    }
  }

  update(t) {
    this._updateSpots(t);
    if (!this.flag) return;
    const cloth = this.flag.userData.cloth, base = this.flag.userData.base, W = this.flag.userData.flagW;
    const pos = cloth.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3], f = x / W;
      pos.setZ(i, base[i * 3 + 2] + Math.sin(x * 3.2 - t * 6) * 0.14 * f);
      pos.setY(i, base[i * 3 + 1] + Math.sin(x * 2.2 - t * 5) * 0.05 * f);
    }
    pos.needsUpdate = true; cloth.geometry.computeVertexNormals();
    this.flag.rotation.y = Math.sin(t * 0.4) * 0.12;
  }

  // 2D segment-vs-AABB occlusion test for enemy line-of-sight (minTop>0 => only tall blockers)
  segmentBlocked(ax, az, bx, bz, minTop = 0) {
    const dx = bx - ax, dz = bz - az;
    for (const c of this.colliders) {
      if (c.top < minTop) continue;
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
}
