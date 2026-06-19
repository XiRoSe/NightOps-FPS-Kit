// On-screen touch controls for mobile: left virtual joystick (move),
// right side drag (look), and FIRE / JUMP / RELOAD / DUCK buttons.
const CSS = `
#touch { position:absolute; inset:0; z-index:20; pointer-events:none; display:none; touch-action:none; }
#touch.on { display:block; }
#touch .joy { position:absolute; width:140px; height:140px; border-radius:50%;
  border:2px solid rgba(216,224,200,.35); background:rgba(20,26,18,.25); display:none; }
#touch .knob { position:absolute; width:62px; height:62px; border-radius:50%;
  background:rgba(216,224,200,.5); border:2px solid rgba(255,255,255,.4); }
#touch .tbtn { position:absolute; pointer-events:auto; border:2px solid rgba(216,224,200,.4);
  background:rgba(18,22,16,.5); color:#d8e0c8; font-family:"Saira Condensed",sans-serif; font-weight:700;
  letter-spacing:.08em; border-radius:14px; display:flex; align-items:center; justify-content:center;
  user-select:none; -webkit-user-select:none; }
#touch .tbtn:active { background:rgba(224,163,46,.55); color:#12160e; }
#touch .fire { right:26px; bottom:120px; width:104px; height:104px; border-radius:50%; font-size:18px; }
#touch .jump { right:150px; bottom:150px; width:74px; height:74px; border-radius:50%; font-size:15px; }
#touch .duck { right:150px; bottom:60px; width:74px; height:74px; border-radius:50%; font-size:15px; }
#touch .reload { right:30px; bottom:240px; width:84px; height:64px; font-size:15px; }
`;

export class TouchControls {
  constructor(input) {
    this.input = input;
    this.enabled = (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) || "ontouchstart" in window;
    if (!this.enabled) return;

    const st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
    const root = document.createElement("div"); root.id = "touch";
    root.innerHTML = `
      <div class="joy"><div class="knob"></div></div>
      <div class="tbtn fire">FIRE</div>
      <div class="tbtn jump">JUMP</div>
      <div class="tbtn duck">DUCK</div>
      <div class="tbtn reload">RELOAD</div>`;
    document.getElementById("ui").appendChild(root);
    this.root = root;
    this.joy = root.querySelector(".joy");
    this.knob = root.querySelector(".knob");

    this.joyId = null; this.joyOrigin = { x: 0, y: 0 };
    this.lookId = null; this.lookLast = { x: 0, y: 0 };
    this.R = 60;

    this._bindButtons(root);
    this._bindZones(root);
  }

  show() { if (this.enabled) this.root.classList.add("on"); }
  hide() { if (this.enabled) this.root.classList.remove("on"); }

  _bindButtons(root) {
    const t = this.input.touch;
    const hold = (sel, on, off) => {
      const el = root.querySelector(sel);
      el.addEventListener("touchstart", (e) => { e.preventDefault(); e.stopPropagation(); on(); }, { passive: false });
      el.addEventListener("touchend", (e) => { e.preventDefault(); e.stopPropagation(); off && off(); }, { passive: false });
      el.addEventListener("touchcancel", () => off && off());
    };
    hold(".fire", () => (t.fire = true), () => (t.fire = false));
    hold(".duck", () => (t.duck = true), () => (t.duck = false));
    hold(".jump", () => this.input.down.add(" "), () => this.input.down.delete(" "));
    hold(".reload", () => this.input.pressed.push("r"));
  }

  _bindZones(root) {
    const t = this.input.touch;
    const isBtn = (el) => el && el.classList && el.classList.contains("tbtn");
    root.addEventListener("touchstart", (e) => {
      for (const tc of e.changedTouches) {
        if (isBtn(tc.target)) continue;
        if (tc.clientX < window.innerWidth * 0.5 && this.joyId === null) {
          this.joyId = tc.identifier; this.joyOrigin = { x: tc.clientX, y: tc.clientY };
          this.joy.style.display = "block";
          this.joy.style.left = tc.clientX - 70 + "px";
          this.joy.style.top = tc.clientY - 70 + "px";
          this.knob.style.left = "39px"; this.knob.style.top = "39px";
        } else if (this.lookId === null) {
          this.lookId = tc.identifier; this.lookLast = { x: tc.clientX, y: tc.clientY };
        }
      }
    }, { passive: true });

    root.addEventListener("touchmove", (e) => {
      for (const tc of e.changedTouches) {
        if (tc.identifier === this.joyId) {
          let dx = tc.clientX - this.joyOrigin.x, dy = tc.clientY - this.joyOrigin.y;
          const len = Math.hypot(dx, dy) || 1; const cl = Math.min(len, this.R);
          dx = dx / len * cl; dy = dy / len * cl;
          this.knob.style.left = 39 + dx + "px"; this.knob.style.top = 39 + dy + "px";
          t.mx = dx / this.R; t.mz = -dy / this.R;
        } else if (tc.identifier === this.lookId) {
          t.lookDX += (tc.clientX - this.lookLast.x) * 2.2;
          t.lookDY += (tc.clientY - this.lookLast.y) * 2.2;
          this.lookLast = { x: tc.clientX, y: tc.clientY };
        }
      }
    }, { passive: true });

    const end = (e) => {
      for (const tc of e.changedTouches) {
        if (tc.identifier === this.joyId) { this.joyId = null; t.mx = 0; t.mz = 0; this.joy.style.display = "none"; }
        else if (tc.identifier === this.lookId) { this.lookId = null; }
      }
    };
    root.addEventListener("touchend", end, { passive: true });
    root.addEventListener("touchcancel", end, { passive: true });
  }
}
