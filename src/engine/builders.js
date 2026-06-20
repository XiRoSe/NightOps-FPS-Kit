import * as THREE from "three";

// Tag a material so the cel-shade OutlineEffect skips it (invisible hitboxes, additive VFX/beams).
export function noOutline(m) { m.userData.outlineParameters = { visible: false }; return m; }

// ---------------------------------------------------------------------------
// "Clear the Compound" — military art kit. Desaturated, daylight, cohesive.
// Hard-edged geometry on purpose: crates/walls/buildings read as intentional.
// ---------------------------------------------------------------------------
export const COLORS = {
  skyTop: 0x9bb7cf,
  skyBottom: 0xdfe4d8,
  fog: 0xd2d6c4,
  sand: 0xc9b487,
  sandDark: 0xb39e72,
  dirt: 0x9c8559,
  concrete: 0xb8b4a6,
  concreteDark: 0x8f8b7e,
  wall: 0xa9a48f,
  metal: 0x5d6168,
  metalDark: 0x42464c,
  olive: 0x6b6b3a,
  oliveDark: 0x53532c,
  woodCrate: 0xa9853f,
  woodDark: 0x7c5f2c,
  rust: 0x9c4a2e,
  sandbag: 0xbfa977,
  sandbagDark: 0xa7905f,
  hazard: 0xe0a32e,
  red: 0xc0392b,
  green: 0x4caf50,
  smokeGreen: 0x6fe09a,
  white: 0xeef0e6,
  black: 0x222428,
};

// Procedural ground texture: sandy speckle + soft blotches. No asset files.
let _groundTex = null;
export function groundTexture() {
  if (_groundTex) return _groundTex;
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#c9b487";
  ctx.fillRect(0, 0, 256, 256);
  // soft blotches
  for (let i = 0; i < 90; i++) {
    const r = 6 + Math.random() * 26;
    const g = 150 + Math.random() * 40;
    ctx.fillStyle = `rgba(${g - 30},${g - 50},${g - 90},${0.05 + Math.random() * 0.08})`;
    ctx.beginPath();
    ctx.arc(Math.random() * 256, Math.random() * 256, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // fine speckle
  const img = ctx.getImageData(0, 0, 256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 22;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n * 0.7;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(14, 14);
  tex.anisotropy = 4;
  _groundTex = tex;
  return tex;
}

// --- procedural surface textures (generated once, cached) ---
const _texCache = new Map();
function _canvas() { const c = document.createElement("canvas"); c.width = c.height = 256; return [c, c.getContext("2d")]; }
function _finishTex(c, repeat) {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 4;
  return tex;
}
export function surfaceTexture(kind) {
  if (_texCache.has(kind)) return _texCache.get(kind);
  const [c, ctx] = _canvas();
  if (kind === "concrete") {
    // concrete panel: base + fine grain + panel seams + subtle stains (no diagonals)
    ctx.fillStyle = "#b4b1a4"; ctx.fillRect(0, 0, 256, 256);
    const img = ctx.getImageData(0, 0, 256, 256);
    for (let i = 0; i < img.data.length; i += 4) { const n = (Math.random() - 0.5) * 26; img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n * 0.9; }
    ctx.putImageData(img, 0, 0);
    // soft stains
    for (let i = 0; i < 24; i++) { const r = 10 + Math.random() * 40; ctx.fillStyle = `rgba(90,88,80,${0.04 + Math.random() * 0.06})`; ctx.beginPath(); ctx.arc(Math.random() * 256, Math.random() * 256, r, 0, 7); ctx.fill(); }
    // panel seams at the tile edges (so tiling reads as concrete blocks)
    ctx.strokeStyle = "rgba(70,68,62,.5)"; ctx.lineWidth = 3;
    ctx.strokeRect(1, 1, 254, 254);
    ctx.strokeStyle = "rgba(255,255,255,.06)"; ctx.lineWidth = 1;
    ctx.strokeRect(3, 3, 250, 250);
  } else if (kind === "wood") {
    ctx.fillStyle = "#a9853f"; ctx.fillRect(0, 0, 256, 256);
    for (let x = 0; x < 256; x += 4) { const s = 30 + Math.random() * 40; ctx.fillStyle = `rgba(${110 - s / 2},${80 - s / 2},${40},${0.18 + Math.random() * 0.1})`; ctx.fillRect(x, 0, 2 + Math.random() * 2, 256); }
    ctx.fillStyle = "rgba(60,42,20,.5)"; ctx.fillRect(0, 124, 256, 4); ctx.fillRect(124, 0, 4, 256);
  } else if (kind === "metal") {
    ctx.fillStyle = "#5d6168"; ctx.fillRect(0, 0, 256, 256);
    for (let x = 0; x < 256; x += 2) { const v = 70 + Math.random() * 50; ctx.fillStyle = `rgba(${v},${v + 4},${v + 10},.12)`; ctx.fillRect(x, 0, 1, 256); }
    for (let i = 0; i < 40; i++) { ctx.fillStyle = `rgba(${120 + Math.random() * 60},${60},${40},${Math.random() * 0.18})`; ctx.beginPath(); ctx.arc(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 5, 0, 7); ctx.fill(); }
  }
  const tex = _finishTex(c, 1);
  _texCache.set(kind, tex);
  return tex;
}

const _cache = new Map();
export function mat(color, opts = {}) {
  const key = color + "|" + JSON.stringify(opts);
  if (_cache.has(key)) return _cache.get(key);
  const p = {
    color,
    roughness: opts.roughness ?? 0.9,
    metalness: opts.metalness ?? 0.0,
    flatShading: !!opts.flat,
  };
  if (opts.emissive !== undefined) p.emissive = opts.emissive;
  if (opts.emissiveIntensity !== undefined) p.emissiveIntensity = opts.emissiveIntensity;
  if (opts.transparent) { p.transparent = true; p.opacity = opts.opacity ?? 1; }
  const m = new THREE.MeshStandardMaterial(p);
  _cache.set(key, m);
  return m;
}

// shared geometry cache — repeated crates/walls/barrels reuse one geometry
const _geo = new Map();
function boxGeo(w, h, d) {
  const k = "b" + w + "_" + h + "_" + d;
  if (!_geo.has(k)) _geo.set(k, new THREE.BoxGeometry(w, h, d));
  return _geo.get(k);
}
function cylGeo(rt, rb, h, seg) {
  const k = "c" + rt + "_" + rb + "_" + h + "_" + seg;
  if (!_geo.has(k)) _geo.set(k, new THREE.CylinderGeometry(rt, rb, h, seg));
  return _geo.get(k);
}

export function texMat(color, kind, opts = {}) {
  const key = "t" + color + kind + JSON.stringify(opts);
  if (_cache.has(key)) return _cache.get(key);
  let map = surfaceTexture(kind);
  if (opts.repeat) {
    // clone so we can tile per-instance without affecting the shared texture
    map = map.clone();
    map.needsUpdate = true;
    map.repeat.set(opts.repeat[0], opts.repeat[1]);
  }
  const m = new THREE.MeshStandardMaterial({
    color,
    map,
    roughness: opts.roughness ?? 0.85,
    metalness: opts.metalness ?? (kind === "metal" ? 0.55 : 0.0),
    envMapIntensity: opts.envMapIntensity ?? 0.7,
  });
  _cache.set(key, m);
  return m;
}

export function box(w, h, d, color, opts = {}) {
  const m = new THREE.Mesh(boxGeo(w, h, d), opts.mat || mat(color, opts));
  m.castShadow = opts.cast ?? true;
  m.receiveShadow = opts.receive ?? true;
  return m;
}
export function cyl(rt, rb, h, color, seg = 12, opts = {}) {
  const m = new THREE.Mesh(cylGeo(rt, rb, h, seg), opts.mat || mat(color, opts));
  m.castShadow = opts.cast ?? true;
  m.receiveShadow = opts.receive ?? true;
  return m;
}

// ---- props ---------------------------------------------------------------
export function makeCrate(size = 1) {
  const g = new THREE.Group();
  const body = box(size, size, size, COLORS.woodCrate, { mat: texMat(COLORS.woodCrate, "wood") });
  g.add(body);
  // edge framing
  const fc = COLORS.woodDark;
  const t = size * 0.1;
  for (const sy of [-size / 2 + t / 2, size / 2 - t / 2]) {
    for (const [ax, az] of [[size / 2 - t / 2, 0], [-size / 2 + t / 2, 0], [0, size / 2 - t / 2], [0, -size / 2 + t / 2]]) {
      const bar = box(ax === 0 ? size : t, t, az === 0 ? size : t, fc, { flat: true });
      bar.position.set(ax, sy, az);
      g.add(bar);
    }
  }
  g.position.y = size / 2;
  return g;
}

export function makeBarrel(color = COLORS.rust) {
  const g = new THREE.Group();
  const body = cyl(0.4, 0.4, 1.1, color, 16, { mat: texMat(color, "metal", { metalness: 0.5, roughness: 0.55 }) });
  g.add(body);
  for (const y of [-0.32, 0, 0.32]) {
    const ring = cyl(0.42, 0.42, 0.06, COLORS.metalDark, 14, { metalness: 0.4, roughness: 0.5 });
    ring.position.y = y;
    g.add(ring);
  }
  g.position.y = 0.55;
  return g;
}

// a low sandbag wall (stacked rounded-ish bags)
export function makeSandbags(len = 3) {
  const g = new THREE.Group();
  const rows = 2;
  const bagW = 0.55, bagH = 0.28, bagD = 0.5;
  for (let r = 0; r < rows; r++) {
    const offset = r % 2 ? bagW / 2 : 0;
    const n = Math.ceil(len / bagW);
    for (let i = 0; i < n; i++) {
      const bag = box(bagW * 0.96, bagH, bagD, i % 2 ? COLORS.sandbag : COLORS.sandbagDark, { flat: true, roughness: 1 });
      bag.position.set(-len / 2 + i * bagW + offset, bagH / 2 + r * (bagH * 0.85), 0);
      bag.rotation.y = (Math.random() - 0.5) * 0.06;
      g.add(bag);
    }
  }
  return g;
}

export function makeBollard() {
  const g = new THREE.Group();
  const post = cyl(0.12, 0.14, 0.9, COLORS.hazard, 10, { roughness: 0.7 });
  post.position.y = 0.45;
  g.add(post);
  const stripe = cyl(0.13, 0.13, 0.18, COLORS.black, 10);
  stripe.position.y = 0.62;
  g.add(stripe);
  return g;
}

// extraction marker: pad + flare post (green)
export function makeExfilPad() {
  const g = new THREE.Group();
  const pad = cyl(2.2, 2.2, 0.1, COLORS.metalDark, 24, { roughness: 0.7, metalness: 0.3 });
  pad.position.y = 0.05;
  g.add(pad);
  const ring = cyl(2.0, 2.0, 0.12, COLORS.green, 24, { emissive: COLORS.green, emissiveIntensity: 0.5 });
  ring.position.y = 0.07;
  g.add(ring);
  const innerRing = cyl(1.4, 1.4, 0.13, COLORS.smokeGreen, 24, { emissive: COLORS.smokeGreen, emissiveIntensity: 0.7 });
  innerRing.position.y = 0.08;
  g.add(innerRing);
  return g;
}

// Objective flag on a pole — cloth waves (see Level.update). Left edge pinned to pole.
export function makeFlag() {
  const g = new THREE.Group();
  const pole = cyl(0.055, 0.07, 4.4, COLORS.metalDark, 10, { metalness: 0.5, roughness: 0.5 });
  pole.position.y = 2.2;
  g.add(pole);
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), mat(COLORS.hazard, { emissive: COLORS.hazard, emissiveIntensity: 0.3 }));
  finial.position.y = 4.45;
  finial.castShadow = true;
  g.add(finial);

  const W = 1.7, H = 1.05;
  const geo = new THREE.PlaneGeometry(W, H, 14, 8);
  geo.translate(W / 2, 0, 0); // pin left edge at the pole
  const cloth = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ color: COLORS.green, emissive: COLORS.green, emissiveIntensity: 0.18, roughness: 0.9, side: THREE.DoubleSide })
  );
  cloth.position.set(0.05, 3.7, 0);
  cloth.castShadow = true;
  g.add(cloth);

  g.userData.cloth = cloth;
  g.userData.base = Float32Array.from(geo.attributes.position.array);
  g.userData.flagW = W;
  return g;
}
