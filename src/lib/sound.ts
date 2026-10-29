// Optional ambient sound, synthesized (no audio files): rain is filtered pink noise, wind is
// slowly breathing brown noise, thunder a low rumble. Off unless turned on in Settings.

type Mix = { rain: number; wind: number };

function noise(ctx: AudioContext, kind: "pink" | "brown", seconds = 4): AudioBuffer {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, last = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    if (kind === "pink") {
      b0 = 0.99765 * b0 + white * 0.099046;
      b1 = 0.963 * b1 + white * 0.2965164;
      b2 = 0.57 * b2 + white * 1.0526913;
      data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.11;
    } else {
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
  }
  return buffer;
}

export class AmbientSound {
  private ctx: AudioContext | undefined;
  private rain: GainNode | undefined;
  private wind: GainNode | undefined;
  private master: GainNode | undefined;

  /** Must first run from a user gesture (a click), as browsers require. */
  start() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(ctx.destination);

    const loop = (buffer: AudioBuffer) => {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.start();
      return src;
    };

    const rainHp = ctx.createBiquadFilter();
    rainHp.type = "highpass";
    rainHp.frequency.value = 450;
    const rainLp = ctx.createBiquadFilter();
    rainLp.type = "lowpass";
    rainLp.frequency.value = 6500;
    this.rain = ctx.createGain();
    this.rain.gain.value = 0;
    loop(noise(ctx, "pink")).connect(rainHp).connect(rainLp).connect(this.rain).connect(this.master);

    const windLp = ctx.createBiquadFilter();
    windLp.type = "lowpass";
    windLp.frequency.value = 380;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 220;
    lfo.connect(lfoDepth).connect(windLp.frequency);
    lfo.start();
    this.wind = ctx.createGain();
    this.wind.gain.value = 0;
    loop(noise(ctx, "brown")).connect(windLp).connect(this.wind).connect(this.master);
  }

  set({ rain, wind }: Mix) {
    if (!this.ctx || !this.rain || !this.wind) return;
    const t = this.ctx.currentTime;
    this.rain.gain.setTargetAtTime(rain * 0.55, t, 1.5);
    this.wind.gain.setTargetAtTime(0.04 + wind * 0.3, t, 2);
  }

  thunder(distance = 0.5) {
    const ctx = this.ctx;
    if (!ctx || !this.master || ctx.state !== "running") return;
    const src = ctx.createBufferSource();
    src.buffer = noise(ctx, "brown", 5);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 160 + (1 - distance) * 140;
    const env = ctx.createGain();
    const t = ctx.currentTime + 0.4 + distance * 2.2;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.9 * (1 - distance * 0.5), t + 0.25);
    env.gain.exponentialRampToValueAtTime(0.001, t + 4.5);
    src.connect(lp).connect(env).connect(this.master);
    src.start(t);
    src.stop(t + 5);
  }

  stop() {
    void this.ctx?.close();
    this.ctx = undefined;
  }
}

export const ambientSound = new AmbientSound();
