/**
 * Telemetria anonima di BOLT.
 *
 * - Un ID anonimo casuale (separato dal salvataggio) e un ID di sessione per apertura.
 * - Niente nomi, email, IP, cookie, tracker esterni o pubblicità: solo eventi di gioco con
 *   proprietà ammesse da un elenco chiuso (numeri, sì/no, testi brevi ripuliti).
 * - Invio a lotti (ogni 20 s e alla chiusura), coda conservata offline; se il server non
 *   risponde il gioco non se ne accorge.
 * - Si può spegnere in Impostazioni ("Cancella i miei dati" cancella anche quanto già inviato).
 *
 * Qui il nucleo puro (testabile in Node); il collegamento al browser è in telemetry-web.ts.
 */

export const EVENT_NAMES = [
  "app_open",
  "session_end",
  "level_start",
  "level_end",
  "level_quit",
  "daily_played",
  "rush_end",
  "duel_created",
  "duel_accepted",
  "duel_finished",
  "duel_rematch",
  "challenge_shared",
  "challenge_opened",
  "invite_shared",
  "friend_invite_opened",
  "shop_purchase",
  "pwa_installed",
  "js_error",
  "perf",
  "feedback",
  "pref",
] as const;
export type EventName = (typeof EVENT_NAMES)[number];

/** Proprietà ammesse e lunghezza massima dei testi. Tutto il resto viene scartato. */
const PROP_RULES: Record<string, number> = {
  source: 60,
  referrer: 60,
  utm_source: 60,
  utm_medium: 60,
  utm_campaign: 60,
  invite: 12,
  device: 12,
  browser: 12,
  lang: 8,
  pwa: 0,
  mode: 12,
  level: 0,
  chapter: 0,
  stars: 0,
  mistakes: 0,
  ms: 0,
  hints: 0,
  score: 0,
  seconds: 0,
  result: 12,
  forfeit: 0,
  round: 0,
  kind: 16,
  theme: 16,
  arrow: 16,
  load_ms: 0,
  fps: 0,
  message: 120,
  where: 80,
  rating: 0,
  comment: 200,
  question: 24,
  answer: 40,
};

export const QUEUE_MAX = 300;
export const BATCH_MAX = 50;
export const FLUSH_MS = 20_000;
export const KEY_ID = "bolt-anon-id";
export const KEY_OFF = "bolt-telemetry-off";
export const KEY_QUEUE = "bolt-telemetry-queue";

export type Props = Record<string, string | number | boolean>;
export type EventRow = {
  created_at: string;
  player_id: string;
  session_id: string;
  name: EventName;
  props: Props;
  version: string;
};

/** Toglie dai testi tutto ciò che sembra un dato personale (email, numeri lunghi, link con parametri). */
export function scrubText(raw: string, max: number) {
  return raw
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[email]")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[numero]")
    .replace(/(https?:\/\/[^\s?#]+)[?#]\S*/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/** Tiene solo le proprietà ammesse, con valori semplici e testi ripuliti e accorciati. */
export function sanitizeProps(props: Record<string, unknown> | undefined): Props {
  const out: Props = {};
  if (!props) return out;
  for (const [k, v] of Object.entries(props)) {
    const max = PROP_RULES[k];
    if (max === undefined) continue;
    if (typeof v === "boolean") out[k] = v;
    else if (typeof v === "number") {
      if (Number.isFinite(v)) out[k] = Math.round(v * 100) / 100;
    } else if (typeof v === "string" && max > 0) {
      const s = scrubText(v, max);
      if (s) out[k] = s;
    }
  }
  return out;
}

export function isEventName(name: string): name is EventName {
  return (EVENT_NAMES as readonly string[]).includes(name);
}

export type KV = { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void };

export type TelemetryDeps = {
  storage: KV;
  now: () => number;
  uuid: () => string;
  version: string;
  /** Invia un lotto; true se il server l'ha accettato. Non deve mai lanciare eccezioni. */
  send: (rows: EventRow[], opts: { keepalive: boolean }) => Promise<boolean>;
  /** Cancella sul server gli eventi di questo ID anonimo. */
  forget?: (playerId: string) => Promise<boolean>;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class Telemetry {
  readonly sessionId: string;
  private deps: TelemetryDeps;
  private queue: EventRow[];
  private sending = false;
  private failures = 0;
  private nextTryAt = 0;

  constructor(deps: TelemetryDeps) {
    this.deps = deps;
    this.sessionId = deps.uuid();
    this.queue = this.enabled() ? this.loadQueue() : [];
  }

  enabled() {
    try {
      return this.deps.storage.getItem(KEY_OFF) !== "1";
    } catch {
      return true;
    }
  }

  /** ID anonimo del dispositivo (creato al primo uso). */
  playerId() {
    try {
      const id = this.deps.storage.getItem(KEY_ID);
      if (id && UUID_RE.test(id)) return id;
      const fresh = this.deps.uuid();
      this.deps.storage.setItem(KEY_ID, fresh);
      return fresh;
    } catch {
      return this.sessionId;
    }
  }

  pending() {
    return this.queue.length;
  }

  /** Registra un evento (se la telemetria è attiva). Non lancia mai eccezioni. */
  track(name: EventName, props?: Record<string, unknown>) {
    if (!this.enabled() || !isEventName(name)) return;
    const row: EventRow = {
      created_at: new Date(this.deps.now()).toISOString(),
      player_id: this.playerId(),
      session_id: this.sessionId,
      name,
      props: sanitizeProps(props),
      version: this.deps.version.slice(0, 40),
    };
    this.queue.push(row);
    if (this.queue.length > QUEUE_MAX) this.queue.splice(0, this.queue.length - QUEUE_MAX);
    this.saveQueue();
  }

  /** Invia fino a BATCH_MAX eventi. In caso di errore la coda resta e si riprova più tardi. */
  async flush(opts: { keepalive?: boolean; force?: boolean } = {}) {
    if (!this.enabled() || this.sending || !this.queue.length) return false;
    if (!opts.force && this.deps.now() < this.nextTryAt) return false;
    const batch = this.queue.slice(0, BATCH_MAX);
    this.sending = true;
    let ok = false;
    try {
      ok = await this.deps.send(batch, { keepalive: Boolean(opts.keepalive) });
    } catch {
      ok = false;
    }
    this.sending = false;
    if (ok) {
      const sent = new Set(batch);
      this.queue = this.queue.filter((r) => !sent.has(r));
      this.failures = 0;
      this.nextTryAt = 0;
      this.saveQueue();
    } else {
      this.failures += 1;
      // Attesa crescente: 20 s, 40 s, 80 s... fino a 10 minuti.
      this.nextTryAt = this.deps.now() + Math.min(600_000, FLUSH_MS * 2 ** (this.failures - 1));
    }
    return ok;
  }

  /** Interruttore in Impostazioni. Spegnendo si svuota la coda. */
  setEnabled(on: boolean) {
    try {
      if (on) this.deps.storage.removeItem(KEY_OFF);
      else {
        this.deps.storage.setItem(KEY_OFF, "1");
        this.queue = [];
        this.deps.storage.removeItem(KEY_QUEUE);
      }
    } catch {
      /* archiviazione non disponibile */
    }
  }

  /** "Cancella i miei dati": cancella sul server, svuota la coda e cambia ID anonimo. */
  async forgetMe() {
    const id = this.playerId();
    this.queue = [];
    try {
      this.deps.storage.removeItem(KEY_QUEUE);
      this.deps.storage.removeItem(KEY_ID);
    } catch {
      /* nulla */
    }
    try {
      return this.deps.forget ? await this.deps.forget(id) : false;
    } catch {
      return false;
    }
  }

  private loadQueue(): EventRow[] {
    try {
      const raw = this.deps.storage.getItem(KEY_QUEUE);
      const arr = raw ? (JSON.parse(raw) as EventRow[]) : [];
      return Array.isArray(arr) ? arr.filter((r) => r && isEventName(r.name)).slice(-QUEUE_MAX) : [];
    } catch {
      return [];
    }
  }

  private saveQueue() {
    try {
      if (this.queue.length) this.deps.storage.setItem(KEY_QUEUE, JSON.stringify(this.queue));
      else this.deps.storage.removeItem(KEY_QUEUE);
    } catch {
      /* quota piena: si continua in memoria */
    }
  }
}

// --- fonte e dispositivo -------------------------------------------------------

export type SourceInfo = {
  source: string;
  referrer?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  invite?: "amico" | "sfida" | "duello";
};

/**
 * Da dove arriva il giocatore: utm_source se c'è, altrimenti un invito (?f / ?c / ?d),
 * altrimenti il dominio del sito di provenienza, altrimenti "diretto".
 */
export function detectSource(input: { search: string; referrer: string; host: string }): SourceInfo {
  const q = new URLSearchParams(input.search);
  const info: SourceInfo = { source: "diretto" };
  if (q.get("d")) info.invite = "duello";
  else if (q.get("c") || q.get("v")) info.invite = "sfida";
  else if (q.get("f")) info.invite = "amico";
  let refHost = "";
  try {
    refHost = input.referrer ? new URL(input.referrer).hostname.replace(/^www\./, "") : "";
  } catch {
    refHost = "";
  }
  if (refHost && refHost !== input.host.replace(/^www\./, "")) info.referrer = refHost;
  for (const k of ["utm_source", "utm_medium", "utm_campaign"] as const) {
    const v = q.get(k);
    if (v) info[k] = scrubText(v, 60);
  }
  info.source = info.utm_source ?? (info.invite ? `invito_${info.invite}` : info.referrer ?? "diretto");
  return info;
}

export function detectDevice(ua: string, platform = "", touchPoints = 0) {
  const ios = /iphone|ipad|ipod/i.test(ua) || (platform === "MacIntel" && touchPoints > 1);
  const android = /android/i.test(ua);
  const device = ios ? "ios" : android ? "android" : "desktop";
  const browser = /edg\//i.test(ua)
    ? "edge"
    : /samsungbrowser/i.test(ua)
      ? "samsung"
      : /firefox|fxios/i.test(ua)
        ? "firefox"
        : /crios|chrome|chromium/i.test(ua)
          ? "chrome"
          : /safari/i.test(ua)
            ? "safari"
            : "altro";
  return { device, browser };
}

/** Errore JS ridotto a messaggio corto e "file:riga" (senza percorsi né parametri). */
export function errorInfo(message: unknown, source?: string, line?: number) {
  const msg = scrubText(String(message ?? "errore"), 120);
  const file = (source ?? "").split(/[?#]/)[0]!.split("/").pop() ?? "";
  return { message: msg, where: file ? `${file}${line ? `:${line}` : ""}` : "" };
}
