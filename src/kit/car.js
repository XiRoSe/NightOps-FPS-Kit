import * as THREE from "three";
import { makeVehicle } from "./content/vehicles.js";

// A driveable arcade car: reuses a CC0 vehicle model, follows the terrain, steers like an arcade racer.
// The game enters/exits it and hands control of the camera to chaseCamera() while driving.
export class Car {
  constructor(scene, x, z, level, type = "suv") {
    this.scene = scene; this.level = level;
    this.group = makeVehicle(type);
    this.pos = new THREE.Vector3(x, 0, z);
    this.yaw = Math.random() * Math.PI * 2; this.speed = 0;
    this.r = 3.2;                 // enter/interact radius
    const bb = new THREE.Box3().setFromObject(this.group); // lift so the LOWEST point (wheels) rests on the ground
    this.rideH = isFinite(bb.min.y) ? -bb.min.y : 0;
    this.maxSpeed = 40; this.maxRev = 11;   // fast sports car
    this._tmp = new THREE.Vector3(); this._look = new THREE.Vector3();
    this.scene.add(this.group);
    this.seat();
  }

  _groundY(x, z) { return this.level.terrainHeight ? this.level.terrainHeight(x, z) : 0; }

  seat() {
    const sea = this.level.seaLevel;
    let gy = this._groundY(this.pos.x, this.pos.z);
    if (sea !== undefined && gy < sea - 0.4) gy = sea - 0.5; // float low on the water instead of sinking to the seabed
    this.group.position.set(this.pos.x, gy + this.rideH, this.pos.z);
    // tilt the body to the terrain: pitch (front/back) + roll (side/side) so it banks on hills/mountains
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw), rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    const ahead = this._groundY(this.pos.x + fx * 2.4, this.pos.z + fz * 2.4), behind = this._groundY(this.pos.x - fx * 2.4, this.pos.z - fz * 2.4);
    const right = this._groundY(this.pos.x + rx * 1.8, this.pos.z + rz * 1.8), left = this._groundY(this.pos.x - rx * 1.8, this.pos.z - rz * 1.8);
    const pitch = Math.atan2(ahead - behind, 4.8), roll = Math.atan2(right - left, 3.6);
    // ease toward the target tilt for smooth, quality movement
    this._pitch = (this._pitch || 0) + (pitch - (this._pitch || 0)) * 0.25;
    this._roll = (this._roll || 0) + (roll - (this._roll || 0)) * 0.25;
    this.group.rotation.set(-this._pitch, this.yaw, this._roll);
  }

  update(dt, input) {
    const fwd = input.isDown("w", "arrowup"), back = input.isDown("s", "arrowdown");
    const steer = (input.isDown("a", "arrowleft") ? 1 : 0) - (input.isDown("d", "arrowright") ? 1 : 0);
    // accelerate / brake / reverse
    if (fwd) this.speed += 28 * dt;
    else if (back) this.speed -= (this.speed > 0.6 ? 52 : 20) * dt;   // firm brake when rolling forward, else reverse
    else this.speed -= this.speed * Math.min(1, 1.3 * dt);            // coast drag
    // crawl in water — cars bog down in the sea instead of racing across it
    const sea = this.level.seaLevel;
    const inWater = sea !== undefined && this._groundY(this.pos.x, this.pos.z) < sea - 0.4;
    const maxS = inWater ? 4 : this.maxSpeed;
    if (inWater && this.speed > maxS) this.speed += (maxS - this.speed) * Math.min(1, 3 * dt); // drag down to a crawl
    this.speed = Math.max(inWater ? -3 : -this.maxRev, Math.min(maxS, this.speed));
    if (!fwd && !back && Math.abs(this.speed) < 0.2) this.speed = 0;
    // steering scales with speed (and naturally reverses when backing up)
    const grip = Math.max(-1, Math.min(1, this.speed / 10));
    this.yaw += steer * 1.7 * dt * grip;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw), d = this.speed * dt;
    const nx = this.pos.x + fx * d, nz = this.pos.z + fz * d;
    if (!this._blocked(nx, this.pos.z)) this.pos.x = nx; else this.speed *= 0.25;
    if (!this._blocked(this.pos.x, nz)) this.pos.z = nz; else this.speed *= 0.25;
    const b = this.level.bounds;
    if (b) { this.pos.x = Math.max(b.minX, Math.min(b.maxX, this.pos.x)); this.pos.z = Math.max(b.minZ, Math.min(b.maxZ, this.pos.z)); }
    this.seat();
  }

  // smoothed behind-and-above chase camera (lags slightly for a nicer feel)
  chaseCamera(camera, dt = 0.016) {
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw), gy = this.group.position.y;
    const tx = this.pos.x - fx * 9, ty = gy + 4.5, tz = this.pos.z - fz * 9;
    if (!this._cam) this._cam = new THREE.Vector3(tx, ty, tz);
    const k = Math.min(1, dt * 14); // framerate-aware smoothing — snappy even at lower FPS
    this._cam.x += (tx - this._cam.x) * k; this._cam.y += (ty - this._cam.y) * k; this._cam.z += (tz - this._cam.z) * k;
    camera.position.copy(this._cam);
    this._look.set(this.pos.x + fx * 6, gy + 1.6, this.pos.z + fz * 6);
    camera.lookAt(this._look);
  }

  // a seat-exit spot beside the car (on the ground)
  exitSpot() {
    const sx = this.pos.x - Math.cos(this.yaw) * 3, sz = this.pos.z + Math.sin(this.yaw) * 3;
    return this._tmp.set(sx, this._groundY(sx, sz), sz);
  }

  _blocked(x, z) {
    for (const c of this.level.colliders) {
      if (c.top < 0.6) continue;
      if (x > c.minX - this.r && x < c.maxX + this.r && z > c.minZ - this.r && z < c.maxZ + this.r) return true;
    }
    return false;
  }
}
