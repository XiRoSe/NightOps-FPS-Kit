import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as skeletonClone } from "three/addons/utils/SkeletonUtils.js";
import { COLORS, box } from "../util/builders.js";

// --- load the rigged soldier once, share across all enemies ---
let _asset = null;        // { scene, animations, scale }
let _loading = null;
export function preloadEnemies() {
  if (_asset) return Promise.resolve();
  if (_loading) return _loading;
  const loader = new GLTFLoader();
  _loading = new Promise((resolve, reject) => {
    loader.load("/models/Soldier.glb", (gltf) => {
      const bbox = new THREE.Box3().setFromObject(gltf.scene);
      const height = bbox.max.y - bbox.min.y || 1;
      _asset = { scene: gltf.scene, animations: gltf.animations, scale: 1.8 / height };
      resolve();
    }, undefined, reject);
  });
  return _loading;
}

export class Enemy {
  constructor(scene, spawn, level) {
    this.scene = scene;
    this.level = level;
    this.baseY = spawn.y || 0; // raised for watchtower posts
    this.pos = new THREE.Vector3(spawn.x, 0, spawn.z);
    this.patrol = spawn.patrol || [{ x: spawn.x, z: spawn.z }];
    this.wp = 0;
    this.yaw = Math.random() * Math.PI * 2;
    this.speed = 2.4;
    this.hp = 100;
    this.dead = false;
    this.counted = false;
    this.alertT = 0;
    this.fireCd = 0.7 + Math.random() * 0.8;
    this.deathT = 0;
    // cover behaviour
    this.coverPos = this.pos.clone();
    this.peeking = false;
    this.peekTimer = 1.2 + Math.random() * 1.6; // time hidden before peeking
    this.peekSide = Math.random() < 0.5 ? 1 : -1;
    this.peekPos = this.pos.clone();
    this._toP = new THREE.Vector3();
    // occasional jump/duck dodge
    this.dodgeCd = 2 + Math.random() * 2.5;
    this.dodging = null;
    this.dodgeT = 0;
    this.dodgeDur = 0.5;

    this.group = new THREE.Group();
    this._build();
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;
    this.scene.add(this.group);
    this._muzzleWorld = new THREE.Vector3();
  }

  _build() {
    // clone the rigged model (shares geometry/material — do NOT mutate materials)
    this.model = skeletonClone(_asset.scene);
    this.model.scale.setScalar(_asset.scale);
    this.model.rotation.y = Math.PI; // model's front is -Z; face it along the group's +Z (toward target)
    this.model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = true; } });
    this.group.add(this.model);

    // animation mixer + clips
    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    for (const clip of _asset.animations) this.actions[clip.name] = this.mixer.clipAction(clip);
    this._current = null;
    this._play(this.actions.Walk ? "Walk" : Object.keys(this.actions)[0]);

    // cache arm + right-hand bones so the rifle can be parented to the hand and the
    // arms posed into an aim each frame (the soldier clips carry no weapon/aim)
    this.bones = {};
    this.model.traverse((o) => {
      if (!o.isBone) return;
      if (o.name === "mixamorigRightArm") this.bones.rArm = o;
      else if (o.name === "mixamorigRightForeArm") this.bones.rFore = o;
      else if (o.name === "mixamorigLeftArm") this.bones.lArm = o;
      else if (o.name === "mixamorigLeftForeArm") this.bones.lFore = o;
      else if (o.name === "mixamorigRightHand") this.bones.rHand = o;
      else if (o.name === "mixamorigLeftHand") this.bones.lHand = o;
    });

    // proper rifle — parented to the RIGHT HAND bone so it's truly part of the soldier
    // (follows duck, jump, and the arm pose; muzzle stays correct).
    const rifle = new THREE.Group();
    const body = box(0.07, 0.12, 0.8, COLORS.metalDark, { metalness: 0.5, roughness: 0.5 }); rifle.add(body);
    const barrel = box(0.04, 0.04, 0.34, 0x15171a, { metalness: 0.6, roughness: 0.4 }); barrel.position.set(0, 0.0, 0.52); rifle.add(barrel);
    const stock = box(0.06, 0.11, 0.22, COLORS.oliveDark, { flat: true }); stock.position.set(0, -0.02, -0.46); rifle.add(stock);
    const mag = box(0.05, 0.2, 0.1, 0x202225, { flat: true }); mag.position.set(0, -0.16, 0.04); mag.rotation.x = 0.25; rifle.add(mag);
    const grip = box(0.05, 0.13, 0.07, 0x202225, { flat: true }); grip.position.set(0, -0.12, -0.12); grip.rotation.x = -0.2; rifle.add(grip);
    const sight = box(0.03, 0.05, 0.06, 0x15171a, { flat: true }); sight.position.set(0, 0.09, 0.0); rifle.add(sight);
    this._gunTip = new THREE.Object3D();
    this._gunTip.position.set(0, 0, 0.62);
    rifle.add(this._gunTip);
    this._rifle = rifle;

    // parent to the right-hand bone so the soldier's own animation holds the rifle naturally.
    // (hand bone lives in a ~0.01 scaled space, so the rifle is scaled back up ~100x.)
    if (this.bones.rHand) {
      this._gunFix = { p: [3.5, 4, 11.5], r: [-0.55, 0.1, 0], s: 102 };
      this.bones.rHand.add(rifle);
      this._applyGun();
    } else {
      rifle.position.set(0.16, 1.34, 0.34); this.group.add(rifle);
    }


    // invisible but raycastable hitbox
    this.hitbox = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.42, 1.1, 4, 8),
      new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false })
    );
    this.hitbox.position.y = 1.0;
    this.hitbox.userData.enemy = this;
    this.group.add(this.hitbox);
  }

  _play(name, fade = 0.25) {
    const next = this.actions[name];
    if (!next || next === this._current) return;
    next.reset().fadeIn(fade).play();
    if (this._current) this._current.fadeOut(fade);
    this._current = next;
  }

  takeDamage(dmg) {
    if (this.dead) return;
    this.hp -= dmg;
    this.state = "alert";
    this.alertT = 5;
    if (this.hp <= 0) this._die();
  }

  _die() {
    this.dead = true;
    this.deathT = 0;
    this.hitbox.userData.enemy = null;
    this.hitbox.visible = false;
  }

  canSee(playerPos) {
    const d = Math.hypot(playerPos.x - this.pos.x, playerPos.z - this.pos.z);
    // elevated watchtower guards look down OVER all the cover (everything is shorter than them)
    if (this.baseY > 0) return d < 50;
    if (d > 26) return false;
    return !this.level.segmentBlocked(this.pos.x, this.pos.z, playerPos.x, playerPos.z);
  }

  // set the rifle's transform within the hand bone (tunable live via window.__gunFix)
  _applyGun() {
    if (!this._rifle || this._rifle.parent === this.group) return;
    const f = (typeof window !== "undefined" && window.__gunFix) || this._gunFix;
    this._rifle.position.set(f.p[0], f.p[1], f.p[2]);
    this._rifle.rotation.set(f.r[0], f.r[1], f.r[2]);
    this._rifle.scale.setScalar(f.s);
  }

  _blocked(x, z) {
    const r = 0.4;
    for (const c of this.level.colliders) {
      if (x > c.minX - r && x < c.maxX + r && z > c.minZ - r && z < c.maxZ + r) return true;
    }
    return false;
  }
  _moveToward(tx, tz, dt) {
    const dx = tx - this.pos.x, dz = tz - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) return true;
    const step = Math.min(this.speed * dt, d);
    const nx = this.pos.x + (dx / d) * step, nz = this.pos.z + (dz / d) * step;
    if (!this._blocked(nx, this.pos.z)) this.pos.x = nx;
    if (!this._blocked(this.pos.x, nz)) this.pos.z = nz;
    return d < 0.3;
  }

  update(dt, playerPos, ctx) {
    if (this.dead) {
      this.deathT += dt;
      const p = Math.min(this.deathT / 0.7, 1);
      this.group.rotation.x = -p * Math.PI * 0.48;
      this.group.position.y = this.baseY * (1 - p) - p * 0.5; // tumble down (off a tower if raised)
      if (this.deathT > 2.2) this.removable = true;
      return;
    }

    // pitch the aim up/down toward the player (so tower guards shoot down at you)
    const dxz = Math.hypot(playerPos.x - this.pos.x, playerPos.z - this.pos.z);
    this._aimPitch = Math.max(-1.2, Math.min(1.2, Math.atan2((this.baseY + 1.3) - playerPos.y, Math.max(0.6, dxz))));

    this.mixer.update(dt);
    this._applyGun(); // rifle rides the hand bone via the natural animation

    const see = this.canSee(playerPos);
    if (see) this.alertT = 5; else this.alertT -= dt;
    const engaged = this.alertT > 0;

    // watchtower guard: never moves — just tracks the player and fires from the post
    if (this.baseY > 0) {
      this.yaw = Math.atan2(playerPos.x - this.pos.x, playerPos.z - this.pos.z);
      this._play("Idle");
      if (see) { this.fireCd -= dt; if (this.fireCd <= 0) { this.fireCd = 2 + Math.random() * 4; this._fire(playerPos, ctx); } }
      this.group.position.set(this.pos.x, this.baseY, this.pos.z);
      this.group.rotation.y = this.yaw;
      return;
    }

    let movingNow = false;
    if (engaged) {
      this.yaw = Math.atan2(playerPos.x - this.pos.x, playerPos.z - this.pos.z);
      this.peekTimer -= dt;
      if (this.peeking) {
        movingNow = !this._moveToward(this.peekPos.x, this.peekPos.z, dt);
        if (this.peekTimer <= 0) { this.peeking = false; this.peekTimer = 1.5 + Math.random() * 1.6; }
      } else {
        movingNow = !this._moveToward(this.coverPos.x, this.coverPos.z, dt);
        if (this.peekTimer <= 0) { this.peeking = true; this.peekTimer = 0.9 + Math.random() * 0.7; this._computePeek(playerPos); }
      }
      // fire on a random 2-6s cadence whenever the player is visible
      if (see) { this.fireCd -= dt; if (this.fireCd <= 0) { this.fireCd = 2 + Math.random() * 4; this._fire(playerPos, ctx); } }
      this._play(movingNow ? "Walk" : "Idle");
    } else {
      const t = this.patrol[this.wp];
      if (this._moveToward(t.x, t.z, dt)) this.wp = (this.wp + 1) % this.patrol.length;
      this.yaw = Math.atan2(t.x - this.pos.x, t.z - this.pos.z);
      this._play("Walk");
    }

    this.group.position.set(this.pos.x, this.baseY, this.pos.z);
    this.group.rotation.y = this.yaw;

    // occasional jump/duck dodge while engaged (infrequent)
    this.model.position.y = 0;
    if (engaged && !this.dodging) {
      this.dodgeCd -= dt;
      if (this.dodgeCd <= 0) {
        this.dodging = Math.random() < 0.5 ? "jump" : "duck";
        this.dodgeDur = this.dodging === "jump" ? 0.55 : 0.5;
        this.dodgeT = this.dodgeDur;
        this.dodgeCd = 2 + Math.random() * 2.5;
      }
    }
    if (this.dodging) {
      this.dodgeT -= dt;
      const s = Math.sin((1 - Math.max(0, this.dodgeT) / this.dodgeDur) * Math.PI);
      if (this.dodging === "jump") this.group.position.y = this.baseY + s * 0.7;
      else this.model.position.y = -s * 0.5;
      if (this.dodgeT <= 0) { this.dodging = null; this.group.position.y = this.baseY; this.model.position.y = 0; }
    }
  }

  // choose a peek position lateral to cover that has line of sight to the player
  _computePeek(playerPos) {
    this._toP.set(playerPos.x - this.coverPos.x, 0, playerPos.z - this.coverPos.z).normalize();
    const px = -this._toP.z, pz = this._toP.x; // perpendicular
    for (const side of [this.peekSide, -this.peekSide]) {
      const cx = this.coverPos.x + px * side * 1.6, cz = this.coverPos.z + pz * side * 1.6;
      if (!this._blocked(cx, cz) && !this.level.segmentBlocked(cx, cz, playerPos.x, playerPos.z)) {
        this.peekPos.set(cx, 0, cz); this.peekSide = side; return;
      }
    }
    this.peekPos.set(this.coverPos.x + this._toP.x * 0.9, 0, this.coverPos.z + this._toP.z * 0.9);
  }

  _fire(playerPos, ctx) {
    ctx.audio?.enemyShot?.();
    this._gunTip.getWorldPosition(this._muzzleWorld);
    ctx.vfx.muzzle(this._muzzleWorld); // soft glowing flash (no more white square)
    ctx._tmp = ctx._tmp || new THREE.Vector3();
    ctx._tmp.set(playerPos.x, playerPos.y - 0.1, playerPos.z);
    ctx.vfx.tracer(this._muzzleWorld, ctx._tmp);
    const d = Math.hypot(playerPos.x - this.pos.x, playerPos.z - this.pos.z);
    const chance = THREE.MathUtils.clamp(0.3 - d * 0.009, 0.05, 0.22); // less accurate
    if (Math.random() < chance) ctx.onPlayerHit(4 + Math.floor(Math.random() * 5)); // 4-8 dmg
  }
}
