import { todayKey } from "./logic";
import type { Save } from "./save";

/** Indizi gratuiti al giorno: si ricaricano a mezzanotte (ora locale). */
export const FREE_HINTS = 3;

/** Indizi rimasti oggi. Un giorno nuovo riparte da FREE_HINTS. */
export function hintsLeft(save: Pick<Save, "hintDay" | "hintsLeft">, today = todayKey()) {
  return save.hintDay === today ? Math.max(0, save.hintsLeft) : FREE_HINTS;
}

/** Consuma un indizio della scorta di oggi (se c'è). */
export function spendHint<T extends Pick<Save, "hintDay" | "hintsLeft">>(save: T, today = todayKey()): T {
  const left = hintsLeft(save, today);
  if (left <= 0) return save;
  return { ...save, hintDay: today, hintsLeft: left - 1 };
}

/** Millisecondi che mancano alla prossima mezzanotte locale. */
export function msUntilMidnight(now = new Date()) {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return Math.max(1000, next.getTime() - now.getTime());
}
