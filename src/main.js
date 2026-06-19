import * as THREE from "three";
import { Engine } from "./core/engine.js";
import { Input } from "./core/input.js";
import { Audio } from "./core/audio.js";
import { Voice } from "./core/voice.js";
import { HUD } from "./ui/hud.js";
import { Level } from "./world/level.js";
import { Controller } from "./fps/controller.js";
import { Weapon } from "./fps/weapon.js";
import { VFX } from "./fps/vfx.js";
import { Combat } from "./fps/combat.js";
import { TouchControls } from "./fps/touch.js";
import { Helicopter } from "./fps/helicopter.js";
import { preloadEnemies } from "./fps/enemy.js";
import { preloadHeli } from "./fps/helicopter.js";
import { COLORS } from "./util/builders.js";

class Game {
  constructor() {
    this.engine = new Engine(document.getElementById("app"));
    this.input = new Input();
    this.audio = new Audio();
    this.voice = new Voice();
    this.hud = new HUD();

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x0e1626, 32, 120);
    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 2000);
    this.scene.add(this.camera);
    this.engine.setupNight(this.scene);
    this.engine.addLights(this.scene);

    this.level = new Level(this.scene);
    this.controller = new Controller(this.camera, this.engine.renderer.domElement, this.level);
    this.controller.onStep = () => this.audio.step();
    this.weapon = new Weapon(this.camera, this.audio);
    this.vfx = new VFX(this.scene);
    this.vfx.setCamera(this.camera);

    // player laser sight: a soft glowing red beam from the muzzle to whatever it hits
    this._laserRay = new THREE.Raycaster();
    this._laserDir = new THREE.Vector3();
    this._laserHit = new THREE.Vector3();
    this._laserOrigin = new THREE.Vector3();
    this._laserBack = new THREE.Vector3();
    this._laserTargets = [];
    this._laserUp = new THREE.Vector3(0, 1, 0);
    const beamGeo = new THREE.CylinderGeometry(0.018, 0.018, 1, 6, 1, true);
    beamGeo.translate(0, 0.5, 0); // base at origin, extends +Y so we can scale length directly
    this.laserBeam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xff1a1a, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.laserBeam.material.userData.outlineParameters = { visible: false };
    this.laserBeam.frustumCulled = false; this.laserBeam.visible = false;
    this.scene.add(this.laserBeam);
    this.touch = new TouchControls(this.input);
    this.heli = null;
    this._heliDelay = 5; // gunship always arrives 5s into the fight
    this._playTime = 0;
    this._heliSpawned = false;
    this._heliKilled = false;

    this.health = 100;
    this.shotsFired = 0;
    this.shotsHit = 0;
    this.baseFov = 70;
    this._fovKick = 0;
    this.combat = null;

    this.engine.setActive(this.scene, this.camera);
    this.state = "loading";

    // pointer-lock driven state transitions (desktop)
    this.controller.onLock = () => this._startPlay();
    this.controller.onUnlock = () => {
      if (this.state === "play") { this.state = "pause"; this.touch.hide(); this.hud.showPause(() => this._resume()); }
    };

    this.engine.start((dt, t) => this.update(dt, t));
    this._boot();
  }

  async _boot() {
    this.hud.showLoading();
    await Promise.all([preloadEnemies(), preloadHeli()]); // load soldier + helicopter models
    this.combat = new Combat(this.scene, this.camera, this.level, this.weapon, this.vfx, this.audio, {
      onPlayerHit: (dmg) => this._onPlayerHit(dmg),
      onKill: (count, left) => { this.hud.killFeed("HOSTILE DOWN"); this.hud.setHostiles(left); this.voice.enemyDown(); },
      onHitmarker: (killed) => { this.shotsHit++; this.hud.hitmarker(killed); this.audio.hitmarker(killed); },
    });
    this.hud.setHostiles(this.combat.enemiesLeft);
    this.state = "start";
    this.hud.showStart(() => this._deploy());
  }

  // Mobile (a finger tapped Deploy -> touch active) starts directly; desktop uses pointer lock.
  _deploy() {
    if (this.touch.enabled) this._startPlay();
    else this.controller.lock();
  }
  _resume() {
    if (this.touch.enabled) this._startPlay();
    else this.controller.lock();
  }
  _startPlay() {
    this.audio.resume();
    this.hud.hideOverlay();
    this.hud.setCombatVisible(true);
    this.touch.show();
    if (!this._deployed) { this._deployed = true; this.voice.deploy(); }
    this.state = "play";
  }

  _onPlayerHit(dmg) {
    if (this.state !== "play") return;
    this.health -= dmg;
    this.hud.setHealth(this.health, 100);
    this.hud.damageFlash();
    this.audio.hurt();
    this._sinceHit = 0; // pause regen when taking fire
    if (this.health <= 0) this._lose();
  }

  _win() {
    if (this.state === "win") return;
    this.state = "win";
    const acc = this.shotsFired ? Math.round((this.shotsHit / this.shotsFired) * 100) : 0;
    this.hud.setCombatVisible(false);
    this.controller.unlock();
    this.audio.stopRotor();
    this.hud.showWin({ kills: this.combat.killCount, total: this.combat.totalEnemies, acc });
    this.audio.win();
    this.voice.win();
  }
  _lose() {
    this.state = "lose";
    this.audio.stopRotor();
    this.hud.setCombatVisible(false);
    this.controller.unlock();
    this.hud.showLose();
    this.audio.lose();
    this.voice.lose();
  }

  _updateLaser() {
    if (!this.combat) return;
    if (this.weapon.reloading) { this.laserBeam.visible = false; return; } // no laser mid-reload
    // aim point = straight down the camera (crosshair)
    const dir = this._laserDir; this.camera.getWorldDirection(dir);
    this._laserRay.set(this.camera.position, dir);
    this._laserRay.far = 90;
    const tg = this._laserTargets; tg.length = 0;
    for (const m of this.level.solidMeshes) tg.push(m);
    for (const e of this.combat.enemies) if (!e.dead) tg.push(e.hitbox);
    if (this.heli && !this.heli.dead) tg.push(this.heli.hitbox);
    const hits = this._laserRay.intersectObjects(tg, true);
    if (hits.length) this._laserHit.copy(hits[0].point);
    else this._laserHit.copy(this.camera.position).addScaledVector(dir, 80);
    // start the beam at the visible barrel tip — a point IN FRONT of the camera (the real muzzle
    // node is flipped behind the camera by the viewmodel's 180° rotation, so we don't use it here)
    const origin = this._laserOrigin.set(0.16, -0.14, -1.25);
    this.camera.localToWorld(origin);
    const len = origin.distanceTo(this._laserHit);
    const beamDir = this._laserHit.clone().sub(origin).normalize();
    this.laserBeam.position.copy(origin);
    this.laserBeam.quaternion.setFromUnitVectors(this._laserUp, beamDir);
    this.laserBeam.scale.set(1, len, 1);
    this.laserBeam.visible = true;
  }

  update(dt, t) {
    this.hud.update(dt);
    this.vfx.update(dt); // always fade effects (even while paused) so trails clear
    this.level.update(t); // wave the objective flag
    this.laserBeam.visible = false; // re-shown each frame during play
    if (this.state !== "play") { this.input.drainPresses(); return; }
    if (this.input.touch.suspended) { this.input.drainPresses(); return; } // portrait gate on mobile

    this.controller.update(dt, this.input);
    this.weapon.update(dt, this.controller.moving);
    this._updateLaser();

    // fire (auto) — mouse or touch FIRE button
    if ((this.input.mouseDown || this.input.touch.fire) && this.weapon.canFire(t)) {
      this.shotsFired++;
      this.combat.tryShoot(t);
      this.hud.bloom();
      this._fovKick = Math.min(this._fovKick + 0.8, 3.5);
    }
    // recoil FOV punch recovery
    this._fovKick *= Math.pow(0.0009, dt);
    const fov = this.baseFov + this._fovKick;
    if (Math.abs(this.camera.fov - fov) > 0.01) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
    // reload
    if (this.input.drainPresses().includes("r")) this.weapon.reload();

    this.combat.update(dt, t, this.camera.position);

    // health regen: +1 HP every 2 seconds, automatically
    this._healT = (this._healT || 0) + dt;
    if (this._healT >= 2) { this._healT -= 2; if (this.health < 100) this.health = Math.min(100, this.health + 1); }

    // helicopter boss — arrives a few seconds into the fight
    this._playTime += dt;
    if (!this._heliSpawned && this._playTime >= this._heliDelay) {
      this._heliSpawned = true;
      this.heli = new Helicopter(this.scene, this.level);
      this.combat.extraHittables.push(this.heli.hitbox);
      this.audio.startRotor();
      this.hud.killFeed("⚠ ENEMY GUNSHIP INBOUND");
    }
    if (this.heli) {
      this.heli.update(dt, t, this.camera.position, {
        vfx: this.vfx, audio: this.audio, onPlayerHit: (d) => this._onPlayerHit(d),
      });
      if (this.heli.dead && !this._heliKilled) { this._heliKilled = true; this.hud.killFeed("GUNSHIP DESTROYED"); this.voice.enemyDown(); }
      if (this.heli.removable) {
        this.scene.remove(this.heli.group);
        if (this.heli.headLight) this.scene.remove(this.heli.headLight, this.heli.headLight.target, this.heli.headBeam);
        const i = this.combat.extraHittables.indexOf(this.heli.hitbox);
        if (i >= 0) this.combat.extraHittables.splice(i, 1);
        this.heli = null;
      }
    }

    const heliAlive = this.heli && !this.heli.dead;
    const cleared = this.combat.enemiesLeft === 0 && !heliAlive;

    // HUD sync
    this.hud.setAmmo(this.weapon.ammo, this.weapon.reserve, this.weapon.reloading);
    this.hud.setHealth(this.health, 100);
    this.hud.setHostiles(this.combat.enemiesLeft + (heliAlive ? 1 : 0));
    if (cleared !== this._cleared) {
      this._cleared = cleared;
      this.hud.setObjective(cleared ? 'All hostiles down — reach the <span class="arrow">FLAG ▲</span>'
        : 'Eliminate all hostiles');
    }

    // win check — reach the extraction flag, but ONLY once everything is dead
    if (cleared) {
      const e = this.level.exfil;
      const dx = this.camera.position.x - e.x, dz = this.camera.position.z - e.z;
      if (dx * dx + dz * dz < e.r * e.r) this._win();
    }
  }
}

window.__game = new Game();
