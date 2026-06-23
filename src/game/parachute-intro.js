import * as THREE from "three";
import { noOutline } from "../engine/primitives.js";
import { CREATURES } from "./actors/creature-assets.js";

// Third-person parachute insertion: a behind-the-back camera follows a strong warrior descending under
// a canopy, all the way down until he lands on the ground, the canopy collapsing — then it cuts to
// first-person. Same interface as Intro ({ start(), update(dt), done, dispose() }).
export class ParachuteIntro {
  constructor(scene, camera, spawn, groundY = 0) {
    this.scene = scene; this.camera = camera;
    this.spawn = new THREE.Vector3(spawn.x, groundY, spawn.z);
    this.t = 0; this.dur = 8.0; this.hold = 0; this.done = false; this.startY = 150;
    this.yaw = 0.5;
    this.pos = new THREE.Vector3(spawn.x, this.startY, spawn.z);
    this.group = new THREE.Group(); this.scene.add(this.group);

    // the warrior avatar (animated), gripping the harness; plays Idle through the descent
    this.rig = new THREE.Group(); this.group.add(this.rig);
    const inst = CREATURES.warrior.make();
    if (inst) {
      this.op = inst.model;
      this.op.traverse((o) => { // brighten the near-black armor to heroic steel so he reads as a strong warrior
        if (!o.isMesh) return;
        o.castShadow = true; o.material = o.material.clone();
        const n = (o.material.name || "").toLowerCase();
        if (n.includes("armor")) { o.material.color.set(0x6f7f8c); o.material.metalness = 0.75; o.material.roughness = 0.38; }
        else if (n.includes("boot")) o.material.color.set(0x3a2c1c);
      });
      this.op.scale.multiplyScalar(1.15);
      this.rig.add(this.op); this.rig.rotation.x = 0.14;
      this.mixer = new THREE.AnimationMixer(this.op);
      const a = inst.animations;
      const idle = a.find((c) => /idle_sword/i.test(c.name)) || a.find((c) => /idle/i.test(c.name)) || a[0]; // sword stance = clearly a warrior
      if (idle) this.mixer.clipAction(idle).play();
    }

    // colorful canopy + risers down to the harness
    const canopyY = 7.2, R = 3.8;
    this.canopy = new THREE.Group(); this.canopy.position.y = canopyY;
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2;
      const panel = new THREE.Mesh(
        new THREE.SphereGeometry(R, 5, 6, a, Math.PI / 6, 0, Math.PI / 2.1),
        noOutline(new THREE.MeshStandardMaterial({ color: i % 2 ? 0xff5a3c : 0xf4f1e8, roughness: 0.85, side: THREE.DoubleSide })),
      );
      this.canopy.add(panel);
    }
    this.group.add(this.canopy);
    const harness = new THREE.Vector3(0, 2.2, 0), riserMat = noOutline(new THREE.MeshBasicMaterial({ color: 0x1a1d22 })), up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2, skirt = new THREE.Vector3(Math.cos(a) * R * 0.82, canopyY - 0.4, Math.sin(a) * R * 0.82);
      const len = skirt.distanceTo(harness), line = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, len, 4), riserMat);
      line.position.copy(skirt).add(harness).multiplyScalar(0.5);
      line.quaternion.setFromUnitVectors(up, harness.clone().sub(skirt).normalize());
      this.group.add(line);
    }
    this._look = new THREE.Vector3();
  }

  start() {}

  update(dt) {
    this.mixer?.update(dt);
    this.t += dt;
    const k = Math.min(this.t / this.dur, 1), ease = k * k * (3 - 2 * k), landed = k >= 1;
    this.pos.y = this.startY + (this.spawn.y - this.startY) * ease;
    this.pos.x = this.spawn.x + Math.sin(this.t * 0.7) * 6 * (1 - ease);
    this.pos.z = this.spawn.z + Math.cos(this.t * 0.6) * 6 * (1 - ease);
    this.yaw = 0.5 + Math.sin(this.t * 0.18) * 0.25;
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;
    if (this.rig) this.rig.rotation.x = 0.14 * (1 - ease); // straighten for landing
    if (k > 0.86) { const cc = Math.min(1, (k - 0.86) / 0.14); this.canopy.scale.set(1 + cc * 0.3, 1 - cc * 0.85, 1 + cc * 0.3); this.canopy.position.y = 7.2 - cc * 4; }
    if (landed) this.canopy.visible = false; // chute released on touchdown

    // behind-the-back follow cam — stays third-person through the whole descent + a beat on the ground
    const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const dist = 8.5 - 3 * ease, hgt = 3.4 - 1.2 * ease;
    this.camera.position.set(this.pos.x - fwd.x * dist, this.pos.y + hgt, this.pos.z - fwd.z * dist);
    this._look.set(this.pos.x + fwd.x * 3.2, this.pos.y + 1.4 - 1.0 * ease, this.pos.z + fwd.z * 3.2);
    this.camera.lookAt(this._look);

    if (landed) { this.hold += dt; if (this.hold > 1.0) this.done = true; } // hold on the ground, then cut to first-person
  }

  dispose() { this.scene.remove(this.group); }
}
