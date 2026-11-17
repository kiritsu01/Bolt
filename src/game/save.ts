import { todayKey, yesterdayKey } from "./logic";

export type Save = {
  version: 1;
  unlocked: number;
  stars: Record<string, number>;
  bestRush: number;
  streak: number;
  lastDay: string;
  daily: Record<string, { mistakes: number; ms: number }>;
  sound: boolean;
  lang: "it" | "en";
  clears: number;
};

const KEY = "bolt-save-v1";

export const defaultSave = (): Save => ({
  version: 1,
  unlocked: 1,
  stars: {},
  bestRush: 0,
  streak: 0,
  lastDay: "",
  daily: {},
  sound: true,
  lang: "it",
  clears: 0,
});

export function loadSave(): Save {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultSave();
    const parsed = JSON.parse(raw) as Partial<Save>;
    if (parsed.version !== 1) return defaultSave();
    return { ...defaultSave(), ...parsed, stars: parsed.stars ?? {}, daily: parsed.daily ?? {} };
  } catch {
    return defaultSave();
  }
}

export function writeSave(save: Save) {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    /* private mode / quota â keep playing in memory */
  }
}

export function noteDay(save: Save, today = todayKey()): Save {
  if (save.lastDay === today) return save;
  const streak = save.lastDay === yesterdayKey(today) ? save.streak + 1 : 1;
  return { ...save, lastDay: today, streak };
}
