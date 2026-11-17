import { b64url, check, cleanName, isPlayerId, num36, unb64url, validName } from "../game/friends";
import { hash32, type Spec } from "../game/logic";

/**
 * Duello live 1 contro 1: regole, link d'invito, griglia condivisa, messaggi e arbitro.
 * Nessuna dipendenza dal servizio realtime: lo usa session.ts attraverso un "trasporto".
 */

/** Il link d'invito vale 10 minuti. */
export const DUEL_TTL_MS = 10 * 60_000;
/** Un avversario sparito vince a tavolino per l'altro dopo 15 secondi. */
export const FORFEIT_MS = 15_000;
/** Un errore blocca per 2 secondi. */
export const BLOCK_MS = 2_000;
/** Conto alla rovescia 3-2-1. */
export const COUNTDOWN_MS = 3_000;
/** Chi apre il link aspetta al massimo così tanto di trovare chi l'ha creato. */
export const HOST_WAIT_MS = 5_000;
/** Dopo aver finito, chi ha creato il duello aspetta un attimo un tempo migliore dell'altro. */
export const FINISH_GRACE_MS = 500;

export type Role = "host" | "guest";

export type DuelInvite = { room: string; createdAt: number; hostId: string; hostName: string };

const ROOM_RE = /^[a-z0-9]{8}$/;

export function newRoomId(rand: () => number = Math.random) {
  const alph = "abcdefghijkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < 8; i++) s += alph[Math.floor(rand() * alph.length)];
  return s;
}

/** Codice del link ?d=: stanza, momento di creazione, chi sfida. Con controllo d'integrità. */
export function encodeInvite(inv: DuelInvite) {
  const body = [inv.room, Math.floor(inv.createdAt / 1000).toString(36), inv.hostId, b64url(cleanName(inv.hostName))].join(".");
  return `${body}.${check(body)}`;
}

export function decodeInvite(code: string | null | undefined, now = Date.now()): DuelInvite | null {
  if (typeof code !== "string" || code.length > 100) return null;
  const parts = code.trim().split(".");
  if (parts.length !== 5) return null;
  const [room, created, hostId, name64, sum] = parts;
  if (sum !== check(parts.slice(0, 4).join("."))) return null;
  if (!room || !ROOM_RE.test(room) || !isPlayerId(hostId)) return null;
  const secs = num36(created, 1e10);
  if (secs === null) return null;
  const createdAt = secs * 1000;
  // Non dal futuro (5 minuti di tolleranza sugli orologi), non più vecchio di un anno.
  if (createdAt > now + 5 * 60_000 || createdAt < now - 365 * 86_400_000) return null;
  const raw = unb64url(name64!);
  const hostName = raw === null ? null : validName(raw);
  if (!hostName) return null;
  return { room, createdAt, hostId, hostName };
}

export function inviteExpired(inv: DuelInvite, now = Date.now()) {
  return now - inv.createdAt > DUEL_TTL_MS;
}

/** Stessa griglia per entrambi: deriva solo dal seed scelto da chi ha creato il duello. */
export function duelSpec(seed: number): Spec {
  return { w: 6, h: 6, count: 22, seed: hash32(`bolt-duel-v1:${seed >>> 0}`) };
}

export function newSeed(rand: () => number = Math.random) {
  return Math.floor(rand() * 2 ** 31) >>> 0;
}

// --- messaggi ----------------------------------------------------------------

export type Msg =
  | { t: "hello"; id: string; name: string }
  | { t: "welcome"; guest: string; name: string }
  | { t: "busy"; to: string }
  | { t: "ping"; id: string; n: number }
  | { t: "pong"; to: string; n: number }
  | { t: "ready"; id: string }
  | { t: "start"; round: number; seed: number; delay: number }
  | { t: "progress"; id: string; round: number; left: number; total: number; blocked: boolean }
  | { t: "done"; id: string; round: number; ms: number }
  | { t: "result"; round: number; winner: string; hostMs: number; guestMs: number | null }
  | { t: "rematch"; id: string }
  | { t: "bye"; id: string };

const isNum = (v: unknown, max = 1e9) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max;
const isStr = (v: unknown, max = 40) => typeof v === "string" && v.length > 0 && v.length <= max;

/** Messaggi in arrivo dalla rete: si accettano solo quelli ben formati. */
export function parseMsg(raw: unknown): Msg | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  switch (m.t) {
    case "hello":
      return isPlayerId(m.id) && isStr(m.name, 24) ? { t: "hello", id: m.id, name: cleanName(m.name) || "?" } : null;
    case "welcome":
      return isPlayerId(m.guest) && isStr(m.name, 24) ? { t: "welcome", guest: m.guest, name: cleanName(m.name) || "?" } : null;
    case "busy":
      return isPlayerId(m.to) ? { t: "busy", to: m.to } : null;
    case "ping":
      return isPlayerId(m.id) && isNum(m.n, 100) ? { t: "ping", id: m.id, n: m.n as number } : null;
    case "pong":
      return isPlayerId(m.to) && isNum(m.n, 100) ? { t: "pong", to: m.to, n: m.n as number } : null;
    case "ready":
      return isPlayerId(m.id) ? { t: "ready", id: m.id } : null;
    case "start":
      return isNum(m.round, 1e6) && isNum(m.seed, 2 ** 32) && isNum(m.delay, 10_000)
        ? { t: "start", round: m.round as number, seed: m.seed as number, delay: m.delay as number }
        : null;
    case "progress":
      return isPlayerId(m.id) && isNum(m.round, 1e6) && isNum(m.left, 100) && isNum(m.total, 100)
        ? { t: "progress", id: m.id, round: m.round as number, left: m.left as number, total: m.total as number, blocked: m.blocked === true }
        : null;
    case "done":
      return isPlayerId(m.id) && isNum(m.round, 1e6) && isNum(m.ms, 3_600_000)
        ? { t: "done", id: m.id, round: m.round as number, ms: m.ms as number }
        : null;
    case "result":
      return isNum(m.round, 1e6) && isPlayerId(m.winner) && isNum(m.hostMs, 3_600_000) && (m.guestMs === null || isNum(m.guestMs, 3_600_000))
        ? { t: "result", round: m.round as number, winner: m.winner, hostMs: m.hostMs as number, guestMs: m.guestMs as number | null }
        : null;
    case "rematch":
      return isPlayerId(m.id) ? { t: "rematch", id: m.id } : null;
    case "bye":
      return isPlayerId(m.id) ? { t: "bye", id: m.id } : null;
    default:
      return null;
  }
}

// --- arbitro (lo tiene chi ha creato il duello) ----------------------------------

export type Arbiter = { hostMs: number | null; guestMs: number | null; winner: Role | null };

export const freshArbiter = (): Arbiter => ({ hostMs: null, guestMs: null, winner: null });

/**
 * Vince chi svuota per primo, misurato sul proprio orologio dal "Via!".
 * - Arriva il tempo dell'ospite: se chi ha creato è già oltre quel tempo (o ha finito dopo), vince l'ospite.
 * - Chi ha creato finisce: aspetta FINISH_GRACE_MS un tempo migliore dell'ospite, poi vince lui.
 * A parità esatta vince chi ha creato il duello.
 * `hostElapsed` è il tempo di gioco attuale di chi ha creato.
 */
export function arbitrate(
  a: Arbiter,
  ev: { kind: "done"; who: Role; ms: number } | { kind: "tick" },
  hostElapsed: number,
): Arbiter {
  if (a.winner) return a;
  const next: Arbiter = { ...a };
  if (ev.kind === "done") {
    if (ev.who === "host" && next.hostMs === null) next.hostMs = ev.ms;
    if (ev.who === "guest" && next.guestMs === null) next.guestMs = ev.ms;
  }
  const { hostMs, guestMs } = next;
  if (hostMs !== null && guestMs !== null) next.winner = guestMs < hostMs ? "guest" : "host";
  else if (guestMs !== null && hostElapsed >= guestMs) next.winner = "guest";
  else if (hostMs !== null && hostElapsed >= hostMs + FINISH_GRACE_MS) next.winner = "host";
  return next;
}
