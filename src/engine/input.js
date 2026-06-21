// Map a KeyboardEvent to a layout-independent logical token using e.code (the PHYSICAL key),
// so movement/actions work regardless of the keyboard language (Hebrew, Russian, etc.) — a user
// in a non-Latin layout still controls with the physical WASD/R/Q/etc. keys. Falls back to e.key.
function keyToken(e) {
  const c = e.code;
  if (c) {
    if (c.startsWith("Key")) return c.slice(3).toLowerCase();            // KeyW -> "w"
    if (c.startsWith("Digit")) return c.slice(5);                         // Digit1 -> "1"
    if (/^Numpad[0-9]$/.test(c)) return c.slice(6);                       // Numpad1 -> "1"
    switch (c) {
      case "Space": return " ";
      case "ArrowUp": return "arrowup";
      case "ArrowDown": return "arrowdown";
      case "ArrowLeft": return "arrowleft";
      case "ArrowRight": return "arrowright";
      case "ShiftLeft": case "ShiftRight": return "shift";
      case "Enter": case "NumpadEnter": return "enter";
      case "Backspace": return "backspace";
      case "Escape": return "escape";
    }
  }
  return (e.key || "").toLowerCase();
}

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
      const k = keyToken(e);
      if (!this.down.has(k)) this.pressed.push(k);
      this.down.add(k);
      if (["w", "a", "s", "d", " ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) e.preventDefault();
    });
    window.addEventListener("keyup", (e) => this.down.delete(keyToken(e)));
    window.addEventListener("mousedown", (e) => {
      if (e.button === 0) this.mouseDown = true;
      if (e.button === 2) this.pressed.push("rmb"); // right-click = one-shot (grenade)
    });
    window.addEventListener("mouseup", (e) => { if (e.button === 0) this.mouseDown = false; });
    window.addEventListener("contextmenu", (e) => e.preventDefault()); // no menu on right-click
  }

  isDown(...keys) { return keys.some((k) => this.down.has(k)); }
  drainPresses() { const q = this.pressed; this.pressed = []; return q; }
}
