// Synthesized FPS audio — no asset files. Created on first user gesture.
export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this._noise = null;
    this.buffers = {};
  }

  ensure() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.6;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 0.5;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this._noise = buf;
    this._loadClips();
  }
  async _loadClips() {
    const clips = {
      helicopter: "/audio/helicopter.ogg", // load first so the intro rotor is ready
      fire_player: "/audio/fire_player.wav",
      fire_enemy: "/audio/fire_enemy.wav",
      clipout: "/audio/clipout.wav",
      clipin: "/audio/clipin.wav",
      boltpull: "/audio/boltpull.wav",
      step1: "/audio/step1.wav",
      step2: "/audio/step2.wav",
      step3: "/audio/step3.wav",
      step4: "/audio/step4.wav",
      explosion: "/audio/explosion.wav",
      heli_fire: "/audio/heli_fire.wav",
    };
    for (const [name, url] of Object.entries(clips)) {
      try {
        const ab = await (await fetch(url)).arrayBuffer();
        this.buffers[name] = await this.ctx.decodeAudioData(ab);
        // if the rotor is already running on the synth fallback, upgrade to the real clip now
        if (name === "helicopter" && this._rotorWanted && !this._rotorSrc) { this._stopSynthRotor(); this._startRealRotor(); }
      } catch (e) { /* fall back to synth */ }
    }
  }
  // play a decoded clip (overlap-capable, low latency). Returns false if unavailable.
  playBuf(name, vol = 0.5, rate = 1) {
    if (!this.ctx || !this.buffers[name]) return false;
    const s = this.ctx.createBufferSource();
    s.buffer = this.buffers[name];
    s.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    s.connect(g); g.connect(this.master);
    s.start();
    return true;
  }
  resume() { this.ensure(); if (this.ctx.state === "suspended") this.ctx.resume(); }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.6; }

  _noiseBurst(dur, freq, q, vol, type = "lowpass") {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noise;
    const filt = this.ctx.createBiquadFilter();
    filt.type = type; filt.frequency.value = freq; filt.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt); filt.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.02);
  }
  _tone(freq, dur, type, vol, slideTo) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  shoot() {
    if (this.playBuf("fire_player", 0.5, 0.96 + Math.random() * 0.08)) return;
    this._noiseBurst(0.12, 2600, 1.2, 0.55);
    this._noiseBurst(0.07, 900, 0.8, 0.4);
    this._tone(120, 0.12, "square", 0.35, 50);
  }
  enemyShot() {
    if (this.playBuf("fire_enemy", 0.22, 0.92 + Math.random() * 0.1)) return;
    this._noiseBurst(0.1, 1500, 1.0, 0.18);
    this._tone(90, 0.1, "square", 0.12, 45);
  }
  reload() {
    // real M4 reload sequence: mag out -> mag in -> bolt
    if (this.buffers.clipout) {
      this.playBuf("clipout", 0.6);
      setTimeout(() => this.playBuf("clipin", 0.6), 520);
      setTimeout(() => this.playBuf("boltpull", 0.6), 1040);
      return;
    }
    this._tone(420, 0.05, "square", 0.18);
    setTimeout(() => this._tone(300, 0.05, "square", 0.16), 180);
    setTimeout(() => this._tone(520, 0.06, "square", 0.2), 900);
    setTimeout(() => this._noiseBurst(0.05, 1800, 1, 0.15), 1100);
  }
  hitmarker(killed) {
    this._tone(killed ? 320 : 1400, 0.05, "square", 0.22);
    if (killed) { this._tone(220, 0.12, "square", 0.2, 90); }
  }
  hurt() {
    this._noiseBurst(0.18, 500, 0.7, 0.4);
    this._tone(80, 0.18, "sawtooth", 0.3, 40);
  }
  step() {
    const n = 1 + Math.floor(Math.random() * 4);
    if (this.playBuf("step" + n, 0.4, 0.92 + Math.random() * 0.16)) return;
    this._noiseBurst(0.05, 300, 1, 0.07);
  }
  explosion() {
    if (this.playBuf("explosion", 0.85, 0.9 + Math.random() * 0.1)) return;
    this._noiseBurst(0.6, 400, 0.6, 0.7);
    this._tone(60, 0.6, "sawtooth", 0.4, 30);
  }
  heliShot() {
    if (this.playBuf("heli_fire", 0.4, 0.95 + Math.random() * 0.1)) return;
    this._noiseBurst(0.08, 1800, 1, 0.2);
  }
  startRotor() {
    this._rotorWanted = true;
    if (!this.ctx || this._rotorSrc || this._rotor) return; // already running (or no ctx yet)
    if (this.buffers.helicopter) this._startRealRotor();
    else this._startSynthRotor();
  }
  _startRealRotor() {
    const s = this.ctx.createBufferSource(); s.buffer = this.buffers.helicopter; s.loop = true;
    const g = this.ctx.createGain(); g.gain.value = 0.6;
    s.connect(g); g.connect(this.master); s.start();
    this._rotorSrc = s; this._rotorGain = g;
  }
  _startSynthRotor() {
    // low rumble + blade "whomp"
    this._turbine = this.ctx.createOscillator();
    this._turbineG = this.ctx.createGain();
    const lp = this.ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 130; lp.Q.value = 0.6;
    this._turbine.type = "sawtooth"; this._turbine.frequency.value = 60;
    this._turbineG.gain.value = 0.05;
    this._turbine.connect(lp); lp.connect(this._turbineG); this._turbineG.connect(this.master);
    this._turbine.start(); this._turbineLP = lp;
    const chop = () => this._noiseBurst(0.09, 120, 0.6, 0.32, "lowpass");
    chop();
    this._rotor = setInterval(chop, 92);
  }
  _stopSynthRotor() {
    if (this._rotor) { clearInterval(this._rotor); this._rotor = null; }
    if (this._turbine) { try { this._turbine.stop(); } catch (e) { /* already stopped */ } this._turbine.disconnect(); this._turbine = null; }
    if (this._turbineLP) { this._turbineLP.disconnect(); this._turbineLP = null; }
  }
  stopRotor() {
    this._rotorWanted = false;
    if (this._rotorSrc) { try { this._rotorSrc.stop(); } catch (e) { /* already stopped */ } this._rotorSrc.disconnect(); this._rotorSrc = null; }
    this._stopSynthRotor();
  }
  win() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this._tone(f, 0.18, "square", 0.22), i * 130)); }
  lose() { [330, 262, 196, 131].forEach((f, i) => setTimeout(() => this._tone(f, 0.25, "sawtooth", 0.22), i * 160)); }
}
