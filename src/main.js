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
import { preloadEnemies } from "./fps/enemy.js";
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
    this.touch = new TouchControls(this.input);
    this.isTouch = this.touch.enabled;

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
    await preloadEnemies(); // load the rigged soldier model before spawning
    this.combat = new Combat(this.scene, this.camera, this.level, this.weapon, this.vfx, this.audio, {
      onPlayerHit: (dmg) => this._onPlayerHit(dmg),
      onKill: (count, left) => { this.hud.killFeed("HOSTILE DOWN"); this.hud.setHostiles(left); this.voice.enemyDown(); },
      onHitmarker: (killed) => { this.shotsHit++; this.hud.hitmarker(killed); this.audio.hitmarker(killed); },
    });
    this.hud.setHostiles(this.combat.enemiesLeft);
    this.state = "start";
    this.hud.showStart(() => this._deploy());
  }

  // Desktop deploys via pointer lock; mobile starts directly (no pointer lock).
  _deploy() {
    if (this.isTouch) this._startPlay();
    else this.controller.lock();
  }
  _resume() {
    if (this.isTouch) this._startPlay();
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
    this.hud.showWin({ kills: this.combat.killCount, total: this.combat.totalEnemies, acc });
    this.audio.win();
    this.voice.win();
  }
  _lose() {
    this.state = "lose";
    this.hud.setCombatVisible(false);
    this.controller.unlock();
    this.hud.showLose();
    this.audio.lose();
    this.voice.lose();
  }

  update(dt, t) {
    this.hud.update(dt);
    this.vfx.update(dt); // always fade effects (even while paused) so trails clear
    this.level.update(t); // wave the objective flag
    if (this.state !== "play") { this.input.drainPresses(); return; }

    this.controller.update(dt, this.input);
    this.weapon.update(dt, this.controller.moving);

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

    // health regen (CoD-style): heal once you've been out of fire for a moment
    this._sinceHit = (this._sinceHit || 0) + dt;
    if (this._sinceHit > 3 && this.health < 100) this.health = Math.min(100, this.health + 22 * dt);

    // HUD sync
    this.hud.setAmmo(this.weapon.ammo, this.weapon.reserve, this.weapon.reloading);
    this.hud.setHealth(this.health, 100);
    this.hud.setHostiles(this.combat.enemiesLeft);

    // win check — reach the extraction pad
    const e = this.level.exfil;
    const dx = this.camera.position.x - e.x, dz = this.camera.position.z - e.z;
    if (dx * dx + dz * dz < e.r * e.r) this._win();
  }
}

window.__game = new Game();
