import * as THREE from "three";
import { COLORS, box } from "../util/builders.js";

// First-person rifle: viewmodel, ammo, recoil spring, muzzle flash.
export class Weapon {
  constructor(camera, audio) {
    this.camera = camera;
    this.audio = audio;
    this.magSize = 30;
    this.ammo = 30;
    this.reserve = 150;
    this.fireRate = 0.092; // ~650 rpm
    this.reloadTime = 1.5;
    this.damage = 34;
    this.spread = 0.012;
    this._lastShot = -1;
    this.reloading = false;
    this._reloadT = 0;

    this.group = new THREE.Group();
    this._build();
    camera.add(this.group);

    // recoil / sway state
    this.kick = 0;        // backward kick (springs to 0)
    this.kickRot = 0;     // muzzle rise
    this._basePos = new THREE.Vector3(0.24, -0.22, -0.55);
    this._baseRot = new THREE.Euler(0, Math.PI, 0);
    this.group.position.copy(this._basePos);
    this.group.rotation.copy(this._baseRot);

    this._muzzleWorld = new THREE.Vector3();
  }

  _build() {
    // PBR materials that catch the HDRI: gunmetal (reflective) + matte polymer
    const gun = { metalness: 0.92, roughness: 0.34, cast: false, receive: false };
    const poly = { metalness: 0.0, roughness: 0.7, cast: false, receive: false };
    const dark = COLORS.metalDark, body = 0x3a3d42, olive = COLORS.oliveDark;
    const P = (m, x, y, z, rx) => { m.position.set(x, y, z); if (rx) m.rotation.x = rx; this.group.add(m); return m; };

    // lower + upper receiver
    P(box(0.1, 0.12, 0.46, body, gun), 0, -0.01, 0.02);
    P(box(0.09, 0.05, 0.5, dark, gun), 0, 0.07, -0.02); // top rail base
    for (let z = -0.18; z <= 0.16; z += 0.06) P(box(0.05, 0.02, 0.02, dark, gun), 0, 0.11, z); // rail ridges
    // handguard (matte polymer) with side vents
    P(box(0.085, 0.085, 0.34, olive, poly), 0, 0.0, -0.34);
    for (const sx of [-0.05, 0.05]) for (let z = -0.46; z <= -0.24; z += 0.07) P(box(0.01, 0.05, 0.03, 0x2c2e26, poly), sx, 0.0, z);
    // barrel + muzzle device
    P(box(0.045, 0.045, 0.5, dark, gun), 0, 0.0, -0.55);
    P(box(0.07, 0.07, 0.1, dark, gun), 0, 0.0, -0.78);
    // curved magazine (grouped so it can drop out during reload)
    this._mag = new THREE.Group();
    const mb1 = box(0.07, 0.16, 0.1, olive, poly); mb1.position.set(0, -0.15, 0.06); mb1.rotation.x = 0.25;
    const mb2 = box(0.07, 0.13, 0.1, olive, poly); mb2.position.set(0, -0.28, 0.12); mb2.rotation.x = 0.5;
    this._mag.add(mb1, mb2);
    this.group.add(this._mag);
    this._magBase = this._mag.position.clone();
    // pistol grip
    P(box(0.07, 0.17, 0.09, body, poly), 0, -0.14, 0.2, -0.32);
    // stock with cheek riser
    P(box(0.06, 0.07, 0.12, dark, gun), 0, -0.01, 0.3);
    P(box(0.08, 0.12, 0.22, body, poly), 0, -0.03, 0.42);
    P(box(0.08, 0.05, 0.18, body, poly), 0, 0.06, 0.4); // cheek
    // red-dot optic
    P(box(0.08, 0.09, 0.12, dark, gun), 0, 0.16, 0.0);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.03, 12), new THREE.MeshBasicMaterial({ color: 0x66ddff, transparent: true, opacity: 0.5 }));
    P(lens, 0, 0.16, 0.06);
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.006, 8), new THREE.MeshBasicMaterial({ color: 0xff3b30 }));
    P(dot, 0, 0.16, 0.061);
    // charging handle
    P(box(0.03, 0.03, 0.06, dark, gun), 0.07, 0.06, 0.18);

    // muzzle flash (hidden by default)
    this.muzzle = new THREE.Group();
    this.muzzle.position.set(0, 0.02, -0.8);
    this.group.add(this.muzzle);
    const flashMat = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.95, depthWrite: false });
    this.flash = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), flashMat);
    this.flash.visible = false;
    this.muzzle.add(this.flash);
    const flash2 = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), flashMat.clone());
    flash2.rotation.z = Math.PI / 2;
    this.flash.add(flash2);
    this.flashLight = new THREE.PointLight(0xffb347, 0, 8, 2);
    this.muzzle.add(this.flashLight);
    this._flashT = 0;
  }

  get muzzleWorld() {
    this.muzzle.getWorldPosition(this._muzzleWorld);
    return this._muzzleWorld;
  }

  canFire(t) {
    return !this.reloading && this.ammo > 0 && (t - this._lastShot) >= this.fireRate;
  }

  fire(t) {
    this.ammo--;
    this._lastShot = t;
    this.kick = Math.min(this.kick + 0.06, 0.12);
    this.kickRot = Math.min(this.kickRot + 0.09, 0.18);
    // muzzle flash
    this.flash.visible = true;
    this.flash.rotation.z = Math.random() * Math.PI;
    this.flash.scale.setScalar(0.7 + Math.random() * 0.6);
    this.flashLight.intensity = 6;
    this._flashT = 0.05;
    this.audio?.shoot?.();
    if (this.ammo === 0) this.reload();
  }

  reload() {
    if (this.reloading || this.ammo === this.magSize || this.reserve <= 0) return;
    this.reloading = true;
    this._reloadT = this.reloadTime;
    this.audio?.reload?.();
  }

  update(dt, moving) {
    // recoil spring recovery
    this.kick += (0 - this.kick) * Math.min(1, dt * 12);
    this.kickRot += (0 - this.kickRot) * Math.min(1, dt * 12);

    // sway: gentle idle + walk bob
    const t = performance.now ? 0 : 0; // avoid Date; use accumulated below
    this._sway = (this._sway || 0) + dt * (moving ? 8 : 2);
    const swayX = Math.sin(this._sway) * (moving ? 0.012 : 0.004);
    const swayY = Math.abs(Math.sin(this._sway * 0.5)) * (moving ? 0.012 : 0.004);

    this.group.position.set(
      this._basePos.x + swayX,
      this._basePos.y + swayY,
      this._basePos.z + this.kick
    );
    this.group.rotation.set(this._baseRot.x - this.kickRot, this._baseRot.y, this._baseRot.z);

    // multi-phase reload animation: dip + tilt, mag drops out, then slams back in
    if (this.reloading) {
      this._reloadT -= dt;
      const p = 1 - this._reloadT / this.reloadTime; // 0..1
      const dip = Math.sin(Math.min(p, 1) * Math.PI);
      this.group.position.y -= dip * 0.22;
      this.group.position.x += dip * 0.05;
      this.group.rotation.x -= dip * 0.6;
      this.group.rotation.z = this._baseRot.z + dip * 0.35;
      // magazine: drop out (~0.12-0.42), gap, slam in (~0.62-0.85)
      let magY = 0, magRot = 0;
      if (p < 0.45) { const q = THREE.MathUtils.clamp((p - 0.12) / 0.3, 0, 1); magY = -0.5 * q; magRot = 0.6 * q; }
      else if (p < 0.62) { magY = -0.5; magRot = 0.6; }
      else { const q = THREE.MathUtils.clamp((p - 0.62) / 0.25, 0, 1); magY = -0.5 * (1 - q); magRot = 0.6 * (1 - q); }
      this._mag.position.set(this._magBase.x, this._magBase.y + magY, this._magBase.z);
      this._mag.rotation.x = magRot;
      if (this._reloadT <= 0) {
        const need = this.magSize - this.ammo;
        const take = Math.min(need, this.reserve);
        this.ammo += take;
        this.reserve -= take;
        this.reloading = false;
        this._mag.position.copy(this._magBase);
        this._mag.rotation.x = 0;
      }
    }

    // flash fade
    if (this._flashT > 0) {
      this._flashT -= dt;
      if (this._flashT <= 0) { this.flash.visible = false; this.flashLight.intensity = 0; }
      else { this.flashLight.intensity = (this._flashT / 0.05) * 6; }
    }
  }
}
