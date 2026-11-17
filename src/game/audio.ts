let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfx: GainNode | null = null;
let enabled = true;

export function setSoundEnabled(on: boolean) {
  enabled = on;
  if (master && ctx) {
    master.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, 0.02);
  }
}

export function unlockAudio() {
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  if (!ctx) {
    ctx = new AC({ latencyHint: "interactive" });
    master = ctx.createGain();
    sfx = ctx.createGain();
    sfx.connect(master);
    master.connect(ctx.destination);
    master.gain.value = enabled ? 1 : 0;
  }
  if (ctx.state === "suspended") void ctx.resume();
}

export function resumeAudio() {
  if (ctx && ctx.state === "suspended") void ctx.resume();
}

function tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number) {
  if (!ctx || !sfx || !enabled) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(sfx);
  o.start(t);
  o.stop(t + dur + 0.02);
  o.onended = () => {
    o.disconnect();
    g.disconnect();
  };
}

const PENTATONIC = [0, 2, 4, 7, 9];

/**
 * Altezza (Hz) del suono di uscita: sale lungo una scala pentatonica a ogni passo di combo,
 * fino a due ottave sopra la nota di partenza, poi resta in cima.
 */
export function comboPitch(combo: number) {
  const step = Math.max(0, Math.min(10, combo - 1));
  const semis = Math.floor(step / 5) * 12 + PENTATONIC[step % 5]!;
  return 392 * 2 ** (semis / 12);
}

export function playExit(combo: number) {
  const base = comboPitch(combo);
  const wobble = 0.99 + Math.random() * 0.02;
  tone(base * wobble, 0.11, "triangle", 0.12, base * wobble * 1.6);
  // Dalla combo x4 si aggiunge una quinta sopra, più leggera: la catena "brilla".
  if (combo >= 4) tone(base * 1.5, 0.09, "sine", 0.05, base * 2.2);
}

export function playHit() {
  tone(300, 0.07, "square", 0.05, 520);
}

export function playUnlock() {
  window.setTimeout(() => tone(1180, 0.08, "sine", 0.06, 1560), 40);
}

export function playMiss() {
  tone(160, 0.13, "square", 0.05, 70);
}

export function playClear() {
  tone(523, 0.12, "triangle", 0.1);
  window.setTimeout(() => tone(659, 0.12, "triangle", 0.1), 90);
  window.setTimeout(() => tone(784, 0.18, "triangle", 0.12), 180);
}

export function playUi() {
  tone(640, 0.045, "sine", 0.04);
}
