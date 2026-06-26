import * as THREE from "three";
import { makeHero } from "./actors/operator.js";

// Cinematic Helldivers/Star-Wars insertion: a slow-mo high-altitude descent while a yellow story CRAWL
// scrolls into the sky, then the pod ACCELERATES and plummets, slamming down in a big BLAST + shockwave —
// the operator emerges and it cuts to first-person. Interface: { start(), update(dt), done, dispose() }.
export class DropPodIntro {
  constructor(scene, camera, spawn, groundY = 0, heroId = null, vfx = null, audio = null, onImpact = null, onCrawl = null, onCrawlEnd = null) {
    this.scene = scene; this.camera = camera; this.vfx = vfx; this.audio = audio;
    this.onImpact = onImpact; this.onCrawl = onCrawl; this.onCrawlEnd = onCrawlEnd;
    this.spawn = new THREE.Vector3(spawn.x, groundY, spawn.z);
    this.phase = "crawl"; this.t = 0; this.hold = 0; this.done = false; this.impacted = false;
    this._calledCrawl = false; this._endedCrawl = false;
    this.crawlDur = 21.0;  // slow-mo crawl descent — 1.5x slower so the opening text reads comfortably
    this.fallDur = 1.9;    // hard plummet
    this.startY = 330; this.hoverY = 250;
    this.pos = new THREE.Vector3(spawn.x, this.startY, spawn.z);
    this.group = new THREE.Group(); this.scene.add(this.group);

    // the pod — a steel capsule whose body/dome/nose all share radius 1.1 + 8 segments so the facets seam cleanly
    this.pod = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({ color: 0x6a7078, metalness: 0.7, roughness: 0.45, flatShading: true });
    const dark = new THREE.MeshStandardMaterial({ color: 0x32363c, metalness: 0.6, roughness: 0.5, flatShading: true });
    const glow = new THREE.MeshStandardMaterial({ color: 0xffb45a, emissive: 0xff5a1a, emissiveIntensity: 2.2 });
    const R = 1.1;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 2.0, 8), steel); body.position.y = 1.6; this.pod.add(body);        // straight body 0.6→2.6
    const cap = new THREE.Mesh(new THREE.ConeGeometry(R, 0.9, 8), steel); cap.position.y = 3.05; this.pod.add(cap);                 // top dome, base seams to body top (2.6)
    const nose = new THREE.Mesh(new THREE.ConeGeometry(R, 1.4, 8), dark); nose.position.y = -0.1; nose.rotation.x = Math.PI; this.pod.add(nose); // bottom point, base seams to body bottom (0.6)
    const ring = new THREE.Mesh(new THREE.TorusGeometry(R + 0.06, 0.1, 8, 16), glow); ring.rotation.x = Math.PI / 2; ring.position.y = 0.85; this.pod.add(ring);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.8, 0.4, 8), glow); base.position.y = -0.7; this.pod.add(base);   // thruster
    this.podScale = 1.0; this.pod.scale.setScalar(this.podScale); // original size (the look that read best)
    this.pod.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.group.add(this.pod);

    const h = makeHero(heroId);
    if (h) { this.hero = h.model; this.hero.visible = false; this.group.add(this.hero); }
    this._look = new THREE.Vector3(); this._tmp = new THREE.Vector3();
  }

  start() {}

  update(dt) {
    if (this.phase === "crawl") {
      if (!this._calledCrawl) { this._calledCrawl = true; this.onCrawl && this.onCrawl(); } // (no descent engine SFX — leaving room for a story narrator)
      this.t += dt;
      const k = Math.min(this.t / this.crawlDur, 1);
      this.pos.y = this.startY + (this.hoverY - this.startY) * k; // slow drift down
      this.group.position.copy(this.pos);
      this.pod.rotation.y += dt * 0.5;
      // slow cinematic orbit, looking up at the pod against the crawling sky
      const a = this.t * 0.16;
      this.camera.position.set(this.pos.x + Math.cos(a) * 9, this.pos.y - 3.5, this.pos.z + Math.sin(a) * 9 - 5);
      this._look.set(this.pos.x, this.pos.y + 1.6, this.pos.z);
      this.camera.lookAt(this._look);
      if (this.vfx) { // smouldering re-entry fire streaming off the pod
        for (let i = 0; i < 3; i++) this.vfx.rocketTrail(this._tmp.set(this.pos.x + (Math.random() - 0.5) * 2.0, this.pos.y + 2.6 + Math.random() * 3, this.pos.z + (Math.random() - 0.5) * 2.0));
        if (this.vfx._fireball && Math.random() < 0.6) this.vfx._fireball(this._tmp.set(this.pos.x + (Math.random() - 0.5) * 1.6, this.pos.y + 3 + Math.random() * 2.5, this.pos.z + (Math.random() - 0.5) * 1.6), 0.55);
      }
      if (k >= 1) { this.phase = "fall"; this.t = 0; this._endCrawl(); }
    } else if (this.phase === "fall") {
      if (!this._endedCrawl) this._endCrawl();
      this.t += dt;
      const k = Math.min(this.t / this.fallDur, 1), ease = k * k * k; // hard accelerate into the ground
      this.pos.y = this.hoverY + (this.spawn.y - this.hoverY) * ease;
      this.group.position.copy(this.pos);
      this.pod.rotation.y += dt * (3 + ease * 9);
      if (this.vfx) { // blazing comet trail on the hard plummet
        for (let i = 0; i < 9; i++) this.vfx.rocketTrail(this._tmp.set(this.pos.x + (Math.random() - 0.5) * 1.8, this.pos.y + 2.4 + Math.random() * 6, this.pos.z + (Math.random() - 0.5) * 1.8));
        if (this.vfx._fireball) for (let i = 0; i < 3; i++) this.vfx._fireball(this._tmp.set(this.pos.x + (Math.random() - 0.5) * 1.6, this.pos.y + 3 + Math.random() * 4, this.pos.z + (Math.random() - 0.5) * 1.6), 0.6 + Math.random() * 0.4);
      }
      this.camera.position.set(this.pos.x - 3.5, this.pos.y + 4 + 6 * (1 - ease), this.pos.z - 12);
      this._look.set(this.pos.x, this.pos.y - 4 * ease, this.pos.z);
      this.camera.lookAt(this._look);
      if (k >= 1) { this._blast(); this.phase = "reveal"; this.hold = 0; }
    } else {
      this.hold += dt;
      const c = Math.min(1, this.hold / 0.9);
      this.pod.scale.setScalar(this.podScale * (1 - c * 0.08)); // settle slightly, keeping the bigger 1.25x base (no shrink-jump)
      this.camera.position.set(this.spawn.x + 3.4, this.spawn.y + 2.1, this.spawn.z + 4.6);
      this._look.set(this.spawn.x, this.spawn.y + 1.3, this.spawn.z);
      this.camera.lookAt(this._look);
      if (this.hold > 1.6) this.done = true;
    }
  }

  _endCrawl() { if (this._endedCrawl) return; this._endedCrawl = true; this.onCrawlEnd && this.onCrawlEnd(); }

  // the big finish: a cluster of explosions + a ground shockwave + heavy shake; the operator emerges
  _blast() {
    this.impacted = true;
    if (this.vfx) {
      for (let i = 0; i < 18; i++) this.vfx.explosion(this._tmp.set(this.spawn.x + (Math.random() - 0.5) * 10, this.spawn.y + 0.5 + Math.random() * 2.4, this.spawn.z + (Math.random() - 0.5) * 10), 2.4 + Math.random() * 0.8);
      for (let i = 0; i < 30; i++) this.vfx.dustBurst(this._tmp.set(this.spawn.x + (Math.random() - 0.5) * 22, this.spawn.y + 0.4, this.spawn.z + (Math.random() - 0.5) * 22));
      if (this.vfx._fireball) for (let i = 0; i < 8; i++) this.vfx._fireball(this._tmp.set(this.spawn.x + (Math.random() - 0.5) * 8, this.spawn.y + 1 + Math.random() * 2, this.spawn.z + (Math.random() - 0.5) * 8), 1.0 + Math.random());
      if (this.vfx._spawnDebris) this.vfx._spawnDebris(this._tmp.set(this.spawn.x, this.spawn.y + 0.4, this.spawn.z), 16);
      if (this.vfx._shockwave) { this.vfx._shockwave(this._tmp.set(this.spawn.x, this.spawn.y + 0.3, this.spawn.z)); setTimeout(() => this.vfx._shockwave(this._tmp.set(this.spawn.x, this.spawn.y + 0.3, this.spawn.z)), 120); }
      // bold XIII-style water/sand SPLASH — a fan of white-cyan plumes
      if (this.vfx._flash) for (let i = 0; i < 16; i++) this.vfx._flash(this._tmp.set(this.spawn.x + (Math.random() - 0.5) * 11, this.spawn.y + 0.8 + Math.random() * 3.5, this.spawn.z + (Math.random() - 0.5) * 11), 1.3 + Math.random() * 1.8, i % 2 ? 0xe6f7ff : 0x8fd6ec);
    }
    if (this.audio && this.audio.explosion) { this.audio.explosion(); setTimeout(() => this.audio.explosion(), 90); }
    if (this.audio && this.audio.splash) this.audio.splash();
    this.onImpact && this.onImpact();
    this.pod.position.y = -0.7; // pod buries its nose
    // hero stays hidden — you ARE the operator (first-person); showing the 3rd-person model just popped a head out the top
  }

  dispose() { this._endCrawl(); this.scene.remove(this.group); }
}
