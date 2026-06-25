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

  shoot(pitch = 1) {
    if (this.playBuf("fire_player", 0.5, (0.96 + Math.random() * 0.08) * pitch)) return;
    this._noiseBurst(0.12, 2600 * pitch, 1.2, 0.55);
    this._noiseBurst(0.07, 900 * pitch, 0.8, 0.4);
    this._tone(120 * pitch, 0.12, "square", 0.35, 50);
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
  hitmarker(killed) { // crisp confirmation click (not a harsh square blip) + a satisfying low confirm on a kill
    this._noiseBurst(0.03, 3400, 1.6, 0.12, "highpass"); // sharp tick
    this._tone(killed ? 560 : 1500, 0.045, "triangle", 0.16);
    if (killed) setTimeout(() => { this._tone(360, 0.16, "sine", 0.24, 170); this._tone(540, 0.14, "sine", 0.12); }, 28); // warm two-tone kill chime
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
  laser(vol = 0.5) { if (this.playBuf("laser", vol, 1.4 + Math.random() * 0.15)) return; this._tone(880, 0.09, "square", 0.16 * (vol / 0.5), 300); this._noiseBurst(0.05, 2200, 1, 0.05); }
  beam(vol = 0.5) { if (this.playBuf("plasma", vol, 1.5 + Math.random() * 0.2)) return; this._tone(700, 0.16, "sawtooth", 0.2 * (vol / 0.5), 170); this._noiseBurst(0.1, 1800, 1, 0.06, "bandpass"); } // sci-fi laser BEAM
  swordSwing() { if (this.playBuf("sword", 0.6, 0.95 + Math.random() * 0.1)) return; this._noiseBurst(0.2, 760, 0.6, 0.18, "bandpass"); }
  thunder() { if (this.playBuf("thunder", 0.35, 0.7 + Math.random() * 0.2)) return; this._noiseBurst(0.9, 220, 0.5, 0.22); this._tone(52, 0.8, "sawtooth", 0.16, 26); } // storm rumble (quieter)
  splash() { // water entry — a bright plume + a downward watery "bloop"
    this._noiseBurst(0.36, 2200, 0.5, 0.3, "lowpass");
    this._noiseBurst(0.28, 700, 0.8, 0.2, "lowpass");
    this._tone(380, 0.22, "sine", 0.12, 150);
  }
  shotgun() { if (this.playBuf("shotgun", 0.6, 0.9 + Math.random() * 0.1)) return; this._noiseBurst(0.3, 500, 0.6, 0.5); this._tone(80, 0.2, "sawtooth", 0.3, 40); }
  jetpack(on) { // realistic rocket thruster: looping filtered noise hiss + a low rumble
    if (!this.ctx) return;
    if (on && !this._jet) {
      const t = this.ctx.currentTime, g = this.ctx.createGain(); g.gain.value = 0; g.connect(this.master);
      if (!this._noiseBuf) { const n = this.ctx.sampleRate * 2, b = this.ctx.createBuffer(1, n, this.ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; this._noiseBuf = b; }
      const src = this.ctx.createBufferSource(); src.buffer = this._noiseBuf; src.loop = true;       // continuous exhaust hiss
      const bp = this.ctx.createBiquadFilter(); bp.type = "lowpass"; bp.frequency.value = 1500; bp.Q.value = 0.9;
      src.connect(bp); bp.connect(g);
      const o = this.ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = 62; const og = this.ctx.createGain(); og.gain.value = 0.32; o.connect(og); og.connect(g); // deep rumble
      src.start(); o.start();
      g.gain.linearRampToValueAtTime(0.5, t + 0.1);
      this._jet = { src, o, g };
    } else if (!on && this._jet) {
      const j = this._jet; this._jet = null; j.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.12);
      setTimeout(() => { try { j.src.stop(); } catch { /* stopped */ } try { j.o.stop(); } catch { /* stopped */ } }, 340);
    }
  }
  railgun() { // BADASS railgun: rising charge whine → sharp electric crack → deep booming tail
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const charge = this.ctx.createOscillator(); charge.type = "sawtooth";
    charge.frequency.setValueAtTime(280, t); charge.frequency.exponentialRampToValueAtTime(1900, t + 0.12);
    const cg = this.ctx.createGain(); cg.gain.setValueAtTime(0.0001, t); cg.gain.exponentialRampToValueAtTime(0.16, t + 0.1); cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    charge.connect(cg); cg.connect(this.master); charge.start(t); charge.stop(t + 0.18);
    this._noiseBurst(0.12, 4200, 1.6, 0.5, "highpass");       // sharp electric CRACK on release
    const boom = this.ctx.createOscillator(); boom.type = "sine";
    boom.frequency.setValueAtTime(150, t + 0.1); boom.frequency.exponentialRampToValueAtTime(42, t + 0.65);
    const bg = this.ctx.createGain(); bg.gain.setValueAtTime(0.0001, t + 0.1); bg.gain.exponentialRampToValueAtTime(0.55, t + 0.14); bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.72);
    boom.connect(bg); bg.connect(this.master); boom.start(t + 0.1); boom.stop(t + 0.78);
    this.playBuf?.("zap", 0.5);                               // electric zap layer (CC0) if present
  }
  rewind() { // ARC-SAND time-warp — iconic tape-rewind: descending warble + STUTTERING granular tremolo + shimmer + rumble
    if (!this.ctx) return;
    const t = this.ctx.currentTime, dur = 1.7;
    // descending pitched warble (vibrato) — the "unwinding" tone
    const o = this.ctx.createOscillator(); o.type = "sawtooth";
    o.frequency.setValueAtTime(1050, t); o.frequency.exponentialRampToValueAtTime(150, t + dur);
    const vib = this.ctx.createOscillator(); vib.type = "sine"; vib.frequency.value = 11;
    const vg = this.ctx.createGain(); vg.gain.value = 80; vib.connect(vg); vg.connect(o.frequency); vib.start(t); vib.stop(t + dur);
    const lp = this.ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2600;
    // STUTTER: a fast square-wave tremolo on the gain → the chattery "rrrrr" of a tape spinning back, speeding up
    const env = this.ctx.createGain(); env.gain.setValueAtTime(0.0001, t); env.gain.exponentialRampToValueAtTime(0.26, t + 0.12); env.gain.setValueAtTime(0.24, t + dur * 0.72); env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const stut = this.ctx.createOscillator(); stut.type = "square"; stut.frequency.setValueAtTime(14, t); stut.frequency.exponentialRampToValueAtTime(38, t + dur); // chatter accelerates
    const sg = this.ctx.createGain(); sg.gain.value = 0.5; stut.connect(sg); sg.connect(env.gain); stut.start(t); stut.stop(t + dur);
    o.connect(lp); lp.connect(env); env.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
    this._noiseBurst(dur, 5400, 0.4, 0.09, "highpass"); // airy reverse shimmer
    this._tone(56, dur, "sine", 0.16, 40);              // deep rumble
    setTimeout(() => { this._tone(1320, 0.18, "sine", 0.18); this._tone(1760, 0.22, "sine", 0.12); }, dur * 1000 - 60); // bright "snap back" chime on settle
  }
  wade() { // a wet footstep: bright surface splash + a sloosh + a couple of droplet bloops
    this._noiseBurst(0.18, 2600, 0.4, 0.2, "lowpass");
    this._noiseBurst(0.26, 760, 0.7, 0.15, "lowpass");
    this._tone(540, 0.1, "sine", 0.07, 230);
    setTimeout(() => this._tone(660, 0.08, "sine", 0.05, 300), 55);
  }
  swimStroke() { // gentle water swish of a stroke
    this._noiseBurst(0.34, 1000, 0.6, 0.15, "lowpass");
    this._noiseBurst(0.2, 440, 0.7, 0.1, "lowpass");
  }
  dropWhoosh() { if (this.playBuf("whoosh", 0.55, 0.8)) return; this._noiseBurst(7.0, 440, 0.4, 0.34); this._tone(190, 7.0, "sawtooth", 0.13, 64); } // descent rush
  creature() { // a full DINOSAUR ROAR — deep bellow with throaty vibrato, guttural sub-growl + raspy snarl
    if (!this.ctx) return;
    const t = this.ctx.currentTime, dur = 0.9;
    // main bellow: rises then falls, with a low-frequency vibrato that gives the throaty "roar" texture
    const o = this.ctx.createOscillator(); o.type = "sawtooth";
    o.frequency.setValueAtTime(150, t); o.frequency.linearRampToValueAtTime(220, t + 0.14); o.frequency.exponentialRampToValueAtTime(80, t + dur);
    const vib = this.ctx.createOscillator(); vib.type = "sine"; vib.frequency.value = 17;
    const vibG = this.ctx.createGain(); vibG.gain.value = 14; vib.connect(vibG); vibG.connect(o.frequency); vib.start(t); vib.stop(t + dur);
    const lp = this.ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 1300;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.1); g.gain.setValueAtTime(0.48, t + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp); lp.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
    // guttural sub-growl
    const sub = this.ctx.createOscillator(); sub.type = "square"; sub.frequency.setValueAtTime(68, t); sub.frequency.exponentialRampToValueAtTime(38, t + dur);
    const sg = this.ctx.createGain(); sg.gain.setValueAtTime(0.0001, t); sg.gain.exponentialRampToValueAtTime(0.24, t + 0.12); sg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    sub.connect(sg); sg.connect(this.master); sub.start(t); sub.stop(t + dur + 0.05);
    this._noiseBurst(0.6, 620, 1.4, 0.16, "bandpass"); // throaty rasp
  }
  arcGet() { if (this.playBuf("pickup", 0.6)) return; this._tone(660, 0.12, "sine", 0.32); setTimeout(() => this._tone(990, 0.16, "sine", 0.32), 90); setTimeout(() => this._tone(1320, 0.26, "sine", 0.3), 185); }
  arcFanfare() { // BIG triumphant victory fanfare — rising run, a major-chord bloom, sparkle + deep boom
    [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => setTimeout(() => this._tone(f, 0.45, "triangle", 0.3), i * 70));
    setTimeout(() => { for (const f of [784, 988, 1175, 1568, 2349]) this._tone(f, 0.9, "sine", 0.15); }, 430); // soaring major chord
    this._noiseBurst(0.55, 7000, 0.5, 0.16, "highpass"); // sparkle shimmer
    setTimeout(() => { this._tone(90, 0.8, "sine", 0.32, 50); this._tone(180, 0.7, "sine", 0.2, 90); }, 380); // deep victory boom
  }
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
  win() { // full triumphant resolve — rising run into a sustained major chord + sparkle + warm root (no square blips)
    [392, 523, 659, 784].forEach((f, i) => setTimeout(() => this._tone(f, 0.32, "triangle", 0.26), i * 90));
    setTimeout(() => { for (const f of [523, 659, 784, 1047, 1319]) this._tone(f, 1.1, "sine", 0.14); }, 360); // sustained C-major chord
    this._noiseBurst(0.6, 7000, 0.5, 0.14, "highpass"); // sparkle
    setTimeout(() => this._tone(98, 0.95, "sine", 0.26, 55), 340); // warm low root
  }
  lose() { // dramatic death sting: dull impact + a slow descending drone
    this._noiseBurst(0.5, 320, 0.6, 0.42);
    this._tone(200, 1.3, "sawtooth", 0.3, 46);
    setTimeout(() => this._tone(130, 1.5, "sine", 0.26, 38), 220);
    setTimeout(() => this._tone(85, 1.8, "sawtooth", 0.2, 26), 520);
  }
}
