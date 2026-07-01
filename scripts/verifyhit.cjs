const { chromium } = require("playwright");
const ARGS = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];
(async () => {
  const browser = await chromium.launch({ headless: true, args: ARGS });
  const page = await browser.newPage({ viewport: { width: 500, height: 500 } });
  // headless swiftshader can't decode the big MP3 tracks (boot awaits clipsReady) → stub decodeAudioData to resolve instantly
  await page.addInitScript(() => { const P = (window.AudioContext || window.webkitAudioContext).prototype; P.decodeAudioData = function () { return Promise.resolve(this.createBuffer(1, 1, 22050)); }; });
  await page.goto("http://localhost:5180/?level=meeseeks_mayhem", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => window.__game && window.__game.combat && window.__game.playerModel, null, { timeout: 90000 });
  const res = await page.evaluate(() => {
    const g = window.__game;
    g._introDone = true; g._disposeLobby && g._disposeLobby(); g._startPlay(); g.controller.onUnlock = () => {};
    const V = g.camera.position.constructor;
    const test = (spawnExtra, label) => {
      g.combat.enemies.length = 0;
      const gy = g.level.terrainHeight(0, 0);
      const mz = g.combat.spawnEnemy({ kind: "meeseeks", weapon: "gun", x: 0, z: 30, ...spawnExtra });
      if (!mz) return { label, err: "no spawn" };
      mz.aggro = true; mz.group.position.set(0, gy, 0 + 30); mz.pos.set(0, 0, 30);
      g.camera.position.set(0, gy + 1.6, 0);
      const bodyY = gy + (mz.sc * 1.0); // aim at ~mid-body
      g.camera.lookAt(0, bodyY, 30); g.camera.updateMatrixWorld(true); g.scene.updateMatrixWorld(true);
      const fwd = new V(); g.camera.getWorldDirection(fwd);
      // sweep the aim vertically across the body to see how much of the tall hitbox actually registers
      let hitsAtCenter = false, hitCount = 0; const ys = [];
      for (const frac of [0.1, 0.25, 0.5, 0.75, 0.95]) {
        const aimY = gy + mz.sc * 2.0 * frac; const d = new V(0, aimY, 30).sub(g.camera.position).normalize();
        const r = g._rayShot(d, 220);
        const hit = !!(r && r.enemy === mz); if (hit) { hitCount++; ys.push(frac); }
        if (Math.abs(frac - 0.5) < 0.01) hitsAtCenter = hit;
      }
      const rC = g._rayShot(fwd, 220);
      return { label, sc: +mz.sc.toFixed(1), hp: mz.hp, hbH: +(2.0 * mz.sc).toFixed(1), centerHit: !!(rC && rC.enemy === mz), centerDist: rC && +rC.dist.toFixed(1), verticalHits: hitCount + "/5", hitFracs: ys };
    };
    return { normal: test({}, "normal"), huge: test({ huge: true }, "huge"), giant: test({ giant: true }, "giant") };
  });
  console.log(JSON.stringify(res, null, 1));
  await browser.close();
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
