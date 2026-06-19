import * as THREE from "three";
import { COLORS } from "../util/builders.js";

// Lightweight renderer: direct render (no post), PBR via image-based lighting.
export class Engine {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    container.appendChild(this.renderer.domElement);

    this.clock = new THREE.Clock();
    window.addEventListener("resize", () => this.resize());
    this.active = null;
  }

  // Baked equirectangular night sky (gradient + stars + big glowing moon),
  // used as the skybox AND the reflection/IBL source.
  setupNight(scene) {
    const W = 2048, H = 1024;
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const ctx = c.getContext("2d");
    // clean, smooth night gradient
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#0b1630");
    g.addColorStop(0.6, "#16273f");
    g.addColorStop(1, "#27394f");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // a sparse sprinkle of crisp stars in the upper sky
    for (let i = 0; i < 260; i++) {
      const b = Math.random();
      ctx.globalAlpha = 0.4 + b * 0.6;
      ctx.fillStyle = "#eaf0ff";
      const s = b > 0.9 ? 2 : 1;
      ctx.fillRect(Math.random() * W, Math.random() * H * 0.5, s, s);
    }
    ctx.globalAlpha = 1;

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.mapping = THREE.EquirectangularReflectionMapping;
    scene.background = tex;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    scene.environment = pmrem.fromEquirectangular(tex).texture;
    scene.environmentIntensity = 0.7;

    this.moonDir = new THREE.Vector3(-0.4, 0.62, -0.68).normalize();

    // crisp 3D moon billboard (a sprite — no equirect distortion)
    const mc = document.createElement("canvas"); mc.width = mc.height = 256;
    const m = mc.getContext("2d");
    const halo = m.createRadialGradient(128, 128, 50, 128, 128, 128);
    halo.addColorStop(0, "rgba(205,222,255,0.45)");
    halo.addColorStop(0.5, "rgba(185,205,250,0.10)");
    halo.addColorStop(1, "rgba(185,205,250,0)");
    m.fillStyle = halo; m.fillRect(0, 0, 256, 256);
    const disc = m.createRadialGradient(110, 110, 8, 128, 128, 66);
    disc.addColorStop(0, "#ffffff");
    disc.addColorStop(0.85, "#eef2ff");
    disc.addColorStop(1, "#ccd6ee");
    m.fillStyle = disc; m.beginPath(); m.arc(128, 128, 66, 0, 7); m.fill();
    // a couple of very subtle craters
    m.fillStyle = "rgba(165,180,215,0.25)";
    for (const [dx, dy, r] of [[-18, -8, 11], [14, 14, 14], [8, -22, 7]]) { m.beginPath(); m.arc(128 + dx, 128 + dy, r, 0, 7); m.fill(); }
    const mtex = new THREE.CanvasTexture(mc); mtex.colorSpace = THREE.SRGBColorSpace;
    const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: mtex, transparent: true, depthWrite: false, fog: false }));
    moon.position.copy(this.moonDir).multiplyScalar(400);
    moon.scale.setScalar(46); // small, distant moon
    scene.add(moon);
  }

  addLights(scene) {
    const hemi = new THREE.HemisphereLight(0x35435f, 0x080a10, 0.5);
    scene.add(hemi);
    const amb = new THREE.AmbientLight(0x223049, 0.4);
    scene.add(amb);
    // cool moonlight key with soft shadows
    const moon = new THREE.DirectionalLight(0xaec6ff, 1.7);
    moon.position.copy(this.moonDir || new THREE.Vector3(-0.45, 0.7, -0.55)).multiplyScalar(60);
    moon.castShadow = true;
    moon.shadow.mapSize.set(1024, 1024);
    const s = moon.shadow.camera;
    s.near = 1; s.far = 140;
    s.left = -40; s.right = 40; s.top = 40; s.bottom = -40;
    moon.shadow.bias = -0.0005;
    moon.shadow.normalBias = 0.06;
    scene.add(moon);
    scene.add(moon.target);
    return moon;
  }

  setActive(scene, camera) { this.active = { scene, camera }; }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    if (this.active?.camera) { this.active.camera.aspect = w / h; this.active.camera.updateProjectionMatrix(); }
  }

  start(onFrame) {
    const loop = () => {
      this._raf = requestAnimationFrame(loop);
      const dt = Math.min(this.clock.getDelta(), 0.05);
      const t = this.clock.elapsedTime;
      if (onFrame) onFrame(dt, t);
      if (this.active) this.renderer.render(this.active.scene, this.active.camera);
    };
    loop();
  }
}
