// Minimal play analytics (best-effort, fire-and-forget): counts a play when gameplay starts and reports
// the session duration when the game ends or the player leaves. Feeds the /crm dashboard in server.js.
let t0 = 0, active = false, sent = false;

export function trackStart() {
  if (active) return;            // one session per page load
  active = true; sent = false; t0 = Date.now();
  try {
    fetch("/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "start" }) }).catch(() => {});
  } catch { /* offline / blocked — ignore */ }
}

export function trackEnd(finished = false) {
  if (!active || sent) return;
  sent = true; active = false;
  const ms = Date.now() - t0;
  const body = JSON.stringify({ type: "end", ms, finished: !!finished }); // finished = actually beat the game (not just left)
  try {
    if (navigator.sendBeacon) navigator.sendBeacon("/api/track", new Blob([body], { type: "application/json" }));
    else fetch("/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
  } catch { /* ignore */ }
}

// catch the player leaving (close tab, navigate away, mobile background)
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", trackEnd);
  window.addEventListener("beforeunload", trackEnd);
}
