import * as THREE from "three";
import { makeHero } from "./actors/operator.js";

// Helldivers-style insertion: the operator rides a sci-fi drop pod down through a fiery re-entry, the
// camera chasing it, a ground-impact shockwave, then the pod cracks open and the operator stands —
// cut to first-person. Same interface as Intro ({ start(), update(dt), done, dispose() }).
export class DropPodIntro {
  constructor(scene, camera, spawn, groundY = 0, tint = null, vfx = null, audio = null, onImpact = null) {
    this.scene = scene; this.camera = camera; this.vfx = vfx; this.audio = audio; this.onImpact = onImpact;
    this.spawn = new THREE.Vector3(spawn.x, groundY, spawn.z);
    this.t = 0; this.dur = 3.0; this.done = false; this.startY = 175; this.impacted = false; this.hold = 0;
    this.pos = new THREE.Vector3(spawn.x, this.startY, spawn.z);
    this.group = new THREE.Group(); this.scene.add(this.group);

    // the pod — a riveted steel capsule with a glowing heat ring + thruster base
    this.pod = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({ color: 0x6a7078, metalness: 0.7, roughness: 0.45 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x32363c, metalness: 0.6, roughness: 0.5 });
    const glow = new THREE.MeshStandardMaterial({ color: 0xffb45a, emissive: 0xff5a1a, emissiveIntensity: 2.2 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.0, 2.0, 8), steel); body.position.y = 1.5; this.pod.add(body);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(1.0, 1.3, 8), dark); nose.position.y = 0.0; nose.rotation.x = Math.PI; this.pod.add(nose);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.15, 0.8, 8), steel); cap.position.y = 2.9; this.pod.add(cap);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.18, 0.09, 8, 16), glow); ring.rotation.x = Math.PI / 2; ring.position.y = 0.6; this.pod.add(ring);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 0.4, 8), glow); base.position.y = -0.5; this.pod.add(base); // thruster
    this.pod.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.group.add(this.pod);

    const h = makeHero(tint);
    if (h) { this.hero = h.model; this.hero.visible = false; this.group.add(this.hero); }
    this._look = new THREE.Vector3(); this._tmp = new THREE.Vector3();
  }

  start() {}

  update(dt) {
    this.t += dt;
    if (!this.impacted) {
      const k = Math.min(this.t / this.dur, 1), ease = k * k; // accelerate as it falls
      this.pos.y = this.startY + (this.spawn.y - this.startY) * ease;
      this.group.position.copy(this.pos);
      this.pod.rotation.y += dt * 1.8;
      if (this.vfx) { // fiery re-entry trail streaming up off the pod
        for (let i = 0; i < 2; i++) this.vfx.rocketTrail(this._tmp.set(this.pos.x + (Math.random() - 0.5) * 1.2, this.pos.y + 2.4 + Math.random() * 2.0, this.pos.z + (Math.random() - 0.5) * 1.2));
      }
      // chase cam: behind + above, easing down to watch the pod streak into the island
      this.camera.position.set(this.pos.x - 3.5, this.pos.y + 5 + 7 * (1 - ease), this.pos.z - 12);
      this._look.set(this.pos.x, this.pos.y - 5 * ease, this.pos.z);
      this.camera.lookAt(this._look);
      if (k >= 1) {
        this.impacted = true;
        if (this.vfx) {
          for (let i = 0; i < 4; i++) this.vfx.explosion(this._tmp.set(this.spawn.x + (Math.random() - 0.5) * 5, this.spawn.y + 0.6, this.spawn.z + (Math.random() - 0.5) * 5), 1.7);
          for (let i = 0; i < 6; i++) this.vfx.dustBurst(this._tmp.set(this.spawn.x + (Math.random() - 0.5) * 8, this.spawn.y + 0.4, this.spawn.z + (Math.random() - 0.5) * 8));
        }
        this.audio && this.audio.explosion && this.audio.explosion();
        this.onImpact && this.onImpact();
        this.pod.position.y = -0.7; // pod buries its nose
        if (this.hero) this.hero.visible = true; // operator emerges
      }
    } else {
      this.hold += dt;
      const c = Math.min(1, this.hold / 0.9);
      this.pod.scale.setScalar(1 - c * 0.25);
      // hero reveal shot
      this.camera.position.set(this.spawn.x + 3.4, this.spawn.y + 2.1, this.spawn.z + 4.6);
      this._look.set(this.spawn.x, this.spawn.y + 1.3, this.spawn.z);
      this.camera.lookAt(this._look);
      if (this.hold > 1.4) this.done = true;
    }
  }

  dispose() { this.scene.remove(this.group); }
}
