// A lightweight simulator that mimics BLE gesture packets while the real glove
// hardware isn't connected. Streams a varied, context-aware vocabulary so the
// sentence builder and TTS can be exercised end-to-end from the preview.

const SIM_VOCAB: Record<string, string[]> = {
  Everyday: ["Hello", "I", "need", "water", "please", "Thank you", "Yes", "No", "Help"],
  Riding: ["Slow down", "Stop", "Left", "Right", "OK", "Stopping", "Hazard", "Fuel"],
  Scuba: ["OK", "Up", "Down", "Low on air", "Problem", "Watch", "Slow", "Together"],
};

type Listener = (token: string) => void;

let timer: ReturnType<typeof setInterval> | null = null;
let listeners: Listener[] = [];
let active = false;

export const bleSimulator = {
  isActive(): boolean {
    return active;
  },
  start(contextMode: "Everyday" | "Riding" | "Scuba" = "Everyday") {
    this.stop();
    active = true;
    let i = 0;
    const words = SIM_VOCAB[contextMode] ?? SIM_VOCAB.Everyday;
    timer = setInterval(() => {
      const token = words[i % words.length];
      i += 1;
      listeners.forEach((listener) => listener(token));
    }, 1800);
  },
  stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    active = false;
  },
  subscribe(listener: Listener) {
    listeners.push(listener);
    return () => {
      listeners = listeners.filter((entry) => entry !== listener);
    };
  },
};
