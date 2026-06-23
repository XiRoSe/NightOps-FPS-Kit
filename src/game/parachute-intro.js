import * as THREE from "three";
import { noOutline } from "../engine/primitives.js";
import { makeOperator } from "./actors/operator.js";

// Third-person parachute insertion: a behind-the-back camera follows your operator as they descend
// under a canopy toward the island, the canopy flares on landing, then it cuts to first-person.
// Same interface as Intro ({ start(), update(dt), done, dispose() }).
export class ParachuteIntro {
  constructor(scene, camera, spawn, groundY = 0) {
    this.scene = scene; this.camera = camera;
    this.spawn = new THREE.Vector3(spawn.x, groundY, spawn.z);
    this.t = 0; this.dur = 7.5; this.done = false; this.startY = 150;
    this.yaw = 0.5; // operator faces this heading; the camera sits behind it
    this.pos = new THREE.Vector3(spawn.x, this.startY, spawn.z);
    this.group = new THREE.Group(); this.scene.add(this.group);

    // operator (scaled up for presence), leaning slightly forward into the descent
    this.rig = new THREE.Group(); this.group.add(this.rig); // operator lives here so it can tilt without the canopy
    const op = makeOperator();
    if (op) {
      this.op = op.model; this.bones = op.bones; this.op.scale.multiplyScalar(1.35);
      this.rig.add(this.op); this.rig.rotation.x = 0.16;
      // arms up gripping the risers
      if (this.bones.rArm) this.bones.rArm.rotation.set(-0.3, 0, 1.45);
      if (this.bones.lArm) this.bones.lArm.rotation.set(-0.3, 0, -1.45);
    }

    // canopy: a domed cap of alternating colored gores, sitting above the operator
    const canopyY = 7.2, R = 3.7;
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

    // risers: lines from the canopy skirt converging onto a harness point at the operator's shoulders
    const harness = new THREE.Vector3(0, 2.5, 0), riserMat = noOutline(new THREE.MeshBasicMaterial({ color: 0x1a1d22 }));
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2;
      const skirt = new THREE.Vector3(Math.cos(a) * R * 0.82, canopyY - 0.4, Math.sin(a) * R * 0.82);
      const len = skirt.distanceTo(harness);
      const line = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, len, 4), riserMat);
      line.position.copy(skirt).add(harness).multiplyScalar(0.5);
      line.quaternion.setFromUnitVectors(up, harness.clone().sub(skirt).normalize());
      this.group.add(line);
    }
    this._look = new THREE.Vector3();
  }

  start() {}

  update(dt) {
    this.t += dt;
    const k = Math.min(this.t / this.dur, 1), ease = k * k * (3 - 2 * k);
    this.pos.y = this.startY + (this.spawn.y - this.startY) * ease;
    this.pos.x = this.spawn.x + Math.sin(this.t * 0.6) * 5 * (1 - ease); // gentle drift
    this.pos.z = this.spawn.z + Math.cos(this.t * 0.5) * 5 * (1 - ease);
    this.yaw = 0.5 + Math.sin(this.t * 0.18) * 0.25; // slow heading sway
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;
    if (this.rig) this.rig.rotation.x = 0.16 - ease * 0.16; // straighten up for landing
    if (k > 0.88) { const c = (k - 0.88) / 0.12; this.canopy.scale.set(1 + c * 0.25, 1 - c * 0.7, 1 + c * 0.25); this.canopy.position.y = 7.2 - c * 3.5; } // flare + collapse

    // behind-the-back follow cam, looking forward + down over the operator toward the island
    const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const dist = 8.5 - 3 * ease, hgt = 3.4 - 0.8 * ease;
    this.camera.position.set(this.pos.x - fwd.x * dist, this.pos.y + hgt, this.pos.z - fwd.z * dist);
    this._look.set(this.pos.x + fwd.x * 3.5, this.pos.y + 1 - 2.4 * ease, this.pos.z + fwd.z * 3.5);
    this.camera.lookAt(this._look);
    if (k >= 1) this.done = true;
  }

  dispose() { this.scene.remove(this.group); }
}
