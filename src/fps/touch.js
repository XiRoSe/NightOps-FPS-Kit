// Mobile controls: dual fixed joysticks (LEFT = move, RIGHT = look) + buttons.
// Big, semi-transparent. On mobile the HUD stats move to the top (set via body.mobile).
const CSS = `
#touch { position:absolute; inset:0; z-index:20; pointer-events:none; display:none; touch-action:none; }
#touch.on { display:block; pointer-events:auto; }
#touch .joy { position:absolute; bottom:46px; width:224px; height:224px; border-radius:50%;
  border:3px solid rgba(216,224,200,.28); background:rgba(20,26,18,.16); }
#touch .joy.left { left:40px; }
#touch .joy.right { right:40px; }
#touch .knob { position:absolute; left:64px; top:64px; width:96px; height:96px; border-radius:50%;
  background:rgba(216,224,200,.32); border:3px solid rgba(255,255,255,.32); }
#touch .jlabel { position:absolute; bottom:-26px; width:100%; text-align:center; color:rgba(216,224,200,.45);
  font-family:"Saira Condensed",sans-serif; font-weight:700; font-size:13px; letter-spacing:.16em; }
#touch .tbtn { position:absolute; pointer-events:auto; border:3px solid rgba(216,224,200,.38);
  background:rgba(18,22,16,.34); color:rgba(232,236,216,.85); font-family:"Saira Condensed",sans-serif; font-weight:700;
  letter-spacing:.05em; border-radius:18px; display:flex; align-items:center; justify-content:center;
  user-select:none; -webkit-user-select:none; font-size:23px; }
#touch .tbtn:active { background:rgba(224,163,46,.55); color:#12160e; }
#touch .fire { left:50%; transform:translateX(-50%); bottom:54px; width:132px; height:132px; border-radius:50%; font-size:26px; }
#touch .jump { left:50%; transform:translateX(-188px); bottom:92px; width:96px; height:96px; border-radius:50%; }
#touch .duck { left:50%; transform:translateX(92px); bottom:92px; width:96px; height:96px; border-radius:50%; }
#touch .reload { left:50%; transform:translateX(-62px); bottom:206px; width:124px; height:74px; }
/* mobile: push stats to the top, keep the bottom clear for the controls */
body.mobile #health { top:120px; bottom:auto; left:18px; }
body.mobile #ammo { top:74px; bottom:auto; right:18px; }
`;

export class TouchControls {
  constructor(input) {
    this.input = input;
    this.enabled = (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) || "ontouchstart" in window;
    if (!this.enabled) return;
    document.body.classList.add("mobile");

    const st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
    const root = document.createElement("div"); root.id = "touch";
    root.innerHTML = `
      <div class="joy left"><div class="knob"></div><div class="jlabel">MOVE</div></div>
      <div class="joy right"><div class="knob"></div><div class="jlabel">LOOK</div></div>
      <div class="tbtn fire">FIRE</div>
      <div class="tbtn jump">JUMP</div>
      <div class="tbtn duck">DUCK</div>
      <div class="tbtn reload">RELOAD</div>`;
    document.getElementById("ui").appendChild(root);
    this.root = root;
    this.moveJoy = root.querySelector(".joy.left");
    this.moveKnob = this.moveJoy.querySelector(".knob");
    this.lookJoy = root.querySelector(".joy.right");
    this.lookKnob = this.lookJoy.querySelector(".knob");

    this.C = 64;   // knob center offset ((224-96)/2)
    this.R = 88;   // drag radius
    this.moveId = null; this.moveBase = { x: 0, y: 0 };
    this.lookId = null; this.lookBase = { x: 0, y: 0 };

    this._bindButtons(root);
    this._bindSticks(root);
  }

  show() {
    if (!this.enabled) return;
    this.root.classList.add("on");
    this._center(this.moveKnob); this._center(this.lookKnob);
  }
  hide() { if (this.enabled) this.root.classList.remove("on"); }
  _center(k) { k.style.left = this.C + "px"; k.style.top = this.C + "px"; }

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

  _baseCenter(el) { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }

  _drive(knob, base, x, y) {
    let dx = x - base.x, dy = y - base.y;
    const len = Math.hypot(dx, dy) || 1, cl = Math.min(len, this.R);
    dx = dx / len * cl; dy = dy / len * cl;
    knob.style.left = this.C + dx + "px"; knob.style.top = this.C + dy + "px";
    return { x: dx / this.R, y: dy / this.R };
  }

  _bindSticks(root) {
    const t = this.input.touch;
    const isBtn = (el) => el && el.classList && el.classList.contains("tbtn");
    root.addEventListener("touchstart", (e) => {
      for (const tc of e.changedTouches) {
        if (isBtn(tc.target)) continue;
        const left = tc.clientX < window.innerWidth * 0.5;
        if (left && this.moveId === null) {
          this.moveId = tc.identifier; this.moveBase = this._baseCenter(this.moveJoy);
          const v = this._drive(this.moveKnob, this.moveBase, tc.clientX, tc.clientY); t.mx = v.x; t.mz = -v.y;
        } else if (!left && this.lookId === null) {
          this.lookId = tc.identifier; this.lookBase = this._baseCenter(this.lookJoy);
          const v = this._drive(this.lookKnob, this.lookBase, tc.clientX, tc.clientY); t.lookRX = v.x; t.lookRY = v.y;
        }
      }
    }, { passive: true });

    root.addEventListener("touchmove", (e) => {
      for (const tc of e.changedTouches) {
        if (tc.identifier === this.moveId) {
          const v = this._drive(this.moveKnob, this.moveBase, tc.clientX, tc.clientY); t.mx = v.x; t.mz = -v.y;
        } else if (tc.identifier === this.lookId) {
          const v = this._drive(this.lookKnob, this.lookBase, tc.clientX, tc.clientY); t.lookRX = v.x; t.lookRY = v.y;
        }
      }
    }, { passive: true });

    const end = (e) => {
      for (const tc of e.changedTouches) {
        if (tc.identifier === this.moveId) { this.moveId = null; t.mx = 0; t.mz = 0; this._center(this.moveKnob); }
        else if (tc.identifier === this.lookId) { this.lookId = null; t.lookRX = 0; t.lookRY = 0; this._center(this.lookKnob); }
      }
    };
    root.addEventListener("touchend", end, { passive: true });
    root.addEventListener("touchcancel", end, { passive: true });
  }
}
