import * as THREE from "three";
import { CREATURES } from "./creature-assets.js";

// An animated creature that charges the player and bites on contact (Quaternius raptor/spider/trex).
// kind: "monster"|"raptor" -> velociraptor, "spider" -> spider, "trex" -> a big mini-boss.
// Drop-in compatible with Combat (pos, hp, dead, counted, removable, hitbox, takeDamage, update).
export class Monster {
  constructor(scene, spawn, level) {
    this.scene = scene; this.level = level;
    this.kind = spawn.kind === "spider" ? "spider" : spawn.kind === "trex" ? "trex" : "raptor";
    this.pos = new THREE.Vector3(spawn.x, 0, spawn.z);
    this.hp = spawn.hp || (this.kind === "trex" ? 420 : this.kind === "spider" ? 90 : 70);
    this.speed = spawn.speed || (this.kind === "trex" ? 2.6 : this.kind === "spider" ? 3.6 : 4.6);
    this.melee = this.kind === "trex" ? 24 : this.kind === "spider" ? 9 : 11;
    this.reach = this.kind === "trex" ? 5.0 : 2.6;
    this.dead = false; this.counted = false; this.removable = false;
    this.aggro = false; this.aggroRange = spawn.aggro || 24; // idle until the player gets close
    this.yaw = 0; this._atkCd = 0; this._deathT = 0; this._cur = null; this._curAction = null;

    this.group = new THREE.Group(); this.group.position.copy(this.pos); this.scene.add(this.group);
    const inst = CREATURES[this.kind].make();
    if (inst) {
      this.model = inst.model;
      const tint = new THREE.Color().setHSL(0.07 + Math.random() * 0.16, 0.45, 0.42 + Math.random() * 0.16); // earthy per-instance variation
      const mix = 0.22 + Math.random() * 0.28;
      this.model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; o.material = o.material.clone(); o.material.color.lerp(tint, mix); } });
      this.group.add(this.model);
      this.mixer = new THREE.AnimationMixer(this.model);
      this._actions = {}; for (const c of inst.animations) this._actions[c.name] = this.mixer.clipAction(c);
      this._play("idle");
    }
    const big = this.kind === "trex";
    const hw = big ? 3 : this.kind === "spider" ? 3 : 1.6, hh = big ? 6 : this.kind === "spider" ? 1.6 : 2.6;
    const hbMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
    hbMat.userData.outlineParameters = { visible: false }; // no ink outline on the invisible hitbox
    this.hitbox = new THREE.Mesh(new THREE.BoxGeometry(hw, hh, hw), hbMat);
    this.hitbox.position.y = hh / 2; this.hitbox.userData.enemy = this; this.group.add(this.hitbox);
  }

  // crossfade to the first clip whose name contains `key`
  _play(key, fade = 0.2, once = false) {
    if (!this._actions) return;
    const name = Object.keys(this._actions).find((n) => n.toLowerCase().includes(key));
    if (!name || name === this._cur) return;
    const next = this._actions[name];
    if (once) { next.setLoop(THREE.LoopOnce, 1); next.clampWhenFinished = true; } else next.setLoop(THREE.LoopRepeat, Infinity);
    if (this._curAction) this._curAction.fadeOut(fade);
    next.reset().fadeIn(fade).play();
    this._cur = name; this._curAction = next;
  }

  takeDamage(dmg) { if (this.dead) return; this.aggro = true; this.hp -= dmg; if (this.hp <= 0) this._die(); } // getting hit makes it charge
  _die() { this.dead = true; this.hitbox.userData.enemy = null; this.hitbox.visible = false; this._deathT = 2.0; this._play("death", 0.12, true); }

  update(dt, playerPos, ctx) {
    this.mixer?.update(dt);
    const groundY = this.level.terrainHeight ? this.level.terrainHeight(this.pos.x, this.pos.z) : 0;
    if (this.dead) { this.group.position.y = groundY; if ((this._deathT -= dt) <= 0) this.removable = true; return; }
    const dx = playerPos.x - this.pos.x, dz = playerPos.z - this.pos.z, d = Math.hypot(dx, dz) || 1;
    if (!this.aggro) { // roam until the player comes near, then lock on
      if (d <= this.aggroRange) this.aggro = true;
      else { this._wander(dt); return; }
    }
    this.yaw = Math.atan2(dx, dz); this.group.rotation.y = this.yaw;
    if (d > this.reach) { // charge
      const step = this.speed * dt;
      const nx = this.pos.x + (dx / d) * step, nz = this.pos.z + (dz / d) * step;
      if (!this._blocked(nx, this.pos.z)) this.pos.x = nx;
      if (!this._blocked(this.pos.x, nz)) this.pos.z = nz;
      this._play("run");
    } else { // bite on a cooldown
      this._play("attack", 0.12);
      if ((this._atkCd -= dt) <= 0) { this._atkCd = 1.0; ctx.onPlayerHit?.(this.melee + Math.floor(Math.random() * 5)); ctx.audio?.creature?.(); }
    }
    this.group.position.set(this.pos.x, groundY, this.pos.z);
  }

  // idle roaming: drift slowly toward random nearby points (trex roams slower than raptors via this.speed)
  _wander(dt) {
    if (!this._home) this._home = this.pos.clone();
    if (!this._roam || (this._roamCd -= dt) <= 0 || Math.hypot(this._roam.x - this.pos.x, this._roam.z - this.pos.z) < 2) {
      const a = Math.random() * Math.PI * 2, r = 6 + Math.random() * 20;
      this._roam = { x: this._home.x + Math.cos(a) * r, z: this._home.z + Math.sin(a) * r };
      this._roamCd = 3 + Math.random() * 4;
    }
    const wx = this._roam.x - this.pos.x, wz = this._roam.z - this.pos.z, wd = Math.hypot(wx, wz) || 1;
    const step = this.speed * 0.4 * dt;
    const px = this.pos.x, pz = this.pos.z;
    const nx = this.pos.x + (wx / wd) * step, nz = this.pos.z + (wz / wd) * step;
    if (!this._blocked(nx, this.pos.z)) this.pos.x = nx;
    if (!this._blocked(this.pos.x, nz)) this.pos.z = nz;
    if (Math.hypot(this.pos.x - px, this.pos.z - pz) < step * 0.3) { if ((this._stuckT = (this._stuckT || 0) + dt) > 2) { this._roam = null; this._stuckT = 0; } } else this._stuckT = 0; // stuck >2s → new destination
    this.yaw = Math.atan2(wx, wz); this.group.rotation.y = this.yaw;
    const gy = this.level.terrainHeight ? this.level.terrainHeight(this.pos.x, this.pos.z) : 0;
    this.group.position.set(this.pos.x, gy, this.pos.z);
    this._play("walk");
  }

  _blocked(x, z) {
    for (const c of this.level.colliders) {
      if (c.top < 0.6) continue;
      if (x > c.minX - 0.5 && x < c.maxX + 0.5 && z > c.minZ - 0.5 && z < c.maxZ + 0.5) return true;
    }
    return false;
  }
}
