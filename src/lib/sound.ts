// Tiny synthesized sound engine built on the Web Audio API. No audio files are
// shipped: every effect is generated on the fly, so the offline bundle stays
// weightless and there are no external requests. Sounds are intentionally soft.

type SoundName =
  | "flip"
  | "draw"
  | "place"
  | "discard"
  | "clear"
  | "button"
  | "win"
  | "lose"
  | "turn";

let ctx: AudioContext | null = null;
let enabled = true;

export const setSoundEnabled = (value: boolean): void => {
  enabled = value;
};

const getCtx = (): AudioContext | null => {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  // Browsers start the context suspended until a user gesture.
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
};

/** Call once from a user gesture to unlock audio on mobile browsers. */
export const primeAudio = (): void => {
  getCtx();
};

interface ToneOptions {
  freq: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
  attack?: number;
  glideTo?: number;
  delay?: number;
}

const tone = (audio: AudioContext, opts: ToneOptions): void => {
  const {
    freq,
    duration,
    type = "sine",
    gain = 0.08,
    attack = 0.005,
    glideTo,
    delay = 0,
  } = opts;
  const start = audio.currentTime + delay;
  const osc = audio.createOscillator();
  const env = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, start + duration);
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(gain, start + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(env);
  env.connect(audio.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
};

export const playSound = (name: SoundName): void => {
  if (!enabled) return;
  const audio = getCtx();
  if (!audio) return;

  switch (name) {
    case "flip":
      tone(audio, { freq: 520, duration: 0.09, type: "triangle", gain: 0.05 });
      break;
    case "draw":
      tone(audio, { freq: 300, glideTo: 460, duration: 0.12, type: "sine", gain: 0.06 });
      break;
    case "place":
      tone(audio, { freq: 420, glideTo: 300, duration: 0.11, type: "triangle", gain: 0.07 });
      break;
    case "discard":
      tone(audio, { freq: 260, glideTo: 180, duration: 0.12, type: "sine", gain: 0.05 });
      break;
    case "turn":
      tone(audio, { freq: 660, duration: 0.07, type: "sine", gain: 0.04 });
      break;
    case "button":
      tone(audio, { freq: 480, duration: 0.05, type: "square", gain: 0.03 });
      break;
    case "clear":
      [523, 659, 784, 1047].forEach((f, i) =>
        tone(audio, { freq: f, duration: 0.16, type: "triangle", gain: 0.06, delay: i * 0.06 })
      );
      break;
    case "win":
      [523, 659, 784, 1047, 1319].forEach((f, i) =>
        tone(audio, { freq: f, duration: 0.28, type: "triangle", gain: 0.07, delay: i * 0.11 })
      );
      break;
    case "lose":
      [392, 330, 262].forEach((f, i) =>
        tone(audio, { freq: f, duration: 0.32, type: "sine", gain: 0.06, delay: i * 0.14 })
      );
      break;
  }
};
