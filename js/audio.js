/** Lightweight Web Audio bus — procedural SFX, no asset pack. */
export class AudioBus {
  constructor() {
    this.ctx = null;
    this.master = null;
    this._muted = false;
    this.supported = typeof window !== "undefined" && !!(window.AudioContext || window.webkitAudioContext);
  }

  get muted() {
    return this._muted;
  }

  set muted(value) {
    this._muted = !!value;
    this.applyMuteGain();
  }

  ensure() {
    if (!this.supported || this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this._muted ? 0.0001 : 0.2;
      this.master.connect(this.ctx.destination);
    } catch {
      this.supported = false;
      this.ctx = null;
      this.master = null;
    }
  }

  applyMuteGain() {
    if (!this.master || !this.ctx) return;
    const t = this.ctx.currentTime;
    const target = this._muted ? 0.0001 : 0.2;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(Math.max(0.0001, this.master.gain.value), t);
    this.master.gain.linearRampToValueAtTime(target, t + 0.04);
  }

  resume() {
    this.ensure();
    if (this.ctx?.state === "suspended") {
      return this.ctx.resume().catch(() => {});
    }
    return Promise.resolve();
  }

  tone(freq, dur = 0.08, type = "sine", gain = 0.5, slide = 0) {
    if (this._muted || !this.ctx || !this.master) return;
    const f0 = Math.max(40, freq);
    const f1 = Math.max(40, freq + slide);
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    if (slide !== 0) {
      try {
        osc.frequency.exponentialRampToValueAtTime(f1, t + dur);
      } catch {
        osc.frequency.linearRampToValueAtTime(f1, t + dur);
      }
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.03, dur));
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  morph() {
    this.tone(220, 0.07, "triangle", 0.32, 180);
  }

  lane() {
    this.tone(168, 0.05, "sine", 0.22, 36);
  }

  collect() {
    this.tone(660, 0.07, "sine", 0.36, 220);
    this.tone(990, 0.09, "triangle", 0.18, 0);
  }

  gate() {
    this.tone(420, 0.06, "square", 0.14, -80);
  }

  combo(n) {
    this.tone(300 + Math.min(12, n) * 36, 0.08, "triangle", 0.28, 120);
  }

  death() {
    this.tone(180, 0.2, "sawtooth", 0.3, -120);
    this.tone(90, 0.36, "triangle", 0.26, -50);
  }

  start() {
    this.tone(260, 0.1, "triangle", 0.28, 100);
    this.tone(390, 0.14, "sine", 0.22, 160);
  }
}
