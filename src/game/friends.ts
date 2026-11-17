import { hash32, todayKey } from "./logic";

/**
 * Amici: tutto passa dai link, niente server.
 * - ?f=CODICE   chi apre il link salva l'amico (nome, livello, stelle, serie, data);
 * - ?v=CODICE   risultato della Sfida di oggi di chi l'ha condivisa, per il confronto "Tu vs Nome".
 * I codici hanno un controllo (checksum) e ogni campo viene validato: valori impossibili = codice ignorato.
 */

export const MAX_FRIENDS = 20;
export const MAX_NAME = 12;
/** Massimo livello credibile in un link (la campagna è infinita, ma oltre è sicuramente manomesso). */
export const MAX_LEVEL = 5000;

export type Friend = {
  /** Identificativo casuale del giocatore (6 caratteri), per riconoscerlo anche se cambia nome. */
  id: string;
  name: string;
  /** Livello raggiunto (sbloccato). */
  level: number;
  stars: number;
  streak: number;
  /** Data del dato (AAAA-MM-GG): serve a tenere sempre il più recente. */
  date: string;
};

export type Versus = {
  name: string;
  /** Giorno: della Sfida di oggi (level 0) oppure di invio della sfida (livelli). */
  date: string;
  ms: number;
  mistakes: number;
  /** Codice giocatore di chi sfida (assente nei link vecchi della Sfida di oggi). */
  id?: string;
  /** Livello della campagna sfidato; 0 = Sfida di oggi del giorno `date`. */
  level?: number;
};

const ID_ALPH = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const EPOCH = Date.UTC(2024, 0, 1);
const DAY = 86400000;

export function newPlayerId(rand: () => number = Math.random) {
  let s = "";
  for (let i = 0; i < 6; i++) s += ID_ALPH[Math.floor(rand() * ID_ALPH.length)];
  return s;
}

export function isPlayerId(id: unknown): id is string {
  return typeof id === "string" && /^[A-HJ-NP-Z2-9]{6}$/.test(id);
}

/** Pulisce un nome: niente caratteri di controllo né spazi doppi, al massimo 12 caratteri. */
export function cleanName(raw: unknown) {
  if (typeof raw !== "string") return "";
  const flat = raw
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return [...flat].slice(0, MAX_NAME).join("").trim();
}

export function validName(raw: string) {
  const clean = cleanName(raw);
  return clean.length > 0 && clean === raw.trim() ? clean : null;
}

// --- piccoli codificatori --------------------------------------------------

export function b64url(text: string) {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function unb64url(code: string) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(code)) return null;
  try {
    const bin = atob(code.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** Numero intero non negativo in base 36, senza zeri iniziali né altro. */
export function num36(part: string | undefined, max: number) {
  if (!part || !/^(0|[1-9a-z][0-9a-z]{0,7})$/.test(part)) return null;
  const n = parseInt(part, 36);
  return Number.isSafeInteger(n) && n <= max ? n : null;
}

export function check(body: string) {
  return (hash32(`bolt-friend:${body}`) % 1679616).toString(36).padStart(4, "0");
}

export function dayNumber(date: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(t);
  if (d.getUTCFullYear() !== Number(m[1]) || d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3]))
    return null;
  const n = Math.round((t - EPOCH) / DAY);
  return n >= 0 ? n : null;
}

export function dayString(n: number) {
  return new Date(EPOCH + n * DAY).toISOString().slice(0, 10);
}

/** Data plausibile: dal 2024 a domani (un giorno di tolleranza per i fusi orari). */
function plausibleDay(n: number | null, today: string): n is number {
  const max = (dayNumber(today) ?? 0) + 1;
  return n !== null && n >= 0 && n <= max;
}

// --- link amico (?f=) ------------------------------------------------------

export function encodeFriend(f: Friend) {
  const day = dayNumber(f.date) ?? 0;
  const body = [
    f.id,
    b64url(cleanName(f.name)),
    f.level.toString(36),
    f.stars.toString(36),
    f.streak.toString(36),
    day.toString(36),
  ].join(".");
  return `${body}.${check(body)}`;
}

export function decodeFriend(code: string | null | undefined, today = todayKey()): Friend | null {
  if (typeof code !== "string" || code.length > 120) return null;
  const parts = code.trim().split(".");
  if (parts.length !== 7) return null;
  const [id, name64, lv, st, sk, dy, sum] = parts;
  const body = parts.slice(0, 6).join(".");
  if (sum !== check(body)) return null;
  if (!isPlayerId(id)) return null;
  const raw = unb64url(name64!);
  const name = raw === null ? null : validName(raw);
  if (!name) return null;
  const level = num36(lv, MAX_LEVEL);
  if (level === null || level < 1) return null;
  const stars = num36(st, 3 * MAX_LEVEL);
  // Le stelle vengono dai livelli completati: al massimo 3 per ogni livello prima di quello raggiunto.
  if (stars === null || stars > 3 * level) return null;
  const day = num36(dy, 100000);
  if (!plausibleDay(day, today)) return null;
  const streak = num36(sk, 100000);
  // La serie conta giorni consecutivi: non può superare i giorni passati dal 2024.
  if (streak === null || streak > day + 1) return null;
  return { id, name, level, stars, streak, date: dayString(day) };
}

// --- risultato da battere: Sfida di oggi e sfide sui livelli (?v=) --------
// Formato: nome.giorno.ms.errori[.id.livello].controllo
// (i link della Sfida di oggi creati prima delle sfide sui livelli non hanno id e livello).

export function encodeVersus(v: Versus) {
  const parts = [
    b64url(cleanName(v.name)),
    (dayNumber(v.date) ?? 0).toString(36),
    Math.round(v.ms).toString(36),
    v.mistakes.toString(36),
  ];
  if (v.id) parts.push(v.id, (v.level ?? 0).toString(36));
  const body = parts.join(".");
  return `${body}.${check(body)}`;
}

export function decodeVersus(code: string | null | undefined, today = todayKey()): Versus | null {
  if (typeof code !== "string" || code.length > 120) return null;
  const parts = code.trim().split(".");
  if (parts.length !== 5 && parts.length !== 7) return null;
  const [name64, dy, msp, mp] = parts;
  if (parts[parts.length - 1] !== check(parts.slice(0, -1).join("."))) return null;
  const raw = unb64url(name64!);
  const name = raw === null ? null : validName(raw);
  if (!name) return null;
  const day = num36(dy, 100000);
  if (!plausibleDay(day, today)) return null;
  // Tra mezzo secondo e 24 ore; errori tra 0 e 999.
  const ms = num36(msp, DAY);
  if (ms === null || ms < 500) return null;
  const mistakes = num36(mp, 999);
  if (mistakes === null) return null;
  const base = { name, date: dayString(day), ms, mistakes };
  if (parts.length === 5) return base;
  const id = parts[4];
  if (!isPlayerId(id)) return null;
  const level = num36(parts[5], MAX_LEVEL);
  // 0 = Sfida di oggi; i livelli 1 e 2 sono il tutorial (griglie fisse, non condivisibili).
  if (level === null || level === 1 || level === 2) return null;
  return { ...base, id, level };
}

/** Chi vince il confronto: meno errori, a parità il tempo più basso. */
export function versusWinner(me: { ms: number; mistakes: number }, other: { ms: number; mistakes: number }) {
  if (me.mistakes !== other.mistakes) return me.mistakes < other.mistakes ? "me" : "other";
  if (Math.abs(me.ms - other.ms) < 50) return "tie";
  return me.ms < other.ms ? "me" : "other";
}

// --- elenco amici ----------------------------------------------------------

export type MergeResult = { friends: Friend[]; status: "added" | "updated" | "same" | "full" | "self" };

function newer(a: Friend, b: Friend) {
  if (a.date !== b.date) return a.date > b.date;
  return a.level > b.level || (a.level === b.level && (a.stars > b.stars || a.streak !== b.streak || a.name !== b.name));
}

/** Aggiunge o aggiorna un amico: al massimo 20, aggiorna solo con dati più recenti. */
export function mergeFriend(list: Friend[], incoming: Friend, myId: string): MergeResult {
  if (incoming.id === myId) return { friends: list, status: "self" };
  const i = list.findIndex((f) => f.id === incoming.id);
  if (i >= 0) {
    if (!newer(incoming, list[i]!)) return { friends: list, status: "same" };
    const friends = [...list];
    friends[i] = incoming;
    return { friends, status: "updated" };
  }
  if (list.length >= MAX_FRIENDS) return { friends: list, status: "full" };
  return { friends: [...list, incoming], status: "added" };
}

/** Ripulisce un elenco letto dal salvataggio: scarta voci rotte o doppie, massimo 20. */
export function sanitizeFriends(raw: unknown, today = todayKey()): Friend[] {
  if (!Array.isArray(raw)) return [];
  let out: Friend[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const f = item as Friend;
    // Si riusa il decodificatore: un amico salvato deve poter essere un link valido.
    const ok = isPlayerId(f.id) && typeof f.name === "string" ? decodeFriend(safeEncode(f), today) : null;
    if (!ok) continue;
    const merged = mergeFriend(out, ok, "");
    if (merged.status !== "full") out = merged.friends;
  }
  return out;
}

function safeEncode(f: Friend) {
  try {
    if (![f.level, f.stars, f.streak].every((n) => Number.isSafeInteger(n) && n >= 0)) return null;
    return encodeFriend(f);
  } catch {
    return null;
  }
}

/** Tu tra i tuoi amici, ordinati per livello (poi stelle). */
export function ranking(me: Friend, friends: Friend[]) {
  return [...friends.map((f) => ({ ...f, me: false })), { ...me, me: true }].sort(
    (a, b) => b.level - a.level || b.stars - a.stars || Number(b.me) - Number(a.me) || a.name.localeCompare(b.name),
  );
}

/** Riga di spinta in home: l'amico più avanti, oppure "sei davanti a tutti". */
export function nudge(myLevel: number, friends: Friend[]) {
  if (!friends.length) return null;
  const top = [...friends].sort((a, b) => b.level - a.level || b.date.localeCompare(a.date))[0]!;
  if (top.level > myLevel) return { kind: "behind" as const, name: top.name, gap: top.level - myLevel };
  if (top.level === myLevel) return { kind: "tied" as const, name: top.name, gap: 0 };
  return { kind: "ahead" as const };
}
