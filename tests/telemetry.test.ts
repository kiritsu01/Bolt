import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BATCH_MAX,
  KEY_ID,
  KEY_OFF,
  KEY_QUEUE,
  QUEUE_MAX,
  Telemetry,
  detectDevice,
  detectSource,
  errorInfo,
  sanitizeProps,
  scrubText,
  type EventRow,
} from "../src/game/telemetry";

class MemStore {
  m = new Map<string, string>();
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

let n = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;

function make(opts: { online?: () => boolean; storage?: MemStore; t?: { now: number } } = {}) {
  const storage = opts.storage ?? new MemStore();
  const clock = opts.t ?? { now: Date.UTC(2026, 10, 18, 12) };
  const sent: EventRow[][] = [];
  const forgotten: string[] = [];
  const tel = new Telemetry({
    storage,
    now: () => clock.now,
    uuid,
    version: "abc1234",
    send: async (rows) => {
      if (opts.online && !opts.online()) return false;
      sent.push(rows.map((r) => ({ ...r })));
      return true;
    },
    forget: async (id) => {
      forgotten.push(id);
      return true;
    },
  });
  return { tel, storage, sent, clock, forgotten };
}

test("ID anonimo casuale, stabile e separato dal salvataggio", () => {
  const { tel, storage } = make();
  const id = tel.playerId();
  assert.match(id, /^[0-9a-f-]{36}$/);
  assert.equal(tel.playerId(), id);
  assert.equal(storage.getItem(KEY_ID), id);
  assert.equal(storage.getItem("bolt-save-v4"), null, "il salvataggio non viene toccato");
});

test("eventi a lotti: al massimo 50 per invio, poi la coda si svuota", async () => {
  const { tel, sent } = make();
  for (let i = 0; i < 120; i++) tel.track("level_start", { level: i + 1 });
  assert.equal(tel.pending(), 120);
  await tel.flush();
  assert.equal(sent[0]!.length, BATCH_MAX);
  await tel.flush();
  await tel.flush();
  assert.equal(tel.pending(), 0);
  assert.equal(sent.flat().length, 120);
  assert.equal(sent[0]![0]!.name, "level_start");
  assert.equal(sent[0]![0]!.version, "abc1234");
});

test("coda offline: si conserva, sopravvive a una riapertura e si invia quando torna la rete", async () => {
  let online = false;
  const storage = new MemStore();
  const clock = { now: Date.UTC(2026, 10, 18, 12) };
  const a = make({ online: () => online, storage, t: clock });
  a.tel.track("app_open", { source: "diretto" });
  a.tel.track("level_end", { level: 3, stars: 3 });
  assert.equal(await a.tel.flush(), false);
  assert.equal(a.tel.pending(), 2);
  assert.ok(storage.getItem(KEY_QUEUE), "coda salvata");
  // Il gioco si riapre (nuova sessione) ancora offline, poi torna la rete.
  const b = make({ online: () => online, storage, t: clock });
  assert.equal(b.tel.pending(), 2);
  online = true;
  clock.now += 10 * 60_000;
  assert.equal(await b.tel.flush(), true);
  assert.equal(b.tel.pending(), 0);
  assert.equal(storage.getItem(KEY_QUEUE), null);
});

test("server che non risponde: il gioco non se ne accorge e si riprova con attesa crescente", async () => {
  const storage = new MemStore();
  const clock = { now: 1_000_000 };
  const tel = new Telemetry({
    storage,
    now: () => clock.now,
    uuid,
    version: "v",
    send: async () => {
      throw new Error("rete giù");
    },
  });
  tel.track("app_open");
  assert.equal(await tel.flush(), false, "nessuna eccezione verso il gioco");
  assert.equal(await tel.flush(), false, "attende prima di riprovare");
  clock.now += 20_001;
  assert.equal(await tel.flush(), false);
  assert.equal(tel.pending(), 1);
});

test("la coda non cresce all'infinito", () => {
  const { tel } = make();
  for (let i = 0; i < QUEUE_MAX + 50; i++) tel.track("perf", { fps: 60 });
  assert.equal(tel.pending(), QUEUE_MAX);
});

test("opt-out: niente eventi, coda svuotata; riattivabile", async () => {
  const { tel, storage, sent } = make();
  tel.track("app_open");
  tel.setEnabled(false);
  assert.equal(storage.getItem(KEY_OFF), "1");
  assert.equal(tel.pending(), 0);
  tel.track("level_start", { level: 1 });
  await tel.flush({ force: true });
  assert.equal(sent.length, 0);
  tel.setEnabled(true);
  tel.track("level_start", { level: 1 });
  assert.equal(tel.pending(), 1);
});

test("Cancella i miei dati: cancella sul server, svuota la coda e cambia ID", async () => {
  const { tel, forgotten } = make();
  const old = tel.playerId();
  tel.track("app_open");
  await tel.forgetMe();
  assert.deepEqual(forgotten, [old]);
  assert.equal(tel.pending(), 0);
  assert.notEqual(tel.playerId(), old);
});

test("niente dati personali: solo proprietà ammesse, testi ripuliti", async () => {
  const { tel, sent } = make();
  tel.track("level_end", {
    level: 3,
    stars: 2,
    name: "Razvan Serban",
    playerName: "Giulia",
    email: "a@b.it",
    friends: ["x"],
    ip: "1.2.3.4",
  } as Record<string, unknown>);
  tel.track("feedback", { rating: 5, comment: "Bellissimo! scrivimi a mario.rossi@gmail.com o al +39 333 123 4567" });
  await tel.flush();
  const rows = sent.flat();
  assert.deepEqual(rows[0]!.props, { level: 3, stars: 2 });
  const comment = String(rows[1]!.props.comment);
  assert.ok(!comment.includes("@"), comment);
  assert.ok(!/\d{6,}/.test(comment.replace(/\s/g, "")), comment);
  assert.match(comment, /\[email\]/);
  const json = JSON.stringify(rows);
  for (const bad of ["Razvan", "Giulia", "1.2.3.4", "mario.rossi"]) assert.ok(!json.includes(bad), bad);
  // Nessun campo oltre a quelli previsti.
  assert.deepEqual(Object.keys(rows[0]!).sort(), ["created_at", "name", "player_id", "props", "session_id", "version"]);
});

test("eventi sconosciuti e valori strani vengono scartati", () => {
  const { tel } = make();
  tel.track("hack_me" as never, { level: 1 });
  assert.equal(tel.pending(), 0);
  assert.deepEqual(sanitizeProps({ level: Number.NaN, fps: Infinity, ms: 1234.5678, comment: "x".repeat(500), pwa: true, source: { a: 1 } }), {
    ms: 1234.57,
    comment: "x".repeat(200),
    pwa: true,
  });
  assert.equal(scrubText("guarda https://x.it/p?token=SEGRETO#y ok", 100), "guarda https://x.it/p ok");
});

test("fonte: utm, inviti, dominio di provenienza, diretto", () => {
  const host = "kiritsu01.github.io";
  assert.deepEqual(detectSource({ search: "?utm_source=marco&utm_medium=whatsapp&utm_campaign=test1", referrer: "", host }), {
    source: "marco",
    utm_source: "marco",
    utm_medium: "whatsapp",
    utm_campaign: "test1",
  });
  assert.equal(detectSource({ search: "?d=abc", referrer: "", host }).source, "invito_duello");
  assert.equal(detectSource({ search: "?c=ABC&v=x", referrer: "", host }).invite, "sfida");
  assert.equal(detectSource({ search: "?f=xyz", referrer: "", host }).invite, "amico");
  assert.equal(detectSource({ search: "", referrer: "https://www.instagram.com/p/123?igsh=x", host }).source, "instagram.com");
  assert.equal(detectSource({ search: "", referrer: `https://${host}/Bolt/`, host }).source, "diretto", "navigazione interna");
  assert.equal(detectSource({ search: "", referrer: "", host }).source, "diretto");
});

test("dispositivo e browser dallo user agent", () => {
  assert.deepEqual(
    detectDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"),
    { device: "ios", browser: "safari" },
  );
  assert.deepEqual(detectDevice("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36"), {
    device: "android",
    browser: "chrome",
  });
  assert.deepEqual(detectDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605", "MacIntel", 5).device, "ios");
  assert.deepEqual(detectDevice("Mozilla/5.0 (Windows NT 10.0) Gecko/20100101 Firefox/131.0"), { device: "desktop", browser: "firefox" });
});

test("errori JS: messaggio corto e file:riga senza percorsi", () => {
  assert.deepEqual(errorInfo("TypeError: x is undefined", "https://kiritsu01.github.io/Bolt/assets/index-ab12.js?v=1", 42), {
    message: "TypeError: x is undefined",
    where: "index-ab12.js:42",
  });
});
