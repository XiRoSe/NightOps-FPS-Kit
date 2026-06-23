import * as THREE from "three";
// engine — reusable, game-agnostic infrastructure
import { Engine } from "./engine/engine.js";
import { Input } from "./engine/input.js";
import { Audio } from "./engine/audio.js";
import { Voice } from "./engine/voice.js";
import { HUD } from "./engine/hud.js";
import { Controller } from "./engine/controller.js";
import { Weapon } from "./kit/weapon.js";
import { VFX } from "./engine/vfx.js";
import { TouchControls } from "./engine/touch.js";
import { LaserSight } from "./engine/laser-sight.js";
import { LevelBuilder } from "./kit/level-builder.js";
import { Destructibles } from "./kit/destructibles.js";
// game — this game's content + rules
import { Combat } from "./game/combat.js";
import { Helicopter, preloadHeli } from "./game/actors/helicopter.js";
import { Intro } from "./game/intro.js";
import { ParachuteIntro } from "./game/parachute-intro.js";
import { preloadEnemies } from "./game/actors/enemy.js";
import { preloadOperator } from "./game/actors/operator.js";
import { preloadCreatures } from "./game/actors/creature-assets.js";
import { preloadNature } from "./kit/content/nature.js";
import { preloadVehicles } from "./kit/content/vehicles.js";
import { preloadPickups } from "./kit/content/pickups.js";
import { Projectile, applyBlast } from "./engine/projectiles.js";
import { preloadWeapons } from "./kit/content/weapons.js";
import { config, mergeConfig } from "./game/config.js";
import { levels, DEFAULT_LEVEL } from "./game/levels/index.js";
import { makeObjective } from "./game/objectives/index.js";
import { isMobileOrTablet, showDesktopOnlyScreen } from "./device.js";

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
    if (this.cfg.scene.sky === "day") { this.engine.setupDay(this.scene); this.engine.addDayLights(this.scene); }
    else { this.engine.setupNight(this.scene); this.engine.addLights(this.scene); }

    this.level = new LevelBuilder(this.scene, this.cfg.balance); // built in _boot, once assets are loaded
    this.controller = new Controller(this.camera, this.engine.renderer.domElement, this.level);
    this.controller.onStep = () => this.audio.step();
    this.weapon = new Weapon(this.camera, this.audio);
    this.vfx = new VFX(this.scene);
    this.vfx.setCamera(this.camera);

    // player laser sight (a soft red aim beam); the game supplies its targets each frame
    this.laser = new LaserSight(this.scene, this.camera);
    this._laserTargets = [];
    // shootable barrels/tanks/vehicles (unit-damage explosions + cook-offs)
    this.destructibles = new Destructibles({
      scene: this.scene, level: this.level, vfx: this.vfx, audio: this.audio, hud: this.hud,
      camera: this.camera, balance: this.cfg.balance,
      enemies: () => this.combat.enemies,
      hurtPlayer: (d) => this._onPlayerHit(d),
    });
    this.touch = new TouchControls(this.input);
    this.heli = null;
    this._heliDelay = this.cfg.helicopter.spawnDelay;
    this._playTime = 0;
    this._heliSpawned = false;
    this._heliKilled = false;

    // objective (exfil = clear all + reach the flag; defuse = crack the timed bomb code).
    // The objective owns the win/lose CONDITIONS; the runner owns the state transitions + cinematics.
    this.objType = this.cfg.objective.type;
    this.objective = makeObjective(this.objType, this);

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
    const jobs = [preloadEnemies(), preloadHeli(), preloadOperator(), preloadVehicles(), preloadPickups(), preloadWeapons(), preloadCreatures(), preloadNature()];
    let done = 0; this.hud.setLoadingProgress(0, jobs.length + 1);
    jobs.forEach((p) => p.then(() => this.hud.setLoadingProgress(++done, jobs.length + 1)));
    await Promise.all(jobs);
    this.weapon.buildLauncher(); // launcher model is loaded now
    // build the level now that all prop models are loaded, then seat the camera at the spawn
    this.levelDef.build(this.level);
    const sp = this.level.playerSpawn;
    if (this.level.terrainHeight && this.cfg.intro && this.cfg.intro.style === "parachute") {
      // start screen: an aerial vantage over the drop zone (else the camera sits buried under the hill)
      const gy = this.level.terrainHeight(sp.x, sp.z);
      this.camera.position.set(sp.x - 26, gy + 72, sp.z - 26); this.camera.lookAt(sp.x, gy + 6, sp.z);
    } else {
      this.camera.position.set(sp.x, this.controller.eye, sp.z);
    }
    // A persistent gunship searchlight, added to the scene ONCE (intensity 0 when idle). The heli
    // reuses it, so the scene's light count never changes between spawns -> no shader recompile hitch.
    this.heliLight = new THREE.SpotLight(0xfff4d2, 0, 140, 0.5, 0.5, 1.0); this.heliLight.castShadow = false;
    this.scene.add(this.heliLight, this.heliLight.target);
    // Warm up: build the gunship once (using the shared light), compile shaders + render one hidden
    // frame so the first real spawn mid-fight is already fully compiled and uploaded.
    const warm = new Helicopter(this.scene, this.level, this.heliLight, this.cfg.balance.gunship.hp);
    this.engine.renderer.compile(this.scene, this.camera);
    this.engine.outline.render(this.scene, this.camera);
    this.scene.remove(warm.group, warm.headBeam);
    this.heliLight.intensity = 0;
    this.hud.setLoadingProgress(jobs.length + 1, jobs.length + 1);
    this.combat = new Combat(this.scene, this.camera, this.level, this.weapon, this.vfx, this.audio, {
      onPlayerHit: (dmg) => this._onPlayerHit(dmg),
      onKill: (count, left) => { this.hud.killFeed(this.cfg.messages.hostileDown); this.hud.setHostiles(left); this.voice.enemyDown(); },
      onHitmarker: (killed) => { this.shotsHit++; this.hud.hitmarker(killed); this.audio.hitmarker(killed); },
      onExplosive: (rec, units) => this.destructibles.damageExplosive(rec, units),
      onVehicleHit: (rec, units) => this.destructibles.damageVehicle(rec, units),
    });
    this.hud.setHostiles(this.combat.enemiesLeft);
    this.state = "start";
    this.hud.showStart(() => this._deploy(), {
      title: this.levelDef.name,
      brief: this.objective.brief(),
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
    this.weapon.group.visible = false; // hands on the rope/canopy, not the gun
    const parachute = this.cfg.intro.style === "parachute";
    if (!parachute) this.audio.startRotor();
    const sp = this.level.playerSpawn;
    const groundY = this.level.terrainHeight ? this.level.terrainHeight(sp.x, sp.z) : 0;
    this.intro = parachute
      ? new ParachuteIntro(this.scene, this.camera, sp, groundY)
      : new Intro(this.scene, this.camera, sp);
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
    this.objective.onPlayStart();
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
    const gb = this.cfg.balance.grenade;
    g.radius = gb.radius; g.damage = gb.damage; g.power = gb.power; g.scale = 0.6;
    this._projectiles.push(g);
    this.audio.playBuf?.("clipout", 0.4);
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
    const rb = this.cfg.balance.rocket;
    rocket.radius = rb.radius; rocket.damage = rb.damage; rocket.power = rb.power; rocket.scale = 1.0; rocket.isRocket = true;
    this._projectiles.push(rocket);
    this._fovKick = Math.min(this._fovKick + 2.5, 6);
  }

  _weaponName(mode) {
    return { rifle: "MK-4 CARBINE", launcher: "MISSILE LAUNCHER", plasma: "PLASMA CANNON", arc: "ARC LANCE" }[mode] || "MK-4 CARBINE";
  }

  // Plasma Cannon: a glowing energy bolt that detonates in a big blue blast.
  _firePlasma(t) {
    this.weapon.firePlasma(t);
    const dir = new THREE.Vector3(); this.camera.getWorldDirection(dir);
    const pos = this.camera.position.clone().addScaledVector(dir, 0.9);
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0xbfeaff, emissive: 0x2a8cff, emissiveIntensity: 3 }));
    mesh.material.userData.outlineParameters = { visible: false };
    const bolt = new Projectile(this.scene, mesh, pos, dir.clone().multiplyScalar(72), { gravity: 0, fuse: 3, detonateOnHit: true });
    const b = this.cfg.balance.plasma;
    bolt.radius = b.radius; bolt.damage = b.damage; bolt.power = b.power; bolt.scale = 1.1; bolt.energy = true; bolt.units = b.units;
    this._projectiles.push(bolt);
    this._fovKick = Math.min(this._fovKick + 1.6, 5);
  }

  // Arc Lance: a chaining lightning beam — hits the targeted enemy, then leaps to nearby ones.
  _fireArc(t) {
    this.weapon.fireArc(t);
    this.hud.bloom();
    const b = this.cfg.balance.arc;
    const dir = new THREE.Vector3(); this.camera.getWorldDirection(dir);
    this._arcRay = this._arcRay || new THREE.Raycaster(); this._arcRay.far = 110;
    this._arcRay.set(this.camera.position, dir);
    const start = this.camera.position.clone().addScaledVector(dir, 1.0);
    const live = this.combat.enemies.filter((e) => !e.dead);
    const hits = this._arcRay.intersectObjects(live.map((e) => e.hitbox), true);
    let target = null;
    if (hits.length) { let o = hits[0].object; while (o && !(o.userData && o.userData.enemy)) o = o.parent; target = o?.userData?.enemy; }
    if (!target) { this.vfx.lightning(start, start.clone().addScaledVector(dir, 70)); return; } // missed — zap into the distance
    const wp = (e) => e.hitbox.getWorldPosition(new THREE.Vector3());
    this.vfx.lightning(start, wp(target)); target.takeDamage(b.damage); this.vfx.hitPuff(wp(target));
    const chained = new Set([target]); let prev = target;
    for (let n = 0; n < b.chains; n++) { // leap to the nearest un-zapped enemy
      let best = null, bd = b.chainRange * b.chainRange;
      for (const e of this.combat.enemies) { if (e.dead || chained.has(e)) continue; const d = e.pos.distanceToSquared(prev.pos); if (d < bd) { bd = d; best = e; } }
      if (!best) break;
      this.vfx.lightning(wp(prev), wp(best)); best.takeDamage(b.damage); this.vfx.hitPuff(wp(best)); chained.add(best); prev = best;
    }
  }

  _updateProjectiles(dt) {
    for (let i = this._projectiles.length - 1; i >= 0; i--) {
      const p = this._projectiles[i];
      p.update(dt, this.level);
      if (p.energy) this.vfx.plasmaTrail(p.pos); // glowing plasma trail
      else if (p.isRocket) this.vfx.rocketTrail(p.pos); // fire+smoke exhaust trail
      // rockets detonate on contact with the flying gunship (generous radius — the gunship is big)
      if (p.detonateOnHit && this.heli && !this.heli.dead) {
        const dx = this.heli.pos.x - p.pos.x, dy = (this.heli.pos.y || 0) - p.pos.y, dz = this.heli.pos.z - p.pos.z;
        if (dx * dx + dy * dy + dz * dz < 36) { p.done = true; p._heliHit = this.heli; } // ~6m
      }
      if (p.done) {
        const c = p.pos.clone();
        if (p.energy) this.vfx.energyBoom(c, p.scale || 1); else this.vfx.explosion(c, p.scale || 0.6);
        this.audio.explosion?.();
        // enemies/props take the big AoE damage; the heli + destructibles use the "unit" scale (below)
        applyBlast(c, { radius: p.radius || 6, damage: p.damage || 200, power: p.power || 15 }, this.combat.enemies, null, this.level.dynamics);
        const units = p.units || (p.isRocket ? this.cfg.balance.units.rocket : this.cfg.balance.units.grenade);
        const R = p.radius || 6;
        // gunship: a direct rocket hit, or being caught in the blast, applies unit damage
        if (this.heli && !this.heli.dead) {
          const dx = this.heli.pos.x - c.x, dy = (this.heli.pos.y || 0) - c.y, dz = this.heli.pos.z - c.z;
          if (p._heliHit || dx * dx + dy * dy + dz * dz < (R + 2) * (R + 2)) this.heli.takeDamage(units);
        }
        // barrels / fuel tanks / vehicles caught in the radius take unit damage and cook off
        this.destructibles.blastUnits(c, units, R);
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
    this._detT = this.cfg.balance.detonation.duration; this._detBlast = 0; // long enough for the player's flight to play out
    this.hud.hideDefuse(); this.hud.showTimer(false); this.hud.setCombatVisible(false);
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
    const det = this.cfg.balance.detonation;
    this._camVel = new THREE.Vector3(away.x * det.launchOut, det.launchUp, away.z * det.launchOut); // hurled high AND far
    this._camSpin = new THREE.Vector3(0.6 + Math.random() * 1.6, (Math.random() - 0.5) * 2.4, (Math.random() - 0.5) * 5); // wild tumble
  }


  _updateLaser() {
    if (!this.combat) return;
    if (this.weapon.mode === "launcher" || this.weapon.reloading) { this.laser.hide(); return; } // no laser on the launcher / mid-reload
    const tg = this._laserTargets; tg.length = 0;
    for (const m of this.level.solidMeshes) tg.push(m);
    for (const e of this.combat.enemies) if (!e.dead) tg.push(e.hitbox);
    if (this.heli && !this.heli.dead) tg.push(this.heli.hitbox);
    this.laser.update(tg);
  }

  update(dt, t) {
    this.hud.update(dt);
    this.vfx.update(dt); // always fade effects (even while paused) so trails clear
    this.level.update(t); // wave the objective flag
    this.laser.hide(); // re-shown each frame during play
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

    // fire — mouse or touch FIRE button (per weapon mode)
    const firing = this.input.mouseDown || this.input.touch.fire;
    const mode = this.weapon.mode;
    if (mode === "launcher") {
      if (firing && this.weapon.canFireRocket(t)) this._fireRocket(t);
    } else if (mode === "plasma") {
      if (firing && this.weapon.canFirePlasma(t)) this._firePlasma(t);
    } else if (mode === "arc") {
      if (firing && this.weapon.canFireArc(t)) this._fireArc(t);
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
    if (presses.includes("q")) this.hud.setWeaponName(this._weaponName(this.weapon.toggle()));

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

    // gift crates — walk over a loot crate for ammo / grenades / health
    if (this.level.gifts) {
      for (const gf of this.level.gifts) {
        if (gf.taken) continue;
        const dx = this.camera.position.x - gf.x, dz = this.camera.position.z - gf.z;
        if (dx * dx + dz * dz < gf.r * gf.r) {
          gf.taken = true; gf.group.visible = false;
          this.audio.playBuf?.("clipin", 0.6);
          if (gf.kind === "grenade") { this.grenades += 2; this.hud.setGrenades(this.grenades); this.hud.notify("+2 GRENADES · GIFT"); }
          else if (gf.kind === "health") { this.health = Math.min(this.cfg.player.maxHealth, this.health + 40); this.hud.notify("+40 HEALTH · GIFT"); }
          else if (gf.kind === "plasma" || gf.kind === "arc") {
            this.weapon.give(gf.kind); this.hud.setWeaponName(this._weaponName(gf.kind));
            this.hud.notify(`✦ ${this._weaponName(gf.kind)} ACQUIRED — Q to cycle`);
          } else { this.weapon.reserve += 60; this.hud.notify("+60 ROUNDS · GIFT"); }
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
      this.heli = new Helicopter(this.scene, this.level, this.heliLight, this.cfg.balance.gunship.hp);
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

    // HUD sync (ammo readout swaps to rockets in launcher mode)
    if (this.weapon.mode === "launcher") this.hud.setAmmo(this.weapon.rockets, 0, false);
    else if (this.weapon.mode === "plasma" || this.weapon.mode === "arc") this.hud.setAmmo("∞", "∞", false);
    else this.hud.setAmmo(this.weapon.ammo, this.weapon.reserve, this.weapon.reloading);
    this.hud.setHealth(this.health, this.cfg.player.maxHealth);

    this.objective.update(dt, t, presses);
  }
}

// Gate to desktop/laptop for now (see device.js); phones/tablets get a "play on a computer" screen.
if (isMobileOrTablet()) {
  showDesktopOnlyScreen();
} else {
  window.__game = new Game();
}
