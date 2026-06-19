import * as THREE from "three";

// Pooled combat VFX — soft textured sprites (no flat squares), additive glow for
// sparks/flash, alpha dust puffs, lingering decals. No per-shot allocs, no lights.
function radialTex(stops) {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const x = c.getContext("2d");
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  for (const [o, col] of stops) g.addColorStop(o, col);
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class VFX {
  constructor(scene) {
    this.scene = scene;
    this._cam = null;
    this._dir = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._up = new THREE.Vector3(0, 1, 0);

    this._glow = radialTex([[0, "rgba(255,255,255,1)"], [0.3, "rgba(255,240,200,0.9)"], [1, "rgba(255,200,120,0)"]]);
    this._smoke = radialTex([[0, "rgba(150,150,155,0.6)"], [0.6, "rgba(120,120,125,0.25)"], [1, "rgba(120,120,125,0)"]]);
    this._hole = radialTex([[0, "rgba(8,8,10,0.95)"], [0.55, "rgba(20,20,24,0.7)"], [1, "rgba(20,20,24,0)"]]);

    const quad = new THREE.PlaneGeometry(1, 1);
    // additive embers (sparks)
    this.embers = this._pool(70, quad, () => new THREE.MeshBasicMaterial({ map: this._glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.embers.forEach((e) => (e.vel = new THREE.Vector3()));
    // additive flashes
    this.flashes = this._pool(14, quad, () => new THREE.MeshBasicMaterial({ map: this._glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    // alpha dust puffs
    this.dust = this._pool(20, quad, () => new THREE.MeshBasicMaterial({ map: this._smoke, transparent: true, depthWrite: false }));
    // lingering decals
    this.decals = this._pool(40, quad, () => new THREE.MeshBasicMaterial({ map: this._hole, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    // thin additive tracers
    const tg = new THREE.CylinderGeometry(0.01, 0.01, 1, 4); tg.translate(0, 0.5, 0);
    this.tracers = this._pool(20, tg, () => new THREE.MeshBasicMaterial({ color: 0xfff0bf, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    // expanding shockwave rings (billboarded)
    const ring = new THREE.RingGeometry(0.55, 0.72, 28);
    this.rings = this._pool(4, ring, () => new THREE.MeshBasicMaterial({ color: 0xffe6b0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    // flying debris chunks
    const chunk = new THREE.BoxGeometry(0.22, 0.22, 0.22);
    this.debris = this._pool(18, chunk, () => new THREE.MeshStandardMaterial({ color: 0x2a2724, roughness: 0.9 }));
    this.debris.forEach((d) => { d.vel = new THREE.Vector3(); d.spin = new THREE.Vector3(); });
  }

  setCamera(cam) { this._cam = cam; }

  _pool(n, geo, makeMat) {
    const arr = [];
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(geo, makeMat());
      m.visible = false; m.frustumCulled = false;
      this.scene.add(m);
      arr.push({ mesh: m, life: 0, max: 1 });
    }
    arr.cursor = 0;
    return arr;
  }
  _next(p) { const it = p[p.cursor]; p.cursor = (p.cursor + 1) % p.length; return it; }

  tracer(from, to) {
    this._dir.subVectors(to, from);
    const len = this._dir.length(); if (len < 0.01) return;
    const t = this._next(this.tracers);
    t.mesh.position.copy(from);
    t.mesh.quaternion.setFromUnitVectors(this._up, this._dir.normalize());
    t.mesh.scale.set(1, len, 1);
    t.mesh.visible = true; t.mesh.material.opacity = 1;
    t.life = t.max = 0.03;
  }

  _flash(point, size, color) {
    const f = this._next(this.flashes);
    f.mesh.position.copy(point);
    f.mesh.material.color.setHex(color);
    f.mesh.scale.setScalar(size);
    f.mesh.visible = true; f.mesh.material.opacity = 1;
    f.life = f.max = 0.08;
  }
  _embers(point, color, count, speed) {
    for (let i = 0; i < count; i++) {
      const e = this._next(this.embers);
      e.mesh.position.copy(point);
      e.mesh.material.color.setHex(color);
      e.mesh.scale.setScalar(0.12 + Math.random() * 0.1);
      e.mesh.visible = true; e.mesh.material.opacity = 1;
      e.vel.set((Math.random() - 0.5), Math.random() * 0.9 + 0.25, (Math.random() - 0.5)).multiplyScalar(speed * (0.5 + Math.random()));
      e.life = e.max = 0.3 + Math.random() * 0.15;
    }
  }
  _dustPuff(point, color, size) {
    const d = this._next(this.dust);
    d.mesh.position.copy(point);
    d.mesh.material.color.setHex(color);
    d.mesh.scale.setScalar(size);
    d.mesh.visible = true; d.mesh.material.opacity = 0.55;
    d.life = d.max = 0.5;
    d.grow = size;
  }
  _decal(point, normal) {
    const d = this._next(this.decals);
    d.mesh.position.copy(point).addScaledVector(normal, 0.02);
    d.mesh.lookAt(this._dir.copy(point).add(normal));
    d.mesh.scale.setScalar(0.22 + Math.random() * 0.1);
    d.mesh.visible = true; d.mesh.material.opacity = 0.9;
    d.life = d.max = 7; d.grow = 0;
  }

  // wall / prop impact
  impact(point, normal) {
    this._flash(point, 0.6, 0xffe2a0);
    this._embers(point, 0xffc878, 7, 5);
    this._dustPuff(point, 0xb9b3a4, 0.35);
    if (normal) this._decal(point, normal);
  }
  // simple soft glowing muzzle flash, billboarded toward the camera
  muzzle(point) {
    this._flash(point, 0.8, 0xffe0a0);
  }

  // big "wow" explosion: fireball + shockwave ring + flying debris + smoke
  explosion(point) {
    for (let i = 0; i < 5; i++) {
      const p = point.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2));
      this._flash(p, 2.6 + Math.random() * 1.5, i % 2 ? 0xffd27a : 0xff8a30);
    }
    this._embers(point, 0xffb24a, 42, 12);
    for (let i = 0; i < 6; i++) {
      const p = point.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2.5, Math.random() * 1.5, (Math.random() - 0.5) * 2.5));
      this._dustPuff(p, 0x2a2520, 2.0 + Math.random() * 1.2);
    }
    this._shockwave(point);
    this._spawnDebris(point, 12);
  }

  _shockwave(point) {
    const r = this._next(this.rings);
    r.mesh.position.copy(point);
    r.mesh.scale.setScalar(0.5);
    r.mesh.visible = true; r.mesh.material.opacity = 0.9;
    r.life = r.max = 0.45; r.grow = 22;
  }
  _spawnDebris(point, n) {
    for (let i = 0; i < n; i++) {
      const d = this._next(this.debris);
      d.mesh.position.copy(point);
      d.mesh.scale.setScalar(0.5 + Math.random() * 1.1);
      d.mesh.visible = true;
      d.vel.set((Math.random() - 0.5), Math.random() * 0.9 + 0.5, (Math.random() - 0.5)).multiplyScalar(7 + Math.random() * 8);
      d.spin.set(Math.random() * 8, Math.random() * 8, Math.random() * 8);
      d.life = d.max = 1.6 + Math.random() * 0.8;
    }
  }

  // enemy hit (crimson)
  hitPuff(point) {
    this._flash(point, 0.5, 0xff6a52);
    this._embers(point, 0xd03a2a, 9, 5.5);
    this._dustPuff(point, 0x5a1410, 0.32);
  }

  update(dt) {
    const camQ = this._cam && this._cam.quaternion;
    for (const t of this.tracers) if (t.life > 0) { t.life -= dt; t.mesh.material.opacity = Math.max(0, t.life / t.max); if (t.life <= 0) t.mesh.visible = false; }
    for (const e of this.embers) if (e.life > 0) {
      e.life -= dt; e.vel.y -= 14 * dt;
      e.mesh.position.addScaledVector(e.vel, dt);
      if (camQ) e.mesh.quaternion.copy(camQ);
      e.mesh.material.opacity = Math.max(0, e.life / e.max);
      if (e.life <= 0) e.mesh.visible = false;
    }
    for (const f of this.flashes) if (f.life > 0) {
      f.life -= dt;
      if (camQ) f.mesh.quaternion.copy(camQ);
      f.mesh.material.opacity = Math.max(0, f.life / f.max);
      if (f.life <= 0) f.mesh.visible = false;
    }
    for (const d of this.dust) if (d.life > 0) {
      d.life -= dt; const k = 1 - d.life / d.max;
      if (camQ) d.mesh.quaternion.copy(camQ);
      d.mesh.scale.setScalar(d.grow * (1 + k * 1.6));
      d.mesh.position.y += dt * 0.5;
      d.mesh.material.opacity = Math.max(0, (1 - k) * 0.55);
      if (d.life <= 0) d.mesh.visible = false;
    }
    for (const d of this.decals) if (d.life > 0) {
      d.life -= dt;
      if (d.life < 1) d.mesh.material.opacity = Math.max(0, d.life * 0.9);
      if (d.life <= 0) d.mesh.visible = false;
    }
    for (const r of this.rings) if (r.life > 0) {
      r.life -= dt; const k = 1 - r.life / r.max;
      if (camQ) r.mesh.quaternion.copy(camQ);
      r.mesh.scale.setScalar(0.5 + k * r.grow);
      r.mesh.material.opacity = Math.max(0, (1 - k) * 0.9);
      if (r.life <= 0) r.mesh.visible = false;
    }
    for (const d of this.debris) if (d.life > 0) {
      d.life -= dt; d.vel.y -= 16 * dt;
      d.mesh.position.addScaledVector(d.vel, dt);
      d.mesh.rotation.x += d.spin.x * dt; d.mesh.rotation.y += d.spin.y * dt; d.mesh.rotation.z += d.spin.z * dt;
      if (d.mesh.position.y < 0.1) { d.mesh.position.y = 0.1; d.vel.set(0, 0, 0); }
      if (d.life <= 0) d.mesh.visible = false;
    }
  }
}
