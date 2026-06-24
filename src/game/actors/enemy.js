import * as THREE from "three";
import { COLORS, box, noOutline } from "../../engine/primitives.js";
import { RiggedAsset } from "../../engine/assets.js";

// the rigged soldier model, loaded once and shared across all enemies
const SOLDIER = new RiggedAsset("/models/Soldier.glb", 1.8);
export function preloadEnemies() { return SOLDIER.preload(); }

// arm/hand/spine/leg bones the enemy poses each frame (the clips carry no weapon/aim)
const SOLDIER_BONES = {
  rArm: "mixamorigRightArm", rFore: "mixamorigRightForeArm",
  lArm: "mixamorigLeftArm", lFore: "mixamorigLeftForeArm",
  rHand: "mixamorigRightHand", lHand: "mixamorigLeftHand",
  spine: "mixamorigSpine", spine1: "mixamorigSpine1",
  lUpLeg: "mixamorigLeftUpLeg", rUpLeg: "mixamorigRightUpLeg",
  lLeg: "mixamorigLeftLeg", rLeg: "mixamorigRightLeg",
};

export class Enemy {
  constructor(scene, spawn, level) {
    this.scene = scene;
    this.level = level;
    this.baseY = spawn.y || 0; // raised for watchtower posts
    this._raised = (spawn.y || 0) > 0; // a deliberate tower post (stays stationary up high)
    this.pos = new THREE.Vector3(spawn.x, 0, spawn.z);
    this.patrol = spawn.patrol || [{ x: spawn.x, z: spawn.z }];
    this.wp = 0;
    this.yaw = Math.random() * Math.PI * 2;
    this.speed = spawn.speed || 2.4;  // per-spawn tuning (tougher/faster guards)
    this.hp = spawn.hp || 100;
    this.dead = false;
    this.counted = false;
    this.alertT = 0;
    this.fireCd = 0.7 + Math.random() * 0.8;
    this.burstLeft = 0;   // shots remaining in the current 5-round burst
    this.burstTimer = 0;
    this.deathT = 0;
    // cover behaviour: run to the nearest cover between us and the player, hide, peek to shoot
    this.cover = null;                 // { cx, cz, r, hx, hz } chosen cover object
    this.coverScanCd = 0;              // cooldown before re-scanning for better cover
    this.coverPos = this.pos.clone();  // hide spot (far side of cover from the player)
    this.peeking = false;
    this.peekTimer = 1.2 + Math.random() * 1.6;
    this.peekSide = Math.random() < 0.5 ? 1 : -1;
    this.peekPos = this.pos.clone();   // peek spot (lateral, has line of sight)
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
    // clone the shared rigged model (shares geometry/material — do NOT mutate materials)
    const inst = SOLDIER.make(SOLDIER_BONES);
    this.model = inst.model;
    this.bones = inst.bones;
    this.model.rotation.y = Math.PI; // model's front is -Z; face it along the group's +Z (toward target)
    this.model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = true; } });
    this.group.add(this.model);

    // animation mixer + clips
    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    for (const clip of inst.animations) this.actions[clip.name] = this.mixer.clipAction(clip);
    this._current = null;
    this._play(this.actions.Walk ? "Walk" : Object.keys(this.actions)[0]);

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
      this._gunFix = { p: [2.7, 6.3, 14.4], r: [-1.0, -0.2, -2.6], s: 102 }; // low-ready carry: grip seated, gun along the arm (no float)
      // temps for aiming the barrel at the player (world -> hand-local)
      this._gpos = new THREE.Vector3();
      this._lhpos = new THREE.Vector3();
      this._fwdZ = new THREE.Vector3(0, 0, 1);
      this._m4 = new THREE.Matrix4();
      this._wq = new THREE.Quaternion();
      this._hq = new THREE.Quaternion();
      this._aimUp = new THREE.Vector3(0, 1, 0);
      this._qFlipY = new THREE.Quaternion().setFromAxisAngle(this._aimUp, Math.PI);
      this.bones.rHand.add(rifle);
      this._applyGun(null, false);
    } else {
      rifle.position.set(0.16, 1.34, 0.34); this.group.add(rifle);
    }


    // invisible but raycastable hitbox
    this.hitbox = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.42, 1.1, 4, 8),
      noOutline(new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }))
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

  // flung by an explosion with a precomputed impulse (from the engine impact system):
  // ragdoll up + away, then tumble to the ground
  applyImpulse(impulse) {
    if (this.blasted) return;
    this.blasted = true;
    if (!this.dead) this._die();
    this._bv = impulse.clone();
    this._flyY = this.baseY + 0.2;
    this._airborne = true;
    this._spinAng = 0;
    this._spinRate = 4 + Math.random() * 4; // tumble speed
  }

  // shoved by a nearby blast but survived — slide away from the centre, briefly staggered
  applyKnockback(impulse) {
    if (!this._kb) this._kb = new THREE.Vector3();
    this._kb.set(impulse.x, 0, impulse.z);
    this.alertT = 8; // it definitely noticed
  }

  canSee(playerPos) {
    const d = Math.hypot(playerPos.x - this.pos.x, playerPos.z - this.pos.z);
    // elevated watchtower guards look down OVER low cover, but tall walls/buildings still block them
    if (this.baseY > 0) return d < 50 && !this.level.segmentBlocked(this.pos.x, this.pos.z, playerPos.x, playerPos.z, 2.8);
    if (d > 26) return false;
    return !this.level.segmentBlocked(this.pos.x, this.pos.z, playerPos.x, playerPos.z);
  }

  // Shooting aim: raise the right arm to the shoulder + left hand forward, and orient the rifle so
  // the barrel points forward (precomputed for THIS arm pose). The rifle is rigid in the hand, so
  // hand + gun point the SAME way (at the player, since the body faces them) — no mismatch.
  // Shooting aim: raise the right arm to the shoulder (+ left hand up), rifle barrel forward on target.
  _aimArm() {
    const b = this.bones; if (!b.rArm || !this._rifle) return;
    b.rArm.rotation.set(1.05, 0.0, 0.45);  if (b.rFore) b.rFore.rotation.set(0, 0, -1.15);
    b.lArm.rotation.set(1.25, -0.2, 0.5);  if (b.lFore) b.lFore.rotation.set(0, 0.25, 1.35);
    this._rifle.position.set(3.5, 4, 11.5);     // aim gun offset
    this._rifle.rotation.set(-1.1, 0.1, -1.4);  // barrel forward for this raised hand
  }

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
  _moveToward(tx, tz, dt, speed = this.speed) {
    const dx = tx - this.pos.x, dz = tz - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) return true;
    const step = Math.min(speed * dt, d);
    const nx = this.pos.x + (dx / d) * step, nz = this.pos.z + (dz / d) * step;
    if (!this._blocked(nx, this.pos.z)) this.pos.x = nx;
    if (!this._blocked(this.pos.x, nz)) this.pos.z = nz;
    return d < 0.3;
  }

  // move toward a target, but if we jam against an obstacle, detour sideways to get around it
  _advance(tx, tz, dt, speed = this.speed) {
    if (this._detourT > 0) {
      this._detourT -= dt;
      let dx = tx - this.pos.x, dz = tz - this.pos.z; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
      const sx = -dz * this._detourSide, sz = dx * this._detourSide; // perpendicular skirt
      const step = speed * dt;
      const nx = this.pos.x + sx * step, nz = this.pos.z + sz * step;
      let moved = false;
      if (!this._blocked(nx, this.pos.z)) { this.pos.x = nx; moved = true; }
      if (!this._blocked(this.pos.x, nz)) { this.pos.z = nz; moved = true; }
      if (!moved) this._detourSide = -this._detourSide; // dead end -> try the other way
      return false;
    }
    const px = this.pos.x, pz = this.pos.z;
    const reached = this._moveToward(tx, tz, dt, speed);
    const moved = Math.hypot(this.pos.x - px, this.pos.z - pz);
    if (!reached && moved < speed * dt * 0.35) {
      this._stuckT = (this._stuckT || 0) + dt;
      if (this._stuckT > 0.25) { this._detourT = 0.45 + Math.random() * 0.35; this._detourSide = this._detourSide || (Math.random() < 0.5 ? 1 : -1); this._stuckT = 0; }
    } else { this._stuckT = 0; }
    return reached;
  }

  update(dt, playerPos, ctx) {
    // terrain-follow on sculpted levels (island): keep the soldier seated on the relief under it (not tower posts)
    if (this.level.terrainHeight && !this.blasted && !this._raised) this.baseY = this.level.terrainHeight(this.pos.x, this.pos.z);
    if (this.dead) {
      this.deathT += dt;
      if (this.blasted) {
        // launched by an explosion: ballistic arc + tumble. Tumble pivots around the body CENTRE
        // (model shifted down, group raised by the same amount) so it never sweeps underground.
        if (this._airborne) {
          this._bv.y -= 18 * dt; // gravity
          this.pos.x += this._bv.x * dt; this.pos.z += this._bv.z * dt;
          this._flyY += this._bv.y * dt;                        // _flyY = feet height (>= ground)
          this._spinAng += dt * this._spinRate;
          this.model.position.y = -0.9;                         // pivot around mid-body
          this.group.position.set(this.pos.x, Math.max(this.baseY, this._flyY) + 0.9, this.pos.z);
          this.group.rotation.set(this._spinAng, this.yaw, 0); // forward flip, no sideways roll
          if (this._flyY <= this.baseY) { this._airborne = false; this._bv.set(0, 0, 0); }
        } else {
          // grounded — settle into a clean flat prone pose (no sideways flopping)
          if (!this._settled) {
            // normalize the tumbled pitch so it eases to flat the SHORT way, and kill any roll
            let rx = this.group.rotation.x % (Math.PI * 2);
            if (rx > Math.PI) rx -= Math.PI * 2; else if (rx < -Math.PI) rx += Math.PI * 2;
            this.group.rotation.set(rx, this.yaw, 0);
            this.model.position.y = 0;
            this.group.position.set(this.pos.x, this.baseY, this.pos.z);
            this._settled = true;
          }
          const k = Math.min(1, dt * 10);
          this.group.rotation.x += (-Math.PI / 2 - this.group.rotation.x) * k; // ease flat, lying down
        }
      } else {
        const p = Math.min(this.deathT / 0.7, 1);
        this.group.rotation.x = -p * Math.PI * 0.48;
        this.group.position.y = this.baseY * (1 - p) - p * 0.5; // tumble down (off a tower if raised)
      }
      if (this.deathT > 2.6) this.removable = true;
      return;
    }

    // pitch the aim up/down toward the player (so tower guards shoot down at you)
    const dxz = Math.hypot(playerPos.x - this.pos.x, playerPos.z - this.pos.z);
    this._aimPitch = Math.max(-1.2, Math.min(1.2, Math.atan2((this.baseY + 1.3) - playerPos.y, Math.max(0.6, dxz))));

    this.mixer.update(dt);

    const see = this.canSee(playerPos);
    if (see) this.alertT = 8; else this.alertT -= dt; // stay engaged through hide cycles
    const engaged = this.alertT > 0;
    this._applyGun();   // rifle held in the right hand via the natural animation (clean, reliable)

    // fire in bursts of 5 shots, with 2-5s between bursts; raise into the aim ~1s before + during a burst
    this._aimHold = Math.max(0, (this._aimHold || 0) - dt);
    let aiming = this._aimHold > 0;
    let fireNow = false;
    if (see) {
      if (this.burstLeft > 0) {
        aiming = true;
        this.burstTimer -= dt;
        if (this.burstTimer <= 0) {
          fireNow = true;
          this.burstLeft--;
          this.burstTimer = 0.12;          // ~0.12s between shots in a burst
          this._aimHold = 0.4;
          if (this.burstLeft === 0) this.fireCd = 2 + Math.random() * 3; // 2-5s until the next burst
        }
      } else {
        this.fireCd -= dt;
        if (this.fireCd <= 1.0) aiming = true; // shoulder the rifle just before the burst
        if (this.fireCd <= 0) { this.burstLeft = 5; this.burstTimer = 0; aiming = true; }
      }
    }
    // apply the aim pose FIRST so the shot leaves the raised barrel, not the hip-carry tip
    if (aiming) this._aimArm();
    if (fireNow) { this.model.updateWorldMatrix(true, true); this._fire(playerPos, ctx); }

    // watchtower guard: never moves — just tracks the player and fires from the post
    if (this._raised) { // deliberate watchtower post — hold position up high
      this.yaw = Math.atan2(playerPos.x - this.pos.x, playerPos.z - this.pos.z);
      this._play("Idle");
      this.group.position.set(this.pos.x, this.baseY, this.pos.z);
      this.group.rotation.y = this.yaw;
      return;
    }

    let movingNow = false;
    if (engaged) {
      // always face the player; run to cover, hide, and pop out to shoot
      this.yaw = Math.atan2(playerPos.x - this.pos.x, playerPos.z - this.pos.z);
      const dist = Math.hypot(playerPos.x - this.pos.x, playerPos.z - this.pos.z);
      const runSp = this.speed * 1.7; // sprint to cover
      this.coverScanCd -= dt;
      // (re)acquire cover while hidden (don't change cover mid-peek)
      if (this.coverScanCd <= 0 && !this.peeking) { this._pickCover(playerPos); this.coverScanCd = 2.5 + Math.random() * 2; }

      if (this.cover) {
        this.peekTimer -= dt;
        if (this.peeking) {
          movingNow = !this._advance(this.peekPos.x, this.peekPos.z, dt, runSp);
          // stay exposed until the burst finishes, then duck back behind cover
          if (this.peekTimer <= 0 && this.burstLeft === 0) { this.peeking = false; this.peekTimer = 1.4 + Math.random() * 1.6; }
        } else {
          movingNow = !this._advance(this.coverPos.x, this.coverPos.z, dt, runSp);
          if (this.peekTimer <= 0) { this.peeking = true; this.peekTimer = 1.0 + Math.random() * 0.8; this._computePeek(playerPos); }
        }
      } else if (dist > 6) {
        movingNow = !this._advance(playerPos.x, playerPos.z, dt, runSp); // no cover -> advance
      }
      this._play(movingNow ? (this.actions.Run ? "Run" : "Walk") : "Idle");
    } else {
      this.cover = null; this.peeking = false;
      // roam around home until the player is spotted
      if (!this._home) this._home = { x: this.pos.x, z: this.pos.z };
      this._roamCd = (this._roamCd || 0) - dt;
      if (!this._roam || this._roamCd <= 0 || Math.hypot(this._roam.x - this.pos.x, this._roam.z - this.pos.z) < 2) {
        const a = Math.random() * Math.PI * 2, r = 6 + Math.random() * 20;
        this._roam = { x: this._home.x + Math.cos(a) * r, z: this._home.z + Math.sin(a) * r };
        this._roamCd = 3 + Math.random() * 4;
      }
      const px = this.pos.x, pz = this.pos.z;
      movingNow = !this._moveToward(this._roam.x, this._roam.z, dt, this.speed * 0.6);
      if (Math.hypot(this.pos.x - px, this.pos.z - pz) < this.speed * 0.6 * dt * 0.3) { if ((this._stuckT = (this._stuckT || 0) + dt) > 2) { this._roam = null; this._stuckT = 0; } } else this._stuckT = 0; // stuck >2s → new spot
      this.yaw = Math.atan2(this._roam.x - this.pos.x, this._roam.z - this.pos.z);
      this._play(movingNow ? (this.actions.Walk ? "Walk" : "Run") : "Idle");
    }

    // explosion knockback while still alive — shoved away from the blast, sliding to a stop
    if (this._kb && this._kb.lengthSq() > 0.02) {
      const nx = this.pos.x + this._kb.x * dt, nz = this.pos.z + this._kb.z * dt;
      if (!this._blocked(nx, this.pos.z)) this.pos.x = nx;
      if (!this._blocked(this.pos.x, nz)) this.pos.z = nz;
      this._kb.multiplyScalar(Math.pow(0.015, dt)); // quick friction
    }

    this.group.position.set(this.pos.x, this.baseY, this.pos.z);
    this.group.rotation.y = this.yaw;

    // occasional jump dodge while exposed (peeking, or out in the open with no cover)
    if (engaged && (this.peeking || !this.cover) && !this.dodging) {
      this.dodgeCd -= dt;
      if (this.dodgeCd <= 0) {
        this.dodging = "jump"; // crouch removed — only the jump dodge
        this.dodgeDur = 0.55;
        this.dodgeT = this.dodgeDur;
        this.dodgeCd = 2 + Math.random() * 2.5;
      }
    }
    if (this.dodging) {
      this.dodgeT -= dt;
      const s = Math.sin((1 - Math.max(0, this.dodgeT) / this.dodgeDur) * Math.PI);
      this.group.position.y = this.baseY + s * 0.7; // hop up (jump dodge only)
      if (this.dodgeT <= 0) { this.dodging = null; this.group.position.y = this.baseY; }
    }
  }

  // pick the nearest cover object roughly between us and the player, and a hide spot behind it
  _pickCover(playerPos) {
    const ex = this.pos.x, ez = this.pos.z, px = playerPos.x, pz = playerPos.z;
    let dx = px - ex, dz = pz - ez; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    let best = null, bestScore = Infinity;
    for (const c of this.level.colliders) {
      if (c.top < 0.9) continue;                          // too low to hide behind
      const cx = (c.minX + c.maxX) / 2, cz = (c.minZ + c.maxZ) / 2;
      const r = Math.max((c.maxX - c.minX) / 2, (c.maxZ - c.minZ) / 2) + 0.5;
      if (r > 6) continue;                                // skip giant walls/buildings as primary cover
      const tx = cx - ex, tz = cz - ez;
      const t = tx * dx + tz * dz;                        // projection along enemy->player
      if (t < 1 || t > L + 3) continue;                   // must be ahead, between us and the player
      if (Math.abs(tx * -dz + tz * dx) > r + 3) continue; // roughly on the path
      const distToEnemy = Math.hypot(tx, tz);
      if (distToEnemy > 20) continue;
      const cpl = Math.hypot(cx - px, cz - pz) || 1;       // hide spot on the far side from the player
      const hx = cx + (cx - px) / cpl * (r + 0.5), hz = cz + (cz - pz) / cpl * (r + 0.5);
      if (this._blocked(hx, hz)) continue;
      const score = distToEnemy + Math.abs(tx * -dz + tz * dx) * 0.5; // near + on-path
      if (score < bestScore) { bestScore = score; best = { cx, cz, r, hx, hz }; }
    }
    if (best) {
      this.cover = best;
      this.coverPos.set(best.hx, 0, best.hz);
      this.peeking = false; this.peekTimer = 0.5 + Math.random() * 0.6;
    } else {
      this.cover = null;
    }
  }

  // choose a peek position lateral to the cover that has line of sight to the player
  _computePeek(playerPos) {
    if (!this.cover) return;
    const { cx, cz, r } = this.cover;
    this._toP.set(playerPos.x - cx, 0, playerPos.z - cz).normalize();
    const px = -this._toP.z, pz = this._toP.x; // perpendicular
    for (const side of [this.peekSide, -this.peekSide]) {
      const qx = cx + px * side * (r + 0.6), qz = cz + pz * side * (r + 0.6);
      if (!this._blocked(qx, qz) && !this.level.segmentBlocked(qx, qz, playerPos.x, playerPos.z)) {
        this.peekPos.set(qx, 0, qz); this.peekSide = side; return;
      }
    }
    this.peekPos.set(cx + this._toP.x * (r + 0.4), 0, cz + this._toP.z * (r + 0.4));
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
