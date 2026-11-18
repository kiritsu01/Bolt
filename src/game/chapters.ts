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
  /** Cielo luminoso del capitolo (tre tappe del gradiente). */
  sky: [string, string, string];
  /** Le tre luci che si muovono nello sfondo del capitolo: arancio, rosa, ciano. */
  lights: [string, string, string];
  /** Meccanica del capitolo (il quinto le alterna). */
  mech: Mech | "mix";
};

const ACCENTS = [null, "#2ec4b6", "#a78bfa", "#ffc93c", "#ff5c8a"] as const;

// Ogni capitolo ha il suo cielo, sempre luminoso e saturo (nessuna tappa sotto il 25% di luce).
const SKIES: Array<[string, string, string]> = [
  ["#0d6b7a", "#1a6fa8", "#6a3f9e"],
  ["#4a22b8", "#6a35c8", "#b03f86"],
  ["#7a4a12", "#8a5a12", "#b0405e"],
  ["#6a1a6e", "#8a2a6e", "#b03f6e"],
  ["#3a1b7a", "#6a35d6", "#c03a80"],
];

const LIGHTS: Array<[string, string, string]> = [
  ["#ff9a2e", "#ff4f9e", "#3ddcff"],
  ["#ff8a1f", "#ff3d8b", "#3ddcff"],
  ["#ffb02e", "#ff5c7a", "#5cc8ff"],
  ["#ff8a1f", "#ff4fd8", "#4fdcff"],
  ["#ff8a1f", "#ff3d8b", "#3ddcff"],
];

export const CHAPTERS: ChapterInfo[] = Array.from({ length: CHAPTER_COUNT }, (_, i) => ({
  index: i,
  first: i * CHAPTER_SIZE + 1,
  last: i === CHAPTER_COUNT - 1 ? null : (i + 1) * CHAPTER_SIZE,
  accent: ACCENTS[i] ?? null,
  sky: SKIES[i] ?? SKIES[0]!,
  lights: LIGHTS[i] ?? LIGHTS[0]!,
  mech: i < 4 ? (i as Mech) : "mix",
}));
