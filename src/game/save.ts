import type { ArrowStyle, ThemeId } from "./cosmetics";
import { todayKey, yesterdayKey } from "./logic";

export type Save = {
  version: 2;
  unlocked: number;
  stars: Record<string, number>;
  bestRush: number;
  streak: number;
  lastDay: string;
  daily: Record<string, { mistakes: number; ms: number }>;
  sound: boolean;
  lang: "it" | "en";
  clears: number;
  /** Capitoli di cui è già stata mostrata la schermata di presentazione. */
  seenChapters: number[];
  /** Monete per il negozio. */
  coins: number;
  theme: ThemeId;
  arrowStyle: ArrowStyle;
  ownedThemes: ThemeId[];
  ownedArrows: ArrowStyle[];
  /** Giorno (AAAA-MM-GG) a cui si riferisce hintsLeft: un giorno nuovo ricarica la scorta. */
  hintDay: string;
  hintsLeft: number;
  /** L'invito ad aggiungere BOLT alla schermata Home è stato chiuso. */
  installDismissed: boolean;
};

/** Formato della versione 1 (chiave "bolt-save-v1"). */
type SaveV1 = Pick<
  Save,
  "unlocked" | "stars" | "bestRush" | "streak" | "lastDay" | "daily" | "sound" | "lang" | "clears"
> & { version: 1 };

const KEY = "bolt-save-v2";
const KEY_V1 = "bolt-save-v1";

export const defaultSave = (): Save => ({
  version: 2,
  unlocked: 1,
  stars: {},
  bestRush: 0,
  streak: 0,
  lastDay: "",
  daily: {},
  sound: true,
  lang: "it",
  clears: 0,
  seenChapters: [],
  coins: 0,
  theme: "notte",
  arrowStyle: "classic",
  ownedThemes: ["notte"],
  ownedArrows: ["classic"],
  hintDay: "",
  hintsLeft: 3,
  installDismissed: false,
});

/**
 * Converte un salvataggio della versione 1: tiene tutto e aggiunge i campi nuovi.
 * Le stelle già guadagnate valgono una moneta ciascuna, come quelle nuove.
 */
export function migrateV1(old: Partial<SaveV1>): Save {
  const base = defaultSave();
  const stars = old.stars ?? {};
  return {
    ...base,
    unlocked: typeof old.unlocked === "number" ? old.unlocked : base.unlocked,
    stars,
    bestRush: old.bestRush ?? 0,
    streak: old.streak ?? 0,
    lastDay: old.lastDay ?? "",
    daily: old.daily ?? {},
    sound: old.sound ?? true,
    lang: old.lang === "en" ? "en" : "it",
    clears: old.clears ?? 0,
    coins: Object.values(stars).reduce((sum, n) => sum + (Number(n) || 0), 0),
  };
}

/** Normalizza un salvataggio v2 letto dal disco: i campi mancanti prendono il valore iniziale. */
export function normalize(parsed: Partial<Save>): Save {
  const base = defaultSave();
  return {
    ...base,
    ...parsed,
    version: 2,
    stars: parsed.stars ?? {},
    daily: parsed.daily ?? {},
    seenChapters: Array.isArray(parsed.seenChapters) ? parsed.seenChapters : [],
    coins: Math.max(0, Number(parsed.coins) || 0),
    ownedThemes: Array.isArray(parsed.ownedThemes) ? parsed.ownedThemes : base.ownedThemes,
    ownedArrows: Array.isArray(parsed.ownedArrows) ? parsed.ownedArrows : base.ownedArrows,
  };
}

/** Interpreta un salvataggio grezzo di qualsiasi versione conosciuta. */
export function parseSave(raw: unknown): Save | null {
  if (!raw || typeof raw !== "object") return null;
  const v = (raw as { version?: unknown }).version;
  if (v === 2) return normalize(raw as Partial<Save>);
  if (v === 1) return migrateV1(raw as Partial<SaveV1>);
  return null;
}

export function loadSave(): Save {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return parseSave(JSON.parse(raw)) ?? defaultSave();
    const old = localStorage.getItem(KEY_V1);
    if (old) {
      const migrated = parseSave(JSON.parse(old));
      if (migrated) {
        writeSave(migrated);
        return migrated;
      }
    }
    return defaultSave();
  } catch {
    return defaultSave();
  }
}

export function writeSave(save: Save) {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    /* private mode / quota: si continua a giocare in memoria */
  }
}

export function noteDay(save: Save, today = todayKey()): Save {
  if (save.lastDay === today) return save;
  const streak = save.lastDay === yesterdayKey(today) ? save.streak + 1 : 1;
  return { ...save, lastDay: today, streak };
}
