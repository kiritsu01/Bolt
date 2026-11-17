import { CHAPTER_COUNT, CHAPTER_SIZE, type Mech } from "./logic";

export type ChapterInfo = {
  /** Indice (0 = primo capitolo). */
  index: number;
  /** Primo livello del capitolo. */
  first: number;
  /** Ultimo livello (null = capitolo senza fine). */
  last: number | null;
  /** Colore d'accento; null = quello del tema scelto. */
  accent: string | null;
  /** Meccanica del capitolo (il quinto le alterna). */
  mech: Mech | "mix";
};

const ACCENTS = [null, "#2ec4b6", "#a78bfa", "#ffc93c", "#ff5c8a"] as const;

export const CHAPTERS: ChapterInfo[] = Array.from({ length: CHAPTER_COUNT }, (_, i) => ({
  index: i,
  first: i * CHAPTER_SIZE + 1,
  last: i === CHAPTER_COUNT - 1 ? null : (i + 1) * CHAPTER_SIZE,
  accent: ACCENTS[i] ?? null,
  mech: i < 4 ? (i as Mech) : "mix",
}));
