import * as THREE from "three";

// First-person controller: manual pointer-lock mouse-look (yaw + pitch) + WASD with AABB collision.
export class Controller {
  constructor(camera, domElement, level) {
    this.camera = camera;
    this.dom = domElement;
    this.level = level;

    this.eye = 1.7;
    this.radius = 0.4;
    this.walkSpeed = 6.2;
    this.sprintSpeed = 9.8;
    this.bob = 0;
    this.moving = false;
    this.onStep = null;
    this._stepT = 0;
    this.sensitivity = 0.0022;
    this.locked = false;
    this.onLock = null;
    this.onUnlock = null;
    // jump + duck
    this.eyeCur = this.eye;
    this.crouchEye = 1.05;
    this.crouching = false;
    this.vy = 0;
    this.jumpY = 0;
    this.jumpStrength = 6.0;
    this.gravity = 22;
    this._jumpWas = false;

    camera.rotation.order = "YXZ";
    camera.position.set(level.playerSpawn.x, this.eye, level.playerSpawn.z);

    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._euler = new THREE.Euler(0, Math.PI, 0, "YXZ");
    this.camera.quaternion.setFromEuler(this._euler);

    this._onMove = (e) => {
      if (!this.locked) return;
      this._euler.setFromQuaternion(this.camera.quaternion);
      this._euler.y -= e.movementX * this.sensitivity;
      this._euler.x -= e.movementY * this.sensitivity;
      this._euler.x = Math.max(-1.5, Math.min(1.5, this._euler.x)); // clamp pitch
      this.camera.quaternion.setFromEuler(this._euler);
    };
    this._onLockChange = () => {
      this.locked = document.pointerLockElement === this.dom;
      if (this.locked) this.onLock?.();
      else this.onUnlock?.();
    };
    document.addEventListener("mousemove", this._onMove);
    document.addEventListener("pointerlockchange", this._onLockChange);
  }

  get isLocked() { return this.locked; }
  lock() { this.dom.requestPointerLock?.(); }
  unlock() { document.exitPointerLock?.(); }

  _blocked(x, z) {
    const r = this.radius;
    for (const c of this.level.colliders) {
      if (x > c.minX - r && x < c.maxX + r && z > c.minZ - r && z < c.maxZ + r) return true;
    }
    const b = this.level.bounds;
    if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) return true;
    return false;
  }

  update(dt, input) {
    // movement basis from camera yaw (flattened)
    this.camera.getWorldDirection(this._fwd);
    this._fwd.y = 0; this._fwd.normalize();
    // player's right = forward × up  (points +X when looking -Z)
    this._right.crossVectors(this._fwd, new THREE.Vector3(0, 1, 0)).normalize();

    let ix = 0, iz = 0;
    if (input.isDown("w", "arrowup")) iz += 1;
    if (input.isDown("s", "arrowdown")) iz -= 1;
    if (input.isDown("d", "arrowright")) ix += 1;
    if (input.isDown("a", "arrowleft")) ix -= 1;
    // touch joystick (mobile)
    const tc = input.touch;
    if (tc) { ix += tc.mx; iz += tc.mz; }

    // touch LOOK stick (mobile): rate-based turn while the stick is held
    if (tc && (tc.lookRX || tc.lookRY)) {
      const rate = 2.6; // radians/sec at full deflection
      this._euler.setFromQuaternion(this.camera.quaternion);
      this._euler.y -= tc.lookRX * rate * dt;
      this._euler.x -= tc.lookRY * rate * dt;
      this._euler.x = Math.max(-1.5, Math.min(1.5, this._euler.x));
      this.camera.quaternion.setFromEuler(this._euler);
    }

    const dir = this._tmpDir || (this._tmpDir = new THREE.Vector3());
    dir.set(0, 0, 0).addScaledVector(this._fwd, iz).addScaledVector(this._right, ix);
    this.moving = dir.lengthSq() > 0.0001;

    // duck (hold C / Z, or touch DUCK) — lower stance, slower. (NOT Ctrl: Ctrl+W closes the tab.)
    this.crouching = input.isDown("c", "z") || (tc && tc.duck);
    const targetEye = this.crouching ? this.crouchEye : this.eye;
    this.eyeCur += (targetEye - this.eyeCur) * Math.min(1, dt * 12);

    let speed = input.isDown("shift") && !this.crouching ? this.sprintSpeed : this.walkSpeed;
    if (this.crouching) speed *= 0.5;

    if (this.moving) {
      dir.normalize().multiplyScalar(speed * dt);
      let x = this.camera.position.x, z = this.camera.position.z;
      if (!this._blocked(x + dir.x, z)) x += dir.x;
      if (!this._blocked(x, z + dir.z)) z += dir.z;
      this.camera.position.x = x;
      this.camera.position.z = z;

      if (this.jumpY <= 0.001) {
        this.bob += dt * (speed * 1.4);
        this._stepT += dt;
        const interval = input.isDown("shift") ? 0.32 : 0.45;
        if (this._stepT > interval) { this._stepT = 0; this.onStep?.(); }
      }
    } else {
      this.bob += dt * 2;
    }

    // jump (Space) — only from the ground, not while crouching
    const jp = input.isDown(" ");
    if (jp && !this._jumpWas && this.jumpY <= 0.001 && !this.crouching) this.vy = this.jumpStrength;
    this._jumpWas = jp;
    this.jumpY += this.vy * dt;
    this.vy -= this.gravity * dt;
    if (this.jumpY < 0) { this.jumpY = 0; this.vy = 0; }

    const airborne = this.jumpY > 0.001;
    const bobAmt = (this.moving && !airborne) ? Math.sin(this.bob) * 0.045 : Math.sin(this.bob) * 0.012;
    this.camera.position.y = this.eyeCur + this.jumpY + bobAmt;
  }
}
