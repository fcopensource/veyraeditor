/* Neon Getaway sound: an engine, sirens, effects and two synthwave radio stations, all made with Web Audio (no files). */
(function (root) {
  'use strict';
  const NOTE = n => 440 * Math.pow(2, (n - 69) / 12);
  const STATIONS = [
    { name: 'Solara FM', bpm: 104, chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], arp: [0, 1, 2, 1, 0, 2, 1, 2], lead: 0.9 },
    { name: 'Night Drive 88', bpm: 86, chords: [[50, 53, 57], [46, 50, 53], [53, 57, 60], [48, 52, 55]], arp: [0, 2, 1, 2, 0, 1, 2, 1], lead: 0.6 },
  ];

  function Audio() {
    this.ctx = null; this.on = true; this.station = 0; this.radioOn = true;
  }
  Audio.prototype.start = function () {
    if (this.ctx || !this.on) return;
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = 0.55; this.master.connect(ctx.destination);
    this.music = ctx.createGain(); this.music.gain.value = 0.16; this.music.connect(this.master);
    // engine: two detuned saws through a low-pass filter
    this.eng = ctx.createGain(); this.eng.gain.value = 0; this.eng.connect(this.master);
    this.engF = ctx.createBiquadFilter(); this.engF.type = 'lowpass'; this.engF.frequency.value = 500; this.engF.connect(this.eng);
    this.o1 = ctx.createOscillator(); this.o1.type = 'sawtooth'; this.o1.connect(this.engF); this.o1.start();
    this.o2 = ctx.createOscillator(); this.o2.type = 'square'; this.o2.detune.value = -1200; this.o2.connect(this.engF); this.o2.start();
    // siren
    this.sir = ctx.createGain(); this.sir.gain.value = 0; this.sir.connect(this.master);
    this.so = ctx.createOscillator(); this.so.type = 'triangle'; this.so.frequency.value = 700; this.so.connect(this.sir); this.so.start();
    const n = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), d = n.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = n;
    this.nextBeat = ctx.currentTime + 0.1; this.beat = 0;
  };
  Audio.prototype.setOn = function (on) {
    this.on = on;
    if (this.ctx) this.master.gain.setTargetAtTime(on ? 0.55 : 0, this.ctx.currentTime, 0.05);
    else if (on) this.start();
  };
  Audio.prototype.nextStation = function () {
    if (!this.radioOn) { this.radioOn = true; this.station = 0; }
    else if (this.station < STATIONS.length - 1) this.station++;
    else this.radioOn = false;
    return this.radioOn ? STATIONS[this.station].name : 'Radio off';
  };
  Audio.prototype.stationName = function () { return this.radioOn ? STATIONS[this.station].name : 'Radio off'; };

  Audio.prototype.blip = function (freq, len, type, vol, when) {
    if (!this.ctx) return;
    const c = this.ctx, t = when || c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.type = type || 'square'; o.frequency.value = freq;
    g.gain.setValueAtTime(vol || 0.2, t); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + len + 0.02);
  };
  Audio.prototype.hit = function (len, vol, freq, when, dest) {
    if (!this.ctx) return;
    const c = this.ctx, t = when || c.currentTime, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise; f.type = freq > 3000 ? 'highpass' : 'lowpass'; f.frequency.value = freq || 800;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    s.connect(f); f.connect(g); g.connect(dest || this.master); s.start(t); s.stop(t + len + 0.02);
  };
  Audio.prototype.fx = function (name, power) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (name === 'crash') this.hit(0.35, Math.min(0.5, (power || 200) / 900), 900);
    else if (name === 'cash') { this.blip(988, 0.08, 'square', 0.12); this.blip(1319, 0.18, 'square', 0.12, t + 0.08); }
    else if (name === 'tape') [784, 988, 1175, 1568].forEach((f, i) => this.blip(f, 0.12, 'triangle', 0.16, t + i * 0.07));
    else if (name === 'checkpoint') this.blip(1046, 0.12, 'triangle', 0.18);
    else if (name === 'passed') [523, 659, 784, 1046].forEach((f, i) => this.blip(f, 0.32, 'sawtooth', 0.1, t + i * 0.11));
    else if (name === 'failed' || name === 'busted') [392, 330, 262].forEach((f, i) => this.blip(f, 0.34, 'sawtooth', 0.1, t + i * 0.16));
    else if (name === 'wanted') { this.blip(660, 0.14, 'square', 0.12); this.blip(880, 0.2, 'square', 0.12, t + 0.12); }
    else if (name === 'horn') { this.blip(392, 0.32, 'square', 0.13); this.blip(494, 0.32, 'square', 0.09); }
    else if (name === 'door') this.hit(0.08, 0.2, 2200);
  };

  /** Called every frame. speed 0..1 of the car's top speed (null on foot); siren 0..1 by the nearest cop's distance. */
  Audio.prototype.update = function (speed, throttle, siren, music) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const driving = speed != null;
    this.eng.gain.setTargetAtTime(driving ? 0.05 + 0.05 * throttle : 0, t, 0.08);
    if (driving) {
      const f = 38 + speed * 120 + throttle * 14;
      this.o1.frequency.setTargetAtTime(f, t, 0.06); this.o2.frequency.setTargetAtTime(f * 2.01, t, 0.06);
      this.engF.frequency.setTargetAtTime(380 + speed * 1300, t, 0.08);
    }
    this.sir.gain.setTargetAtTime(siren * 0.07, t, 0.1);
    this.so.frequency.setTargetAtTime(Math.floor(t * 2.2) % 2 ? 960 : 720, t, 0.04);
    this.music.gain.setTargetAtTime(music && this.radioOn ? 0.16 : 0, t, 0.3);
    if (!(music && this.radioOn)) { this.nextBeat = t + 0.1; return; }
    // The radio: a little synthwave sequencer, scheduled a moment ahead.
    const st = STATIONS[this.station], sixteenth = 60 / st.bpm / 4;
    while (this.nextBeat < t + 0.15) {
      const b = this.beat, when = this.nextBeat, bar = Math.floor(b / 16) % st.chords.length, chord = st.chords[bar], s16 = b % 16;
      if (s16 % 4 === 0) this.kick(when);
      if (s16 % 4 === 2) this.hit(0.05, 0.07, 7000, when, this.music);
      if (s16 === 4 || s16 === 12) this.hit(0.16, 0.12, 1800, when, this.music);
      if (s16 % 2 === 0) this.tone(NOTE(chord[0] - 24), sixteenth * 1.8, 'sawtooth', 0.32, when, 600);
      this.tone(NOTE(chord[st.arp[s16 % 8]] + 12), sixteenth * 0.9, 'square', 0.07 * st.lead, when, 2600);
      if (s16 === 0) chord.forEach(n => this.tone(NOTE(n), sixteenth * 15, 'sawtooth', 0.05, when, 1400));
      this.nextBeat += sixteenth; this.beat++;
    }
  };
  Audio.prototype.kick = function (t) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.14);
    g.gain.setValueAtTime(0.7, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(g); g.connect(this.music); o.start(t); o.stop(t + 0.22);
  };
  Audio.prototype.tone = function (freq, len, type, vol, t, cut) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
    o.type = type; o.frequency.value = freq; f.type = 'lowpass'; f.frequency.value = cut;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(f); f.connect(g); g.connect(this.music); o.start(t); o.stop(t + len + 0.03);
  };

  root.NGAudio = Audio;
})(typeof self !== 'undefined' ? self : this);
