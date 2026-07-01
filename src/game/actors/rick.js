import * as THREE from "three";
import { RICK_MODEL, RICK_WALK, RICK_RUN, RICK_GUN, RM_HAND_BONE, clipsOf } from "./rickmorty-assets.js";
import { makeHeldGun, gunKindForMode } from "./heldguns.js";
import { makeGunModel } from "./gunmodels.js";

// 3rd-person RICK avatar — a clean UE4-skeleton mesh driven by REAL Mixamo clips (Idle / Walk / Run / Gunplay)
// authored for this exact mesh, so they fit natively: no retargeting, no procedural swing/lean hacks. The held
// weapon rides the right-hand bone. Falls back to a procedural homage if the rig isn't present.
export function makeRick() {
  const group = new THREE.Group();
  let mixer = null, hand = null, handL = null;
  // Upper/lower-body split actions: legs run the locomotion clip, torso+arms crossfade to the Gunplay pose.
  let idleLo, idleUp, walkLo, walkUp, runLo, runUp, gunUp;
  let legL, legR, armL, armR; // procedural fallback handles

  if (RICK_MODEL.ready) {
    const inst = RICK_MODEL.make({ rightHand: RM_HAND_BONE, leftHand: "hand_l" });
    group.add(inst.model);
    mixer = new THREE.AnimationMixer(inst.model);
    // Each Mixamo clip is split into an upper half (torso/arms/head/hands) and a lower half (pelvis/legs/feet). The
    // legs always play locomotion; the arms swap to the aim pose while firing — so Rick runs-and-guns: legs keep
    // striding, hands hold the shooting stance. Upper+lower halves of the same clip stay in phase (never reset).
    const mk = (raw, up) => { const c = maskClip(raw, up); return c && c.tracks.length ? mixer.clipAction(c) : null; };
    const rIdle = clipsOf(RICK_MODEL)[0], rWalk = clipsOf(RICK_WALK)[0], rRun = clipsOf(RICK_RUN)[0], rGun = clipsOf(RICK_GUN)[0];
    idleLo = mk(rIdle, false); idleUp = mk(rIdle, true);
    walkLo = mk(rWalk, false); walkUp = mk(rWalk, true);
    runLo = mk(rRun, false); runUp = mk(rRun, true);
    gunUp = mk(rGun, true); // only the upper half of the gun stance — legs come from locomotion
    hand = inst.bones.rightHand; handL = inst.bones.leftHand;
    for (const a of [idleLo, idleUp, walkLo, walkUp, runLo, runUp, gunUp]) if (a) { a.play(); a.setEffectiveWeight(0); }
    if (idleLo) idleLo.setEffectiveWeight(1); if (idleUp) idleUp.setEffectiveWeight(1);
  } else {
    buildProcedural(group, (l, r, al, ar) => { legL = l; legR = r; armL = al; armR = ar; });
  }

  // held weapon — parented to the GROUP (native scale) and each frame snapped to the hand bone's position
  // while pointing forward (+Z = the way Rick faces/aims). Falls back to a fixed side position if unrigged.
  const _tmp = new THREE.Vector3();
  let gun = null, gunKind = null;
  const setWeapon = (mode) => {
    const k = gunKindForMode(mode); if (k === gunKind) return; gunKind = k;
    if (gun) group.remove(gun);
    gun = makeGunModel(k) || makeHeldGun(k); group.add(gun); // real CC0 model when loaded, else procedural
    if (!hand) gun.position.set(0.34, 1.16, 0.34);
  };
  setWeapon("sword");
  const trackGun = () => {
    if (!hand || !gun) return;
    hand.updateWorldMatrix(true, false); hand.getWorldPosition(_tmp); group.worldToLocal(_tmp);
    gun.position.copy(_tmp); gun.position.z += 0.15; gun.rotation.set(gunPitch + restDown * 1.1, 0, 0); // aim pitch + lowered (barrel down) while standing idle
  };

  // IRON-MAN hand jets: no jetpack — while flying, fire streams down out of both palms (thrusters tracked to the hands)
  const thruster = makeThruster(); thruster.points.frustumCulled = false; group.add(thruster.points);

  let phase = 0, mW = 0, sW = 0, fW = 0, fT = 0, gunPitch = 0, restDown = 0;
  const _muzzleV = new THREE.Vector3(), _hp = new THREE.Vector3();
  return {
    group, setWeapon,
    getMuzzle() { if (!gun) return null; gun.updateWorldMatrix(true, false); return gun.localToWorld(_muzzleV.set(0, 0, 0.7)); }, // barrel tip in world space
    fireKick() { fT = 0.3; }, // firing → blend in the Gunplay clip for a moment
    _weights: () => ({ idleLo: idleLo ? +idleLo.getEffectiveWeight().toFixed(2) : 0, walkLo: walkLo ? +walkLo.getEffectiveWeight().toFixed(2) : 0, runLo: runLo ? +runLo.getEffectiveWeight().toFixed(2) : 0, walkUp: walkUp ? +walkUp.getEffectiveWeight().toFixed(2) : 0, gunUp: gunUp ? +gunUp.getEffectiveWeight().toFixed(2) : 0, gunRotX: gun ? +gun.rotation.x.toFixed(2) : 0 }), // debug: legs vs arms
    update(dt, moving, speed = 1, jetting = false, aimPitch = 0) {
      gunPitch = aimPitch;                                       // barrel follows the vertical aim
      const pts = [];                                            // hand-jet emit points (group-local) while flying
      if (jetting && hand && handL) for (const hb of [hand, handL]) { hb.updateWorldMatrix(true, false); hb.getWorldPosition(_hp); group.worldToLocal(_hp); pts.push(_hp.x, _hp.y, _hp.z); }
      thruster.update(dt, jetting, pts);
      if (mixer) {
        mixer.update(dt);
        fT = Math.max(0, fT - dt);
        mW += ((moving ? 1 : 0) - mW) * Math.min(1, dt * 10);                     // idle↔move blend
        sW += (((moving && speed > 1.5) ? 1 : 0) - sW) * Math.min(1, dt * 8);     // walk↔run blend
        fW += (((fT > 0) ? 1 : 0) - fW) * Math.min(1, dt * 14);                   // gunplay (arm) blend
        const jW = jetting ? 1 : 0;                                                // flying → idle hover (Iron-Man), gun stowed
        const m = mW * (1 - jW), f = fW * (1 - jW);
        // LEGS (lower body): always locomotion — idle / walk / run — independent of firing
        if (idleLo) idleLo.setEffectiveWeight(Math.max(1 - m, jW));
        if (walkLo) walkLo.setEffectiveWeight(m * (1 - sW));
        if (runLo) runLo.setEffectiveWeight(m * sW);
        // TORSO + ARMS (upper body): locomotion swing when idle, Gunplay aim stance while firing → run-and-gun
        if (gunUp) gunUp.setEffectiveWeight(f);
        if (idleUp) idleUp.setEffectiveWeight(Math.max((1 - m) * (1 - f), jW));
        if (walkUp) walkUp.setEffectiveWeight(m * (1 - sW) * (1 - f));
        if (runUp) runUp.setEffectiveWeight(m * sW * (1 - f));
      } else if (legL) { // procedural fallback walk
        phase += dt * (moving ? 8.5 * speed : 2); const sw = Math.sin(phase);
        if (moving) { legL.rotation.x = sw * 0.7; legR.rotation.x = -sw * 0.7; armL.rotation.x = -sw * 0.6; armR.rotation.x = sw * 0.6; }
        else { legL.rotation.x *= 0.85; legR.rotation.x *= 0.85; }
      }
      restDown += (((!moving && fT <= 0 && !jetting) ? 1 : 0) - restDown) * Math.min(1, dt * 8); // lower the barrel when standing idle
      if (gun) gun.visible = !jetting;                           // stow the gun while flying (fire from bare hands)
      if (!jetting) trackGun();                                  // keep the weapon in-hand + pointing forward/down
    },
  };
}

// Split a Mixamo/UE4 clip into upper-body (torso/arms/head/hands) vs lower-body (pelvis/legs/feet) track sets, so
// legs and arms can be driven from different clips. A bone is "upper" by name; everything else (incl. pelvis) is lower.
const UPPER_RE = /spine|neck|head|clavicle|shoulder|upperarm|lowerarm|forearm|hand|thumb|index|middle|ring|pinky|finger/i;
function boneOf(trackName) { const dot = trackName.lastIndexOf("."); const path = dot >= 0 ? trackName.slice(0, dot) : trackName; return path.slice(path.lastIndexOf("/") + 1).split(":").pop(); }
function maskClip(clip, wantUpper) {
  if (!clip) return null;
  const tracks = clip.tracks.filter((t) => UPPER_RE.test(boneOf(t.name)) === wantUpper);
  return new THREE.AnimationClip(clip.name + (wantUpper ? "_up" : "_lo"), clip.duration, tracks);
}

function buildProcedural(group, refs) {
  const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, flatShading: true, ...o });
  const COAT = 0xcfe3ea, SKIN = 0xe8c9a8, HAIR = 0x9fd6e6, PANTS = 0x8a8f98, SHOE = 0x4a3b2e, BROW = 0x7a8a90;
  const legG = new THREE.Group(); group.add(legG);
  const mkLeg = (x) => { const leg = new THREE.Group(); const t = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.14, 0.95, 8), mat(PANTS)); t.position.y = -0.48; leg.add(t); const s = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.18, 0.42), mat(SHOE)); s.position.set(0, -0.98, 0.07); leg.add(s); leg.position.set(x, 0.95, 0); legG.add(leg); return leg; };
  const legL = mkLeg(-0.17), legR = mkLeg(0.17);
  const coat = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, 1.1, 10), mat(COAT)); coat.position.y = 1.55; group.add(coat);
  const shirt = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.5, 0.16), mat(0x6fae9b)); shirt.position.set(0, 1.62, 0.3); group.add(shirt);
  const mkArm = (x) => { const arm = new THREE.Group(); const s = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.11, 0.92, 8), mat(COAT)); s.position.y = -0.42; arm.add(s); const h = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), mat(SKIN)); h.position.y = -0.9; arm.add(h); arm.position.set(x, 2.0, 0); group.add(arm); return arm; };
  const armL = mkArm(-0.44), armR = mkArm(0.44);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.5, 0.44), mat(SKIN)); head.position.y = 2.42; group.add(head);
  for (const sx of [-0.11, 0.11]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), mat(0xffffff, { roughness: 0.3 })); e.position.set(sx, 2.46, 0.22); group.add(e); const p = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), mat(0x101010)); p.position.set(sx, 2.46, 0.29); group.add(p); }
  const brow = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.05, 0.05), mat(BROW)); brow.position.set(0, 2.58, 0.23); group.add(brow);
  const hair = new THREE.Group(); hair.position.y = 2.7; group.add(hair);
  for (const [x, y, z, tilt] of [[0, 0, 0, 0], [-0.16, -0.02, 0.05, 0.4], [0.16, -0.02, 0.05, -0.4], [-0.1, 0, -0.16, 0.2], [0.1, 0, -0.16, -0.2], [0, 0.04, 0.16, 0]]) { const s = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 7), mat(HAIR)); s.position.set(x, y + 0.18, z); s.rotation.z = tilt; hair.add(s); }
  group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  refs(legL, legR, armL, armR);
}

// soft round particle sprite (radial gradient → glowing dot) for additive flames
function makeSoftTex() {
  const c = document.createElement("canvas"); c.width = c.height = 64; const x = c.getContext("2d");
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.45, "rgba(255,255,255,0.55)"); g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.needsUpdate = true; return t;
}

// GPU thruster plume: a pool of additive soft sprites emitted from the two nozzles, falling + spreading and
// fading through a hot→cool color ramp (blue-white core → yellow → orange → smoulder). update(dt, jetting).
function makeThruster() {
  const N = 130, NOZ = [[-0.13, -0.36], [0.13, -0.36]];
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), siz = new Float32Array(N), alp = new Float32Array(N);
  const vel = new Float32Array(N * 3), age = new Float32Array(N).fill(99), life = new Float32Array(N);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
  geo.setAttribute("aSize", new THREE.BufferAttribute(siz, 1));
  geo.setAttribute("aAlpha", new THREE.BufferAttribute(alp, 1));
  // alpha-blended (not additive) so the flame reads as solid even over the bright daytime scene
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTex: { value: makeSoftTex() } },
    transparent: true, depthWrite: false,
    vertexShader: "attribute float aSize; attribute vec3 aColor; attribute float aAlpha; varying vec3 vC; varying float vA; void main(){ vC=aColor; vA=aAlpha; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=aSize*(340.0/max(0.1,-mv.z)); gl_Position=projectionMatrix*mv; }",
    fragmentShader: "uniform sampler2D uTex; varying vec3 vC; varying float vA; void main(){ float a=texture2D(uTex,gl_PointCoord).a; gl_FragColor=vec4(vC,a*vA); }",
  });
  const points = new THREE.Points(geo, mat); points.frustumCulled = false;
  // hot blue-white core → white → yellow → orange → red smoulder (core contrasts the orange scene)
  const ramp = (t) => t < 0.15 ? [0.75, 0.92, 1.0] : t < 0.35 ? [1.0, 0.98, 0.85] : t < 0.6 ? [1.0, 0.82, 0.3] : t < 0.85 ? [1.0, 0.42, 0.12] : [0.7, 0.16, 0.05];
  let acc = 0;
  return {
    points,
    update(dt, jetting, pts) {
      if (jetting && pts && pts.length) { acc += dt; while (acc > 0.0028) { acc -= 0.0028; // dense emission from the palms while flying
        for (let i = 0; i < N; i++) if (age[i] >= life[i]) {
          const h = ((Math.random() * pts.length / 3) | 0) * 3; // pick one of the emit points (hands)
          pos[i * 3] = pts[h] + (Math.random() - 0.5) * 0.05; pos[i * 3 + 1] = pts[h + 1]; pos[i * 3 + 2] = pts[h + 2] + (Math.random() - 0.5) * 0.05;
          vel[i * 3] = (Math.random() - 0.5) * 0.5; vel[i * 3 + 1] = -(2.6 + Math.random() * 2.0); vel[i * 3 + 2] = (Math.random() - 0.5) * 0.5;
          age[i] = 0; life[i] = 0.22 + Math.random() * 0.2; break;
        }
      } }
      for (let i = 0; i < N; i++) {
        if (age[i] >= life[i]) { siz[i] = 0; alp[i] = 0; continue; }
        age[i] += dt; const tn = age[i] / life[i];
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        const c = ramp(tn); col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
        alp[i] = Math.min(1, tn * 6) * (1 - tn) * 1.3;          // fade in fast, fade out toward the tail
        siz[i] = 0.3 + 0.4 * tn;                                 // grows along the plume
      }
      geo.attributes.position.needsUpdate = geo.attributes.aColor.needsUpdate = geo.attributes.aSize.needsUpdate = geo.attributes.aAlpha.needsUpdate = true;
    },
  };
}
