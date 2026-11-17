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

export function playExit(combo: number) {
  const base = 380 + Math.min(combo, 12) * 42;
  const wobble = 0.94 + Math.random() * 0.12;
  tone(base * wobble, 0.11, "triangle", 0.12, base * wobble * 1.85);
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
