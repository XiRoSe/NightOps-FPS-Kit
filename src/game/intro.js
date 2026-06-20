import * as THREE from "three";
import { COLORS, box, cyl, noOutline } from "../engine/builders.js";
import { makeOperator } from "./operator.js";

// Third-person fast-rope insertion: a helicopter sweeps in over the compound with the
// player fast-roping on a rope below it, then drops him at the spawn. Cuts to first-person
// when the game starts. Skippable.
export class Intro {
  constructor(scene, camera, spawn) {
    this.scene = scene;
    this.camera = camera;
    this.spawn = new THREE.Vector3(spawn.x, 0, spawn.z);
    this.t = 0;
    this.dur = 12; // ~8.4s fly-in (70%) + ~3.6s fast-rope descent
    this.done = false;

    this.group = new THREE.Group();
    this.scene.add(this.group);

    // flight path: in from far + high, decelerating into a hover directly OVER the spawn
    // (so the player ropes straight down onto the compound, no sideways swing)
    this.heliStart = new THREE.Vector3(spawn.x - 20, 34, spawn.z + 82);
    this.heliHover = new THREE.Vector3(spawn.x - 0.9, 19, spawn.z + 0.3); // anchor lands ~over the spawn
    this.heliPos = this.heliStart.clone();
    this.anchor = new THREE.Vector3();   // rope hardpoint on the heli belly
    this.hands = new THREE.Vector3();     // player grip point (rope bottom)
    this.playerPos = new THREE.Vector3();

    this._buildHeli();
    this._buildPlayer();
    this._buildRope();

    // cinematic camera focus + offset (eased wide -> close)
    this._focus = new THREE.Vector3();
    this._camOff0 = new THREE.Vector3(15, 7, 16);   // wide establishing (see it approach)
    this._camOff1 = new THREE.Vector3(5.5, 2.6, 9);  // close, low, near the landing
    this._tmp = new THREE.Vector3();
    this._UP = new THREE.Vector3(0, 1, 0);
  }

  _buildHeli() {
    const olive = COLORS.oliveDark, metal = COLORS.metal;
    const h = new THREE.Group();
    const body = box(2.0, 1.8, 4.4, olive, { metalness: 0.4, roughness: 0.6 }); h.add(body);
    const nose = box(1.6, 1.2, 1.2, olive, { metalness: 0.4 }); nose.position.set(0, -0.2, 2.6); h.add(nose);
    const cab = box(1.7, 1.3, 1.5, 0x223038, { metalness: 0.7, roughness: 0.2 }); cab.position.set(0, 0.2, 2.1); h.add(cab);
    const boom = box(0.5, 0.5, 4.0, olive, { metalness: 0.4 }); boom.position.set(0, 0.45, -3.8); h.add(boom);
    const fin = box(0.16, 1.3, 0.9, olive); fin.position.set(0, 1.05, -5.4); h.add(fin);
    const stab = box(1.8, 0.12, 0.7, olive); stab.position.set(0, 0.55, -5.2); h.add(stab);
    for (const sx of [-0.9, 0.9]) {
      const skid = cyl(0.08, 0.08, 3.6, metal, 6); skid.rotation.x = Math.PI / 2; skid.position.set(sx, -1.15, 0.1); h.add(skid);
      const strut = box(0.07, 0.5, 0.07, metal); strut.position.set(sx, -0.85, 0.6); h.add(strut);
    }
    // open side door (player ropes from here)
    const door = box(0.05, 1.2, 1.4, 0x1a2228, { metalness: 0.6 }); door.position.set(1.02, 0.0, 0.3); h.add(door);
    // main rotor (spins)
    this.rotor = new THREE.Group();
    const hub = cyl(0.2, 0.2, 0.32, metal, 8); this.rotor.add(hub);
    for (let i = 0; i < 2; i++) { const b = box(0.2, 0.05, 9.0, 0x16181b); b.rotation.y = i * Math.PI / 2; this.rotor.add(b); }
    const disc = new THREE.Mesh(new THREE.CircleGeometry(4.5, 30),
      noOutline(new THREE.MeshBasicMaterial({ color: 0x12141a, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false })));
    disc.rotation.x = -Math.PI / 2; this.rotor.add(disc);
    this.rotor.position.set(0, 1.15, -0.2); h.add(this.rotor);
    // tail rotor
    this.tailRotor = new THREE.Group();
    for (let i = 0; i < 2; i++) { const tb = box(0.05, 1.2, 0.1, 0x16181b); tb.rotation.z = i * Math.PI / 2; this.tailRotor.add(tb); }
    this.tailRotor.position.set(0.32, 0.8, -5.5); h.add(this.tailRotor);
    // a small red beacon
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8),
      noOutline(new THREE.MeshBasicMaterial({ color: 0xff3322 })));
    beacon.position.set(0, -1.0, -1.5); h.add(beacon); this.beacon = beacon;

    // faint self-lighting so the airframe reads against the night sky (not a flat black blob)
    h.traverse((o) => { if (o.isMesh && o.material && o.material.emissive) { o.material = o.material.clone(); o.material.emissive.setHex(0x121611); o.material.emissiveIntensity = 0.5; } });
    // blinking white strobe on the belly
    const strobe = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 6), noOutline(new THREE.MeshBasicMaterial({ color: 0xffffff })));
    strobe.position.set(0, -1.15, 1.6); h.add(strobe); this.strobe = strobe;

    h.rotation.y = Math.PI; // nose (+Z) faces the travel direction (-Z, into the compound)
    this.heli = h;
    this.group.add(h);

    // dramatic searchlight sweeping down from the belly onto the insertion point
    // tight penumbra -> a crisp contained circle on the ground (no soft glow spilling outside it)
    this.searchlight = new THREE.SpotLight(0xfff2d4, 130, 80, 0.34, 0.12, 1.0);
    this.searchTarget = new THREE.Object3D();
    this.group.add(this.searchlight, this.searchTarget);
    this.searchlight.target = this.searchTarget;
    this.searchBeam = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 24, 1, true),
      noOutline(new THREE.MeshBasicMaterial({ color: 0xfff2d4, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })));
    this.searchBeam.frustumCulled = false;
    this.group.add(this.searchBeam);
  }

  _buildPlayer() {
    const made = makeOperator();
    if (made) {
      this.player = made.model;
      const b = made.bones;
      // right hand up gripping the rope; left arm bent ~40° in toward the body
      if (b.rArm) b.rArm.rotation.set(1.2, 0, 0.8);   // right arm up, wrist above the head
      if (b.rFore) b.rFore.rotation.set(0, 0, 0.1);
      if (b.lArm) b.lArm.rotation.set(0.55, 0, -0.5); // left arm raised ~40°
      if (b.lFore) b.lFore.rotation.set(0, 0, -0.7);  // forearm tucked toward the chest
      this.player.scale.multiplyScalar(0.85); // a little smaller
      this._gripHand = b.rWrist; // rope attaches to the raised wrist
    } else {
      // fallback proc figure
      this.player = new THREE.Group();
      const torso = box(0.5, 0.8, 0.3, COLORS.oliveDark); torso.position.y = 1.2; this.player.add(torso);
      const head = box(0.28, 0.3, 0.28, 0xcaa987); head.position.y = 1.75; this.player.add(head);
      for (const sx of [-0.3, 0.3]) { const arm = box(0.12, 0.7, 0.12, COLORS.oliveDark); arm.position.set(sx, 1.9, 0); this.player.add(arm); }
      for (const sx of [-0.15, 0.15]) { const leg = box(0.16, 0.8, 0.16, 0x2c3324); leg.position.set(sx, 0.4, 0); this.player.add(leg); }
    }
    this.group.add(this.player);
  }

  _buildRope() {
    this.ropeMat = noOutline(new THREE.MeshStandardMaterial({ color: 0x161510, roughness: 1, metalness: 0 }));
    this.rope = new THREE.Mesh(new THREE.BufferGeometry(), this.ropeMat);
    this.rope.frustumCulled = false;
    this.group.add(this.rope);
    this._curve = new THREE.CatmullRomCurve3([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]);
  }

  _updateRope() {
    const top = this.anchor, bot = this.hands;
    const len = top.distanceTo(bot);
    const sag = Math.min(2.2, len * 0.12);
    const sway = Math.sin(this.t * 2.1) * 0.35 + Math.sin(this.t * 3.3) * 0.15;
    const p = this._curve.points;
    p[0].copy(top);
    p[3].copy(bot);
    // two mid control points pulled down (sag) and pushed sideways (sway), tapering at the ends
    p[1].lerpVectors(top, bot, 0.34); p[1].y -= sag * 0.9; p[1].x += sway * 0.5; p[1].z += sway * 0.3;
    p[2].lerpVectors(top, bot, 0.68); p[2].y -= sag * 0.7; p[2].x += sway * 0.8; p[2].z += sway * 0.45;
    const geo = new THREE.TubeGeometry(this._curve, 22, 0.045, 5, false);
    this.rope.geometry.dispose();
    this.rope.geometry = geo;
  }

  start() {
    // position everything at t=0 and frame the camera before the first rendered frame
    this.update(0.0001);
  }

  update(dt) {
    this.t += dt;
    if (this.rotor) this.rotor.rotation.y += dt * 36;
    if (this.tailRotor) this.tailRotor.rotation.x += dt * 60;
    if (this.beacon) this.beacon.visible = Math.sin(this.t * 8) > 0;

    const k = Math.min(this.t / this.dur, 1);

    // --- helicopter: fly in (decelerating) for the first 70%, then hover with a gentle bob ---
    const flyK = Math.min(k / 0.7, 1);
    const fly = 1 - Math.pow(1 - flyK, 3); // easeOutCubic
    this.heliPos.lerpVectors(this.heliStart, this.heliHover, fly);
    if (k > 0.7) this.heliPos.y += Math.sin((this.t) * 1.6) * 0.18; // hover bob
    this.heli.position.copy(this.heliPos);
    // bank slightly while still moving fast, level out into the hover
    this.heli.rotation.z = (1 - fly) * 0.18;
    this.heli.rotation.x = (1 - fly) * -0.14;

    // rope hardpoint on the belly (door side)
    this.anchor.copy(this.heliPos).add(this._tmp.set(0.9, -1.15, -0.3));

    // --- player: ride tucked just under the heli during the flight, then fast-rope down only ON ARRIVAL ---
    const arrive = 0.7;                         // heli reaches the compound (matches the hover threshold)
    const flightY = this.anchor.y - 2.0;        // tucked right under the belly while flying
    const slideK = k < arrive ? 0 : Math.min((k - arrive) / (1 - arrive), 1);
    const slide = slideK * slideK * (3 - 2 * slideK); // smoothstep
    // horizontal: hang under the anchor while flying, settle onto the spawn as he ropes down
    this.playerPos.x = this.anchor.x + (this.spawn.x - this.anchor.x) * slide;
    this.playerPos.z = this.anchor.z + (this.spawn.z - this.anchor.z) * slide;
    this.playerPos.y = flightY + (0 - flightY) * slide; // descend to the ground after arrival
    // suspended in the air -> gentle pendulum sway (eases out as he reaches the ground)
    const sway = (1 - slide) * 0.18;
    this.playerPos.x += Math.sin(this.t * 1.1) * sway;
    this.playerPos.z += Math.cos(this.t * 0.85) * sway * 0.6;
    this.player.position.copy(this.playerPos);
    this.player.rotation.y = Math.PI; // face into the compound (-Z)
    this.player.rotation.z = Math.sin(this.t * 1.1) * 0.05 * (1 - slide); // slight swing tilt
    // the rope attaches to the RAISED grip hand -> he hangs straight from one hand
    this.player.updateWorldMatrix(true, true);
    if (this._gripHand) {
      this._gripHand.getWorldPosition(this.hands);
    } else {
      this.hands.copy(this.playerPos).add(this._tmp.set(0, 1.95, 0.05));
    }

    this._updateRope();

    // --- searchlight: beam from the belly down onto the insertion point ---
    this.searchlight.position.copy(this.anchor);
    this.searchTarget.position.set(this.playerPos.x, 0, this.playerPos.z);
    if (this.strobe) this.strobe.visible = Math.sin(this.t * 12) > 0.5;
    const from = this.anchor, to = this.searchTarget.position;
    const len = from.distanceTo(to) || 1;
    this.searchBeam.position.copy(from).add(to).multiplyScalar(0.5);
    this.searchBeam.quaternion.setFromUnitVectors(this._UP, this._tmp.copy(from).sub(to).normalize());
    const rad = Math.tan(0.34) * len;
    this.searchBeam.scale.set(rad, len, rad);

    // --- cinematic camera: frame the heli + player, easing from a wide to a close angle ---
    const camK = k * k * (3 - 2 * k); // smoothstep
    this._focus.lerpVectors(this.heliPos, this.playerPos, 0.45 + 0.4 * camK); // bias toward the player as he ropes down
    this._tmp.lerpVectors(this._camOff0, this._camOff1, camK);
    this.camera.position.copy(this._focus).add(this._tmp);
    this.camera.lookAt(this._focus);

    if (k >= 1) this.done = true;
  }

  skip() { this.t = this.dur; this.update(0); this.done = true; }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }
}
