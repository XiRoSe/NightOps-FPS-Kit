// Tiny zero-dependency static server for the built app (Railway/production).
// Also hosts a minimal CRM: /api/track records play sessions, /crm shows the dashboard.
import { createServer } from "http";
import { readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { extname, join, normalize } from "path";
import { fileURLToPath } from "url";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const DIST = join(ROOT, "dist");
const PORT = process.env.PORT || 8080;

// ── tiny analytics store ── persisted to the Railway volume at /data (survives redeploys), else locally
const DATA_DIR = existsSync("/data") ? "/data" : ROOT;
const STATS_FILE = join(DATA_DIR, "stats.json");
const stats = { plays: 0, totalMs: 0, completed: 0, first: Date.now(), days: {} };
try { Object.assign(stats, JSON.parse(await readFile(STATS_FILE, "utf8"))); } catch { /* first run */ }
let _saveT = null;
function saveStats() { clearTimeout(_saveT); _saveT = setTimeout(() => { writeFile(STATS_FILE, JSON.stringify(stats)).catch(() => {}); }, 400); }
function readBody(req) { return new Promise((res) => { let d = ""; req.on("data", (c) => { d += c; if (d.length > 1e5) req.destroy(); }); req.on("end", () => res(d)); req.on("error", () => res("")); }); }
function fmtDur(ms) { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`; }

function crmPage() {
  const avg = stats.completed ? stats.totalMs / stats.completed : 0;
  const days = Object.entries(stats.days).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 14);
  const rows = days.map(([d, v]) => `<tr><td>${d}</td><td>${v.plays || 0}</td><td>${v.completed || 0}</td><td>${v.completed ? fmtDur(v.ms / v.completed) : "—"}</td></tr>`).join("") || `<tr><td colspan="4" style="opacity:.5">no data yet</td></tr>`;
  const card = (label, val) => `<div class="card"><div class="num">${val}</div><div class="lbl">${label}</div></div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="30"><title>ARCFALL · CRM</title>
<style>body{margin:0;background:#0b0a14;color:#e7e3f5;font:15px/1.5 'Segoe UI',system-ui,sans-serif}.wrap{max-width:760px;margin:0 auto;padding:32px 20px}h1{font-size:22px;letter-spacing:.12em;color:#ffd23a;margin:0 0 4px}.sub{opacity:.55;margin:0 0 26px;font-size:13px}.cards{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:30px}.card{flex:1;min-width:150px;background:#16142200;background:#161422;border:1px solid #2a2740;border-radius:12px;padding:18px}.num{font-size:30px;font-weight:800;color:#fff}.lbl{opacity:.6;font-size:12px;text-transform:uppercase;letter-spacing:.08em;margin-top:4px}table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;padding:9px 12px;border-bottom:1px solid #221f33}th{opacity:.5;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.06em}h2{font-size:13px;text-transform:uppercase;letter-spacing:.1em;opacity:.6;margin:26px 0 8px}.foot{opacity:.4;font-size:12px;margin-top:26px}</style></head>
<body><div class="wrap"><h1>ARCFALL · PLAYER CRM</h1><p class="sub">live since ${new Date(stats.first).toISOString().slice(0, 10)} · auto-refreshes every 30s</p>
<div class="cards">${card("Plays", stats.plays)}${card("Finished sessions", stats.completed)}${card("Avg play time", stats.completed ? fmtDur(avg) : "—")}${card("Total play time", fmtDur(stats.totalMs))}</div>
<h2>Last 14 days</h2><table><thead><tr><th>Day</th><th>Plays</th><th>Sessions</th><th>Avg time</th></tr></thead><tbody>${rows}</tbody></table>
<p class="foot">A "play" = a session that reached gameplay. A "finished session" = one we got a duration for (game over or leaving the page). Avg time is over finished sessions.</p></div></body></html>`;
}
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".wav": "audio/wav",
  ".glb": "model/gltf-binary",
  ".hdr": "application/octet-stream",
  ".ktx2": "application/octet-stream",
  ".woff2": "font/woff2",
};

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);

    // ── CRM endpoints ──
    if (p === "/api/track" && req.method === "POST") {
      let j = {}; try { j = JSON.parse(await readBody(req)); } catch { /* ignore */ }
      const day = new Date().toISOString().slice(0, 10);
      const d = stats.days[day] || (stats.days[day] = { plays: 0, completed: 0, ms: 0 });
      if (j.type === "start") { stats.plays++; d.plays++; saveStats(); }
      else if (j.type === "end") { const ms = Math.max(0, Math.min(6 * 3600 * 1000, +j.ms || 0)); if (ms > 1500) { stats.totalMs += ms; stats.completed++; d.completed++; d.ms += ms; saveStats(); } }
      res.writeHead(204); return res.end();
    }
    if (p === "/crm" || p === "/crm/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" });
      return res.end(crmPage());
    }

    if (p === "/") p = "/index.html";
    let file = normalize(join(DIST, p));
    if (!file.startsWith(DIST)) { res.writeHead(403); return res.end("forbidden"); }
    let data;
    try {
      data = await readFile(file);
    } catch {
      file = join(DIST, "index.html"); // SPA fallback
      data = await readFile(file);
    }
    res.writeHead(200, {
      "Content-Type": MIME[extname(file)] || "application/octet-stream",
      "Cache-Control": extname(file) === ".html" ? "no-cache" : "public, max-age=86400",
    });
    res.end(data);
  } catch (e) {
    res.writeHead(500);
    res.end("server error");
  }
});
server.listen(PORT, () => console.log(`NightOps FPS Kit serving dist/ on :${PORT}`));
