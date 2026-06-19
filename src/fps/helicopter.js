import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { COLORS, box, cyl, mat } from "../util/builders.js";

let HELI_TPL = null; // (kept for future glTF use; we build the gunship procedurally for control)
export async function preloadHeli() { /* using a procedural attack gunship — nothing to load */ }

// Attack helicopter boss: descends from the sky, hovers and strafes while firing,
// can be shot down, then explodes and crashes.
export class Helicopter {
  constructor(scene, level) {
    this.scene = scene;
    this.level = level;
    this.hp = 780; // tanky gunship (3x)
    this.dead = false;
    this.removable = false;
    this.state = "descend";
    this.fireCd = 1.0;
    this.deathT = 0;
    this._needExplode = false;
    this._smokeT = 0;

    this.hoverY = 15;
    this.pos = new THREE.Vector3((Math.random() - 0.5) * 8, 46, -2);

    this.group = new THREE.Group();
    this._build();
    this.group.position.copy(this.pos);
    this.scene.add(this.group);

    this._muzzle = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
  }

  _build() {
    if (HELI_TPL) this._buildModel();
    else this._buildProcedural();
  }

  _buildModel() {
    const m = HELI_TPL.clone(true);
    // auto-scale to ~6.5m and center at the group origin
    const bbox = new THREE.Box3().setFromObject(m);
    const size = bbox.getSize(new THREE.Vector3());
    const center = bbox.getCenter(new THREE.Vector3());
    const s = 6.5 / Math.max(size.x, size.y, size.z);
    m.scale.setScalar(s);
    m.position.set(-center.x * s, -center.y * s, -center.z * s);
    m.rotation.y = Math.PI; // face the player side (tweakable)
    this.group.add(m);
    this.model = m;

    const sx = size.x * s, sy = size.y * s, sz = size.z * s;
    // spinning rotor blur disc on top
    this.mainRotor = new THREE.Group();
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(Math.max(sx, sz) * 0.62, 28),
      new THREE.MeshBasicMaterial({ color: 0x15171a, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false })
    );
    disc.rotation.x = -Math.PI / 2;
    for (let i = 0; i < 2; i++) { const b = box(0.12, 0.04, Math.max(sx, sz) * 1.15, 0x202225, { roughness: 0.7 }); b.rotation.y = i * Math.PI / 2; this.mainRotor.add(b); }
    this.mainRotor.add(disc);
    this.mainRotor.position.y = sy * 0.5 + 0.1;
    this.group.add(this.mainRotor);
    this.tailRotor = null; this.beacon = null;

    // gun under the nose
    this._gunTip = new THREE.Object3D(); this._gunTip.position.set(0, -sy * 0.3, sz * 0.5); this.group.add(this._gunTip);

    // invisible hitbox sized to the model
    this.hitbox = new THREE.Mesh(
      new THREE.BoxGeometry(sx * 1.1, sy * 1.3, sz * 1.1),
      new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false })
    );
    this.hitbox.userData.heli = this;
    this.group.add(this.hitbox);
  }

  _buildProcedural() {
    // serious attack gunship (Apache-ish), nose at +Z so it faces the player when it yaws
    const dark = COLORS.metalDark, olive = COLORS.oliveDark, metal = COLORS.metal, glass = 0x1f2a30;
    // sleek fuselage + tapered nose
    const body = box(1.2, 1.25, 3.4, olive, { metalness: 0.45, roughness: 0.5 });
    body.position.set(0, 0, -0.2); this.group.add(body);
    const nose = box(0.95, 0.8, 1.5, olive, { metalness: 0.45, roughness: 0.5 });
    nose.position.set(0, -0.2, 1.95); this.group.add(nose);
    // tandem stepped cockpit (gunner front-low, pilot rear-high)
    const can1 = box(0.82, 0.55, 1.0, glass, { metalness: 0.6, roughness: 0.2 }); can1.position.set(0, 0.42, 1.35); this.group.add(can1);
    const can2 = box(0.92, 0.66, 1.0, glass, { metalness: 0.6, roughness: 0.2 }); can2.position.set(0, 0.6, 0.35); this.group.add(can2);
    // engine housings beside the rotor mast
    for (const sx of [-0.48, 0.48]) { const eng = box(0.5, 0.5, 1.5, dark, { metalness: 0.5, roughness: 0.5 }); eng.position.set(sx, 0.5, -0.6); this.group.add(eng); }
    // stub wings + rocket pods
    const wing = box(3.4, 0.16, 0.95, olive, { metalness: 0.45, roughness: 0.5 }); wing.position.set(0, 0.05, -0.3); this.group.add(wing);
    for (const sx of [-1.5, 1.5]) {
      const pylon = box(0.12, 0.32, 0.4, dark); pylon.position.set(sx, -0.08, -0.25); this.group.add(pylon);
      const pod = cyl(0.18, 0.18, 0.95, dark, 8, { metalness: 0.5 }); pod.rotation.x = Math.PI / 2; pod.position.set(sx, -0.28, -0.2); this.group.add(pod);
    }
    // tail boom + vertical fin + horizontal stabilizer
    const boom = box(0.4, 0.42, 3.2, olive, { metalness: 0.45, roughness: 0.5 }); boom.position.set(0, 0.18, -2.9); this.group.add(boom);
    const fin = box(0.16, 1.2, 0.8, olive, { metalness: 0.45, roughness: 0.5 }); fin.position.set(0, 0.78, -4.4); this.group.add(fin);
    const stab = box(1.7, 0.12, 0.6, olive); stab.position.set(0, 0.3, -4.1); this.group.add(stab);
    // landing wheels
    for (const wx of [-0.62, 0.62]) { const w = cyl(0.17, 0.17, 0.12, 0x111316, 10); w.rotation.z = Math.PI / 2; w.position.set(wx, -0.95, 0.5); this.group.add(w); const st = box(0.08, 0.7, 0.08, metal); st.position.set(wx, -0.6, 0.5); this.group.add(st); }
    // chin gun turret
    const turret = cyl(0.16, 0.2, 0.3, dark, 8, { metalness: 0.6 }); turret.position.set(0, -0.62, 2.2); this.group.add(turret);
    const barrels = cyl(0.05, 0.05, 0.7, 0x111316, 6, { metalness: 0.7 }); barrels.rotation.x = Math.PI / 2; barrels.position.set(0, -0.62, 2.7); this.group.add(barrels);
    // main rotor (hub + blades) + blur disc
    this.mainRotor = new THREE.Group();
    const hub = cyl(0.16, 0.16, 0.4, metal, 8, { metalness: 0.7 }); this.mainRotor.add(hub);
    for (let i = 0; i < 2; i++) { const b = box(0.16, 0.05, 7.4, 0x16181b, { roughness: 0.7 }); b.rotation.y = i * Math.PI / 2; this.mainRotor.add(b); }
    this.mainRotor.position.set(0, 0.95, -0.4); this.group.add(this.mainRotor);
    const discMat = () => new THREE.MeshBasicMaterial({ color: 0x121417, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false });
    const mainDisc = new THREE.Mesh(new THREE.CircleGeometry(3.7, 28), discMat()); mainDisc.rotation.x = -Math.PI / 2; mainDisc.position.set(0, 0.97, -0.4); this.group.add(mainDisc);
    // tail rotor + disc
    this.tailRotor = new THREE.Group();
    for (let i = 0; i < 2; i++) { const tb = box(0.05, 1.1, 0.1, 0x16181b, { roughness: 0.7 }); tb.rotation.z = i * Math.PI / 2; this.tailRotor.add(tb); }
    this.tailRotor.position.set(0.28, 0.6, -4.5); this.group.add(this.tailRotor);
    const tailDisc = new THREE.Mesh(new THREE.CircleGeometry(0.66, 16), discMat()); tailDisc.rotation.y = Math.PI / 2; tailDisc.position.set(0.3, 0.6, -4.5); this.group.add(tailDisc);
    // nav lights (port red / starboard green) + blinking belly beacon
    const lightMesh = (c) => new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), mat(c, { emissive: c, emissiveIntensity: 1.4 }));
    const navL = lightMesh(0xff3326); navL.position.set(-1.72, 0.05, -0.2); this.group.add(navL);
    const navR = lightMesh(0x33ff66); navR.position.set(1.72, 0.05, -0.2); this.group.add(navR);
    this.beacon = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), mat(0xff2a2a, { emissive: 0xff2a2a, emissiveIntensity: 1.4 }).clone());
    this.beacon.position.set(0, -0.5, -1.4); this.group.add(this.beacon);

    // FRONT HEADLIGHT — dynamic searchlight that always reaches the ground below/ahead.
    // The lamp rides the heli; the light + beam live in the scene and are recomputed each frame.
    this._headLocal = new THREE.Vector3(0, -0.4, 2.6); // nose lamp position (group-local)
    const lens = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff7dc })); lens.position.copy(this._headLocal); this.group.add(lens);
    this.headLight = new THREE.SpotLight(0xfff4d2, 9, 120, 0.5, 0.55, 0.85); this.headLight.castShadow = false;
    this.scene.add(this.headLight, this.headLight.target);
    this.headBeam = new THREE.Mesh(
      new THREE.ConeGeometry(1, 1, 22, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff4d2, transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    this.headBeam.frustumCulled = false; this.scene.add(this.headBeam);
    this._hA = new THREE.Vector3(); this._hB = new THREE.Vector3(); this._hUp = new THREE.Vector3(0, 1, 0);

    // gun muzzle origin
    this._gunTip = new THREE.Object3D(); this._gunTip.position.set(0, -0.62, 3.0); this.group.add(this._gunTip);
    // hitbox (spans stub wings)
    this.hitbox = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.4, 8), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
    this.hitbox.userData.heli = this;
    this.group.add(this.hitbox);
  }

  takeDamage(dmg) {
    if (this.dead) return;
    this.hp -= dmg;
    if (this.hp <= 0) {
      this.dead = true;
      this.deathT = 0;
      this._needExplode = true;
      this.hitbox.userData.heli = null;
      this.hitbox.visible = false;
    }
  }

  update(dt, t, playerPos, ctx) {
    // rotor spin (slows after death)
    const spin = this.dead ? 4 : 26;
    if (this.mainRotor) this.mainRotor.rotation.y += spin * dt;
    if (this.tailRotor) this.tailRotor.rotation.x += spin * 1.6 * dt;
    // blinking belly beacon
    if (this.beacon) this.beacon.material.emissiveIntensity = Math.sin(t * 9) > 0 ? 1.8 : 0.12;

    if (this.dead) {
      if (this.headBeam) this.headBeam.visible = false;
      if (this.headLight) this.headLight.intensity = 0;
      if (this._needExplode) { // initial mid-air boom
        this._needExplode = false;
        this.group.getWorldPosition(this._tmp);
        ctx.vfx.explosion(this._tmp);
        ctx.audio?.explosion?.();
        ctx.audio?.stopRotor?.();
      }
      this.deathT += dt;
      // tumble + accelerating fall
      this.pos.y -= dt * (6 + this.deathT * 5);
      this.pos.x += dt * 1.2;
      this.group.position.copy(this.pos);
      this.group.rotation.z += dt * 1.8;
      this.group.rotation.x += dt * 1.0;
      // smoke/fire trail while falling
      this._smokeT -= dt;
      if (this._smokeT <= 0) { this._smokeT = 0.05; this.group.getWorldPosition(this._tmp); ctx.vfx.impact(this._tmp); }
      // ground impact -> huge fireball, then vanish
      if (this.pos.y <= 1.4 && !this._impacted) {
        this._impacted = true;
        this.group.getWorldPosition(this._tmp);
        const p = this._tmp;
        ctx.vfx.explosion(p);
        ctx.vfx.explosion(p.clone().add(new THREE.Vector3(3, 1.5, 0)));
        ctx.vfx.explosion(p.clone().add(new THREE.Vector3(-3, 0.5, 2)));
        ctx.vfx.explosion(p.clone().add(new THREE.Vector3(0, 2.5, -2.5)));
        ctx.audio?.explosion?.();
        this.group.visible = false; // disappear after the ground blast
        this.removable = true;
      }
      return;
    }

    // face the player (yaw)
    const yaw = Math.atan2(playerPos.x - this.pos.x, playerPos.z - this.pos.z);
    this.group.rotation.y = yaw;

    if (this.state === "descend") {
      this.pos.y += (this.hoverY - this.pos.y) * Math.min(1, dt * 0.9);
      if (this.pos.y < this.hoverY + 0.6) this.state = "attack";
    } else {
      // hover bob + slow strafe around the yard
      this.pos.x += Math.cos(t * 0.4) * dt * 2.2;
      this.pos.z = -2 + Math.sin(t * 0.3) * 6;
      this.pos.y = this.hoverY + Math.sin(t * 1.5) * 0.4;
      this.fireCd -= dt;
      if (this.fireCd <= 0) {
        this.fireCd = 0.55 + Math.random() * 0.4;
        this._fire(playerPos, ctx);
      }
    }
    this.group.position.copy(this.pos);
    this._updateHeadlight();
  }

  // searchlight that always reaches the ground (length grows with altitude), aimed forward+down
  _updateHeadlight() {
    if (!this.headBeam) return;
    this.group.updateWorldMatrix(true, false);
    const lamp = this._hA.copy(this._headLocal); this.group.localToWorld(lamp);
    const yaw = this.group.rotation.y, ahead = 7;
    const ground = this._hB.set(lamp.x + Math.sin(yaw) * ahead, 0.1, lamp.z + Math.cos(yaw) * ahead);
    this.headLight.position.copy(lamp);
    this.headLight.target.position.copy(ground); this.headLight.target.updateMatrixWorld();
    const dir = ground.clone().sub(lamp); const len = dir.length() || 1; dir.normalize();
    this.headBeam.position.copy(lamp).addScaledVector(dir, len / 2);
    this.headBeam.quaternion.setFromUnitVectors(this._hUp, dir.clone().negate());
    this.headBeam.scale.set(1.5, len, 1.5);
    this.headBeam.visible = true;
  }

  _fire(playerPos, ctx) {
    this._gunTip.getWorldPosition(this._muzzle);
    // minigun: a rapid 4-round burst with spread + ground impacts around the player
    for (let i = 0; i < 4; i++) {
      setTimeout(() => {
        if (this.dead) return;
        this._gunTip.getWorldPosition(this._muzzle);
        ctx.vfx.muzzle(this._muzzle);
        ctx.audio?.heliShot?.();
        this._tmp.set(playerPos.x + (Math.random() - 0.5) * 2.4, playerPos.y - 0.2, playerPos.z + (Math.random() - 0.5) * 2.4);
        ctx.vfx.tracer(this._muzzle, this._tmp);
        // most rounds kick up dust near the player; some connect
        if (Math.random() < 0.22) ctx.onPlayerHit(4 + Math.floor(Math.random() * 5));
        else { this._tmp.y = 0.1; ctx.vfx.impact(this._tmp, this._up || (this._up = new THREE.Vector3(0, 1, 0))); }
      }, i * 70);
    }
  }
}
