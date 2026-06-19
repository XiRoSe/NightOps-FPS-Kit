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
    this.dodgeCd = 5 + Math.random() * 5;
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

    // rifle held forward at chest height (parented to the group — reliable size)
    const rifle = new THREE.Group();
    const body = box(0.08, 0.1, 0.66, COLORS.metalDark, { metalness: 0.5, roughness: 0.5 });
    rifle.add(body);
    const grip = box(0.07, 0.16, 0.08, COLORS.oliveDark, { flat: true }); grip.position.set(0, -0.12, 0.06); rifle.add(grip);
    this._gunTip = new THREE.Object3D();
    this._gunTip.position.set(0, 0, 0.4);
    rifle.add(this._gunTip);
    rifle.position.set(0.22, 1.12, 0.32);
    this.group.add(rifle);
    this._rifle = rifle;

    // muzzle flash on the gun tip
    this._flash = new THREE.Mesh(
      new THREE.PlaneGeometry(0.4, 0.4),
      new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    this._flash.visible = false;
    this._gunTip.add(this._flash);
    this._flashT = 0;

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
    if (this._flash) this._flash.visible = false;
  }

  canSee(playerPos) {
    const d = Math.hypot(playerPos.x - this.pos.x, playerPos.z - this.pos.z);
    if (d > 26) return false;
    return !this.level.segmentBlocked(this.pos.x, this.pos.z, playerPos.x, playerPos.z);
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
      this.group.position.y = -p * 0.5;
      if (this.deathT > 2.2) this.removable = true;
      return;
    }

    this.mixer.update(dt);

    const see = this.canSee(playerPos);
    if (see) this.alertT = 5; else this.alertT -= dt;
    const engaged = this.alertT > 0;

    let movingNow = false;
    if (engaged) {
      this.yaw = Math.atan2(playerPos.x - this.pos.x, playerPos.z - this.pos.z);
      this.peekTimer -= dt;
      if (this.peeking) {
        // popped out: advance to the peek spot beside cover, fire bursts while visible
        movingNow = !this._moveToward(this.peekPos.x, this.peekPos.z, dt);
        if (see) { this.fireCd -= dt; if (this.fireCd <= 0) { this.fireCd = 0.45; this._fire(playerPos, ctx); } }
        if (this.peekTimer <= 0) { this.peeking = false; this.peekTimer = 1.5 + Math.random() * 1.6; }
      } else {
        // hidden: pull back behind cover (occluded by the box), hold fire
        movingNow = !this._moveToward(this.coverPos.x, this.coverPos.z, dt);
        if (this.peekTimer <= 0) {
          this.peeking = true; this.peekTimer = 0.9 + Math.random() * 0.7; this.fireCd = 0.25;
          this._computePeek(playerPos);
        }
      }
      this._play(movingNow ? "Walk" : "Idle");
    } else {
      const t = this.patrol[this.wp];
      if (this._moveToward(t.x, t.z, dt)) this.wp = (this.wp + 1) % this.patrol.length;
      this.yaw = Math.atan2(t.x - this.pos.x, t.z - this.pos.z);
      this._play("Walk");
    }

    this.group.position.set(this.pos.x, 0, this.pos.z);
    this.group.rotation.y = this.yaw;

    // occasional jump/duck dodge while engaged (infrequent)
    this.model.position.y = 0;
    if (engaged && !this.dodging) {
      this.dodgeCd -= dt;
      if (this.dodgeCd <= 0) {
        this.dodging = Math.random() < 0.5 ? "jump" : "duck";
        this.dodgeDur = this.dodging === "jump" ? 0.55 : 0.5;
        this.dodgeT = this.dodgeDur;
        this.dodgeCd = 5 + Math.random() * 6;
      }
    }
    if (this.dodging) {
      this.dodgeT -= dt;
      const s = Math.sin((1 - Math.max(0, this.dodgeT) / this.dodgeDur) * Math.PI);
      if (this.dodging === "jump") this.group.position.y = s * 0.7;
      else this.model.position.y = -s * 0.5;
      if (this.dodgeT <= 0) { this.dodging = null; this.group.position.y = 0; this.model.position.y = 0; }
    }

    if (this._flashT > 0) { this._flashT -= dt; if (this._flashT <= 0) this._flash.visible = false; }
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
    this._flash.visible = true;
    this._flash.rotation.z = Math.random() * Math.PI;
    this._flash.scale.setScalar(0.8 + Math.random() * 0.5);
    this._flashT = 0.06;
    ctx.audio?.enemyShot?.();
    this._gunTip.getWorldPosition(this._muzzleWorld);
    ctx._tmp = ctx._tmp || new THREE.Vector3();
    ctx._tmp.set(playerPos.x, playerPos.y - 0.1, playerPos.z);
    ctx.vfx.tracer(this._muzzleWorld, ctx._tmp);
    const d = Math.hypot(playerPos.x - this.pos.x, playerPos.z - this.pos.z);
    const chance = THREE.MathUtils.clamp(0.3 - d * 0.009, 0.05, 0.22); // less accurate
    if (Math.random() < chance) ctx.onPlayerHit(4 + Math.floor(Math.random() * 5)); // 4-8 dmg
  }
}
