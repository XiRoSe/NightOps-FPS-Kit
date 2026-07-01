const { chromium } = require("playwright");
const ARGS = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];
(async () => {
  const browser = await chromium.launch({ headless: true, args: ARGS });
  const page = await browser.newPage({ viewport: { width: 700, height: 700 } });
  await page.goto("http://localhost:5180/?level=meeseeks_mayhem", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => window.__game && window.__game.playerModel && window.__game.level.terrainHeight, null, { timeout: 90000 });
  await page.evaluate(() => {
    const g = window.__game; const pm = g.playerModel;
    g._introDone = true; g._disposeLobby && g._disposeLobby(); g._startPlay(); g.controller.onUnlock = () => {};
    g.combat.enemies.length = 0;
    const sp = g.level.playerSpawn, gy = g.level.terrainHeight(sp.x, sp.z);
    pm.setWeapon("rifle");
    pm.group.position.set(sp.x, gy, sp.z); pm.group.rotation.y = Math.PI * 0.5; // face +X so we see him side-on
    for (let i = 0; i < 80; i++) { pm.fireKick(); pm.update(1 / 60, true, 1, false, 0); } // walking + firing
    // frame side-on (camera on Rick's +Z flank; he faces +X) so legs (striding) + arms (aiming forward) both show
    const p = pm.group.position;
    g.camera.position.set(p.x + 0.6, p.y + 1.2, p.z + 4.4); g.camera.lookAt(p.x, p.y + 1.05, p.z);
    g.camera.fov = 42; g.camera.updateProjectionMatrix(); g.scene.updateMatrixWorld(true);
    document.querySelectorAll("#ui > *").forEach((e) => e.style && (e.style.display = "none"));
    if (g.engine.renderer) { g.engine.renderer.render(g.scene, g.camera); g.engine.outline && g.engine.outline.render(g.scene, g.camera); }
  });
  await page.waitForTimeout(250);
  await page.screenshot({ path: "media/runandgun.jpg", type: "jpeg", quality: 90 });
  console.log("shot done");
  await browser.close();
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
