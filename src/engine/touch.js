// Mobile controls: dual fixed joysticks (LEFT = move, RIGHT = look) + buttons.
// Big, semi-transparent. On mobile the HUD stats move to the top (set via body.mobile).
const CSS = `
#touch { position:absolute; inset:0; z-index:20; pointer-events:none; display:none; touch-action:none; }
#touch.on { display:block; pointer-events:auto; }
#touch .joy { position:absolute; bottom:24px; width:128px; height:128px; border-radius:50%;
  border:3px solid rgba(216,224,200,.28); background:rgba(20,26,18,.16); }
#touch .joy.left { left:24px; }
#touch .joy.right { right:24px; }
#touch .knob { position:absolute; left:38px; top:38px; width:52px; height:52px; border-radius:50%;
  background:rgba(216,224,200,.32); border:3px solid rgba(255,255,255,.32); }
#touch .jlabel { position:absolute; bottom:-20px; width:100%; text-align:center; color:rgba(216,224,200,.45);
  font-family:"Saira Condensed",sans-serif; font-weight:700; font-size:11px; letter-spacing:.16em; }
#touch .tbtn { position:absolute; pointer-events:auto; border:3px solid rgba(216,224,200,.38);
  background:rgba(18,22,16,.34); color:rgba(232,236,216,.85); font-family:"Saira Condensed",sans-serif; font-weight:700;
  letter-spacing:.05em; border-radius:14px; display:flex; align-items:center; justify-content:center;
  user-select:none; -webkit-user-select:none; font-size:14px; }
#touch .tbtn:active { background:rgba(224,163,46,.55); color:#12160e; }
#touch .fire { left:50%; transform:translateX(-50%); bottom:30px; width:78px; height:78px; border-radius:50%; font-size:16px; }
#touch .jump { left:50%; transform:translateX(-112px); bottom:56px; width:58px; height:58px; border-radius:50%; }
#touch .duck { left:50%; transform:translateX(54px); bottom:56px; width:58px; height:58px; border-radius:50%; }
#touch .reload { left:50%; transform:translateX(-37px); bottom:128px; width:74px; height:44px; }
/* mobile: HP + rounds on the RIGHT (HP above ammo), other stats stay on the left, bottom clear for controls */
body.mobile #health { top:16px; bottom:auto; right:14px; left:auto; text-align:right; transform:scale(.9); transform-origin:top right; }
body.mobile #ammo { top:84px; bottom:auto; right:14px; left:auto; text-align:right; transform:scale(.9); transform-origin:top right; }
/* rotate-to-landscape gate (portrait phones) */
#rotate { position:absolute; inset:0; z-index:60; display:none; flex-direction:column; align-items:center;
  justify-content:center; gap:18px; background:#0a0e08; color:#d8e0c8; text-align:center; pointer-events:auto;
  font-family:"Saira Condensed",sans-serif; }
#rotate .ico { font-size:64px; animation:rot 2s ease-in-out infinite; }
#rotate h2 { font-size:30px; font-weight:700; letter-spacing:.16em; margin:0; }
#rotate p { font-size:16px; color:#8d9a7e; letter-spacing:.1em; }
@keyframes rot { 0%,100%{ transform:rotate(0) } 50%{ transform:rotate(90deg) } }
body.portrait #rotate { display:flex; }
body.portrait #touch.on { display:none; }
`;

export class TouchControls {
  constructor(input) {
    this.input = input;
    this.enabled = false;     // true ONLY after a real finger touch (never on desktop)
    this._activated = false;
    // The ONLY thing that exists on desktop: a dormant listener. A mouse/keyboard
    // never fires touchstart, so this never activates and nothing is built.
    window.addEventListener("touchstart", () => this._activate(), { passive: true });
  }

  // Build the touch UI lazily, only once a real touch happens (i.e. on a phone/tablet).
  _activate() {
    if (this._activated) return;
    this._activated = true;
    this.enabled = true;
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

    this.C = 50;   // knob center offset ((170-70)/2)
    this.R = 66;   // drag radius
    this.moveId = null; this.moveBase = { x: 0, y: 0 };
    this.lookId = null; this.lookBase = { x: 0, y: 0 };

    const rot = document.createElement("div");
    rot.id = "rotate";
    rot.innerHTML = `<div class="ico">⟳</div><h2>ROTATE YOUR DEVICE</h2><p>Landscape mode required to play</p>`;
    document.getElementById("ui").appendChild(rot);
    this._checkOrientation = () => {
      const portrait = window.innerHeight > window.innerWidth;
      document.body.classList.toggle("portrait", portrait);
      this.input.touch.suspended = this.enabled && portrait;
    };
    window.addEventListener("resize", this._checkOrientation);
    window.addEventListener("orientationchange", this._checkOrientation);
    this._checkOrientation();

    this._bindButtons(root);
    this._bindSticks(root);

    // if the game is already underway, show immediately
    if (this._showWhenReady) this.show();
  }

  show() {
    this._showWhenReady = true;
    if (!this.enabled || !this.root) return; // desktop: never built, nothing to show
    this.root.classList.add("on");
    this._center(this.moveKnob); this._center(this.lookKnob);
  }
  hide() { this._showWhenReady = false; if (this.root) this.root.classList.remove("on"); }
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
