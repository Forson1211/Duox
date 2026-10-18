// Web Audio API zero-dependency arcade synthesizer for DUO CLASH

let ctx: AudioContext | null = null;
let soundEnabled = true;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx) {
      ctx = new AudioCtx();
    }
  }
  if (ctx && ctx.state === "suspended") {
    void ctx.resume();
  }
  return ctx;
}

export function setSoundEnabled(enabled: boolean) {
  soundEnabled = enabled;
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem("duo_sound_enabled", String(enabled));
    } catch {
      // ignore
    }
  }
}

export function isSoundEnabled(): boolean {
  if (typeof window !== "undefined") {
    try {
      const saved = localStorage.getItem("duo_sound_enabled");
      if (saved !== null) return saved === "true";
    } catch {
      // ignore
    }
  }
  return soundEnabled;
}

export function playTone(
  freq: number,
  duration = 0.25,
  type: OscillatorType = "sine",
  gainLevel = 0.15,
) {
  if (!isSoundEnabled()) return;
  const audio = getContext();
  if (!audio) return;

  try {
    const now = audio.currentTime;
    const osc = audio.createOscillator();
    const gain = audio.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);

    // Smooth envelope to avoid clicks
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(gainLevel, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(audio.destination);

    osc.start(now);
    osc.stop(now + duration + 0.05);
  } catch {
    // Ignore audio errors
  }
}

const tileFrequencies = [261.63, 329.63, 392.0, 523.25]; // C4, E4, G4, C5

export function playMemoryTile(tileIndex: number) {
  const freq = tileFrequencies[tileIndex] ?? 300;
  playTone(freq, 0.35, "sine", 0.2);
}

export function playTileTap(tileIndex: number) {
  const freq = tileFrequencies[tileIndex] ?? 300;
  playTone(freq, 0.18, "triangle", 0.25);
}

export function playCorrect() {
  if (!isSoundEnabled()) return;
  const audio = getContext();
  if (!audio) return;
  try {
    const now = audio.currentTime;
    [
      { f: 392.0, t: 0 },
      { f: 523.25, t: 0.1 },
      { f: 659.25, t: 0.2 },
    ].forEach(({ f, t }) => {
      setTimeout(() => playTone(f, 0.25, "sine", 0.15), t * 1000);
    });
  } catch {
    // ignore
  }
}

export function playIncorrect() {
  if (!isSoundEnabled()) return;
  playTone(130, 0.3, "sawtooth", 0.12);
}

export function playGo() {
  if (!isSoundEnabled()) return;
  playTone(659.25, 0.15, "triangle", 0.25);
  setTimeout(() => playTone(880, 0.3, "sine", 0.25), 100);
}

export function playClick() {
  if (!isSoundEnabled()) return;
  playTone(440, 0.05, "sine", 0.08);
}

export function playLetterPlace() {
  if (!isSoundEnabled()) return;
  playTone(480, 0.08, "triangle", 0.12);
}

export function playLetterRemove() {
  if (!isSoundEnabled()) return;
  playTone(320, 0.08, "sine", 0.1);
}
