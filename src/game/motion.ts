/**
 * Movimento delle frecce che escono: una curva sola, usata sia dalla simulazione
 * (quando la freccia passa il bordo) sia dal disegno, così tutto resta sincronizzato.
 *
 * 1. carica: la freccia arretra appena e si schiaccia (anticipazione);
 * 2. scatto: accelera con continuità, senza strappi, e non rallenta;
 * 3. uscita: supera il bordo di un tratto e intanto sfuma e si rimpicciolisce.
 */

/** Celle percorse oltre il bordo mentre la freccia sfuma. */
export const OVERSHOOT = 1.6;
/** Quota della durata dedicata alla carica. */
const WINDUP = 0.16;
/** Quanto arretra durante la carica (in celle). */
const PULLBACK = 0.14;

/** Durata del volo: cresce con la radice della distanza, così i voli lunghi restano rapidi. */
export function flyDuration(dist: number, reduce: boolean) {
  if (reduce) return 0.12 + dist * 0.02;
  return 0.24 + Math.sqrt(dist + OVERSHOOT) * 0.085;
}

/** Celle percorse al tempo normalizzato t (0..1). Negativo durante la carica. */
export function flyDistance(t: number, dist: number, reduce: boolean) {
  const u = Math.min(1, Math.max(0, t));
  if (reduce) return dist * u;
  const total = dist + OVERSHOOT;
  if (u < WINDUP) return -PULLBACK * Math.sin((u / WINDUP) * Math.PI);
  const v = (u - WINDUP) / (1 - WINDUP);
  // Parte da ferma e accelera; la velocità finale è 1,5 volte la media (nessuna frenata).
  return total * ((3 * v * v - v * v * v) / 2);
}

/**
 * Deformazione lungo la direzione: < 1 schiacciata (carica), > 1 allungata (velocità).
 * Il disegno la applica come scala (s, 1/s), quindi il volume apparente resta uguale.
 */
export function flyStretch(t: number, reduce: boolean) {
  if (reduce) return 1;
  const u = Math.min(1, Math.max(0, t));
  if (u < WINDUP) return 1 - 0.16 * Math.sin((u / WINDUP) * Math.PI);
  const v = (u - WINDUP) / (1 - WINDUP);
  const speed = (6 * v - 3 * v * v) / 2 / 1.5; // 0..1
  return 1 + 0.42 * speed;
}

/**
 * Mini rimbalzo al tocco: durante la carica la freccia si gonfia di un 12% e torna normale,
 * così il dito "sente" la freccia prima che parta. 1 = dimensione normale.
 */
export function flyPop(t: number, reduce: boolean) {
  if (reduce) return 1;
  const u = Math.min(1, Math.max(0, t));
  if (u >= WINDUP * 1.6) return 1;
  return 1 + 0.12 * Math.sin((u / (WINDUP * 1.6)) * Math.PI);
}

/** Opacità e scala: piene dentro la griglia, poi sfumano oltre il bordo. */
export function flyFade(pos: number, dist: number) {
  const out = Math.min(1, Math.max(0, (pos - dist + 0.35) / OVERSHOOT));
  const k = 1 - out * out * (3 - 2 * out);
  return { alpha: k, scale: 0.72 + 0.28 * k };
}

/** Tempo normalizzato in cui la freccia passa il bordo della griglia. */
export function crossTime(dist: number, reduce: boolean) {
  if (reduce) return 1;
  let lo = WINDUP;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (flyDistance(mid, dist, reduce) < dist) lo = mid;
    else hi = mid;
  }
  return hi;
}
