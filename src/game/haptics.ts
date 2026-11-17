/** Vibrazioni brevi (navigator.vibrate dove esiste; su iPhone non c'è e non succede nulla). */

export const HAPTIC = {
  tap: 8,
  tapHot: 12,
  miss: [12, 40, 12],
  star: 10,
  unlock: 10,
  win: [14, 50, 24],
  chapter: [15, 60, 25],
} as const;

export function vibrate(pattern: number | readonly number[]) {
  try {
    navigator.vibrate?.(pattern as number | number[]);
  } catch {
    /* non supportato */
  }
}
