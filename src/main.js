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
import { Projectile, applyBlast } from "./engine/projectiles.js";
import { preloadWeapons } from "./engine/weapons.js";
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
      // A self-working "mentalist" lock: the player feeds in a personal number, but the operations
      // are rigged so the secret cancels out and EVERYONE lands on our exact 3-digit code.
      //   ((x * m) + m*N) / m - x  ==  N   for any x, any m.
      const N = 100 + Math.floor(Math.random() * 900); // the real 3-digit code
      this.bombCode = String(N);
      this.codeLen = 3;
      const m = 2 + Math.floor(Math.random() * 2); // 2 or 3
      const personals = [
        "the day of the month you were born",
        "your age",
        "your house number",
        "the last two digits of your phone number",
        "your lucky number",
      ];
      const who = personals[Math.floor(Math.random() * personals.length)];
      this.bombHint =
        `<b>NEURAL KEY · unique to you</b><br>` +
        `① think of <b>${who}</b> (keep it secret)<br>` +
        `② multiply it by ${m}<br>` +
        `③ add ${m * N}<br>` +
        `④ divide by ${m}<br>` +
        `⑤ subtract the number you started with<br>` +
        `▶ what remains is the 3-digit disarm code`;
      this.maxTries = this.cfg.objective.maxTries || 3;
      this.codeTries = 0;
      this.defusing = false; this.defused = false; this.codeTyped = ""; this.codeFeedback = "";
    }

    this.health = this.cfg.player.maxHealth;
    this.grenades = this.cfg.player.grenades ?? 5;
    this._projectiles = [];
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
    const jobs = [preloadEnemies(), preloadHeli(), preloadOperator(), preloadVehicles(), preloadPickups(), preloadWeapons()];
    let done = 0; this.hud.setLoadingProgress(0, jobs.length + 1);
    jobs.forEach((p) => p.then(() => this.hud.setLoadingProgress(++done, jobs.length + 1)));
    await Promise.all(jobs);
    this.weapon.buildLauncher(); // launcher model is loaded now
    // build the level now that all prop models are loaded, then seat the camera at the spawn
    this.levelDef.build(this.level);
    this.camera.position.set(this.level.playerSpawn.x, this.controller.eye, this.level.playerSpawn.z);
    // A persistent gunship searchlight, added to the scene ONCE (intensity 0 when idle). The heli
    // reuses it, so the scene's light count never changes between spawns -> no shader recompile hitch.
    this.heliLight = new THREE.SpotLight(0xfff4d2, 0, 140, 0.5, 0.5, 1.0); this.heliLight.castShadow = false;
    this.scene.add(this.heliLight, this.heliLight.target);
    // Warm up: build the gunship once (using the shared light), compile shaders + render one hidden
    // frame so the first real spawn mid-fight is already fully compiled and uploaded.
    const warm = new Helicopter(this.scene, this.level, this.heliLight);
    this.engine.renderer.compile(this.scene, this.camera);
    this.engine.outline.render(this.scene, this.camera);
    this.scene.remove(warm.group, warm.headBeam);
    this.heliLight.intensity = 0;
    this.hud.setLoadingProgress(jobs.length + 1, jobs.length + 1);
    this.combat = new Combat(this.scene, this.camera, this.level, this.weapon, this.vfx, this.audio, {
      onPlayerHit: (dmg) => this._onPlayerHit(dmg),
      onKill: (count, left) => { this.hud.killFeed(this.cfg.messages.hostileDown); this.hud.setHostiles(left); this.voice.enemyDown(); },
      onHitmarker: (killed) => { this.shotsHit++; this.hud.hitmarker(killed); this.audio.hitmarker(killed); },
      onExplosive: (rec, dmg) => { if (rec.hp != null) { rec.hp -= dmg; if (rec.hp <= 0) this._explodeBarrel(rec); } else this._explodeBarrel(rec); },
      onVehicleHit: (rec, dmg) => { rec.hp -= dmg; if (rec.hp <= 0) this._explodeVehicle(rec); },
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
    this.hud.setGrenades(this.grenades);
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

  _throwGrenade() {
    this.grenades--;
    this.hud.setGrenades(this.grenades);
    const dir = new THREE.Vector3(); this.camera.getWorldDirection(dir);
    const pos = this.camera.position.clone().addScaledVector(dir, 0.6); pos.y -= 0.15;
    const vel = dir.clone().multiplyScalar(17); vel.y += 5; // forward throw with an arc
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0x2c3322, roughness: 0.7, metalness: 0.3 }));
    const g = new Projectile(this.scene, mesh, pos, vel, { gravity: 18, fuse: 1.5, bounce: 0.35, spin: true });
    g.radius = 7; g.damage = 320; g.power = 11; g.scale = 0.6;
    this._projectiles.push(g);
    this.audio.playBuf?.("clipout", 0.4);
  }

  // a shot fuel barrel cooks off: big boom, blast damage to nearby enemies, flings props,
  // hurts the player if too close, and chain-detonates barrels packed right next to it.
  _explodeBarrel(rec, depth = 0) {
    if (rec.exploded) return;
    rec.exploded = true;
    const c = new THREE.Vector3(rec.x, rec.cy || 0.75, rec.z);
    // remove the barrel/tank + its collider / dynamic / occluder so nothing lingers
    this.scene.remove(rec.mesh);
    const lvl = this.level;
    const drop = (arr, item) => { if (arr) { const i = arr.indexOf(item); if (i >= 0) arr.splice(i, 1); } };
    drop(lvl.colliders, rec.collider); drop(lvl.dynamics, rec.dyn); drop(lvl.solidMeshes, rec.mesh);
    // boom (bigger for fuel tanks via rec.scale / rec.radius)
    this.vfx.explosion(c, rec.scale || 0.9);
    this.audio.explosion?.();
    if (rec.scale > 1.2) this.hud._shake = Math.max(this.hud._shake || 0, 12);
    const opts = { radius: rec.radius || 7, damage: rec.damage || 240, power: 13 };
    applyBlast(c, opts, this.combat.enemies, null, lvl.dynamics); // heli takes only unit damage, handled elsewhere
    // catch the player in the blast if they're standing too close
    const pd = Math.hypot(this.camera.position.x - rec.x, this.camera.position.z - rec.z);
    if (pd < opts.radius) this._onPlayerHit(Math.round(opts.damage * 0.22 * (1 - pd / opts.radius)));
    // chain-react barrels/tanks packed right next to it (a staggered cook-off)
    if (depth < 5 && lvl.explosives) {
      for (const other of lvl.explosives) {
        if (other.exploded) continue;
        if (Math.hypot(other.x - rec.x, other.z - rec.z) < Math.max(3.0, opts.radius * 0.4)) {
          setTimeout(() => this._explodeBarrel(other, depth + 1), 110 + Math.random() * 160);
        }
      }
    }
  }

  // a vehicle takes sustained fire (or a rocket/grenade) then cooks off: a BIG explosion,
  // the wreck is hurled into the air, tumbles down, and vanishes ~2s after it lands.
  _explodeVehicle(rec) {
    if (rec.exploded) return;
    rec.exploded = true;
    const c = new THREE.Vector3(rec.x, 1.1, rec.z);
    const lvl = this.level;
    // it no longer blocks movement or stops bullets once it's airborne wreckage
    const drop = (arr, item) => { if (arr) { const i = arr.indexOf(item); if (i >= 0) arr.splice(i, 1); } };
    drop(lvl.colliders, rec.collider); drop(lvl.solidMeshes, rec.mesh);
    // bigger boom + heavier screen shake
    this.vfx.explosion(c, 1.7);
    this.audio.explosion?.();
    this.hud._shake = Math.max(this.hud._shake || 0, 14);
    const opts = { radius: 11, damage: 320, power: 20 };
    applyBlast(c, opts, this.combat.enemies, null, lvl.dynamics); // heli takes only unit damage, handled elsewhere
    // launch the wreck itself into the air (override the heavy mass — this is its own blast)
    if (rec.dyn) {
      const d = rec.dyn;
      d.rest = false; d.vanish = true; d.vanishDelay = 2; // vanish 2s after it settles
      d.vel.set((Math.random() - 0.5) * 7, 13 + Math.random() * 5, (Math.random() - 0.5) * 7);
      d.spin.set((Math.random() - 0.5) * 6, 0, (Math.random() - 0.5) * 6);
    }
    // player caught in the (bigger) blast
    const pd = Math.hypot(this.camera.position.x - rec.x, this.camera.position.z - rec.z);
    if (pd < opts.radius) this._onPlayerHit(Math.round(opts.damage * 0.25 * (1 - pd / opts.radius)));
    // the blast cooks off any fuel barrels nearby too
    if (lvl.explosives) for (const ex of lvl.explosives) {
      if (!ex.exploded && Math.hypot(ex.x - rec.x, ex.z - rec.z) < opts.radius) setTimeout(() => this._explodeBarrel(ex), 80 + Math.random() * 160);
    }
  }

  _fireRocket(t) {
    this.weapon.fireRocket(t);
    const dir = new THREE.Vector3(); this.camera.getWorldDirection(dir);
    const pos = this.camera.position.clone().addScaledVector(dir, 0.8);
    const vel = dir.clone().multiplyScalar(50); // fast, flat trajectory
    // a proper missile: olive body + red nose cone + tail fins, built along +Y then aimed along flight
    const mesh = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.55, 10), new THREE.MeshStandardMaterial({ color: 0x4b5320, metalness: 0.3, roughness: 0.6 }));
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.22, 10), new THREE.MeshStandardMaterial({ color: 0x8a2b1a, metalness: 0.3, roughness: 0.5 })); nose.position.y = 0.38;
    mesh.add(body, nose);
    for (let i = 0; i < 4; i++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.13, 0.12), new THREE.MeshStandardMaterial({ color: 0x2c2e26 }));
      const a = i * Math.PI / 2; fin.position.set(Math.cos(a) * 0.08, -0.26, Math.sin(a) * 0.08); fin.rotation.y = -a;
      mesh.add(fin);
    }
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()); // point along flight
    const rocket = new Projectile(this.scene, mesh, pos, vel, { gravity: 2.5, fuse: 4, detonateOnHit: true });
    rocket.radius = 9; rocket.damage = 900; rocket.power = 16; rocket.scale = 1.0; rocket.isRocket = true;
    this._projectiles.push(rocket);
    this._fovKick = Math.min(this._fovKick + 2.5, 6);
  }

  _updateProjectiles(dt) {
    for (let i = this._projectiles.length - 1; i >= 0; i--) {
      const p = this._projectiles[i];
      p.update(dt, this.level);
      if (p.isRocket) this.vfx.rocketTrail(p.pos); // fire+smoke exhaust trail
      // rockets detonate on contact with the flying gunship (generous radius — the gunship is big)
      if (p.detonateOnHit && this.heli && !this.heli.dead) {
        const dx = this.heli.pos.x - p.pos.x, dy = (this.heli.pos.y || 0) - p.pos.y, dz = this.heli.pos.z - p.pos.z;
        if (dx * dx + dy * dy + dz * dz < 36) { p.done = true; p._heliHit = this.heli; } // ~6m
      }
      if (p.done) {
        const c = p.pos.clone();
        this.vfx.explosion(c, p.scale || 0.6);
        this.audio.explosion?.();
        // enemies/props take the big AoE damage; the heli + destructibles use the "unit" scale (below)
        applyBlast(c, { radius: p.radius || 6, damage: p.damage || 200, power: p.power || 15 }, this.combat.enemies, null, this.level.dynamics);
        const units = p.isRocket ? 15 : 5; // rocket = 15 units (one-shots the 15-unit gunship), grenade = 5
        const R = p.radius || 6;
        // gunship: a direct rocket hit, or being caught in the blast, applies unit damage
        if (this.heli && !this.heli.dead) {
          const dx = this.heli.pos.x - c.x, dy = (this.heli.pos.y || 0) - c.y, dz = this.heli.pos.z - c.z;
          if (p._heliHit || dx * dx + dy * dy + dz * dz < (R + 2) * (R + 2)) this.heli.takeDamage(units);
        }
        // barrels + fuel tanks caught in the radius take unit damage; cook off at 0
        if (this.level.explosives) for (const ex of this.level.explosives) {
          if (!ex.exploded && Math.hypot(ex.x - c.x, ex.z - c.z) < R) { ex.hp -= units; if (ex.hp <= 0) setTimeout(() => this._explodeBarrel(ex), 40 + Math.random() * 120); }
        }
        // vehicles caught in the radius take unit damage; blow up at 0
        if (this.level.vehicles) for (const v of this.level.vehicles) {
          if (!v.exploded && Math.hypot(v.x - c.x, v.z - c.z) < R + 1.5) { v.hp -= units; if (v.hp <= 0) this._explodeVehicle(v); }
        }
        this.hud._shake = Math.max(this.hud._shake, p.scale > 0.7 ? 10 : 6);
        p.dispose();
        this._projectiles.splice(i, 1);
      }
    }
  }

  // bomb goes off: a big rolling explosion (reuses the gunship blast), then the fail screen
  _detonate() {
    if (this.state === "detonate" || this.state === "lose") return;
    this.state = "detonate";
    this._detT = 4.2; this._detBlast = 0; // longer so the player's flight clear out of the compound plays out
    this.defusing = false; this.hud.hideDefuse(); this.hud.showTimer(false); this.hud.setCombatVisible(false);
    this.controller.unlock(); this.audio.stopRotor();
    const b = this.level.bomb; this._bombPos = new THREE.Vector3(b.x, 1, b.z);
    // one ENORMOUS blast
    this.vfx.explosion(this._bombPos, 3.2);
    this.audio.explosion?.();
    this.hud._shake = 48;
    // hurl the player way up into the sky and back, away from the bomb, tumbling
    const away = new THREE.Vector3(this.camera.position.x - b.x, 0, this.camera.position.z - b.z);
    if (away.lengthSq() < 0.5) this.camera.getWorldDirection(away).setY(0).multiplyScalar(-1); // shoved backward if right on it
    away.y = 0; away.normalize();
    this._camVel = new THREE.Vector3(away.x * 30, 46, away.z * 30); // hurled high AND far — clear out of the compound
    this._camSpin = new THREE.Vector3(0.6 + Math.random() * 1.6, (Math.random() - 0.5) * 2.4, (Math.random() - 0.5) * 5); // wild tumble
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
          this.codeFeedback = `<b class="bad">✗ WRONG · ${this.codeTries}/${this.maxTries}</b><br>${this.bombHint}`;
          this.codeTyped = "";
        }
      }
      this.hud.updateDefuse(this.codeTyped, this.codeFeedback);
    }
  }

  _updateLaser() {
    if (!this.combat) return;
    if (this.weapon.mode === "launcher" || this.weapon.reloading) { this.laserBeam.visible = false; return; } // no laser on the launcher / mid-reload
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
      // fly the player up & away, tumbling, with gravity — far enough to clear the compound
      if (this._camVel) {
        this._camVel.y -= 22 * dt;
        this.camera.position.addScaledVector(this._camVel, dt);
        if (this.camera.position.y <= 1.6) { this.camera.position.y = 1.6; this._camVel.multiplyScalar(0); this._camSpin.multiplyScalar(0.9); }
        this.camera.rotation.x += this._camSpin.x * dt;
        this.camera.rotation.y += this._camSpin.y * dt;
        this.camera.rotation.z += this._camSpin.z * dt;
      }
      this._detBlast -= dt;
      if (this._detBlast <= 0) { // several consecutive blasts: a big cluster around the bomb + booms chasing the player up
        this._detBlast = 0.1;
        const o = this._bombPos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 10, Math.random() * 4, (Math.random() - 0.5) * 10));
        this.vfx.explosion(o, 1.1 + Math.random() * 0.8);
        // a blast right under the airborne player too, so the explosions visibly hurl them
        if (this.camera.position.y > 3) this.vfx.explosion(this.camera.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 4, -2, (Math.random() - 0.5) * 4)), 1.0);
      }
      this.hud._shake = Math.max(this.hud._shake, 14);
      if (this._detT <= 0) this._lose("The bomb detonated", 'Mission <span class="hz">Failed</span>');
      return;
    }
    if (this.state !== "play") { this.input.drainPresses(); return; }
    if (this.input.touch.suspended) { this.input.drainPresses(); return; } // portrait gate on mobile

    this.controller.update(dt, this.input);
    this.weapon.update(dt, this.controller.moving);
    this._updateLaser();

    // fire — mouse or touch FIRE button (rifle = hitscan; launcher = rocket)
    const firing = this.input.mouseDown || this.input.touch.fire;
    if (this.weapon.mode === "launcher") {
      if (firing && this.weapon.canFireRocket(t)) this._fireRocket(t);
    } else if (firing && this.weapon.canFire(t)) {
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
    // grenade (right-click)
    if (presses.includes("rmb") && this.grenades > 0) this._throwGrenade();
    // swap rifle <-> missile launcher (Q)
    if (presses.includes("q")) {
      const m = this.weapon.toggle();
      this.hud.setWeaponName(m === "launcher" ? "MISSILE LAUNCHER" : "MK-4 CARBINE");
    }

    this.combat.update(dt, t, this.camera.position);
    this._updateProjectiles(dt);
    this.level.updateDynamics(dt); // explosion-flung props (barrels, etc.)

    // ammo pickups — grab a magazine by walking over it (+rounds to reserve)
    if (this.level.pickups) {
      for (const p of this.level.pickups) {
        if (p.taken) continue;
        const dx = this.camera.position.x - p.x, dz = this.camera.position.z - p.z;
        if (dx * dx + dz * dz < p.r * p.r) {
          // hide the box + glow, but leave the (now-dark) light in the scene: toggling a light's
          // visibility changes the scene light count and recompiles every shader (a multi-second freeze).
          p.taken = true; p.box.visible = false; p.glow.visible = false; p.light.intensity = 0;
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
      this.heli = new Helicopter(this.scene, this.level, this.heliLight);
      this.combat.extraHittables.push(this.heli.hitbox);
      this.audio.startRotor();
      this.hud.killFeed(this.cfg.messages.gunshipInbound);
      this.hud.showPrompt('Press <b>Q</b> to use the Missile Launcher', 6);
    }
    if (this.heli) {
      this.heli.update(dt, t, this.camera.position, {
        vfx: this.vfx, audio: this.audio, onPlayerHit: (d) => this._onPlayerHit(d),
      });
      if (this.heli.dead && !this._heliKilled) { this._heliKilled = true; this.hud.killFeed(this.cfg.messages.gunshipDown); this.voice.enemyDown(); }
      if (this.heli.removable) {
        this.scene.remove(this.heli.group, this.heli.headBeam);
        this.heliLight.intensity = 0; // keep the shared light in the scene; just switch it off
        if (this.heli.headLight && this.heli._ownsLight) this.scene.remove(this.heli.headLight, this.heli.headLight.target);
        const i = this.combat.extraHittables.indexOf(this.heli.hitbox);
        if (i >= 0) this.combat.extraHittables.splice(i, 1);
        this.heli = null;
      }
    }

    const heliAlive = this.heli && !this.heli.dead;

    // HUD sync (ammo readout swaps to rockets in launcher mode)
    if (this.weapon.mode === "launcher") this.hud.setAmmo(this.weapon.rockets, 0, false);
    else this.hud.setAmmo(this.weapon.ammo, this.weapon.reserve, this.weapon.reloading);
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
