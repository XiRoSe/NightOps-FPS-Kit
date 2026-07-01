const { chromium } = require("playwright");
const ARGS = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];
(async () => {
  const browser = await chromium.launch({ headless: true, args: ARGS });
  const page = await browser.newPage({ viewport: { width: 700, height: 800 } });
  await page.goto("http://localhost:5180/?level=meeseeks_mayhem", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => window.__game && window.__game.playerModel, null, { timeout: 90000 });
  const res = await page.evaluate(() => {
    const g = window.__game; const pm = g.playerModel;
    g._introDone = true; g._disposeLobby && g._disposeLobby(); g._startPlay(); g.controller.onUnlock = () => {};
    pm.setWeapon("rifle");
    const settle = (moving, speed, jetting, firing) => { for (let i = 0; i < 90; i++) { if (firing) pm.fireKick(); pm.update(1 / 60, moving, speed, jetting, 0); } return pm._weights(); };
    return {
      idle:       settle(false, 1, false, false),
      walking:    settle(true, 1, false, false),
      running:    settle(true, 2, false, false),
      standShoot: settle(false, 1, false, true),
      walkShoot:  settle(true, 1, false, true),   // <-- legs walk + arms aim
      runShoot:   settle(true, 2, false, true),   // <-- legs run  + arms aim
    };
  });
  console.log(JSON.stringify(res, null, 1));
  await browser.close();
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
