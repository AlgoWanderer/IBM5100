// All audio: the looping CRT buzz (your mp3) plus small synthesized effects,
// so no other sound files are needed. Everything starts from a user click,
// because browsers block audio until the page is interacted with.

const BUZZ_URL = `${import.meta.env.BASE_URL}audio/crt-buzz.mp3`;
const BUZZ_VOLUME = 0.42;

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buzzGain: GainNode | null = null;
  private buzzSource: AudioBufferSourceNode | null = null;
  private buzzBuffer: Promise<AudioBuffer | null> | null = null;
  private noise: AudioBuffer | null = null;
  private muted = false;
  private on = false;

  /** Must be called from a click/keypress handler the first time. */
  private ensure(): AudioContext | null {
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return null;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      this.master.connect(this.ctx.destination);
      this.noise = this.makeNoise(this.ctx);
      this.buzzBuffer = fetch(BUZZ_URL)
        .then((r) => r.arrayBuffer())
        .then((b) => this.ctx!.decodeAudioData(b))
        .catch(() => null);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  private makeNoise(ctx: AudioContext) {
    const buf = ctx.createBuffer(1, ctx.sampleRate * 1, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.05);
  }

  async powerOn() {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    this.on = true;
    this.thunk();
    this.degauss();
    const buffer = await this.buzzBuffer;
    if (!buffer || this.buzzSource || !this.on) return;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(BUZZ_VOLUME, ctx.currentTime + 0.6);
    src.connect(g).connect(this.master);
    src.start();
    this.buzzSource = src;
    this.buzzGain = g;
  }

  powerOff() {
    this.on = false;
    const ctx = this.ctx;
    if (!ctx) return;
    this.thunk(0.7);
    if (this.buzzSource && this.buzzGain) {
      const src = this.buzzSource;
      this.buzzGain.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
      src.stop(ctx.currentTime + 0.5);
      this.buzzSource = null;
      this.buzzGain = null;
    }
    // high-pitched collapse "tick"
    this.tone(9000, 0.12, 0.03, "sine");
  }

  /** A mechanical key: short filtered noise click + a low body thump. */
  key(heavy = false) {
    const ctx = this.ensure();
    if (!ctx || !this.master || !this.noise) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.9 + Math.random() * 0.3;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = (heavy ? 1700 : 2600) + Math.random() * 600;
    bp.Q.value = 1.4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(heavy ? 0.5 : 0.38, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (heavy ? 0.07 : 0.045));
    src.connect(bp).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5, 0.1);
    this.tone(heavy ? 110 : 150 + Math.random() * 40, heavy ? 0.22 : 0.14, 0.05, "triangle");
  }

  /** Burst of static for glitch effects. */
  static(duration = 0.35, level = 0.3) {
    const ctx = this.ensure();
    if (!ctx || !this.master || !this.noise) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 900;
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(hp).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + duration + 0.05);
  }

  /**
   * The tape unit running for `ms`: a capstan motor hum that wobbles a little,
   * tape hiss over the heads, and a clunk at start and stop.
   */
  tape(ms: number) {
    const ctx = this.ensure();
    if (!ctx || !this.master || !this.noise) return;
    const t = ctx.currentTime;
    const end = t + ms / 1000;
    this.clunk(t);
    this.clunk(end - 0.04, 0.7);

    // motor: low sawtooth through a lowpass, with a slow pitch wobble
    const motor = ctx.createOscillator();
    motor.type = "sawtooth";
    motor.frequency.setValueAtTime(70, t);
    motor.frequency.linearRampToValueAtTime(118, t + 0.18); // spin-up
    motor.frequency.setValueAtTime(118, end - 0.15);
    motor.frequency.linearRampToValueAtTime(60, end); // spin-down
    const wobble = ctx.createOscillator();
    wobble.frequency.value = 5.5;
    const wobbleDepth = ctx.createGain();
    wobbleDepth.gain.value = 3;
    wobble.connect(wobbleDepth).connect(motor.frequency);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 520;
    const mg = ctx.createGain();
    mg.gain.setValueAtTime(0.0001, t);
    mg.gain.exponentialRampToValueAtTime(0.09, t + 0.12);
    mg.gain.setValueAtTime(0.09, end - 0.12);
    mg.gain.exponentialRampToValueAtTime(0.0001, end);
    motor.connect(lp).connect(mg).connect(this.master);

    // hiss of tape moving past the head
    const hiss = ctx.createBufferSource();
    hiss.buffer = this.noise;
    hiss.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 3400;
    bp.Q.value = 0.8;
    const hg = ctx.createGain();
    hg.gain.setValueAtTime(0.0001, t);
    hg.gain.exponentialRampToValueAtTime(0.035, t + 0.2);
    hg.gain.setValueAtTime(0.035, end - 0.12);
    hg.gain.exponentialRampToValueAtTime(0.0001, end);
    hiss.connect(bp).connect(hg).connect(this.master);

    for (const node of [motor, wobble, hiss]) {
      node.start(t);
      node.stop(end + 0.05);
    }
  }

  /** A relay/switch click, for the DISPLAY and REVERSE switches. */
  click() {
    const ctx = this.ensure();
    if (!ctx) return;
    this.clunk(ctx.currentTime, 0.45);
    this.tone(2400, 0.05, 0.018, "square");
  }

  /** Short mechanical clunk: a pitched-down thump plus a burst of noise. */
  private clunk(at: number, level = 1) {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noise) return;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(160, at);
    o.frequency.exponentialRampToValueAtTime(55, at + 0.08);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.32 * level, at + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.1);
    o.connect(g).connect(this.master);
    o.start(at);
    o.stop(at + 0.12);
    const n = ctx.createBufferSource();
    n.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 1800;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.18 * level, at);
    ng.gain.exponentialRampToValueAtTime(0.0001, at + 0.04);
    n.connect(f).connect(ng).connect(this.master);
    n.start(at, Math.random() * 0.5, 0.05);
  }

  /** Soft beep, like the 5100 signalling an error or a meter landing. */
  beep(freq = 880, dur = 0.12) {
    this.ensure();
    this.tone(freq, 0.12, dur, "square");
  }

  private tone(freq: number, level: number, dur: number, type: OscillatorType) {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  /** The relay "thunk" of an old set switching on. */
  private thunk(level = 1) {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.25);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.6 * level, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.32);
  }

  /** The rising whine + hum of a degaussing coil on power-up. */
  private degauss() {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(60, t);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 420;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    o.connect(lp).connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 1.15);
    this.tone(15600, 0.025, 1.4, "sine"); // flyback whine
  }
}

export const sounds = new SoundEngine();
