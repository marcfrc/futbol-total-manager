/**
 * match/audio.ts — Audio del partido sintetizado con Web Audio: ambiente de grada,
 * silbato, golpeos, gol, entrada y UI. Sin archivos de audio; mute persistente.
 */

const MUTE_KEY = "ftm.muted";

function readMuted(): boolean {
  try { return localStorage.getItem(MUTE_KEY) === "1"; } catch { return false; }
}
function writeMuted(v: boolean): void {
  try { localStorage.setItem(MUTE_KEY, v ? "1" : "0"); } catch { /* noop */ }
}

export class MatchAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private crowdGain: GainNode | null = null;
  private crowdBase = 0.16;
  private disposed = false;
  muted = readMuted();

  private ensure(): AudioContext | null {
    if (this.disposed) return null;
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.9;
        this.master.connect(this.ctx.destination);
      } catch { return null; }
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  setMuted(v: boolean): void {
    this.muted = v;
    writeMuted(v);
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(v ? 0 : 0.9, this.ctx.currentTime, 0.05);
  }

  /** Murmullo continuo de la grada: ruido filtrado con vaivén lento. */
  startCrowd(): void {
    const ctx = this.ensure();
    if (!ctx || !this.master || this.crowdGain) return;
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass"; bp.frequency.value = 500; bp.Q.value = 0.6;
    const gain = ctx.createGain();
    gain.gain.value = this.crowdBase;
    // vaivén lento del público
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.13;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.045;
    lfo.connect(lfoGain).connect(gain.gain);
    src.connect(bp).connect(gain).connect(this.master);
    src.start(); lfo.start();
    this.crowdGain = gain;
  }

  /** Subida emocional del público (ocasiones, minutos finales). */
  crowdSwell(amount: number, decay = 1.2): void {
    const ctx = this.ctx;
    if (!ctx || !this.crowdGain) return;
    const g = this.crowdGain.gain;
    g.cancelScheduledValues(ctx.currentTime);
    g.setTargetAtTime(this.crowdBase + amount, ctx.currentTime, 0.08);
    g.setTargetAtTime(this.crowdBase, ctx.currentTime + 0.3, decay);
  }

  private blip(freq: number, dur: number, type: OscillatorType, vol: number, slide = 0): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slide !== 0) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), ctx.currentTime + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g).connect(this.master);
    o.start(); o.stop(ctx.currentTime + dur + 0.02);
  }

  private noise(dur: number, vol: number, freq = 1200, q = 1): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const len = Math.max(1, (ctx.sampleRate * dur) | 0);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass"; bp.frequency.value = freq; bp.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(bp).connect(g).connect(this.master);
    src.start();
  }

  whistle(long = false): void {
    this.blip(2200, long ? 1.0 : 0.35, "square", 0.12);
    this.blip(2350, long ? 1.0 : 0.35, "square", 0.08);
  }
  kick(power = 1): void { this.noise(0.09, 0.35 * power, 700, 0.8); this.blip(95, 0.08, "sine", 0.3 * power, -40); }
  tackle(): void { this.noise(0.12, 0.3, 350, 1); this.blip(70, 0.12, "sine", 0.32, -25); }
  post(): void { this.blip(420, 0.35, "triangle", 0.3, -60); }
  goal(): void {
    this.crowdSwell(0.55, 2.5);
    this.noise(1.6, 0.5, 900, 0.4);
    this.blip(523, 0.5, "sine", 0.16);
    setTimeout(() => this.blip(659, 0.5, "sine", 0.16), 140);
    setTimeout(() => this.blip(784, 0.8, "sine", 0.2), 280);
  }
  ui(): void { this.blip(660, 0.06, "sine", 0.12); }

  dispose(): void {
    this.disposed = true;
    if (this.ctx) void this.ctx.close().catch(() => undefined);
    this.ctx = null;
    this.master = null;
    this.crowdGain = null;
  }
}
