import * as THREE from "three";
// engine — reusable, game-agnostic infrastructure
import { Engine } from "./engine/engine.js";
import { Input } from "./engine/input.js";
import { Audio } from "./engine/audio.js";
import { Voice } from "./engine/voice.js";
import { HUD } from "./engine/hud.js";
import { Controller } from "./engine/controller.js";
import { Weapon } from "./engine/weapon.js";
import { VFX } from "./engine/vfx.js";
import { TouchControls } from "./engine/touch.js";
import { LevelBuilder } from "./engine/level-builder.js";
// game — this game's content + rules
import { Combat } from "./game/combat.js";
import { Helicopter, preloadHeli } from "./game/helicopter.js";
import { Intro } from "./game/intro.js";
import { preloadEnemies } from "./game/enemy.js";
import { preloadOperator } from "./game/operator.js";
import { preloadVehicles } from "./engine/vehicles.js";
import { preloadPickups } from "./engine/pickups.js";
import { config, mergeConfig } from "./game/config.js";
import { levels, DEFAULT_LEVEL } from "./game/levels/index.js";

class Game {
  constructor() {
    // pick the level (?level=<id>) and merge its overrides onto the base config
    this.levelDef = levels[new URLSearchParams(location.search).get("level")] || levels[DEFAULT_LEVEL];
    this.cfg = mergeConfig(config, this.levelDef.config || {});

    this.engine = new Engine(document.getElementById("app"));
    this.input = new Input();
    this.audio = new Audio();
    this.voice = new Voice();
    this.hud = new HUD();
    this.hud.setOperation(this.levelDef.name);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(this.cfg.scene.fog.color, this.cfg.scene.fog.near, this.cfg.scene.fog.far);
    this.camera = new THREE.PerspectiveCamera(this.cfg.scene.fov, window.innerWidth / window.innerHeight, 0.1, 2000);
    this.scene.add(this.camera);
    this.engine.setupNight(this.scene);
    this.engine.addLights(this.scene);

    this.level = new LevelBuilder(this.scene); // built in _boot, once assets are loaded
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
    this._heliDelay = this.cfg.helicopter.spawnDelay;
    this._playTime = 0;
    this._heliSpawned = false;
    this._heliKilled = false;

    // objective
    this.objType = this.cfg.objective.type;
    if (this.objType === "defuse") {
      this.bombTime = this.cfg.objective.timeLimit;
      this.codeLen = this.cfg.objective.codeLength || 3;
      // one solvable code: an arithmetic sequence the player can deduce from a single hint
      const maxStep = Math.max(1, Math.floor(8 / (this.codeLen - 1)));
      const step = 1 + Math.floor(Math.random() * maxStep);
      const first = 1 + Math.floor(Math.random() * Math.max(1, 9 - (this.codeLen - 1) * step));
      this.bombCode = Array.from({ length: this.codeLen }, (_, i) => first + i * step).join("");
      this.bombHint = `HINT — first digit ${first}, then +${step} each`;
      this.maxTries = this.cfg.objective.maxTries || 3;
      this.codeTries = 0;
      this.defusing = false; this.defused = false; this.codeTyped = ""; this.codeFeedback = "";
    }

    this.health = this.cfg.player.maxHealth;
    this.shotsFired = 0;
    this.shotsHit = 0;
    this.baseFov = this.cfg.scene.fov;
    this._fovKick = 0;
    this.combat = null;

    this.engine.setActive(this.scene, this.camera);
    this.state = "loading";

    // pointer-lock driven state transitions (desktop)
    this.controller.onLock = () => { if (!this._introDone) this._beginIntro(); else this._startPlay(); };
    this.controller.onUnlock = () => {
      if (this.state === "play") { this.state = "pause"; this.touch.hide(); this.hud.showPause(() => this._resume()); }
    };

    this.engine.start((dt, t) => this.update(dt, t));
    this._boot();
  }

  async _boot() {
    this.hud.showLoading();
    this.audio.ensure(); // create the (suspended) audio context now so clips — incl. the heli rotor — preload before Deploy
    // load models progressively (async, off the main thread) with a progress readout
    const jobs = [preloadEnemies(), preloadHeli(), preloadOperator(), preloadVehicles(), preloadPickups()];
    let done = 0; this.hud.setLoadingProgress(0, jobs.length + 1);
    jobs.forEach((p) => p.then(() => this.hud.setLoadingProgress(++done, jobs.length + 1)));
    await Promise.all(jobs);
    // build the level now that all prop models are loaded, then seat the camera at the spawn
    this.levelDef.build(this.level);
    // warm up the procedural gunship build (populates the shared geometry caches) so its
    // first real spawn mid-fight doesn't hitch the frame
    const warm = new Helicopter(this.scene, this.level);
    this.scene.remove(warm.group);
    if (warm.headLight) this.scene.remove(warm.headLight, warm.headLight.target, warm.headBeam);
    this.hud.setLoadingProgress(jobs.length + 1, jobs.length + 1);
    this.camera.position.set(this.level.playerSpawn.x, this.controller.eye, this.level.playerSpawn.z);
    this.combat = new Combat(this.scene, this.camera, this.level, this.weapon, this.vfx, this.audio, {
      onPlayerHit: (dmg) => this._onPlayerHit(dmg),
      onKill: (count, left) => { this.hud.killFeed(this.cfg.messages.hostileDown); this.hud.setHostiles(left); this.voice.enemyDown(); },
      onHitmarker: (killed) => { this.shotsHit++; this.hud.hitmarker(killed); this.audio.hitmarker(killed); },
    });
    this.hud.setHostiles(this.combat.enemiesLeft);
    this.state = "start";
    this.hud.showStart(() => this._deploy(), {
      title: this.levelDef.name,
      brief: this.objType === "defuse"
        ? "Infiltrate the base and disarm the bomb before it detonates."
        : "Push to the extraction zone. Eliminate anyone in your way.",
    });
  }

  // Mobile (a finger tapped Deploy -> touch active) starts directly; desktop uses pointer lock.
  _deploy() {
    this.audio.resume();
    if (this.touch.enabled) this._beginIntro();
    else this.controller.lock(); // onLock -> _beginIntro
  }

  // Fast-rope insertion cinematic, then hand control to the player.
  _beginIntro() {
    if (this.state === "intro" || this._introDone) return;
    if (!this.cfg.intro.enabled) { this._introDone = true; this._startPlay(); return; }
    this.state = "intro";
    this.hud.hideOverlay();
    this.hud.setCombatVisible(false);
    this.weapon.group.visible = false; // hands on the rope, not the gun
    this.audio.startRotor();
    this.intro = new Intro(this.scene, this.camera, this.level.playerSpawn);
    this.intro.start();
    this.hud.killFeed(this.cfg.messages.deployHint);
    this._introT = 0;
    this._spottedCalled = false;
    this._introFar = new THREE.Vector3(0, -999, 0); // keeps enemies from detecting the player pre-game
  }
  _endIntro() {
    if (this._introDone) return;
    this._introDone = true;
    if (this.intro) { this.intro.dispose(); this.intro = null; }
    this.audio.stopRotor();
    this.weapon.group.visible = true;
    // settle the player at the spawn, facing into the compound
    this.camera.position.set(this.level.playerSpawn.x, this.controller.eye, this.level.playerSpawn.z);
    this.controller._euler.set(0, 0, 0);
    this.camera.quaternion.setFromEuler(this.controller._euler);
    this._startPlay();
  }
  _resume() {
    if (this.touch.enabled) this._startPlay();
    else this.controller.lock();
  }
  _startPlay() {
    this.audio.resume();
    this.hud.hideOverlay();
    this.hud.setCombatVisible(true);
    if (this.objType === "defuse") {
      this.hud.showTimer(true);
      this.hud.setMissionTimer(this.bombTime);
      this.hud.setObjective('Reach &amp; disarm the <span class="arrow">BOMB ◎</span>');
      this.hud.setCounter("Eliminated", this.combat.killCount);
    } else {
      this.hud.setCounter("Hostiles", this.combat.enemiesLeft);
    }
    this.touch.show();
    if (!this._deployed) { this._deployed = true; this.voice.deploy(); }
    this.state = "play";
  }

  _onPlayerHit(dmg) {
    if (this.state !== "play") return;
    this.health -= dmg;
    this.hud.setHealth(this.health, this.cfg.player.maxHealth);
    this.hud.damageFlash();
    this.audio.hurt();
    this._sinceHit = 0; // pause regen when taking fire
    if (this.health <= 0) this._lose();
  }

  _win(extra = {}) {
    if (this.state === "win") return;
    this.state = "win";
    const acc = this.shotsFired ? Math.round((this.shotsHit / this.shotsFired) * 100) : 0;
    this.hud.setCombatVisible(false);
    this.hud.showTimer(false); this.hud.hideDefuse();
    this.controller.unlock();
    this.audio.stopRotor();
    this.hud.showWin({ kills: this.combat.killCount, total: extra.disarmed ? 0 : this.combat.totalEnemies, acc, ...extra });
    this.audio.win();
    this.voice.win();
  }
  _lose(sub, title) {
    if (this.state === "lose") return;
    this.state = "lose";
    this.audio.stopRotor();
    this.hud.setCombatVisible(false);
    this.hud.showTimer(false); this.hud.hideDefuse();
    this.controller.unlock();
    this.hud.showLose(sub, title);
    this.audio.lose();
    this.voice.lose();
  }

  // bomb goes off: a big rolling explosion (reuses the gunship blast), then the fail screen
  _detonate() {
    if (this.state === "detonate" || this.state === "lose") return;
    this.state = "detonate";
    this._detT = 1.5; this._detBlast = 0;
    this.defusing = false; this.hud.hideDefuse(); this.hud.showTimer(false); this.hud.setCombatVisible(false);
    this.controller.unlock(); this.audio.stopRotor();
    const b = this.level.bomb; this._bombPos = new THREE.Vector3(b.x, 1, b.z);
    this.audio.explosion?.();
  }

  // bomb objective: countdown, proximity disarm panel, code entry, win/lose
  _updateDefuse(dt, presses) {
    this.bombTime -= dt;
    this.hud.setMissionTimer(this.bombTime);
    this.hud.setCounter("Eliminated", this.combat.killCount);
    if (this.bombTime <= 0) { this._detonate(); return; }
    if (this.defused) return;

    const bmb = this.level.bomb;
    const dx = this.camera.position.x - bmb.x, dz = this.camera.position.z - bmb.z;
    const near = (dx * dx + dz * dz) < bmb.r * bmb.r;
    if (near && !this.defusing) {
      this.defusing = true; this.codeTyped = "";
      this.codeFeedback = this.bombHint;
      this.hud.showDefuse(this.codeLen); this.hud.updateDefuse("", this.codeFeedback);
    } else if (!near && this.defusing) {
      this.defusing = false; this.hud.hideDefuse();
    }

    if (this.defusing && presses.length) {
      for (const k of presses) {
        if (/^[0-9]$/.test(k)) { if (this.codeTyped.length < this.codeLen) this.codeTyped += k; }
        else if (k === "backspace") this.codeTyped = this.codeTyped.slice(0, -1);
        else if (k === "enter" && this.codeTyped.length === this.codeLen) {
          let correct = 0;
          for (let i = 0; i < this.codeLen; i++) if (this.codeTyped[i] === this.bombCode[i]) correct++;
          if (correct === this.codeLen) {
            const left = Math.max(0, this.bombTime), mm = Math.floor(left / 60), ss = Math.floor(left % 60);
            this.hud.hideDefuse();
            this._win({ disarmed: true, timeLeft: `${mm}:${String(ss).padStart(2, "0")}`, title: 'Bomb <span class="hz">Disarmed</span>' });
            return;
          }
          this.codeTries++;
          if (this.codeTries >= this.maxTries) { this.hud.hideDefuse(); this._detonate(); return; }
          this.codeFeedback = `WRONG (${this.codeTries}/${this.maxTries}) — ${this.bombHint}`;
          this.codeTyped = "";
        }
      }
      this.hud.updateDefuse(this.codeTyped, this.codeFeedback);
    }
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
    if (this.state === "intro") {
      this.intro.update(dt);
      this.combat.update(dt, t, this._introFar); // enemies patrol/idle normally, never detect the player yet
      this._introT += dt;
      if (!this._spottedCalled && this._introT > this.cfg.intro.spottedCalloutAt) { this._spottedCalled = true; this.voice.enemySpotted(); }
      const pressed = this.input.drainPresses();
      if (this.intro.done || this.input.mouseDown || pressed.length || this.input.touch.fire) this._endIntro();
      return;
    }
    if (this.state === "detonate") {
      this.input.drainPresses();
      this._detT -= dt;
      this._detBlast -= dt;
      if (this._detBlast <= 0) { // rolling cluster of blasts around the bomb
        this._detBlast = 0.13;
        const o = this._bombPos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 7, Math.random() * 3, (Math.random() - 0.5) * 7));
        this.vfx.explosion(o);
      }
      this.hud._shake = Math.max(this.hud._shake, 12);
      if (this._detT <= 0) this._lose("The bomb detonated", 'Mission <span class="hz">Failed</span>');
      return;
    }
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
    // reload (+ keys reused by the bomb code entry below)
    const presses = this.input.drainPresses();
    if (presses.includes("r")) this.weapon.reload();

    this.combat.update(dt, t, this.camera.position);

    // ammo pickups — grab a magazine by walking over it (+rounds to reserve)
    if (this.level.pickups) {
      for (const p of this.level.pickups) {
        if (p.taken) continue;
        const dx = this.camera.position.x - p.x, dz = this.camera.position.z - p.z;
        if (dx * dx + dz * dz < p.r * p.r) {
          p.taken = true; p.group.visible = false;
          this.weapon.reserve += p.rounds;
          this.audio.playBuf?.("clipin", 0.6);
          this.hud.notify(`+${p.rounds} ROUNDS · MAGAZINE`);
        }
      }
    }

    // health regen: restore a little HP on a fixed interval
    const hp = this.cfg.player;
    this._healT = (this._healT || 0) + dt;
    if (this._healT >= hp.regenInterval) { this._healT -= hp.regenInterval; if (this.health < hp.maxHealth) this.health = Math.min(hp.maxHealth, this.health + hp.regenAmount); }

    // helicopter boss — arrives a few seconds into the fight
    this._playTime += dt;
    if (!this._heliSpawned && this._playTime >= this._heliDelay) {
      this._heliSpawned = true;
      this.heli = new Helicopter(this.scene, this.level);
      this.combat.extraHittables.push(this.heli.hitbox);
      this.audio.startRotor();
      this.hud.killFeed(this.cfg.messages.gunshipInbound);
    }
    if (this.heli) {
      this.heli.update(dt, t, this.camera.position, {
        vfx: this.vfx, audio: this.audio, onPlayerHit: (d) => this._onPlayerHit(d),
      });
      if (this.heli.dead && !this._heliKilled) { this._heliKilled = true; this.hud.killFeed(this.cfg.messages.gunshipDown); this.voice.enemyDown(); }
      if (this.heli.removable) {
        this.scene.remove(this.heli.group);
        if (this.heli.headLight) this.scene.remove(this.heli.headLight, this.heli.headLight.target, this.heli.headBeam);
        const i = this.combat.extraHittables.indexOf(this.heli.hitbox);
        if (i >= 0) this.combat.extraHittables.splice(i, 1);
        this.heli = null;
      }
    }

    const heliAlive = this.heli && !this.heli.dead;

    // HUD sync
    this.hud.setAmmo(this.weapon.ammo, this.weapon.reserve, this.weapon.reloading);
    this.hud.setHealth(this.health, this.cfg.player.maxHealth);

    if (this.objType === "defuse") {
      // disarm-the-bomb objective (timed; doesn't require clearing the base)
      this._updateDefuse(dt, presses);
    } else {
      // clear-and-extract objective
      const cleared = this.combat.enemiesLeft === 0 && !heliAlive;
      this.hud.setCounter("Hostiles", this.combat.enemiesLeft + (heliAlive ? 1 : 0));
      if (cleared !== this._cleared) {
        this._cleared = cleared;
        this.hud.setObjective(cleared ? this.cfg.messages.objectiveCleared : this.cfg.messages.objective);
      }
      if (cleared) {
        const e = this.level.exfil;
        const dx = this.camera.position.x - e.x, dz = this.camera.position.z - e.z;
        if (dx * dx + dz * dz < e.r * e.r) this._win();
      }
    }
  }
}

window.__game = new Game();
