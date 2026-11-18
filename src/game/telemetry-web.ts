import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/duel/config";
import { detectDevice, detectSource, errorInfo, FLUSH_MS, Telemetry, type EventName, type EventRow } from "./telemetry";

/**
 * Collegamento della telemetria al browser: invio a Supabase (REST, solo inserimento),
 * lotti ogni 20 s e alla chiusura (fetch keepalive), errori JS, tempo di caricamento.
 * Tutto silenzioso: qualunque errore viene ignorato e il gioco non se ne accorge.
 */

export const GAME_VERSION = typeof __BOLT_VERSION__ === "string" ? __BOLT_VERSION__ : "dev";

let tel: Telemetry | null = null;
const startedAt = Date.now();

function restBase() {
  try {
    return `https://${new URL(SUPABASE_URL).host}/rest/v1`;
  } catch {
    return "";
  }
}

function headers() {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=minimal",
  };
}

async function send(rows: EventRow[], opts: { keepalive: boolean }) {
  const base = restBase();
  if (!base || !SUPABASE_ANON_KEY || !navigator.onLine) return false;
  try {
    const res = await fetch(`${base}/events`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(rows),
      keepalive: opts.keepalive,
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function forget(playerId: string) {
  const base = restBase();
  if (!base) return false;
  try {
    const res = await fetch(`${base}/rpc/forget_player`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ p_player: playerId }),
      credentials: "omit",
    });
    return res.ok;
  } catch {
    return false;
  }
}

function uuid() {
  try {
    return crypto.randomUUID();
  } catch {
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6]! & 0x0f) | 0x40;
    b[8] = (b[8]! & 0x3f) | 0x80;
    const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
}

function isStandalone() {
  try {
    return window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
}

/** Da chiamare una volta all'avvio, prima che l'URL venga ripulito dai parametri d'invito. */
export function initTelemetry() {
  if (tel || import.meta.env.MODE === "e2e") return;
  try {
    tel = new Telemetry({ storage: localStorage, now: () => Date.now(), uuid, version: GAME_VERSION, send, forget });
  } catch {
    tel = null;
    return;
  }
  const src = detectSource({ search: location.search, referrer: document.referrer, host: location.host });
  const dev = detectDevice(navigator.userAgent, navigator.platform, navigator.maxTouchPoints);
  track("app_open", { ...src, ...dev, lang: (navigator.language || "").slice(0, 2), pwa: isStandalone() });

  // Tempo di caricamento, appena disponibile.
  window.addEventListener("load", () => {
    window.setTimeout(() => {
      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      const ms = nav ? nav.loadEventEnd || nav.domContentLoadedEventEnd : performance.now();
      if (ms > 0) track("perf", { kind: "load", load_ms: Math.round(ms) });
    }, 0);
  });

  // Errori JS (al massimo 5 per sessione).
  let errors = 0;
  const onError = (message: unknown, source?: string, line?: number) => {
    if (errors++ >= 5) return;
    track("js_error", errorInfo(message, source, line));
  };
  window.addEventListener("error", (e) => onError(e.message, e.filename, e.lineno));
  window.addEventListener("unhandledrejection", (e) => onError((e.reason as Error)?.message ?? e.reason));
  window.addEventListener("appinstalled", () => track("pwa_installed"));

  window.setInterval(() => void tel?.flush(), FLUSH_MS);
  let ended = false;
  const endSession = () => {
    if (ended) return;
    ended = true;
    track("session_end", { seconds: Math.round((Date.now() - startedAt) / 1000) });
    void tel?.flush({ keepalive: true, force: true });
  };
  window.addEventListener("pagehide", endSession);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void tel?.flush({ keepalive: true, force: true });
  });
  window.addEventListener("online", () => void tel?.flush({ force: true }));
  window.setTimeout(() => void tel?.flush(), 3000);
}

export function track(name: EventName, props?: Record<string, unknown>) {
  try {
    tel?.track(name, props);
  } catch {
    /* mai un errore verso il gioco */
  }
}

export function telemetryEnabled() {
  return tel ? tel.enabled() : localStorage.getItem("bolt-telemetry-off") !== "1";
}

export function setTelemetryEnabled(on: boolean) {
  tel?.setEnabled(on);
  if (!tel) {
    try {
      if (on) localStorage.removeItem("bolt-telemetry-off");
      else localStorage.setItem("bolt-telemetry-off", "1");
    } catch {
      /* nulla */
    }
  }
}

export async function forgetMyData() {
  return tel ? tel.forgetMe() : false;
}

// --- fps medio durante la partita --------------------------------------------------

let frames = 0;
let frameStart = 0;

/** Da chiamare a ogni fotogramma della partita. */
export function countFrame(now: number) {
  if (!frameStart) frameStart = now;
  frames++;
}

/** Fps medio dall'ultimo azzeramento (null se troppo pochi dati); poi azzera. */
export function takeFps(now: number) {
  const secs = (now - frameStart) / 1000;
  const fps = frameStart && secs > 2 ? Math.min(240, frames / secs) : null;
  frames = 0;
  frameStart = 0;
  return fps;
}
