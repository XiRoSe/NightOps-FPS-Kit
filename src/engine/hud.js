// Tactical HUD + menus. Distinctive condensed military type, hazard accents.
const CSS = `
:root{
  --hud:#d8e0c8; --dim:#8d9a7e; --hz:#e0a32e; --danger:#e0463a; --ok:#6fcf73;
  --panel:rgba(18,22,16,.62); --line:rgba(216,224,200,.28);
}
#ui, #ui *{ font-family:"Rajdhani","Saira Condensed",sans-serif; }
#ui{ color:var(--hud); letter-spacing:.04em; }
.mil-title{ font-family:"Saira Condensed",sans-serif; font-weight:700; text-transform:uppercase; letter-spacing:.14em; }

/* crosshair */
#xhair{ position:absolute; left:50%; top:50%; width:0; height:0; pointer-events:none; }
#xhair .tick{ position:absolute; background:var(--hud); box-shadow:0 0 3px rgba(0,0,0,.7); opacity:.9; }
#xhair .t-u,#xhair .t-d{ width:2px; height:9px; left:-1px; }
#xhair .t-l,#xhair .t-r{ height:2px; width:9px; top:-1px; }
#xhair .dot{ position:absolute; width:3px; height:3px; left:-1.5px; top:-1.5px; background:var(--hud); border-radius:50%; }
#hitmark{ position:absolute; left:50%; top:50%; width:0; height:0; pointer-events:none; opacity:0; }
#hitmark span{ position:absolute; width:2px; height:9px; background:#fff; }

/* vignette / damage */
#vign{ position:absolute; inset:0; pointer-events:none; box-shadow:inset 0 0 220px rgba(0,0,0,.55); }
#dmg{ position:absolute; inset:0; pointer-events:none; opacity:0;
  background:radial-gradient(120% 90% at 50% 110%, rgba(224,70,58,.55), transparent 55%); }

/* readouts */
.panel{ position:absolute; background:var(--panel); border:1px solid var(--line);
  padding:8px 14px; backdrop-filter:blur(2px); }
.panel .lbl{ font-size:11px; color:var(--dim); text-transform:uppercase; letter-spacing:.18em; }
#mission{ left:18px; top:16px; }
#mission .op{ font-size:15px; }
#hostiles{ left:18px; top:64px; }
#hostiles b{ font-size:26px; font-weight:700; color:var(--hz); line-height:1; }
#objective{ left:50%; top:18px; transform:translateX(-50%); text-align:center; }
#objective .arrow{ color:var(--hz); }

#health{ left:18px; bottom:18px; min-width:220px; }
#health .row{ display:flex; align-items:baseline; gap:8px; }
#health b{ font-size:30px; font-weight:700; line-height:1; }
#hpbar{ height:10px; margin-top:6px; background:rgba(0,0,0,.4); border:1px solid var(--line); }
#hpbar > i{ display:block; height:100%; width:100%; background:var(--ok); transition:width .15s, background .2s; }

#ammo{ right:18px; bottom:18px; text-align:right; min-width:180px; }
#ammo .gun{ font-size:12px; color:var(--dim); letter-spacing:.2em; }
#ammo .count b{ font-size:40px; font-weight:700; line-height:.9; }
#ammo .count s{ font-size:20px; color:var(--dim); text-decoration:none; }
#ammo.low .count b{ color:var(--danger); animation:blink .6s steps(2) infinite; }
@keyframes blink{ 50%{ opacity:.35; } }

#feed{ right:18px; top:16px; text-align:right; display:flex; flex-direction:column; gap:4px; }
#feed .k{ font-size:13px; color:var(--hud); background:var(--panel); border-right:3px solid var(--danger);
  padding:3px 10px; letter-spacing:.1em; animation:slideIn .25s ease; }
@keyframes slideIn{ from{ transform:translateX(20px); opacity:0; } }

/* overlays */
.overlay{ position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center;
  gap:18px; pointer-events:auto; text-align:center;
  background:radial-gradient(120% 100% at 50% 30%, rgba(20,26,18,.55), rgba(8,10,7,.88)); }
.overlay h1{ font-size:clamp(40px,8vw,92px); letter-spacing:.18em; margin:0;
  text-shadow:0 4px 24px rgba(0,0,0,.6); }
.overlay h1 .hz{ color:var(--hz); }
.overlay .sub{ font-size:18px; color:var(--dim); letter-spacing:.22em; text-transform:uppercase; }
.overlay .cta{ margin-top:10px; font-family:"Saira Condensed"; font-weight:700; text-transform:uppercase;
  letter-spacing:.18em; font-size:22px; color:#12160e; background:var(--hz); padding:14px 34px;
  border:none; cursor:pointer; clip-path:polygon(8px 0,100% 0,calc(100% - 8px) 100%,0 100%);
  animation:pulse 1.4s ease-in-out infinite; }
.overlay .controls{ margin-top:14px; font-size:14px; color:var(--dim); letter-spacing:.12em; line-height:1.9; }
.overlay .controls kbd{ color:var(--hud); border:1px solid var(--line); padding:1px 8px; margin:0 2px; }
.overlay .stats{ font-size:20px; letter-spacing:.1em; line-height:1.8; }
@keyframes pulse{ 50%{ transform:translateY(-4px); } }
.hidden{ display:none !important; }
`;

export class HUD {
  constructor() {
    this.root = document.getElementById("ui");
    const st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
    this.root.innerHTML = `
      <div id="vign"></div><div id="dmg"></div>
      <div id="xhair"><span class="tick t-u"></span><span class="tick t-d"></span>
        <span class="tick t-l"></span><span class="tick t-r"></span><span class="dot"></span></div>
      <div id="hitmark"><span></span><span></span><span></span><span></span></div>
      <div id="mission" class="panel"><div class="lbl">Operation</div><div class="op mil-title">Clear the Compound</div></div>
      <div id="hostiles" class="panel"><div class="lbl">Hostiles</div><b>0</b></div>
      <div id="objective" class="panel"><div class="lbl">Objective</div><div class="obj mil-title">Eliminate hostiles · reach <span class="arrow">EXTRACTION ▲</span></div></div>
      <div id="health" class="panel"><div class="lbl">Vitals</div><div class="row"><b>100</b><span class="dim">HP</span></div><div id="hpbar"><i></i></div></div>
      <div id="ammo" class="panel"><div class="gun">MK-4 CARBINE</div><div class="count"><b>30</b><s> / 150</s></div></div>
      <div id="feed"></div>
    `;
    this.xhair = this.root.querySelector("#xhair");
    this.hitmark = this.root.querySelector("#hitmark");
    this.dmg = this.root.querySelector("#dmg");
    this.hostiles = this.root.querySelector("#hostiles b");
    this.hpNum = this.root.querySelector("#health b");
    this.hpBar = this.root.querySelector("#hpbar > i");
    this.ammoEl = this.root.querySelector("#ammo");
    this.ammoCount = this.root.querySelector("#ammo .count");
    this.feed = this.root.querySelector("#feed");
    this.app = document.getElementById("app");

    this._bloom = 0; this._dmgT = 0; this._shake = 0; this._hitT = 0;
    this.setCombatVisible(false);
  }

  setCombatVisible(v) {
    ["#xhair", "#mission", "#hostiles", "#objective", "#health", "#ammo"].forEach((s) =>
      this.root.querySelector(s).classList.toggle("hidden", !v));
  }

  // ---- menus ----
  _overlay(html) {
    this._clearOverlay();
    const o = document.createElement("div"); o.className = "overlay"; o.id = "overlay";
    o.innerHTML = html; this.root.appendChild(o); return o;
  }
  _clearOverlay() { const e = this.root.querySelector("#overlay"); if (e) e.remove(); }

  showStart(onDeploy) {
    const o = this._overlay(`
      <div class="sub">Tactical Operations · Solo Deployment</div>
      <h1 class="mil-title">Clear the <span class="hz">Compound</span></h1>
      <button class="cta" id="deploy">▶ Click to Deploy</button>
      <div class="controls"><kbd>WASD</kbd> move &nbsp; <kbd>SHIFT</kbd> sprint &nbsp; <kbd>SPACE</kbd> jump &nbsp; <kbd>C</kbd> duck &nbsp; <kbd>MOUSE</kbd> aim &nbsp; <kbd>CLICK</kbd> fire &nbsp; <kbd>R</kbd> reload<br>
      Push to the extraction zone. Eliminate anyone in your way.</div>`);
    const go = () => { onDeploy(); };
    o.querySelector("#deploy").addEventListener("click", go);
  }
  showPause(onResume) {
    const o = this._overlay(`<div class="sub">Paused</div><h1 class="mil-title">Stand <span class="hz">By</span></h1>
      <button class="cta" id="resume">▶ Click to Resume</button>`);
    o.querySelector("#resume").addEventListener("click", onResume);
  }
  showWin(stats) {
    this._overlay(`<div class="sub">Mission Accomplished</div><h1 class="mil-title">Extraction <span class="hz">Complete</span></h1>
      <div class="stats">HOSTILES ELIMINATED &nbsp;<b>${stats.kills}/${stats.total}</b><br>ACCURACY &nbsp;<b>${stats.acc}%</b></div>
      <button class="cta" id="again">▶ Redeploy</button>`);
    this.root.querySelector("#again").addEventListener("click", () => location.reload());
  }
  showLose() {
    this._overlay(`<div class="sub">You were eliminated</div><h1 class="mil-title">K · <span class="hz">I</span> · A</h1>
      <button class="cta" id="again">▶ Redeploy</button>`);
    this.root.querySelector("#again").addEventListener("click", () => location.reload());
  }
  hideOverlay() { this._clearOverlay(); }

  // ---- live readouts ----
  setHealth(hp, max) {
    hp = Math.max(0, Math.round(hp));
    this.hpNum.textContent = hp;
    const pct = (hp / max) * 100;
    this.hpBar.style.width = pct + "%";
    this.hpBar.style.background = pct > 50 ? "var(--ok)" : pct > 25 ? "var(--hz)" : "var(--danger)";
  }
  setAmmo(ammo, reserve, reloading) {
    this.ammoCount.innerHTML = `<b>${reloading ? "––" : ammo}</b><s> / ${reserve}</s>`;
    this.ammoEl.classList.toggle("low", !reloading && ammo <= 6);
  }
  setHostiles(n) { this.hostiles.textContent = n; }
  setObjective(html) { const o = this.root.querySelector("#objective .obj"); if (o) o.innerHTML = html; }

  showLoading() {
    this._overlay(`<div class="sub">Preparing deployment</div><h1 class="mil-title">Loading<span class="hz">…</span></h1>`);
  }

  hitmarker(killed) {
    this.hitmark.style.opacity = "1";
    this.hitmark.querySelectorAll("span").forEach((s) => s.style.background = killed ? "var(--danger)" : "#fff");
    this._hitT = 0.18;
    const g = 7;
    const m = this.hitmark.querySelectorAll("span");
    m[0].style.cssText = `transform:translate(-${g}px,-${g}px) rotate(45deg)`;
    m[1].style.cssText = `transform:translate(${g}px,-${g}px) rotate(-45deg)`;
    m[2].style.cssText = `transform:translate(-${g}px,${g}px) rotate(-45deg)`;
    m[3].style.cssText = `transform:translate(${g}px,${g}px) rotate(45deg)`;
    this.hitmark.querySelectorAll("span").forEach((s) => { s.style.position = "absolute"; s.style.width = "2px"; s.style.height = "10px"; });
  }
  killFeed(text) {
    const d = document.createElement("div"); d.className = "k"; d.textContent = "✖ " + text;
    this.feed.appendChild(d);
    setTimeout(() => d.remove(), 3000);
  }
  damageFlash() { this._dmgT = 0.5; this._shake = Math.max(this._shake, 6); }
  bloom() { this._bloom = Math.min(this._bloom + 4, 14); this._shake = Math.max(this._shake, 2.5); }

  update(dt) {
    // crosshair bloom
    this._bloom += (0 - this._bloom) * Math.min(1, dt * 10);
    const g = 5 + this._bloom;
    this.xhair.querySelector(".t-u").style.transform = `translateY(-${g + 9}px)`;
    this.xhair.querySelector(".t-d").style.transform = `translateY(${g}px)`;
    this.xhair.querySelector(".t-l").style.transform = `translateX(-${g + 9}px)`;
    this.xhair.querySelector(".t-r").style.transform = `translateX(${g}px)`;
    // hitmarker fade
    if (this._hitT > 0) { this._hitT -= dt; this.hitmark.style.opacity = Math.max(0, this._hitT / 0.18); }
    // damage vignette
    if (this._dmgT > 0) { this._dmgT -= dt; this.dmg.style.opacity = Math.max(0, this._dmgT / 0.5); }
    // screen shake
    if (this._shake > 0.05) {
      this._shake *= Math.pow(0.001, dt);
      const sx = (Math.random() - 0.5) * this._shake, sy = (Math.random() - 0.5) * this._shake;
      this.app.style.transform = `translate(${sx}px,${sy}px)`;
    } else { this.app.style.transform = ""; }
  }
}
