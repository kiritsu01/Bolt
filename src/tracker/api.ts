import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/duel/config";
import type { Cohort, DailyRow, LevelRow, Release, Summary } from "./metrics";

/**
 * Accesso del Tracker a Supabase senza librerie: Auth (link o codice via email) e REST.
 * La sessione resta in localStorage di questa app (scope /Bolt/dev/) e si rinnova da sola.
 * Le letture passano dalle funzioni SQL che rispondono solo all'email autorizzata.
 */

const HOST = (() => {
  try {
    return `https://${new URL(SUPABASE_URL).host}`;
  } catch {
    return "";
  }
})();
const KEY = "tracker-session";

export type Session = { access_token: string; refresh_token: string; expires_at: number; email: string };

function load(): Session | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null") as Session | null;
    return s && s.access_token && s.refresh_token ? s : null;
  } catch {
    return null;
  }
}

let session: Session | null = load();

function store(s: Session | null) {
  session = s;
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    /* modalità privata: la sessione dura finché la pagina è aperta */
  }
}

function toSession(json: { access_token: string; refresh_token: string; expires_in?: number; expires_at?: number; user?: { email?: string } }, email?: string): Session {
  const expires_at = json.expires_at ?? Math.floor(Date.now() / 1000) + (json.expires_in ?? 3600);
  return { access_token: json.access_token, refresh_token: json.refresh_token, expires_at, email: json.user?.email ?? email ?? session?.email ?? "" };
}

const base = { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" };

export function currentSession() {
  return session;
}

/** Link nel messaggio email: accesso con #access_token=... nell'indirizzo. */
export function takeSessionFromUrl(): Session | null | "error" {
  const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
  if (hash.get("error_description")) {
    history.replaceState(null, "", location.pathname);
    return "error";
  }
  const access = hash.get("access_token");
  const refresh = hash.get("refresh_token");
  if (!access || !refresh) return null;
  let email = "";
  try {
    email = JSON.parse(atob(access.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/"))).email ?? "";
  } catch {
    email = "";
  }
  const s = toSession(
    { access_token: access, refresh_token: refresh, expires_in: Number(hash.get("expires_in") ?? 3600), expires_at: Number(hash.get("expires_at")) || undefined },
    email,
  );
  store(s);
  history.replaceState(null, "", location.pathname);
  return s;
}

/** Manda link + codice all'email (solo utenti già creati: niente nuove iscrizioni). */
export async function sendLogin(email: string) {
  const redirect = `${location.origin}${location.pathname}`;
  const res = await fetch(`${HOST}/auth/v1/otp?redirect_to=${encodeURIComponent(redirect)}`, {
    method: "POST",
    headers: base,
    body: JSON.stringify({ email, create_user: false }),
  });
  return res.ok;
}

/** Codice a 6 cifre dalla stessa email (utile sull'app installata su iPhone). */
export async function verifyCode(email: string, token: string) {
  const res = await fetch(`${HOST}/auth/v1/verify`, {
    method: "POST",
    headers: base,
    body: JSON.stringify({ type: "email", email, token }),
  });
  if (!res.ok) return null;
  const s = toSession(await res.json(), email);
  store(s);
  return s;
}

async function refresh() {
  if (!session) return null;
  const res = await fetch(`${HOST}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: base,
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  });
  if (!res.ok) {
    if (res.status === 400 || res.status === 401) store(null);
    return null;
  }
  const s = toSession(await res.json());
  store(s);
  return s;
}

export async function signOut() {
  const s = session;
  store(null);
  if (s) {
    try {
      await fetch(`${HOST}/auth/v1/logout`, { method: "POST", headers: { ...base, Authorization: `Bearer ${s.access_token}` } });
    } catch {
      /* già fuori */
    }
  }
}

export class AuthError extends Error {}

async function authed(path: string, init: RequestInit = {}) {
  if (!session) throw new AuthError("no session");
  if (session.expires_at - 60 < Date.now() / 1000) await refresh();
  if (!session) throw new AuthError("expired");
  const doFetch = () =>
    fetch(`${HOST}${path}`, { ...init, headers: { ...base, Authorization: `Bearer ${session!.access_token}`, ...(init.headers ?? {}) } });
  let res = await doFetch();
  if (res.status === 401) {
    await refresh();
    if (!session) throw new AuthError("expired");
    res = await doFetch();
  }
  if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => "")}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export const rpc = <T,>(name: string, args: Record<string, unknown> = {}) =>
  authed(`/rest/v1/rpc/${name}`, { method: "POST", body: JSON.stringify(args) }) as Promise<T>;

// --- dati delle schede ---------------------------------------------------------------

export type LiveEvent = { created_at: string; name: string; props: Record<string, unknown>; version: string | null; player_id: string };
export type Breakdown = Record<string, Array<{ k: string; n: number }>>;
export type Sources = { sources: Array<{ source: string; players: number; opens: number }>; campaigns: Array<{ campaign: string; source: string; players: number }> };
export type Growth = {
  counts: Record<string, number>;
  duel_results: Record<string, number>;
  invited_new: number;
  invite_kinds: Record<string, number>;
  active: number;
};
export type VersionRow = { version: string; first_seen: string; players: number; avg_load_ms: number | null; avg_fps: number | null; errors: number; sessions: number };
export type ErrorRow = { message: string; where: string; c: number; players: number; last_at: string; versions: string[] };
export type Feedback = {
  ratings: Record<string, number>;
  comments: Array<{ at: string; rating: number | null; comment: string }>;
  prefs: Array<{ question: string; answer: string; n: number }>;
  names: Array<{ at: string; name: string }>;
};
export type RoadItem = { id: number; title: string; note: string; status: "todo" | "doing" | "done"; position: number; created_at: string; updated_at: string };
export type BuildInfo = { version: string; builtAt: string; tests: number; bytesTotal: number; bytesGame: number };

export const api = {
  summary: () => rpc<Summary | null>("tracker_summary"),
  daily: (days: number) => rpc<DailyRow[] | null>("tracker_daily", { p_days: days }),
  cohorts: (days: number) => rpc<Cohort[] | null>("tracker_cohorts", { p_days: days }),
  breakdown: (days: number) => rpc<Breakdown | null>("tracker_breakdown", { p_days: days }),
  sources: (days: number) => rpc<Sources | null>("tracker_sources", { p_days: days }),
  growth: (days: number) => rpc<Growth | null>("tracker_growth", { p_days: days }),
  levels: (days: number) => rpc<LevelRow[] | null>("tracker_levels", { p_days: days }),
  versions: (days: number) => rpc<VersionRow[] | null>("tracker_versions", { p_days: days }),
  errors: (days: number) => rpc<ErrorRow[] | null>("tracker_errors", { p_days: days }),
  feedback: (days: number) => rpc<Feedback | null>("tracker_feedback", { p_days: days }),
  live: () =>
    authed("/rest/v1/events?select=created_at,name,props,version,player_id&order=created_at.desc&limit=50") as Promise<LiveEvent[]>,
  roadmap: () => authed("/rest/v1/roadmap?select=*&order=position.asc,id.asc") as Promise<RoadItem[]>,
  addRoad: (item: Pick<RoadItem, "title" | "note" | "status" | "position">) =>
    authed("/rest/v1/roadmap", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(item) }) as Promise<RoadItem[]>,
  updateRoad: (id: number, patch: Partial<RoadItem>) =>
    authed(`/rest/v1/roadmap?id=eq.${id}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
    }) as Promise<RoadItem[]>,
  deleteRoad: (id: number) => authed(`/rest/v1/roadmap?id=eq.${id}`, { method: "DELETE" }),
  releases: async () => {
    try {
      const r = await fetch("./releases.json", { cache: "no-store" });
      return r.ok ? ((await r.json()) as Release[]) : [];
    } catch {
      return [];
    }
  },
  buildInfo: async () => {
    try {
      const r = await fetch("./build-info.json", { cache: "no-store" });
      return r.ok ? ((await r.json()) as BuildInfo) : null;
    } catch {
      return null;
    }
  },
};
