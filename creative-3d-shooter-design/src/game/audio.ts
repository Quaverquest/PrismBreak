/**
 * PRISMBREAK — fully procedural WebAudio sound engine.
 * Every effect is synthesised at runtime; there are zero audio assets.
 */

export class AudioEngine {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  musicBus: GainNode | null = null;
  sfxBus: GainNode | null = null;
  muted = false;
  private droneNodes: { osc: OscillatorNode[]; lfo: OscillatorNode; filter: BiquadFilterNode } | null =
    null;
  private noiseBuffer: AudioBuffer | null = null;
  private started = false;

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
    } catch {
      this.ctx = null;
      return;
    }
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.85;
    this.master.connect(this.ctx.destination);

    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 22;
    comp.ratio.value = 9;
    comp.attack.value = 0.003;
    comp.release.value = 0.22;
    comp.connect(this.master);

    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = 0.9;
    this.sfxBus.connect(comp);

    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = 0.0;
    this.musicBus.connect(comp);

    // white noise buffer
    const len = this.ctx.sampleRate * 1.2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buf;
  }

  resume() {
    this.init();
    if (this.ctx && this.ctx.state === "suspended") void this.ctx.resume();
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.85, this.ctx.currentTime, 0.05);
    }
  }

  private now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  private noise(dur: number) {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    src.start(this.now());
    src.stop(this.now() + dur + 0.05);
    return src;
  }

  private env(
    node: AudioNode,
    peak: number,
    attack: number,
    decay: number,
    delay = 0,
  ): GainNode {
    const g = this.ctx!.createGain();
    const t = this.now() + delay;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    node.connect(g);
    return g;
  }

  // ---------------------------------------------------------------- ambience
  startDrone() {
    if (!this.ctx || this.started) return;
    this.started = true;
    const t = this.now();
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 420;
    filter.Q.value = 6;
    filter.connect(this.musicBus!);

    const freqs = [55, 82.5, 110, 164.81];
    const oscs = freqs.map((f, i) => {
      const o = this.ctx!.createOscillator();
      o.type = i % 2 === 0 ? "sawtooth" : "triangle";
      o.frequency.value = f;
      o.detune.value = (i - 1.5) * 7;
      const g = this.ctx!.createGain();
      g.gain.value = 0.16 / (i + 1);
      o.connect(g);
      g.connect(filter);
      o.start(t);
      return o;
    });

    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 260;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start(t);

    this.musicBus!.gain.setTargetAtTime(0.5, t, 2.5);
    this.droneNodes = { osc: oscs, lfo, filter };
  }

  /** raises the ambience when the arena gets hectic */
  setIntensity(v: number) {
    if (!this.ctx || !this.droneNodes || !this.musicBus) return;
    const t = this.now();
    this.musicBus.gain.setTargetAtTime(0.42 + v * 0.4, t, 0.5);
    this.droneNodes.filter.frequency.setTargetAtTime(380 + v * 1500, t, 0.4);
  }

  stopDrone() {
    if (!this.ctx || !this.droneNodes) return;
    const t = this.now();
    this.musicBus!.gain.setTargetAtTime(0.0, t, 0.4);
    this.droneNodes.osc.forEach((o) => o.stop(t + 2));
    this.droneNodes.lfo.stop(t + 2);
    this.droneNodes = null;
    this.started = false;
  }

  // ------------------------------------------------------------------- sfx
  /** pitch rises with channel so each colour has its own voice */
  shoot(channel: number, overcharged: boolean) {
    if (!this.ctx || !this.sfxBus) return;
    const t = this.now();
    const base = [520, 430, 620, 700][channel] ?? 520;
    const o = this.ctx.createOscillator();
    o.type = "square";
    o.frequency.setValueAtTime(base * (overcharged ? 1.5 : 1), t);
    o.frequency.exponentialRampToValueAtTime(base * 0.34, t + 0.13);
    const f = this.ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.setValueAtTime(base * 3, t);
    f.frequency.exponentialRampToValueAtTime(300, t + 0.14);
    f.Q.value = 2.2;
    o.connect(f);
    this.env(f, overcharged ? 0.24 : 0.16, 0.004, 0.14).connect(this.sfxBus);

    const n = this.noise(0.09);
    const nf = this.ctx.createBiquadFilter();
    nf.type = "highpass";
    nf.frequency.value = 1800;
    n.connect(nf);
    this.env(nf, overcharged ? 0.13 : 0.08, 0.002, 0.08).connect(this.sfxBus);
  }

  shift(dir: number, channel: number) {
    if (!this.ctx || !this.sfxBus) return;
    const t = this.now();
    const f0 = [400, 500, 620, 760][channel] ?? 500;
    const o = this.ctx.createOscillator();
    o.type = "triangle";
    o.frequency.setValueAtTime(f0 * (dir > 0 ? 0.7 : 1.4), t);
    o.frequency.exponentialRampToValueAtTime(f0 * (dir > 0 ? 1.4 : 0.7), t + 0.09);
    this.env(o, 0.1, 0.005, 0.1).connect(this.sfxBus);
  }

  hit(channel: number) {
    if (!this.ctx || !this.sfxBus) return;
    const t = this.now();
    const o = this.ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(900 + channel * 180, t);
    o.frequency.exponentialRampToValueAtTime(340, t + 0.09);
    this.env(o, 0.11, 0.002, 0.09).connect(this.sfxBus);
    const n = this.noise(0.05);
    const nf = this.ctx.createBiquadFilter();
    nf.type = "highpass";
    nf.frequency.value = 3200;
    n.connect(nf);
    this.env(nf, 0.07, 0.001, 0.05).connect(this.sfxBus);
  }

  dissonance() {
    if (!this.ctx || !this.sfxBus) return;
    const t = this.now();
    const o = this.ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(70, t + 0.22);
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 700;
    o.connect(f);
    this.env(f, 0.14, 0.006, 0.22).connect(this.sfxBus);
  }

  kill(channel: number) {
    if (!this.ctx || !this.sfxBus) return;
    const t = this.now();
    const f0 = [300, 260, 350, 400][channel] ?? 300;
    [1, 1.5, 2.02, 3.01].forEach((mult, i) => {
      const o = this.ctx!.createOscillator();
      o.type = i > 1 ? "triangle" : "sine";
      o.frequency.setValueAtTime(f0 * mult, t);
      o.frequency.exponentialRampToValueAtTime(f0 * mult * 0.5, t + 0.42);
      this.env(o, 0.09 / (i * 0.6 + 1), 0.004, 0.4 + i * 0.06).connect(this.sfxBus!);
    });
    const n = this.noise(0.35);
    const nf = this.ctx.createBiquadFilter();
    nf.type = "bandpass";
    nf.frequency.setValueAtTime(4200, t);
    nf.frequency.exponentialRampToValueAtTime(600, t + 0.34);
    nf.Q.value = 1.1;
    n.connect(nf);
    this.env(nf, 0.14, 0.004, 0.34).connect(this.sfxBus);
  }

  hurt() {
    if (!this.ctx || !this.sfxBus) return;
    const t = this.now();
    const o = this.ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(190, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.34);
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 900;
    o.connect(f);
    this.env(f, 0.3, 0.004, 0.34).connect(this.sfxBus);
    const n = this.noise(0.3);
    const nf = this.ctx.createBiquadFilter();
    nf.type = "lowpass";
    nf.frequency.value = 1400;
    n.connect(nf);
    this.env(nf, 0.18, 0.002, 0.3).connect(this.sfxBus);
  }

  dash() {
    if (!this.ctx || !this.sfxBus) return;
    const t = this.now();
    const n = this.noise(0.4);
    const f = this.ctx.createBiquadFilter();
    f.type = "bandpass";
    f.Q.value = 1.6;
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(5200, t + 0.24);
    f.frequency.exponentialRampToValueAtTime(400, t + 0.4);
    n.connect(f);
    this.env(f, 0.24, 0.01, 0.4).connect(this.sfxBus);
  }

  jump() {
    if (!this.ctx || !this.sfxBus) return;
    const t = this.now();
    const o = this.ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(240, t);
    o.frequency.exponentialRampToValueAtTime(520, t + 0.11);
    this.env(o, 0.07, 0.004, 0.12).connect(this.sfxBus);
  }

  land() {
    if (!this.ctx || !this.sfxBus) return;
    const n = this.noise(0.14);
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 500;
    n.connect(f);
    this.env(f, 0.14, 0.002, 0.14).connect(this.sfxBus);
  }

  burst() {
    if (!this.ctx || !this.sfxBus) return;
    const t = this.now();
    const o = this.ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(2400, t + 0.5);
    o.frequency.exponentialRampToValueAtTime(60, t + 1.5);
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(500, t);
    f.frequency.exponentialRampToValueAtTime(6000, t + 0.5);
    f.frequency.exponentialRampToValueAtTime(300, t + 1.4);
    o.connect(f);
    this.env(f, 0.32, 0.02, 1.5).connect(this.sfxBus);
    const n = this.noise(1.1);
    const nf = this.ctx.createBiquadFilter();
    nf.type = "highpass";
    nf.frequency.setValueAtTime(200, t);
    nf.frequency.exponentialRampToValueAtTime(3000, t + 0.9);
    n.connect(nf);
    this.env(nf, 0.16, 0.3, 0.8).connect(this.sfxBus);
  }

  pickup() {
    if (!this.ctx || !this.sfxBus) return;
    [0, 0.06, 0.12].forEach((d, i) => {
      const o = this.ctx!.createOscillator();
      o.type = "sine";
      o.frequency.value = [660, 880, 1320][i];
      this.env(o, 0.09, 0.004, 0.2, d).connect(this.sfxBus!);
    });
  }

  waveStinger(boss: boolean) {
    if (!this.ctx || !this.sfxBus) return;
    const t = this.now();
    const chord = boss ? [110, 116.5, 164.8, 220] : [196, 261.6, 329.6, 392];
    chord.forEach((f, i) => {
      const o = this.ctx!.createOscillator();
      o.type = boss ? "sawtooth" : "triangle";
      o.frequency.value = f;
      const g = this.env(o, boss ? 0.16 : 0.12, 0.02 + i * 0.02, boss ? 1.6 : 0.9);
      const lp = this.ctx!.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = boss ? 1200 : 2600;
      g.connect(lp);
      lp.connect(this.sfxBus!);
    });
    if (boss) {
      for (let k = 0; k < 3; k++) {
        const o = this.ctx.createOscillator();
        o.type = "square";
        o.frequency.setValueAtTime(880, t + 0.7 + k * 0.28);
        o.frequency.exponentialRampToValueAtTime(440, t + 0.9 + k * 0.28);
        this.env(o, 0.09, 0.005, 0.2, 0.7 + k * 0.28).connect(this.sfxBus);
      }
    }
  }

  gameOver() {
    if (!this.ctx || !this.sfxBus) return;
    const t = this.now();
    [392, 330, 262, 175].forEach((f, i) => {
      const o = this.ctx!.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = f;
      o.detune.value = -8;
      const g = this.env(o, 0.16, 0.02, 1.1, i * 0.16);
      const lp = this.ctx!.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(2400, t + i * 0.16);
      lp.frequency.exponentialRampToValueAtTime(260, t + i * 0.16 + 1.1);
      g.connect(lp);
      lp.connect(this.sfxBus!);
    });
  }

  victory() {
    if (!this.ctx || !this.sfxBus) return;
    [523, 659, 784, 1046, 1318].forEach((f, i) => {
      const o = this.ctx!.createOscillator();
      o.type = "triangle";
      o.frequency.value = f;
      const g = this.env(o, 0.12, 0.01, 0.9, i * 0.09);
      g.connect(this.sfxBus!);
    });
  }

  ui(up = true) {
    if (!this.ctx || !this.sfxBus) return;
    const o = this.ctx.createOscillator();
    o.type = "square";
    o.frequency.value = up ? 1200 : 700;
    this.env(o, 0.045, 0.002, 0.05).connect(this.sfxBus);
  }

  dispose() {
    try {
      this.stopDrone();
      void this.ctx?.close();
    } catch {
      /* noop */
    }
    this.ctx = null;
  }
}

export const audio = new AudioEngine();
