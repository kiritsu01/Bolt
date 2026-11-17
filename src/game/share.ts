import { copy, type Lang } from "./i18n";

/** Quadratini massimi nella riga di emoji: le partite lunghe vengono riassunte a blocchi. */
export const ROW_MAX = 12;

/**
 * Riga di emoji stile Wordle a partire dal registro delle mosse
 * (0 errore, 1 uscita, 2 uscita in combo). Ogni quadratino copre uno o più tocchi:
 * 🟥 se nel blocco c'è un errore, 🟧 se è tutto in combo, ⬜ altrimenti.
 */
export function emojiRow(log: readonly number[], max = ROW_MAX) {
  if (!log.length) return "";
  const n = Math.min(max, log.length);
  let row = "";
  for (let i = 0; i < n; i++) {
    const from = Math.floor((i * log.length) / n);
    const to = Math.max(from + 1, Math.floor(((i + 1) * log.length) / n));
    const chunk = log.slice(from, to);
    if (chunk.includes(0)) row += "🟥";
    else if (chunk.every((v) => v === 2)) row += "🟧";
    else row += "⬜";
  }
  return row;
}

export function formatClock(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export type ShareInput = {
  kind: "level" | "daily" | "rush" | "challenge";
  level?: number;
  stars?: number;
  mistakes?: number;
  maxCombo?: number;
  seconds?: number;
  score?: number;
  date?: string;
  log?: readonly number[];
  url?: string;
};

/** Testo completo da condividere: titolo, riga di emoji, riepilogo e link. */
export function shareMessage(lang: Lang, input: ShareInput) {
  const t = copy[lang].shareCard;
  const lines: string[] = [];
  if (input.kind === "rush") {
    lines.push(`BOLT · ${t.rush} · ${input.score ?? 0} ${t.points}`);
  } else {
    let title = "BOLT · ";
    if (input.kind === "daily") title += `${t.daily}${input.date ? ` ${shortDate(input.date)}` : ""}`;
    else if (input.kind === "challenge") title += t.challenge;
    else title += `${t.level} ${input.level ?? 1}`;
    if (input.stars) title += ` ${"⭐".repeat(input.stars)}${"☆".repeat(Math.max(0, 3 - input.stars))}`;
    lines.push(title);
  }
  const row = emojiRow(input.log ?? []);
  if (row) lines.push(row);
  const stats: string[] = [];
  if (input.kind !== "rush") stats.push(input.mistakes ? `❌ ${input.mistakes}` : `✅ ${t.noMistakes}`);
  if ((input.maxCombo ?? 0) > 1) stats.push(`🔥 x${input.maxCombo}`);
  if (input.seconds != null) stats.push(`⏱️ ${formatClock(input.seconds)}`);
  if (stats.length) lines.push(stats.join("  "));
  lines.push(input.kind === "rush" ? t.beatRush : t.beatMe);
  if (input.url) lines.push(input.url);
  return lines.join("\n");
}

function shortDate(date: string) {
  const [, m, d] = date.split("-");
  return m && d ? `${d}/${m}` : date;
}
