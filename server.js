// Tiny zero-dependency static server for the built app (Railway/production).
import { createServer } from "http";
import { readFile } from "fs/promises";
import { extname, join, normalize } from "path";
import { fileURLToPath } from "url";

const DIST = join(fileURLToPath(new URL(".", import.meta.url)), "dist");
const PORT = process.env.PORT || 8080;
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
server.listen(PORT, () => console.log(`CS_WEB_DEMO serving dist/ on :${PORT}`));
