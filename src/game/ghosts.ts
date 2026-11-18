/**
 * Frecce fantasma dello sfondo: 20-30 sagome di frecce tenuissime che salgono piano,
 * a velocità e dimensioni diverse, con una leggera rotazione, nel colore del tema/capitolo.
 *
 * Reagiscono al gioco tramite tre segnali (scritti dalla partita, letti dallo sfondo):
 * - calore della combo: accelerano e si scaldano verso l'oro dell'alone;
 * - errore: rallentano per un attimo;
 * - festa di fine livello (solo successi veri): schizzano via verso l'alto.
 *
 * Qui solo logica pura; il disegno è in components/ghost-field.tsx.
 */

export const GHOST_COUNT_MIN = 20;
export const GHOST_COUNT_MAX = 30;
export const GHOST_ALPHA_MIN = 0.06;
export const GHOST_ALPHA_MAX = 0.09;
/** Opacità massima assoluta, anche con la combo al massimo: resta nel range 0,06-0,10. */
export const GHOST_ALPHA_CAP = 0.10;
export const GHOST_FPS = 30;
export const HEAT_GOLD = "#ffc23d";

/** Durata del rallentamento dopo un errore (s) e della spinta della festa (s). */
const MISS_SLOW = 0.7;
const BURST_TIME = 1.4;

export type Ghost = {
  x: number;
  y: number;
  /** Lato della sagoma in px. */
  size: number;
  /** Velocità di salita a riposo (px/s). */
  speed: number;
  rot: number;
  spin: number;
  alpha: number;
  /** Deriva laterale (px/s). */
  drift: number;
};

export type GhostSignals = {
  heat: number;
  heatAt: number;
  missAt: number;
  burstAt: number;
};

/** Segnali condivisi tra la partita e lo sfondo (un solo sfondo per pagina). */
export const ghostSignals: GhostSignals = { heat: 0, heatAt: -1e9, missAt: -1e9, burstAt: -1e9 };

export function setGhostHeat(heat: number, now = performance.now()) {
  ghostSignals.heat = Math.max(0, Math.min(1, heat));
  ghostSignals.heatAt = now;
}
export function ghostMiss(now = performance.now()) {
  ghostSignals.missAt = now;
}
/** Da chiamare SOLO per un successo vero (2-3 stelle, sfida vinta, record del Rush). */
export function ghostBurst(now = performance.now()) {
  ghostSignals.burstAt = now;
}

export function ghostCount(w: number, h: number) {
  // Più fantasmi sugli schermi grandi, sempre tra 20 e 30.
  const n = Math.round((w * h) / 22000);
  return Math.max(GHOST_COUNT_MIN, Math.min(GHOST_COUNT_MAX, n));
}

export function spawnGhost(w: number, h: number, rand: () => number, below = false): Ghost {
  const size = 14 + rand() * 34;
  return {
    x: rand() * w,
    y: below ? h + size + rand() * h * 0.6 : rand() * h,
    size,
    // Le sagome grandi salgono più piano: effetto profondità.
    speed: 26 - (size - 14) * 0.45 + rand() * 6,
    rot: (rand() - 0.5) * 0.6,
    spin: (rand() - 0.5) * 0.3,
    alpha: GHOST_ALPHA_MIN + rand() * (GHOST_ALPHA_MAX - GHOST_ALPHA_MIN),
    drift: (rand() - 0.5) * 6,
  };
}

export function createGhosts(w: number, h: number, rand: () => number = Math.random) {
  return Array.from({ length: ghostCount(w, h) }, () => spawnGhost(w, h, rand));
}

/** Calore effettivo: se la partita non lo aggiorna da un po' (fuori gioco), torna a zero. */
export function effectiveHeat(s: GhostSignals, now: number) {
  return now - s.heatAt > 400 ? 0 : s.heat;
}

/**
 * Moltiplicatore della velocità di salita:
 * combo → fino a 3x; errore → crolla a 0,2x e torna normale in 0,7 s.
 */
export function speedFactor(s: GhostSignals, now: number) {
  let m = 1 + effectiveHeat(s, now) * 2;
  const sinceMiss = (now - s.missAt) / 1000;
  if (sinceMiss >= 0 && sinceMiss < MISS_SLOW) {
    const k = sinceMiss / MISS_SLOW;
    m *= 0.2 + 0.8 * k * k;
  }
  return m;
}

/** Spinta verso l'alto della festa (px/s in più), forte all'inizio e poi si smorza. */
export function burstBoost(s: GhostSignals, now: number) {
  const t = (now - s.burstAt) / 1000;
  if (t < 0 || t > BURST_TIME) return 0;
  return 1400 * Math.exp(-t * 2.6);
}

export function isBursting(s: GhostSignals, now: number) {
  return burstBoost(s, now) > 0;
}

/** Avanza la simulazione di dt secondi (al massimo 0,1 s per volta). */
export function stepGhosts(
  ghosts: Ghost[],
  dt: number,
  w: number,
  h: number,
  now: number,
  s: GhostSignals,
  rand: () => number = Math.random,
) {
  const d = Math.min(0.1, Math.max(0, dt));
  const m = speedFactor(s, now);
  const boost = burstBoost(s, now);
  for (let i = 0; i < ghosts.length; i++) {
    const g = ghosts[i]!;
    g.y -= (g.speed * m + boost * (0.6 + g.size / 60)) * d;
    g.x += g.drift * d;
    g.rot += g.spin * d * (0.5 + m * 0.5);
    if (g.y < -g.size * 1.5 || g.x < -g.size * 2 || g.x > w + g.size * 2) {
      // Rientra dal basso; durante la festa più in basso, così lo schermo si svuota e poi si riempie.
      ghosts[i] = spawnGhost(w, h, rand, true);
      if (boost === 0) ghosts[i]!.y = h + ghosts[i]!.size + rand() * 40;
    }
  }
}

// --- colore e contrasto ----------------------------------------------------

export function parseHex(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [255, 90, 31];
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Colore dei fantasmi: quello del tema/capitolo, che si scalda verso l'oro con la combo. */
export function ghostRgb(accent: string, heat: number): [number, number, number] {
  const a = parseHex(accent);
  const g = parseHex(HEAT_GOLD);
  const k = Math.max(0, Math.min(1, heat));
  return [0, 1, 2].map((i) => Math.round(a[i]! + (g[i]! - a[i]!) * k)) as [number, number, number];
}

/** Opacità di un fantasma: un filo più visibile con la combo, mai oltre GHOST_ALPHA_CAP. */
export function ghostAlpha(base: number, heat: number) {
  return Math.min(GHOST_ALPHA_CAP, base * (1 + 0.25 * Math.max(0, Math.min(1, heat))));
}

export function blend(fg: [number, number, number], bg: [number, number, number], alpha: number) {
  return [0, 1, 2].map((i) => fg[i]! * alpha + bg[i]! * (1 - alpha)) as [number, number, number];
}

function luminance([r, g, b]: [number, number, number]) {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Rapporto di contrasto WCAG tra due colori. */
export function contrastRatio(a: [number, number, number], b: [number, number, number]) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Va disegnato un fotogramma? Limite di 30 fotogrammi al secondo. */
export function shouldDraw(lastDraw: number, now: number, fps = GHOST_FPS) {
  return now - lastDraw >= 1000 / fps - 1;
}
