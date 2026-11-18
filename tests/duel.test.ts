import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BLOCK_MS,
  COUNTDOWN_MS,
  DUEL_TTL_MS,
  FINISH_GRACE_MS,
  FORFEIT_MS,
  arbitrate,
  decodeInvite,
  duelSpec,
  encodeInvite,
  freshArbiter,
  inviteExpired,
  parseMsg,
  type DuelInvite,
} from "../src/duel/protocol";
import { DuelSession, type DuelView } from "../src/duel/session";
import { MemoryHub } from "../src/duel/transport";
import { isSolvable, makeBoard, mulberry32 } from "../src/game/logic";
import { duelBlocked, duelBlockUntil } from "../src/game/sim";

/** Orologio finto: i timer scattano solo quando si fa avanzare il tempo. */
class Clock {
  t = 1_000;
  wall = Date.UTC(2026, 10, 17, 12, 0, 0);
  private q: Array<{ at: number; fn: () => void; id: number }> = [];
  private id = 0;
  now = () => this.t;
  wallNow = () => this.wall + this.t;
  schedule = (fn: () => void, ms: number) => {
    const id = ++this.id;
    this.q.push({ at: this.t + Math.max(0, ms), fn, id });
    return () => {
      this.q = this.q.filter((x) => x.id !== id);
    };
  };
  advance(ms: number) {
    const end = this.t + ms;
    for (;;) {
      this.q.sort((a, b) => a.at - b.at || a.id - b.id);
      const next = this.q[0];
      if (!next || next.at > end) break;
      this.q.shift();
      this.t = Math.max(this.t, next.at);
      next.fn();
    }
    this.t = end;
  }
}

function setup(latency = 40) {
  const clock = new Clock();
  const hub = new MemoryHub(latency, (fn, ms) => clock.schedule(fn, ms));
  const invite: DuelInvite = { room: "abcd2345", createdAt: clock.wallNow(), hostId: "RZVNXX", hostName: "Razvan" };
  const views: Record<string, DuelView> = {};
  const make = (id: string, name: string, role: "host" | "guest", inv = invite) =>
    new DuelSession({
      transport: hub.transport(),
      me: { id, name },
      role,
      invite: inv,
      now: clock.now,
      wallNow: clock.wallNow,
      schedule: clock.schedule,
      onChange: (v) => (views[id] = v),
      rand: mulberry32(id.charCodeAt(0)),
    });
  return { clock, hub, invite, views, make };
}

test("link del duello: andata e ritorno, scadenza dopo 10 minuti, manomissioni rifiutate", () => {
  const now = Date.UTC(2026, 10, 17, 12, 0, 0);
  const inv: DuelInvite = { room: "abcd2345", createdAt: now, hostId: "RZVNXX", hostName: "Razvan" };
  const code = encodeInvite(inv);
  assert.deepEqual(decodeInvite(code, now), inv);
  assert.equal(inviteExpired(inv, now + DUEL_TTL_MS - 1000), false);
  assert.equal(inviteExpired(inv, now + DUEL_TTL_MS + 1000), true);
  assert.equal(decodeInvite(code.replace("abcd2345", "abcd2346"), now), null, "stanza cambiata");
  assert.equal(decodeInvite(code.slice(0, -1), now), null);
  assert.equal(decodeInvite("x.y.z", now), null);
  assert.equal(decodeInvite(encodeInvite({ ...inv, createdAt: now + 3_600_000 }), now), null, "dal futuro");
  assert.equal(decodeInvite(encodeInvite({ ...inv, hostId: "bad" }), now), null);
});

test("stessa griglia per entrambi, sempre risolvibile", () => {
  for (const seed of [1, 42, 99999, 2 ** 31 - 1]) {
    assert.deepEqual(makeBoard(duelSpec(seed)), makeBoard(duelSpec(seed)));
    assert.ok(isSolvable(makeBoard(duelSpec(seed))));
  }
  assert.notDeepEqual(makeBoard(duelSpec(1)), makeBoard(duelSpec(2)));
});

test("messaggi dalla rete: solo quelli ben formati", () => {
  assert.deepEqual(parseMsg({ t: "ping", id: "RZVNXX", n: 1 }), { t: "ping", id: "RZVNXX", n: 1 });
  assert.equal(parseMsg({ t: "ping", id: "bad", n: 1 }), null);
  assert.equal(parseMsg({ t: "progress", id: "RZVNXX", round: 1, left: -3, total: 22 }), null);
  assert.equal(parseMsg({ t: "boh" }), null);
  assert.equal(parseMsg(null), null);
});

test("arbitro: vince chi svuota per primo sul proprio orologio", () => {
  // L'ospite finisce a 30 s, chi ha creato è già a 30,05 s: vince l'ospite subito.
  assert.equal(arbitrate(freshArbiter(), { kind: "done", who: "guest", ms: 30_000 }, 30_050).winner, "guest");
  // Chi ha creato finisce a 30 s: aspetta mezzo secondo un tempo migliore dell'ospite.
  let a = arbitrate(freshArbiter(), { kind: "done", who: "host", ms: 30_000 }, 30_000);
  assert.equal(a.winner, null);
  a = arbitrate(a, { kind: "done", who: "guest", ms: 29_900 }, 30_200);
  assert.equal(a.winner, "guest", "l'ospite era più veloce ma il messaggio è arrivato dopo");
  a = arbitrate(freshArbiter(), { kind: "done", who: "host", ms: 30_000 }, 30_000);
  a = arbitrate(a, { kind: "tick" }, 30_000 + FINISH_GRACE_MS);
  assert.equal(a.winner, "host");
  // Parità esatta: vince chi ha creato il duello.
  a = arbitrate(freshArbiter(), { kind: "done", who: "host", ms: 30_000 }, 30_000);
  assert.equal(arbitrate(a, { kind: "done", who: "guest", ms: 30_000 }, 30_100).winner, "host");
});

test("un errore blocca per 2 secondi", () => {
  const until = duelBlockUntil(10_000);
  assert.equal(until, 10_000 + BLOCK_MS);
  assert.equal(duelBlocked(until, 11_999), true);
  assert.equal(duelBlocked(until, 12_000), false);
});

test("flusso completo: invito, conto alla rovescia sincronizzato, progressi, vittoria", async () => {
  const { clock, views, make } = setup(60);
  const host = make("RZVNXX", "Razvan", "host");
  await host.host();
  clock.advance(100);
  assert.equal(views.RZVNXX!.phase, "waiting");

  const guest = make("GZULKA", "Giulia", "guest");
  assert.equal(guest.view.phase, "invited");
  await guest.accept();
  clock.advance(2000);
  assert.equal(views.RZVNXX!.phase, "countdown");
  assert.equal(views.GZULKA!.phase, "countdown");
  assert.equal(views.RZVNXX!.seed, views.GZULKA!.seed, "stesso seed");
  assert.equal(views.RZVNXX!.opponent?.name, "Giulia");
  assert.equal(views.GZULKA!.opponent?.name, "Razvan");
  // Il "Via!" scatta quasi insieme: il ritardo di rete è compensato.
  assert.ok(Math.abs(views.RZVNXX!.goAt! - views.GZULKA!.goAt!) <= 5, `scarto ${views.RZVNXX!.goAt! - views.GZULKA!.goAt!} ms`);

  clock.advance(COUNTDOWN_MS);
  assert.equal(views.RZVNXX!.phase, "playing");
  assert.equal(views.GZULKA!.phase, "playing");

  guest.progress(10, 22, false);
  clock.advance(100);
  assert.equal(views.RZVNXX!.oppLeft, 10);
  guest.progress(10, 22, true);
  clock.advance(100);
  assert.equal(views.RZVNXX!.oppBlocked, true, "l'avversario vede il mio blocco");

  // L'ospite svuota per prima.
  const go = views.GZULKA!.goAt!;
  clock.t = go + 25_000;
  guest.done(25_000);
  clock.advance(300);
  assert.equal(views.RZVNXX!.phase, "finished");
  assert.equal(views.RZVNXX!.result?.winner, "opponent");
  assert.equal(views.GZULKA!.result?.winner, "me");
  assert.equal(views.GZULKA!.result?.forfeit, false);

  // Rivincita: riparte subito per entrambi, griglia nuova.
  const oldSeed = views.GZULKA!.seed;
  guest.rematch();
  clock.advance(300);
  assert.equal(views.RZVNXX!.phase, "countdown");
  assert.equal(views.GZULKA!.phase, "countdown");
  assert.equal(views.GZULKA!.round, 2);
  assert.notEqual(views.GZULKA!.seed, oldSeed);
});

test("chi ha creato finisce prima: vince lui", async () => {
  const { clock, views, make } = setup(50);
  const host = make("RZVNXX", "Razvan", "host");
  await host.host();
  const guest = make("GZULKA", "Giulia", "guest");
  await guest.accept();
  clock.advance(2000 + COUNTDOWN_MS);
  clock.t = views.RZVNXX!.goAt! + 20_000;
  host.done(20_000);
  clock.advance(1000);
  assert.equal(views.RZVNXX!.result?.winner, "me");
  assert.equal(views.GZULKA!.result?.winner, "opponent");
});

test("avversario disconnesso a metà: vittoria a tavolino dopo 15 secondi, annullata se rientra", async () => {
  const { clock, views, make, hub } = setup(30);
  const host = make("RZVNXX", "Razvan", "host");
  await host.host();
  const guest = make("GZULKA", "Giulia", "guest");
  await guest.accept();
  clock.advance(2000 + COUNTDOWN_MS + 100);
  assert.equal(views.RZVNXX!.phase, "playing");

  // L'ospite perde la connessione (sparisce dalla presenza, senza salutare).
  const room = hub.rooms.get("abcd2345")!;
  const guestTransport = room.members.get("GZULKA")!;
  room.members.delete("GZULKA");
  for (const t of room.members.values()) (t as unknown as { emitPresence: (r: unknown) => void }).emitPresence(room);
  clock.advance(100);
  assert.ok(views.RZVNXX!.forfeitAt, "conto alla rovescia di 15 s");
  clock.advance(5_000);
  // Rientra in tempo: si continua.
  room.members.set("GZULKA", guestTransport);
  for (const t of room.members.values()) (t as unknown as { emitPresence: (r: unknown) => void }).emitPresence(room);
  clock.advance(100);
  assert.equal(views.RZVNXX!.forfeitAt, null);
  assert.equal(views.RZVNXX!.phase, "playing");

  // Sparisce di nuovo e non torna: a tavolino.
  room.members.delete("GZULKA");
  for (const t of room.members.values()) (t as unknown as { emitPresence: (r: unknown) => void }).emitPresence(room);
  clock.advance(FORFEIT_MS - 200);
  assert.equal(views.RZVNXX!.phase, "playing");
  clock.advance(500);
  assert.equal(views.RZVNXX!.phase, "finished");
  assert.deepEqual(views.RZVNXX!.result, { winner: "me", forfeit: true, myMs: null, oppMs: null });
  assert.equal(views.RZVNXX!.opponentGone, true, "niente rivincita");
});

test("chi esce con Home durante la partita: l'altro vince a tavolino subito", async () => {
  const { clock, views, make } = setup(30);
  const host = make("RZVNXX", "Razvan", "host");
  await host.host();
  const guest = make("GZULKA", "Giulia", "guest");
  await guest.accept();
  clock.advance(2000 + COUNTDOWN_MS + 100);
  host.leave();
  clock.advance(200);
  assert.equal(views.GZULKA!.result?.winner, "me");
  assert.equal(views.GZULKA!.result?.forfeit, true);
});

test("link aperto dopo 10 minuti: scaduto, senza nemmeno collegarsi", () => {
  const { clock, make, invite } = setup();
  const old = { ...invite, createdAt: clock.wallNow() - DUEL_TTL_MS - 60_000 };
  const guest = make("GZULKA", "Giulia", "guest", old);
  assert.equal(guest.view.phase, "expired");
});

test("chi ha creato è uscito: dopo l'attesa il duello risulta scaduto", async () => {
  const { clock, views, make } = setup();
  const guest = make("GZULKA", "Giulia", "guest");
  await guest.accept();
  clock.advance(6000);
  assert.equal(views.GZULKA!.phase, "expired");
});

test("chi ha creato annulla mentre aspetta: chi arriva dopo trova il duello scaduto", async () => {
  const { clock, views, make } = setup();
  const host = make("RZVNXX", "Razvan", "host");
  await host.host();
  clock.advance(100);
  host.leave();
  const guest = make("GZULKA", "Giulia", "guest");
  await guest.accept();
  clock.advance(6000);
  assert.equal(views.GZULKA!.phase, "expired");
});

test("stesso link aperto da un terzo: duello già iniziato", async () => {
  const { clock, views, make } = setup(30);
  const host = make("RZVNXX", "Razvan", "host");
  await host.host();
  const guest = make("GZULKA", "Giulia", "guest");
  await guest.accept();
  clock.advance(2000);
  const third = make("MARCXX", "Marco", "guest");
  await third.accept();
  clock.advance(2000);
  assert.equal(views.MARCXX!.phase, "busy");
  assert.equal(views.RZVNXX!.opponent?.id, "GZULKA", "il duello in corso non cambia");
  assert.ok(["countdown", "playing"].includes(views.GZULKA!.phase), "il duello vero va avanti");
});

test("servizio non raggiungibile prima di iniziare: messaggio chiaro", async () => {
  const { clock, views, make, hub } = setup();
  const host = make("RZVNXX", "Razvan", "host");
  await host.host();
  clock.advance(50);
  (hub.rooms.get("abcd2345")!.members.get("RZVNXX") as unknown as { fail: () => void }).fail();
  assert.equal(views.RZVNXX!.phase, "unavailable");
});

import { realtimeEndpoint } from "../src/duel/endpoint";

test("indirizzo Realtime di Supabase, anche da un URL copiato con /rest/v1/", () => {
  const want = "wss://ntprneeezzdcfxlwndox.supabase.co/realtime/v1";
  assert.equal(realtimeEndpoint("https://ntprneeezzdcfxlwndox.supabase.co"), want);
  assert.equal(realtimeEndpoint("https://ntprneeezzdcfxlwndox.supabase.co/"), want);
  assert.equal(realtimeEndpoint("https://ntprneeezzdcfxlwndox.supabase.co/rest/v1/"), want);
  assert.equal(realtimeEndpoint("  https://ntprneeezzdcfxlwndox.supabase.co/rest/v1  "), want);
});
