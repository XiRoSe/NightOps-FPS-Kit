const { chromium } = require("playwright");
const ARGS = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];
(async () => {
  const browser = await chromium.launch({ headless: true, args: ARGS });
  const page = await browser.newPage({ viewport: { width: 500, height: 500 } });
  await page.addInitScript(() => { const P = (window.AudioContext || window.webkitAudioContext).prototype; P.decodeAudioData = function () { return Promise.resolve(this.createBuffer(1, 1, 22050)); }; });
  await page.goto("http://localhost:5180/?level=meeseeks_mayhem", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => window.__game && window.__game.combat && window.__game.playerModel, null, { timeout: 60000 });
  const res = await page.evaluate(() => {
    const g = window.__game; const V = g.camera.position.constructor;
    g._introDone = true; g._disposeLobby && g._disposeLobby(); g._startPlay(); g.controller.onUnlock = () => {};
    const out = {};

    // 1) enemy ROCKET now detonates on Rick's body + damages him (test high in the air → no terrain in the way)
    const gy = g.level.terrainHeight(0, 150), AY = gy + 60;
    g.controller.pos.set(0, 0, 150); g.controller.feetY = AY; g.controller.headPos.set(0, AY + 1.6, 150); g.controller.onGround = false;
    g._projectiles = g._projectiles || [];
    let hitReported = 0; const realHit = g._onPlayerHit.bind(g); g._onPlayerHit = (d) => { hitReported += d; realHit(d); };
    g._enemyFire({ from: { x: 0, y: AY + 1.0, z: 138 }, to: { x: 0, y: AY + 1.4, z: 150 }, kind: "rocket", dmg: 50 });
    let detZ = null;
    for (let i = 0; i < 120 && g._projectiles.length; i++) { g._updateProjectiles(1 / 60); if (g._projectiles[0]) detZ = +g._projectiles[0].pos.z.toFixed(1); }
    out.rocketHitDamage = hitReported; out.rocketProjLeft = g._projectiles.length; out.rocketLastZ = detZ;

    // 2) meeseeks tiers: sizes, hp, weapon scale
    const mk = (extra) => { const m = g.combat.spawnEnemy({ kind: "meeseeks", weapon: "rocket", x: 5, z: 5, ...extra }); const w = m._gun ? +m._gun.scale.x.toFixed(1) : null; const hp = m.hp; const sc = +m.sc.toFixed(1); m.removable = true; m.dead = true; return { sc, hp, weaponScale: w }; };
    out.normal = mk({}); out.huge = mk({ huge: true }); out.giant = mk({ giant: true });

    // 3) poof sound method exists
    out.poofFn = typeof g.audio.poof === "function";
    return out;
  });
  console.log(JSON.stringify(res, null, 1));
  await browser.close();
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
