import * as THREE from "three";
import { noOutline } from "../engine/primitives.js";
import { makeHero } from "./actors/operator.js";
import { HERO_TINT } from "./actors/creature-assets.js";

// Third-person parachute insertion: a behind-the-back camera follows a strong warrior descending under
// a canopy, all the way down until he lands on the ground, the canopy collapsing — then it cuts to
// first-person. Same interface as Intro ({ start(), update(dt), done, dispose() }).
export class ParachuteIntro {
  constructor(scene, camera, spawn, groundY = 0, heroId = "assault") {
    this.scene = scene; this.camera = camera;
    this.spawn = new THREE.Vector3(spawn.x, groundY, spawn.z);
    this.t = 0; this.dur = 8.0; this.hold = 0; this.done = false; this.startY = 150;
    this.yaw = 0.5;
    this.pos = new THREE.Vector3(spawn.x, this.startY, spawn.z);
    this.group = new THREE.Group(); this.scene.add(this.group);

    // the operator avatar hanging from the harness
    this.rig = new THREE.Group(); this.group.add(this.rig);
    const inst = makeHero(HERO_TINT[heroId]);
    if (inst) { this.op = inst.model; this.rig.add(this.op); this.rig.rotation.x = 0.14; }

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
    // risers attach to two shoulder points (a harness on the back), not a single point at the head
    const shL = new THREE.Vector3(-0.5, 1.7, -0.15), shR = new THREE.Vector3(0.5, 1.7, -0.15);
    const riserMat = noOutline(new THREE.MeshBasicMaterial({ color: 0x1a1d22 })), up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2, skirt = new THREE.Vector3(Math.cos(a) * R * 0.82, canopyY - 0.4, Math.sin(a) * R * 0.82);
      const harness = i % 2 === 0 ? shL : shR;
      const len = skirt.distanceTo(harness), line = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, len, 4), riserMat);
      line.position.copy(skirt).add(harness).multiplyScalar(0.5);
      line.quaternion.setFromUnitVectors(up, harness.clone().sub(skirt).normalize());
      this.group.add(line);
    }
    this._look = new THREE.Vector3();
  }

  // a horned viking helmet + a red cape, placed on the rig at the warrior's head/back (world scale, reliable)
  _addViking() {
    const steel = new THREE.MeshStandardMaterial({ color: 0x9aa6b2, metalness: 0.8, roughness: 0.35 });
    const horn = new THREE.MeshStandardMaterial({ color: 0xe8e2d0, roughness: 0.6 });
    const helm = new THREE.Group();
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.56), steel);
    const brim = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.055, 8, 18), steel); brim.rotation.x = Math.PI / 2;
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.2, 0.05), steel); nose.position.set(0, -0.14, 0.33);
    const hornGeo = new THREE.ConeGeometry(0.08, 0.42, 10);
    const hL = new THREE.Mesh(hornGeo, horn); hL.position.set(-0.32, 0.18, 0); hL.rotation.z = 0.7;
    const hR = new THREE.Mesh(hornGeo, horn); hR.position.set(0.32, 0.18, 0); hR.rotation.z = -0.7;
    helm.add(dome, brim, nose, hL, hR); helm.position.set(0, 2.18, 0.02); this.rig.add(helm); this._helm = helm;
    const cape = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 1.5),
      new THREE.MeshStandardMaterial({ color: 0xb02a2a, roughness: 0.85, side: THREE.DoubleSide }));
    cape.position.set(0, 1.35, -0.24); cape.rotation.x = -0.14; this.rig.add(cape);
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
