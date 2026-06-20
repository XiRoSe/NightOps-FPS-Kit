import * as THREE from "three";
import { Enemy } from "./enemy.js";

export class Combat {
  constructor(scene, camera, level, weapon, vfx, audio, hooks) {
    this.scene = scene;
    this.camera = camera;
    this.level = level;
    this.weapon = weapon;
    this.vfx = vfx;
    this.audio = audio;
    this.hooks = hooks; // { onPlayerHit, onKill, onHitmarker }
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 200;

    this.enemies = level.enemySpawns.map((s) => new Enemy(scene, s, level));
    this.killCount = 0;
    this.totalEnemies = this.enemies.length;

    this._dir = new THREE.Vector3();
    this._origin = new THREE.Vector3();
    this._far = new THREE.Vector3();
    this._targets = [];
    this.extraHittables = []; // hitboxes outside the enemy list (e.g. helicopter)
  }

  get enemiesLeft() {
    return this.enemies.filter((e) => !e.dead).length;
  }

  tryShoot(t) {
    if (!this.weapon.canFire(t)) return;
    this.weapon.fire(t);

    // ray from screen center with a little spread
    this.camera.getWorldDirection(this._dir);
    const s = this.weapon.spread;
    this._dir.x += (Math.random() - 0.5) * s;
    this._dir.y += (Math.random() - 0.5) * s;
    this._dir.z += (Math.random() - 0.5) * s;
    this._dir.normalize();
    this._origin.copy(this.camera.position);
    this.raycaster.set(this._origin, this._dir);

    // rebuild target list in place (no per-shot array growth churn)
    this._targets.length = 0;
    for (const m of this.level.solidMeshes) this._targets.push(m);
    for (const e of this.enemies) if (!e.dead) this._targets.push(e.hitbox);
    for (const ht of this.extraHittables) this._targets.push(ht); // e.g. helicopter
    const hits = this.raycaster.intersectObjects(this._targets, true);

    const muzzle = this.weapon.muzzleWorld; // reused vector, copied immediately by tracer
    if (hits.length) {
      const h = hits[0];
      let obj = h.object, enemy = null, heli = null;
      while (obj) {
        if (obj.userData && obj.userData.enemy) { enemy = obj.userData.enemy; break; }
        if (obj.userData && obj.userData.heli) { heli = obj.userData.heli; break; }
        obj = obj.parent;
      }
      this.vfx.tracer(muzzle, h.point);
      if (enemy && !enemy.dead) {
        enemy.takeDamage(this.weapon.damage);
        this.vfx.hitPuff(h.point);
        this.hooks.onHitmarker?.(enemy.dead);
      } else if (heli && !heli.dead) {
        heli.takeDamage(this.weapon.damage);
        this.vfx.hitPuff(h.point);
        this.hooks.onHitmarker?.(heli.dead);
      } else {
        this._far.copy(this._dir).multiplyScalar(-1); // approx surface normal = back toward shooter
        this.vfx.impact(h.point, this._far);
      }
    } else {
      this._far.copy(this._origin).addScaledVector(this._dir, 120);
      this.vfx.tracer(muzzle, this._far);
    }
  }

  update(dt, t, playerPos) {
    const ctx = {
      vfx: this.vfx,
      audio: this.audio,
      onPlayerHit: (dmg) => this.hooks.onPlayerHit?.(dmg),
    };
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      e.update(dt, playerPos, ctx);
      if (e.dead && !e.counted) {
        e.counted = true;
        this.killCount++;
        this.hooks.onKill?.(this.killCount, this.enemiesLeft);
      }
      if (e.removable) {
        this.scene.remove(e.group);
        this.enemies.splice(i, 1);
      }
    }
  }
}
