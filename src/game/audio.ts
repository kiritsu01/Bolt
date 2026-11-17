/**
 * Suoni di BOLT: tutti sintetizzati con Web Audio, nessun file da scaricare (si gioca offline).
 * Ogni suono è breve e ha un ruolo preciso; i successi salgono di tono, gli errori sono sordi e bassi.
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfx: GainNode | null = null;
let noise: AudioBuffer | null = null;
let enabled = true;

export function setSoundEnabled(on: boolean) {
  enabled = on;
  if (master && ctx) {
    master.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, 0.02);
  }
}

export function unlockAudio() {
  if (typeof window === "undefined") return;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  if (!ctx) {
    ctx = new AC({ latencyHint: "interactive" });
    master = ctx.createGain();
    sfx = ctx.createGain();
    // Compressore leggero: suoni più pieni e nessun picco fastidioso quando si sovrappongono.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 12;
    comp.ratio.value = 3;
    comp.attack.value = 0.003;
    comp.release.value = 0.15;
    sfx.connect(comp);
    comp.connect(master);
    master.connect(ctx.destination);
    master.gain.value = enabled ? 1 : 0;
    // Rumore bianco riutilizzabile (tonfi, clic, whoosh).
    noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === "suspended") void ctx.resume();
}

export function resumeAudio() {
  if (ctx && ctx.state === "suspended") void ctx.resume();
}

type ToneOpts = { slideTo?: number; delay?: number; attack?: number };

function tone(freq: number, dur: number, type: OscillatorType, vol: number, opts: ToneOpts = {}) {
  if (!ctx || !sfx || !enabled) return;
  const t = ctx.currentTime + (opts.delay ?? 0);
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (opts.slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(30, opts.slideTo), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + (opts.attack ?? 0.008));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(sfx);
  o.start(t);
  o.stop(t + dur + 0.03);
  o.onended = () => {
    o.disconnect();
    g.disconnect();
  };
}

/** Rumore filtrato: base per tonfi (passa-basso), clic (passa-alto) e whoosh (passa-banda che scorre). */
function hiss(
  dur: number,
  vol: number,
  filter: BiquadFilterType,
  freq: number,
  opts: { delay?: number; sweepTo?: number; q?: number } = {},
) {
  if (!ctx || !sfx || !noise || !enabled) return;
  const t = ctx.currentTime + (opts.delay ?? 0);
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = filter;
  f.frequency.setValueAtTime(freq, t);
  if (opts.sweepTo) f.frequency.exponentialRampToValueAtTime(opts.sweepTo, t + dur);
  f.Q.value = opts.q ?? 0.8;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.02, dur / 3));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f);
  f.connect(g);
  g.connect(sfx);
  src.start(t);
  src.stop(t + dur + 0.02);
  src.onended = () => {
    src.disconnect();
    f.disconnect();
    g.disconnect();
  };
}

// --- note ------------------------------------------------------------------

const PENTATONIC = [0, 2, 4, 7, 9];

/** Passi di combo in cui la nota continua a salire (x1 ... x16). */
export const COMBO_STEPS = 16;

/**
 * Altezza (Hz) della nota di una combo: sale lungo una scala pentatonica a OGNI mossa giusta,
 * per tre ottave (da do4 a do7), poi resta in cima.
 */
export function comboPitch(combo: number) {
  const step = Math.max(0, Math.min(COMBO_STEPS - 1, combo - 1));
  const semis = Math.floor(step / 5) * 12 + PENTATONIC[step % 5]!;
  return 261.63 * 2 ** (semis / 12);
}

/** Note delle stelle contate a fine livello: do, mi, sol (salgono). */
export const STAR_NOTES = [523.25, 659.25, 783.99] as const;

// --- suoni del gioco -------------------------------------------------------

/** Tocco riuscito: "pop" corto (colpo morbido) + nota della combo che sale a ogni mossa. */
export function playExit(combo: number) {
  const base = comboPitch(combo);
  tone(620, 0.06, "sine", 0.16, { slideTo: 180, attack: 0.002 });
  hiss(0.025, 0.06, "highpass", 3500);
  tone(base, 0.12, "triangle", 0.11, { slideTo: base * 1.5, delay: 0.012 });
  // Da x4 una quinta sopra, più leggera: la catena "brilla".
  if (combo >= 4) tone(base * 1.5, 0.1, "sine", 0.045, { slideTo: base * 2.1, delay: 0.02 });
  // Da x8 un'ottava cristallina in più.
  if (combo >= 8) tone(base * 2, 0.08, "sine", 0.03, { delay: 0.04 });
}

/** Primo colpo su una freccia doppia: un "toc" secco, il guscio si incrina. */
export function playHit() {
  tone(300, 0.07, "square", 0.04, { slideTo: 520 });
  hiss(0.04, 0.05, "bandpass", 1800, { q: 2 });
}

/** Lucchetto che si apre: scatto metallico + campanella. */
export function playUnlock() {
  hiss(0.03, 0.09, "highpass", 4200, { delay: 0.03 });
  tone(1568, 0.28, "sine", 0.06, { delay: 0.07 });
  tone(2349, 0.2, "sine", 0.025, { delay: 0.075 });
}

/** Mossa sbagliata: tonfo sordo e basso. Niente note allegre. */
export function playMiss() {
  hiss(0.14, 0.16, "lowpass", 420, { sweepTo: 160 });
  tone(120, 0.16, "sine", 0.18, { slideTo: 55, attack: 0.004 });
}

/** Stella contata a fine livello (indice 0, 1, 2): nota che sale; la terza aggiunge l'accordo. */
export function playStar(index: number) {
  const f = STAR_NOTES[Math.max(0, Math.min(2, index))]!;
  tone(f, 0.22, "triangle", 0.12);
  tone(f * 2, 0.16, "sine", 0.035, { delay: 0.01 });
  if (index >= 2) {
    tone(STAR_NOTES[0], 0.45, "sine", 0.05, { delay: 0.05 });
    tone(STAR_NOTES[1], 0.45, "sine", 0.05, { delay: 0.05 });
  }
}

/** Vittoria vera: arpeggio che sale e si apre in un accordo. */
export function playWin() {
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((f, i) => tone(f, 0.3 + i * 0.05, "triangle", 0.09, { delay: i * 0.07 }));
  notes.forEach((f) => tone(f, 0.6, "sine", 0.025, { delay: 0.3 }));
}

/** Fine neutra (sfida persa o pari, tempo scaduto senza record): una nota calma, nessuna festa. */
export function playCalm() {
  tone(392, 0.32, "sine", 0.07);
  tone(330, 0.4, "sine", 0.05, { delay: 0.12 });
}

/** Moneta contata: "tic" brillante che sale leggermente. */
export function playCoin(index: number) {
  const f = 1760 + Math.min(index, 12) * 45;
  tone(f, 0.07, "square", 0.025);
  tone(f * 1.5, 0.09, "sine", 0.04, { delay: 0.015 });
}

/** Acquisto nel negozio: "cassa" a due note. */
export function playBuy() {
  tone(1046.5, 0.08, "triangle", 0.08);
  tone(1568, 0.18, "triangle", 0.08, { delay: 0.08 });
  hiss(0.05, 0.04, "highpass", 5000, { delay: 0.08 });
}

/** Nuovo capitolo: fanfara breve di quattro note. */
export function playFanfare() {
  const seq = [392, 523.25, 659.25, 783.99];
  seq.forEach((f, i) => tone(f, i === 3 ? 0.5 : 0.14, "sawtooth", 0.035, { delay: i * 0.11 }));
  seq.forEach((f, i) => tone(f, i === 3 ? 0.55 : 0.16, "triangle", 0.08, { delay: i * 0.11 }));
}

/** Rivincita: un colpo d'aria che passa. */
export function playWhoosh() {
  hiss(0.28, 0.12, "bandpass", 400, { sweepTo: 3200, q: 1.4 });
}

/** Griglia svuotata (prima del pannello): accordo brillante breve. */
export function playClear() {
  tone(523, 0.12, "triangle", 0.08);
  tone(784, 0.18, "triangle", 0.08, { delay: 0.06 });
}

/** Conto alla rovescia del duello: un tono per numero (3, 2, 1), poi il "Via!" più alto. */
export function playCount(n: number) {
  tone(n > 0 ? 523.25 : 1046.5, n > 0 ? 0.12 : 0.28, "triangle", n > 0 ? 0.09 : 0.11);
  if (n === 0) tone(1567.98, 0.25, "sine", 0.05, { delay: 0.02 });
}

export function playUi() {
  tone(640, 0.045, "sine", 0.04);
}
