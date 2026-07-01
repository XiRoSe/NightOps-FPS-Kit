import * as THREE from "three";
import { RICK_MODEL, RICK_SHOOT, RM_HAND_BONE, clipsOf } from "./rickmorty-assets.js";
import { makeHeldGun, gunKindForMode } from "./heldguns.js";
import { makeGunModel } from "./gunmodels.js";

// 3rd-person RICK avatar. Now SKELETALLY ANIMATED (Mesh2Motion rig): Walk_Loop plays while moving, the
// held weapon is parented to the right-hand bone so it follows the hands, and Pistol_Shoot fires on demand.
// Falls back to a procedural homage if the rigged GLB isn't present. Returns { group, update, setWeapon, fireKick }.
export function makeRick() {
  const group = new THREE.Group();
  let mixer = null, walk = null, shoot = null, aim = null, hand = null, spineBone = null, spineBase = null, glb = false;
  let legL, legR, armL, armR; // procedural fallback handles
  const rig = {}, rigBase = {}; // arm/leg bones + their rest quats, for swing amplification

  if (RICK_MODEL.ready) {
    const inst = RICK_MODEL.make({ rightHand: RM_HAND_BONE, spine: "spine_02", ua_l: "upperarm_l", ua_r: "upperarm_r", th_l: "thigh_l", th_r: "thigh_r" });
    group.add(inst.model);
    mixer = new THREE.AnimationMixer(inst.model);
    for (const c of inst.animations) if (/walk/i.test(c.name)) walk = mixer.clipAction(c);
    const sc = clipsOf(RICK_SHOOT).find((c) => /shoot|pistol/i.test(c.name));
    if (sc) {
      shoot = mixer.clipAction(sc);
      const aimClip = sc.clone(); aim = mixer.clipAction(aimClip);     // a frozen frame of the shoot pose = a "weapon up, ready" idle stance
      aim.play(); aim.paused = true; aim.time = sc.duration * 0.5; aim.setEffectiveWeight(0);
    }
    hand = inst.bones.rightHand;
    spineBone = inst.bones.spine; if (spineBone) spineBase = spineBone.quaternion.clone(); // rest pose, for aim-pitch lean
    for (const k of ["ua_l", "ua_r", "th_l", "th_r"]) { const b = inst.bones[k]; if (b) { rig[k] = b; rigBase[k] = b.quaternion.clone(); } } // arm/leg bones for swing amplification
    if (walk) { walk.play(); walk.setEffectiveWeight(0); }
    glb = true;
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
    gun.position.copy(_tmp); gun.position.z += 0.15; gun.rotation.set(gunPitch, 0, 0); // pitch barrel to match the vertical aim
  };

  // JETPACK on Rick's back (back = -z local, which the 3rd-person camera sees) — rounded tank build (not boxy),
  // with layered additive thruster flames (blue-white core → yellow → orange tail) that flicker while flying.
  const jetpack = new THREE.Group(); jetpack.position.set(0, 1.34, -0.26); group.add(jetpack);
  const JM = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, metalness: 0.6, roughness: 0.4, flatShading: true, ...o });
  const spine = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.34, 6, 10), JM(0x3a3f47)); spine.position.set(0, 0, 0.05); jetpack.add(spine); // slim central spine
  for (const sx of [-0.13, 0.13]) {                            // two rounded fuel tanks + red caps + nozzles
    const tank = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.32, 6, 12), JM(0x59636f)); tank.position.set(sx, 0, 0); jetpack.add(tank);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), JM(0xb0432a)); cap.position.set(sx, 0.26, 0); jetpack.add(cap);
    const noz = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.085, 0.14, 10), JM(0x14161a)); noz.position.set(sx, -0.3, 0); jetpack.add(noz);
  }
  jetpack.traverse((o) => { if (o.isMesh && o.material.metalness !== undefined) o.castShadow = true; });
  const thruster = makeThruster();                             // additive particle plume from the two nozzles
  jetpack.add(thruster.points);

  let phase = 0, walkW = 0, jetSway = 0, gunPitch = 0, runLean = 0;
  const _muzzleV = new THREE.Vector3(), _spineQ = new THREE.Quaternion(), _xAxis = new THREE.Vector3(1, 0, 0), _swQ = new THREE.Quaternion(), _relQ = new THREE.Quaternion(), _euler = new THREE.Euler();
  return {
    group, setWeapon,
    getMuzzle() { if (!gun) return null; gun.updateWorldMatrix(true, false); return gun.localToWorld(_muzzleV.set(0, 0, 0.7)); }, // barrel tip in world space

    fireKick() { // re-trigger the shoot anim only once the previous shot has played out (semi-auto feel, no stutter)
      if (shoot && (!shoot.isRunning() || shoot.time >= shoot.getClip().duration - 0.02)) {
        shoot.reset(); shoot.setLoop(THREE.LoopOnce, 1); shoot.clampWhenFinished = true; shoot.setEffectiveWeight(1).play();
      }
    },
    update(dt, moving, speed = 1, jetting = false, aimPitch = 0) {
      gunPitch = aimPitch;                                       // barrel follows the vertical aim (so shots leave the muzzle correctly)
      thruster.update(dt, jetting);                              // particle plume
      jetSway += dt * (moving ? 16 * speed : 2.5);               // fast but SUBTLE side-to-side jiggle with the stride
      jetpack.rotation.z = Math.sin(jetSway) * (moving ? 0.05 : 0.012);
      if (mixer) {
        mixer.update(dt);
        walkW += ((moving ? 1 : 0) - walkW) * Math.min(1, dt * 10); // crossfade walk in/out by movement
        if (walk) { walk.setEffectiveWeight(walkW); walk.setEffectiveTimeScale(4 * speed); } // cadence matches ground speed (no foot-slide); the forward lean sells the run
        const firing = shoot && shoot.isRunning() && shoot.time < shoot.getClip().duration - 0.02;
        if (shoot) shoot.setEffectiveWeight(firing ? 1 : 0); // release the shoot pose once the shot finishes — clamped weight was corrupting the walk loop
        if (aim) aim.setEffectiveWeight(firing ? 0 : 1 - walkW); // idle → gun-up ready stance; moving → full walk (arms swing); firing → shoot
        runLean += (((moving && speed > 1.5) ? 1 : 0) - runLean) * Math.min(1, dt * 8); // ease the sprint forward-lean in/out
        if (spineBone) { const lean = Math.max(-0.95, Math.min(0.95, Math.max(-0.8, Math.min(0.8, aimPitch)) + runLean * 0.5)); _spineQ.setFromAxisAngle(_xAxis, lean); spineBone.quaternion.copy(spineBase).multiply(_spineQ); } // aim pitch + a runner's forward lean while sprinting
        if (moving) {
          const run = speed > 1.5;
          for (const k of ["th_l", "th_r"]) if (rig[k]) { _swQ.copy(rig[k].quaternion); rig[k].quaternion.copy(rigBase[k]).slerp(_swQ, run ? 1.35 : 1.2); } // bigger leg stride
          // arms: take the clip's forward/back swing (already opposite the legs) and amplify ONLY that axis, cleanly
          for (const k of ["ua_l", "ua_r"]) if (rig[k]) { _relQ.copy(rigBase[k]).invert().multiply(rig[k].quaternion); _euler.setFromQuaternion(_relQ, "XYZ"); _swQ.setFromAxisAngle(_xAxis, _euler.x * (run ? 2.2 : 1.6)); rig[k].quaternion.copy(rigBase[k]).multiply(_swQ); }
        }
      } else if (legL) { // procedural fallback walk
        phase += dt * (moving ? 8.5 * speed : 2); const sw = Math.sin(phase);
        if (moving) { legL.rotation.x = sw * 0.7; legR.rotation.x = -sw * 0.7; armL.rotation.x = -sw * 0.6; armR.rotation.x = sw * 0.6; }
        else { legL.rotation.x *= 0.85; legR.rotation.x *= 0.85; }
      }
      trackGun(); // keep the weapon in-hand + pointing forward
    },
  };
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
    update(dt, jetting) {
      if (jetting) { acc += dt; while (acc > 0.0035) { acc -= 0.0035; // dense emission while flying
        for (let i = 0; i < N; i++) if (age[i] >= life[i]) {
          const n = NOZ[(Math.random() * 2) | 0];
          pos[i * 3] = n[0] + (Math.random() - 0.5) * 0.05; pos[i * 3 + 1] = n[1]; pos[i * 3 + 2] = (Math.random() - 0.5) * 0.05;
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
