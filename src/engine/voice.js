// Radio callouts — plays short CS-style clips from /public/audio.
export class Voice {
  constructor() {
    this.clips = {
      deploy: this._mk("/audio/go.wav", 0.85),
      kill: this._mk("/audio/enemydown.wav", 0.9),
      win: this._mk("/audio/ctwin.wav", 0.95),
      lose: this._mk("/audio/fallback.wav", 0.9),
      spotted: this._mk("/audio/enemy_spotted.wav", 1.0),
    };
    this._busyUntil = 0;
  }
  _mk(src, vol) {
    const a = new Audio(src);
    a.preload = "auto";
    a.volume = vol;
    return a;
  }
  _play(name, cooldown = 0) {
    const a = this.clips[name];
    if (!a) return;
    const now = performance.now() / 1000;
    if (now < this._busyUntil) return; // avoid overlapping callouts
    this._busyUntil = now + cooldown;
    try { a.currentTime = 0; a.play().catch(() => {}); } catch (e) {}
  }
  deploy() { this._play("deploy", 1.2); }
  enemySpotted() { this._play("spotted", 0); }
  enemyDown() { this._play("kill", 0.9); }
  win() { this._play("win", 0); }
  lose() { this._play("lose", 0); }
  hurt() {}
}
