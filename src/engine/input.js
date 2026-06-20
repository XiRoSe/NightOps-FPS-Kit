// Keyboard + mouse-button state. (Mouse-look is handled by PointerLockControls.)
export class Input {
  constructor() {
    this.down = new Set();
    this.mouseDown = false;
    this.pressed = [];
    // touch/mobile state (written by TouchControls)
    // mx/mz = move stick; lookRX/lookRY = look stick deflection (-1..1, rate-based)
    this.touch = { mx: 0, mz: 0, lookRX: 0, lookRY: 0, fire: false, duck: false, suspended: false };

    window.addEventListener("keydown", (e) => {
      const k = e.key.toLowerCase();
      if (!this.down.has(k)) this.pressed.push(k);
      this.down.add(k);
      if (["w", "a", "s", "d", " ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) e.preventDefault();
    });
    window.addEventListener("keyup", (e) => this.down.delete(e.key.toLowerCase()));
    window.addEventListener("mousedown", (e) => { if (e.button === 0) this.mouseDown = true; });
    window.addEventListener("mouseup", (e) => { if (e.button === 0) this.mouseDown = false; });
  }

  isDown(...keys) { return keys.some((k) => this.down.has(k)); }
  drainPresses() { const q = this.pressed; this.pressed = []; return q; }
}
