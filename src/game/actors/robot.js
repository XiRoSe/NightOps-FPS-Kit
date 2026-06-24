import * as THREE from "three";
import { CREATURES } from "./creature-assets.js";

// Ranged robot enemies (Quaternius cyberpunk + mech). One actor, configured per spawn.kind:
//   robot  — giant mech (heavy, slow)        sentry — walking gun-bot (medium, agile)
//   heavy  — large gun-bot (tanky)           drone  — hovering gun-drone (fast, flies)
// Drop-in compatible with Combat (pos, hp, dead, counted, removable, hitbox, takeDamage, update).
const CFG = {
  robot:  { asset: "mech",   hp: 600, hbW: 3.2, hbH: 7.2, gun: [0, 5.2, 2.4], fly: 0, speed: 1.6, range: 16, dmg: [10, 18], rate: 1.8, boom: 1.9 },
  sentry: { asset: "sentry", hp: 130, hbW: 1.5, hbH: 2.6, gun: [0, 1.7, 0.9], fly: 0, speed: 3.4, range: 24, dmg: [6, 11],  rate: 1.3, boom: 0.8 },
  heavy:  { asset: "heavy",  hp: 320, hbW: 2.4, hbH: 3.8, gun: [0, 2.4, 1.3], fly: 0, speed: 1.9, range: 22, dmg: [11, 19], rate: 1.6, boom: 1.3 },
  drone:  { asset: "drone",  hp: 80,  hbW: 1.6, hbH: 1.8, gun: [0, 0.4, 0.9], fly: 8, speed: 4.6, range: 28, dmg: [5, 9],   rate: 1.1, boom: 0.8 },
};

export class Robot {
  constructor(scene, spawn, level) {
    this.scene = scene; this.level = level;
    this.kind = CFG[spawn.kind] ? spawn.kind : "robot";
    const cfg = CFG[this.kind]; this.cfg = cfg;
    this.pos = new THREE.Vector3(spawn.x, 0, spawn.z);
    this.hp = spawn.hp || cfg.hp;
    this.speed = spawn.speed || cfg.speed;
    this.fly = cfg.fly;
    this.dead = false; this.counted = false; this.removable = false;
    this.aggro = false; this.aggroRange = spawn.aggro || cfg.range + 24; // idle until the player approaches
    this._laserColor = 0xff2a1a; // all robots fire red laser beams
    this.yaw = 0; this._fireCd = 1.5 + Math.random(); this._deathT = 0; this._needBoom = false; this._cur = null; this._curAction = null; this._fallV = 0;
    this._muzzle = new THREE.Vector3(); this._tmp = new THREE.Vector3();

    this.group = new THREE.Group(); this.group.position.copy(this.pos); this.scene.add(this.group);
    const inst = CREATURES[cfg.asset].make();
    if (inst) {
      this.model = inst.model;
      this.model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
      this.group.add(this.model);
      this.mixer = new THREE.AnimationMixer(this.model);
      this._actions = {}; for (const c of inst.animations) this._actions[c.name] = this.mixer.clipAction(c);
      this._play("idle");
    }
    this._gunTip = new THREE.Object3D(); this._gunTip.position.set(cfg.gun[0], cfg.gun[1], cfg.gun[2]); this.group.add(this._gunTip);
    const hbMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
    hbMat.userData.outlineParameters = { visible: false };
    this.hitbox = new THREE.Mesh(new THREE.BoxGeometry(cfg.hbW, cfg.hbH, cfg.hbW), hbMat);
    this.hitbox.position.y = cfg.hbH / 2; this.hitbox.userData.enemy = this; this.group.add(this.hitbox);
    this.boss = !!spawn.boss;
    this._bossCd = 4 + Math.random() * 2; this._charging = false; this._charge = 0; // chest-laser cycle
    // the bipedal mech ("robot") form is a boss-class GIANT (chest laser + big)
    const sc = spawn.scale || (this.kind === "robot" ? 2.0 : 1); this._scale = sc;
    this._hasBeam = this.boss || this.kind === "robot"; // all mechs charge the chest laser
    this._chestY = 5.5 * sc; // high up on the chest of the giant
    if (sc !== 1) { this.model && this.model.scale.multiplyScalar(sc); this.hitbox.scale.setScalar(sc); this.hitbox.position.y = cfg.hbH / 2 * sc; this.cfg = { ...cfg, boom: cfg.boom * sc }; }
  }

  // idle roaming: drift slowly toward random nearby points around home (speed scales with size via cfg.speed)
  _wander(dt) {
    if (!this._home) this._home = this.pos.clone();
    if (!this._roam || (this._roamCd -= dt) <= 0 || Math.hypot(this._roam.x - this.pos.x, this._roam.z - this.pos.z) < 2) {
      const a = Math.random() * Math.PI * 2, r = 6 + Math.random() * 20;
      this._roam = { x: this._home.x + Math.cos(a) * r, z: this._home.z + Math.sin(a) * r };
      this._roamCd = 3 + Math.random() * 4;
    }
    const wx = this._roam.x - this.pos.x, wz = this._roam.z - this.pos.z, wd = Math.hypot(wx, wz) || 1;
    const step = this.speed * 0.45 * dt;
    const px = this.pos.x, pz = this.pos.z;
    const nx = this.pos.x + (wx / wd) * step, nz = this.pos.z + (wz / wd) * step;
    if (!this._blocked(nx, this.pos.z)) this.pos.x = nx;
    if (!this._blocked(this.pos.x, nz)) this.pos.z = nz;
    if (Math.hypot(this.pos.x - px, this.pos.z - pz) < step * 0.3) { if ((this._stuckT = (this._stuckT || 0) + dt) > 2) { this._roam = null; this._stuckT = 0; } } else this._stuckT = 0; // stuck >2s → new destination
    this.yaw = Math.atan2(wx, wz); this.group.rotation.y = this.yaw;
    const gy = this.level.terrainHeight ? this.level.terrainHeight(this.pos.x, this.pos.z) : 0;
    this.group.position.set(this.pos.x, gy + (this.fly || 0), this.pos.z);
    if (this.mixer) this.mixer.timeScale = Math.max(0.4, Math.min(1.2, (this.speed * 0.45) / (3.5 * this._scale))); // wander legs match slow drift
    this._play(this.fly || this.speed > 3 ? "run" : "walk");
  }

  // THE GUARDIAN's signature: charge a glowing orb at the chest, then unleash a giant laser beam + booms
  _bossBeam(dt, playerPos, ctx) {
    const chest = this._tmp.set(this.pos.x, this.group.position.y + this._chestY, this.pos.z);
    if (this._charging) {
      this._charge += dt;
      if (ctx.vfx && ctx.vfx._flash) { const sz = 2.4 + this._charge * 8; ctx.vfx._flash(chest, sz, 0xff1408); ctx.vfx._flash(chest, sz * 0.5, 0xff6a40); } // big growing RED charge orb
      if (this._charge >= 1.3) {
        this._charging = false; this._bossCd = 5 + Math.random() * 2.5;
        // aim at the GROUND beneath the player so the beam is a visible downward diagonal ray (not head-on)
        const groundY = this.level.terrainHeight ? this.level.terrainHeight(playerPos.x, playerPos.z) : playerPos.y - 1.6;
        const from = chest.clone(), to = new THREE.Vector3(playerPos.x, groundY + 0.2, playerPos.z);
        const beamEnd = to.clone().add(to.clone().sub(from).normalize().multiplyScalar(8)); // overshoot past the impact
        ctx.vfx && ctx.vfx.bossBeam && ctx.vfx.bossBeam(from, beamEnd);
        for (let i = 1; i <= 6; i++) ctx.vfx && ctx.vfx.explosion && ctx.vfx.explosion(from.clone().lerp(to, i / 6), 1.6 + i * 0.25); // bigger booms toward the impact
        ctx.vfx && ctx.vfx._shockwave && ctx.vfx._shockwave(to);
        ctx.audio && ctx.audio.beam && ctx.audio.beam(0.95); ctx.audio && ctx.audio.explosion && ctx.audio.explosion(); // giant's beam (full) + boom
        ctx.onBossBeam && ctx.onBossBeam();
        ctx.onPlayerHit && ctx.onPlayerHit(17 + Math.floor(Math.random() * 11)); // halved beam damage
      }
    } else if ((this._bossCd -= dt) <= 0) {
      this._charging = true; this._charge = 0; ctx.audio && ctx.audio.zap && ctx.audio.zap(); // charge whine
    }
  }

  // crossfade to a clip; matches "Armature|Run" by suffix, else any clip containing the key
  _play(key, fade = 0.25, once = false) {
    if (!this._actions) return;
    const keys = Object.keys(this._actions);
    const name = keys.find((n) => n.toLowerCase().endsWith("|" + key)) || keys.find((n) => n.toLowerCase().includes(key));
    if (!name || name === this._cur) return;
    const next = this._actions[name];
    if (once) { next.setLoop(THREE.LoopOnce, 1); next.clampWhenFinished = true; } else next.setLoop(THREE.LoopRepeat, Infinity);
    if (this._curAction) this._curAction.fadeOut(fade);
    next.reset().fadeIn(fade).play();
    this._cur = name; this._curAction = next;
  }

  takeDamage(dmg) { if (this.dead) return; this.aggro = true; this.hp -= dmg; if (this.hp <= 0) this._die(); } // getting shot wakes it up
  _die() { this.dead = true; if (this.mixer) this.mixer.timeScale = 1; this.hitbox.userData.enemy = null; this.hitbox.visible = false; this._deathT = 2.0; this._needBoom = true; this._play("dea", 0.12, true); }

  update(dt, playerPos, ctx) {
    this.mixer?.update(dt);
    const groundY = this.level.terrainHeight ? this.level.terrainHeight(this.pos.x, this.pos.z) : 0;
    if (this.dead) {
      if (this._needBoom) { this._needBoom = false; ctx.vfx?.explosion?.(this._tmp.copy(this.group.position).setY(this.group.position.y + this.cfg.hbH * 0.4), this.cfg.boom); ctx.audio?.explosion?.(); }
      if (this.fly) { this._fallV += 22 * dt; this.group.position.y = Math.max(groundY, this.group.position.y - this._fallV * dt); } // drones crash down
      else this.group.position.y = groundY;
      if ((this._deathT -= dt) <= 0) this.removable = true;
      return;
    }
    const flyY = groundY + this.fly;
    const dx = playerPos.x - this.pos.x, dz = playerPos.z - this.pos.z, d = Math.hypot(dx, dz) || 1;
    if (!this.aggro) { // roam the island until the player approaches
      if (d <= this.aggroRange) this.aggro = true;
      else { this._wander(dt); return; }
    }
    this.yaw = Math.atan2(dx, dz); this.group.rotation.y = this.yaw;
    if (d > this.cfg.range) { // close in
      const step = this.speed * dt;
      const nx = this.pos.x + (dx / d) * step, nz = this.pos.z + (dz / d) * step;
      if (!this._blocked(nx, this.pos.z)) this.pos.x = nx;
      if (!this._blocked(this.pos.x, nz)) this.pos.z = nz;
      if (this.mixer) this.mixer.timeScale = Math.max(0.45, Math.min(1.3, this.speed / (3.5 * this._scale))); // legs match ground speed/size
      this._play(this.fly || this.speed > 3 ? "run" : "walk");
    } else { if (this.mixer) this.mixer.timeScale = 1; this._play("idle"); }
    const bob = this.fly ? Math.sin(performance.now() * 0.003 + this.pos.x) * 0.4 : 0;
    this.group.position.set(this.pos.x, flyY + bob, this.pos.z);
    if (this._hasBeam && d < 110 && !ctx.airborne) { this._bossBeam(dt, playerPos, ctx); } // giant chest laser (boss + all mechs) — not while you fly high
    if ((this._fireCd -= dt) <= 0 && d < this.cfg.range + 8 && !ctx.airborne && !this.level.segmentBlocked(this.pos.x, this.pos.z, playerPos.x, playerPos.z, 1.8)) {
      this._fireCd = this.cfg.rate + Math.random() * 0.8;
      this._play("shoot", 0.08, true);
      this._gunTip.getWorldPosition(this._muzzle);
      ctx.vfx?.muzzle?.(this._muzzle);
      (ctx.vfx?.enemyLaser ? ctx.vfx.enemyLaser(this._muzzle, this._tmp.set(playerPos.x, playerPos.y - 0.1, playerPos.z), this._laserColor) : ctx.vfx?.tracer?.(this._muzzle, this._tmp.set(playerPos.x, playerPos.y - 0.1, playerPos.z)));
      ctx.audio?.beam?.(0.5); // small robots: sci-fi laser BEAM at ~70% of the giant's volume
      if (Math.random() < 0.5) ctx.onPlayerHit?.(this.cfg.dmg[0] + Math.floor(Math.random() * (this.cfg.dmg[1] - this.cfg.dmg[0])));
    }
  }

  _blocked(x, z) {
    if (this.fly) return false; // drones fly over obstacles
    for (const c of this.level.colliders) {
      if (c.top < 0.6) continue;
      if (x > c.minX - 1 && x < c.maxX + 1 && z > c.minZ - 1 && z < c.maxZ + 1) return true;
    }
    return false;
  }
}
