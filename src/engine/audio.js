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
      laser: "/audio/laser.ogg",
      sword: "/audio/sword.ogg",
      shotgun: "/audio/shotgun.ogg",
      plasma: "/audio/plasma.ogg",
      zap: "/audio/zap.ogg",
      thunder: "/audio/thunder.ogg",
      creature: "/audio/creature.ogg",
      hurt: "/audio/hurt.ogg",
      whoosh: "/audio/whoosh.ogg",
      pickup: "/audio/pickup.ogg",
      splash: "/audio/splash.ogg",
      car_engine: "/audio/car_engine.ogg",
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
    if (this.playBuf("hurt", 0.6, 0.9 + Math.random() * 0.15)) return;
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
  // --- ARCFALL: synth sci-fi + creature + pickup sounds ---
  plasma() { if (this.playBuf("plasma", 0.5, 0.9 + Math.random() * 0.12)) return; this._tone(560, 0.2, "sawtooth", 0.3, 150); this._noiseBurst(0.12, 1400, 1, 0.12, "bandpass"); }
  zap() { if (this.playBuf("zap", 0.4)) return; this._noiseBurst(0.18, 3200, 0.6, 0.22, "bandpass"); this._tone(1000, 0.12, "square", 0.16, 2000); }
  laser() { if (this.playBuf("laser", 0.5, 1.4 + Math.random() * 0.15)) return; this._tone(880, 0.09, "square", 0.16, 300); this._noiseBurst(0.05, 2200, 1, 0.05); }
  swordSwing() { if (this.playBuf("sword", 0.6, 0.95 + Math.random() * 0.1)) return; this._noiseBurst(0.2, 760, 0.6, 0.18, "bandpass"); }
  thunder() { if (this.playBuf("thunder", 0.35, 0.7 + Math.random() * 0.2)) return; this._noiseBurst(0.9, 220, 0.5, 0.22); this._tone(52, 0.8, "sawtooth", 0.16, 26); } // storm rumble (quieter)
  splash() { if (this.playBuf("splash", 0.5, 0.9 + Math.random() * 0.2)) return; this._noiseBurst(0.32, 1300, 0.7, 0.32); } // water entry
  shotgun() { if (this.playBuf("shotgun", 0.6, 0.9 + Math.random() * 0.1)) return; this._noiseBurst(0.3, 500, 0.6, 0.5); this._tone(80, 0.2, "sawtooth", 0.3, 40); }
  swimStroke() { if (this.playBuf("splash", 0.28, 1.5 + Math.random() * 0.2)) return; this._noiseBurst(0.22, 680, 0.6, 0.14, "bandpass"); } // swim swish
  dropWhoosh() { if (this.playBuf("whoosh", 0.55, 0.8)) return; this._noiseBurst(7.0, 440, 0.4, 0.34); this._tone(190, 7.0, "sawtooth", 0.13, 64); } // descent rush
  creature() { if (this.playBuf("creature", 0.55, 0.7 + Math.random() * 0.25)) return; this._tone(120, 0.34, "sawtooth", 0.3, 64); this._noiseBurst(0.18, 360, 0.8, 0.14); } // growl/bite
  arcGet() { if (this.playBuf("pickup", 0.6)) return; this._tone(660, 0.12, "sine", 0.32); setTimeout(() => this._tone(990, 0.16, "sine", 0.32), 90); setTimeout(() => this._tone(1320, 0.26, "sine", 0.3), 185); }
  // looping vehicle engine — real engine loop (pitch rises with speed); synth fallback
  startEngine() {
    if (!this.ctx || this._eng) return;
    if (this.buffers.car_engine) {
      const s = this.ctx.createBufferSource(); s.buffer = this.buffers.car_engine; s.loop = true;
      const g = this.ctx.createGain(); g.gain.value = 0; s.connect(g); g.connect(this.master); s.start();
      g.gain.linearRampToValueAtTime(0.45, this.ctx.currentTime + 0.3);
      this._eng = { src: s, g, real: true };
      return;
    }
    const o = this.ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = 52;
    const lp = this.ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 430;
    const g = this.ctx.createGain(); g.gain.value = 0;
    o.connect(lp); lp.connect(g); g.connect(this.master); o.start();
    g.gain.linearRampToValueAtTime(0.13, this.ctx.currentTime + 0.3);
    this._eng = { o, g };
  }
  setEngine(speed) {
    if (!this._eng) return;
    if (this._eng.real) this._eng.src.playbackRate.value = 0.62 + Math.min(1.4, Math.abs(speed) * 0.045);
    else this._eng.o.frequency.value = 48 + Math.abs(speed) * 4.5;
  }
  stopEngine() {
    if (!this._eng) return; const e = this._eng; this._eng = null;
    e.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.12);
    setTimeout(() => { try { (e.src || e.o).stop(); } catch { /* already stopped */ } }, 350);
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
  // ── chill lo-fi R&B groove for the hero-select screen (warm Rhodes chords + bassline + soft beat) ──
  startLobbyMusic() {
    if (!this.ctx || this._lobbyMusic) return;
    const ctx = this.ctx, bus = ctx.createGain(); bus.gain.value = 0; bus.connect(this.master);
    bus.gain.linearRampToValueAtTime(0.34, ctx.currentTime + 1.4); // fade in
    const f = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
    // a smooth ii–V–I–vi style progression: Fmaj7, Em7, Dm7, G7
    const chords = [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [55, 59, 62, 65]].map((c) => c.map(f));
    const bass = [29, 28, 26, 31].map(f); // F1, E1, D1, G1 (laid-back roots)
    const bpm = 72, beat = 60 / bpm, bar = beat * 4;
    const m = { bus, stopped: false, interval: null }; this._lobbyMusic = m;
    const pad = (fr, t, dur, vol) => { // soft electric-piano-ish voice
      const o = ctx.createOscillator(); o.type = "triangle"; o.frequency.value = fr;
      const o2 = ctx.createOscillator(); o2.type = "sine"; o2.frequency.value = fr * 2.001;
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 1500;
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.06); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(lp); o2.connect(lp); lp.connect(g); g.connect(bus); o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
    };
    const bassV = (fr, t, dur, vol) => { const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = fr; const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.05); };
    const kick = (t) => { const o = ctx.createOscillator(); o.type = "sine"; o.frequency.setValueAtTime(125, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12); const g = ctx.createGain(); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2); o.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.22); };
    const noise = (t, dur, freq, q, vol, type) => { const s = ctx.createBufferSource(); s.buffer = this._noise; const bp = ctx.createBiquadFilter(); bp.type = type; bp.frequency.value = freq; bp.Q.value = q; const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); s.connect(bp); bp.connect(g); g.connect(bus); s.start(t); s.stop(t + dur + 0.02); };
    let i = 0;
    const playBar = () => {
      if (m.stopped) return;
      const t = ctx.currentTime + 0.06, c = chords[i % 4], b = bass[i % 4];
      for (const fr of c) pad(fr, t + 0.02, bar * 0.95, 0.085);              // held chord
      bassV(b, t, beat * 1.4, 0.2); bassV(b, t + beat * 2.5, beat * 1.2, 0.16); // syncopated bass
      kick(t); kick(t + beat * 2 + beat * 0.5);                              // laid-back kick
      noise(t + beat, 0.18, 1400, 1, 0.18, "bandpass"); noise(t + beat * 3, 0.18, 1400, 1, 0.18, "bandpass"); // snaps on 2 & 4
      for (let h = 0; h < 8; h++) noise(t + h * beat * 0.5, 0.04, 8000, 0.7, h % 2 ? 0.05 : 0.09, "highpass"); // hats
      i++;
    };
    playBar(); m.interval = setInterval(playBar, bar * 1000);
  }
  stopLobbyMusic() {
    const m = this._lobbyMusic; if (!m) return; this._lobbyMusic = null; m.stopped = true;
    if (m.interval) clearInterval(m.interval);
    try { m.bus.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4); } catch { /* ctx gone */ }
    setTimeout(() => { try { m.bus.disconnect(); } catch { /* already gone */ } }, 1400);
  }
  win() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this._tone(f, 0.18, "square", 0.22), i * 130)); }
  lose() { [330, 262, 196, 131].forEach((f, i) => setTimeout(() => this._tone(f, 0.25, "sawtooth", 0.22), i * 160)); }
}
