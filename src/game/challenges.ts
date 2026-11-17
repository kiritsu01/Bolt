import { cleanName, decodeVersus, isPlayerId, MAX_LEVEL, versusWinner, type Versus } from "./friends";
import { campaignSpec, dailySpec, decodeSpec, encodeSpec, todayKey } from "./logic";

/**
 * Sfide ricevute dai link `?c=GRIGLIA&v=RISULTATO`: tutto in locale, niente server.
 * Il formato del link è quello del confronto della Sfida di oggi (friends.ts), con in più
 * codice giocatore e livello.
 */

export const MAX_CHALLENGES = 30;

export type Score = { ms: number; mistakes: number };
export type Outcome = "win" | "loss" | "tie";

export type Challenge = {
  /** Identifica la sfida: stesso mittente, stessa griglia, stesso risultato = stessa sfida. */
  key: string;
  from: { id: string; name: string };
  /** Livello della campagna; 0 = Sfida di oggi del giorno `date`. */
  level: number;
  date: string;
  /** Codice della griglia (?c=). */
  code: string;
  theirs: Score;
  mine?: Score;
  outcome?: Outcome;
};

/** La griglia attesa per un risultato: Sfida di quel giorno o livello della campagna. */
export function expectedCode(v: Pick<Versus, "level" | "date">) {
  return encodeSpec(v.level ? campaignSpec(v.level) : dailySpec(v.date));
}

/**
 * Sfida da un link: il risultato deve essere valido e la griglia deve essere proprio
 * quella del livello (o della Sfida di quel giorno) dichiarato. Altrimenti null.
 */
export function challengeFromLink(c: string | null | undefined, v: string | null | undefined, today = todayKey()) {
  const versus = decodeVersus(v, today);
  const spec = decodeSpec(c);
  if (!versus || !spec) return null;
  const code = encodeSpec(spec);
  if (!code || code !== expectedCode(versus)) return null;
  return fromVersus(versus, code);
}

export function fromVersus(v: Versus, code: string): Challenge {
  const id = v.id ?? "";
  return {
    key: `${id || `n:${v.name}`}|${code}|${v.ms}|${v.mistakes}`,
    from: { id, name: v.name },
    level: v.level ?? 0,
    date: v.date,
    code,
    theirs: { ms: v.ms, mistakes: v.mistakes },
  };
}

export function outcomeOf(mine: Score, theirs: Score): Outcome {
  const w = versusWinner(mine, theirs);
  return w === "me" ? "win" : w === "other" ? "loss" : "tie";
}

/** Aggiunge una sfida (senza doppioni). Oltre le 30 si tolgono le più vecchie. */
export function addChallenge(list: Challenge[], ch: Challenge, myId = ""): Challenge[] {
  if (ch.from.id && ch.from.id === myId) return list;
  if (list.some((c) => c.key === ch.key)) return list;
  const next = [...list, ch];
  return next.length > MAX_CHALLENGES ? next.slice(next.length - MAX_CHALLENGES) : next;
}

/** Registra il proprio risultato. Conta solo il primo tentativo: la sfida non si rigioca per vincerla. */
export function resolveChallenge(list: Challenge[], key: string, mine: Score): Challenge[] {
  return list.map((c) =>
    c.key === key && !c.outcome ? { ...c, mine: { ms: Math.round(mine.ms), mistakes: mine.mistakes }, outcome: outcomeOf(mine, c.theirs) } : c,
  );
}

export const pendingChallenges = (list: Challenge[]) => list.filter((c) => !c.outcome).reverse();
export const doneChallenges = (list: Challenge[]) => list.filter((c) => c.outcome).reverse();

export type Tally = { key: string; id: string; name: string; wins: number; losses: number; ties: number };

/** Bilancio per avversario ("Tu 3 - 2 Giulia"), solo con almeno una sfida conclusa. */
export function tally(list: Challenge[]): Tally[] {
  const map = new Map<string, Tally>();
  for (const c of list) {
    if (!c.outcome) continue;
    const key = c.from.id || `n:${c.from.name}`;
    const row = map.get(key) ?? { key, id: c.from.id, name: c.from.name, wins: 0, losses: 0, ties: 0 };
    row.name = c.from.name; // il nome più recente
    if (c.outcome === "win") row.wins += 1;
    else if (c.outcome === "loss") row.losses += 1;
    else row.ties += 1;
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => b.wins + b.losses + b.ties - (a.wins + a.losses + a.ties) || a.name.localeCompare(b.name));
}

function validScore(s: unknown): s is Score {
  if (!s || typeof s !== "object") return false;
  const { ms, mistakes } = s as Score;
  return Number.isSafeInteger(ms) && ms >= 500 && ms <= 86400000 && Number.isSafeInteger(mistakes) && mistakes >= 0 && mistakes <= 999;
}

/** Ripulisce le sfide lette dal salvataggio: scarta voci rotte o incoerenti, massimo 30. */
export function sanitizeChallenges(raw: unknown): Challenge[] {
  if (!Array.isArray(raw)) return [];
  let out: Challenge[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const c = item as Challenge;
    const name = cleanName(c.from?.name);
    const id = c.from?.id ?? "";
    if (!name || (id !== "" && !isPlayerId(id))) continue;
    if (!Number.isSafeInteger(c.level) || c.level < 0 || c.level > MAX_LEVEL || c.level === 1 || c.level === 2) continue;
    if (typeof c.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(c.date)) continue;
    if (typeof c.code !== "string" || c.code !== expectedCode(c)) continue;
    if (!validScore(c.theirs)) continue;
    let clean = fromVersus({ name, id: id || undefined, level: c.level, date: c.date, ...c.theirs }, c.code);
    if (c.outcome && validScore(c.mine)) clean = { ...clean, mine: c.mine, outcome: outcomeOf(c.mine, c.theirs) };
    out = addChallenge(out, clean);
  }
  return out;
}
