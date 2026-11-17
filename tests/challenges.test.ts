import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_CHALLENGES,
  type Challenge,
  addChallenge,
  challengeFromLink,
  doneChallenges,
  expectedCode,
  fromVersus,
  outcomeOf,
  pendingChallenges,
  resolveChallenge,
  sanitizeChallenges,
  tally,
} from "../src/game/challenges";
import { decodeVersus, encodeVersus } from "../src/game/friends";
import { campaignSpec, dailySpec, encodeSpec } from "../src/game/logic";
import { parseSave } from "../src/game/save";

const TODAY = "2026-11-17";
const giulia = { name: "Giulia", id: "GZULKA", date: TODAY, ms: 42350, mistakes: 1 };

function link(level: number, extra: Partial<typeof giulia> = {}) {
  const v = { ...giulia, level, ...extra };
  return { c: expectedCode(v)!, v: encodeVersus(v) };
}

test("link di sfida su un livello: andata e ritorno", () => {
  const { c, v } = link(12);
  assert.equal(c, encodeSpec(campaignSpec(12)));
  assert.deepEqual(decodeVersus(v, TODAY), { ...giulia, level: 12 });
  const ch = challengeFromLink(c, v, TODAY)!;
  assert.equal(ch.level, 12);
  assert.deepEqual(ch.from, { id: "GZULKA", name: "Giulia" });
  assert.deepEqual(ch.theirs, { ms: 42350, mistakes: 1 });
  assert.equal(ch.outcome, undefined);
});

test("link della Sfida di oggi: vecchio formato (senza id) e nuovo (livello 0)", () => {
  const old = encodeVersus({ name: "Giulia", date: TODAY, ms: 30000, mistakes: 0 });
  assert.equal(old.split(".").length, 5, "i link già inviati restano validi");
  const c = encodeSpec(dailySpec(TODAY))!;
  const a = challengeFromLink(c, old, TODAY)!;
  assert.equal(a.level, 0);
  assert.equal(a.from.id, "");
  const b = challengeFromLink(c, encodeVersus({ ...giulia, level: 0 }), TODAY)!;
  assert.equal(b.level, 0);
  assert.equal(b.from.id, "GZULKA");
});

test("link di sfida manomessi o incoerenti vengono ignorati", () => {
  const { c, v } = link(12);
  const parts = v.split(".");
  const swap = (i: number, val: string) => {
    const p = [...parts];
    p[i] = val;
    return p.join(".");
  };
  const bad: Array<[string | null, string | null]> = [
    [c, swap(5, "d")], // livello cambiato: il controllo non torna
    [c, swap(2, "1")], // tempo cambiato
    [c, swap(4, "AAAAAA")], // codice giocatore cambiato
    [encodeSpec(campaignSpec(13)), v], // griglia di un altro livello
    [encodeSpec(dailySpec(TODAY)), v], // griglia della Sfida di oggi con risultato di un livello
    [c, v.slice(0, -1)],
    [c, `${v}.x`],
    ["XXXXXXXXXX", v],
    [null, v],
    [c, null],
    [c, ""],
  ];
  for (const [cc, vv] of bad) assert.equal(challengeFromLink(cc, vv, TODAY), null, `${cc} ${vv}`);
  // Valori impossibili, anche se codificati "bene".
  for (const extra of [{ level: 1 }, { level: 2 }, { level: 999999 }, { ms: 100 }, { mistakes: 1000 }, { date: "2031-01-01" }, { id: "giulia" }]) {
    const vv = encodeVersus({ ...giulia, level: 12, ...extra } as typeof giulia & { level: number });
    assert.equal(decodeVersus(vv, TODAY), null, JSON.stringify(extra));
  }
});

test("esito: meno errori vince, a parità il tempo più basso", () => {
  assert.equal(outcomeOf({ ms: 60000, mistakes: 0 }, { ms: 10000, mistakes: 1 }), "win");
  assert.equal(outcomeOf({ ms: 9000, mistakes: 2 }, { ms: 60000, mistakes: 1 }), "loss");
  assert.equal(outcomeOf({ ms: 20000, mistakes: 1 }, { ms: 25000, mistakes: 1 }), "win");
  assert.equal(outcomeOf({ ms: 25000, mistakes: 1 }, { ms: 20000, mistakes: 1 }), "loss");
  assert.equal(outcomeOf({ ms: 20020, mistakes: 1 }, { ms: 20000, mistakes: 1 }), "tie");
});

test("elenco sfide: niente doppioni, niente sfide da se stessi, massimo 30 (via le più vecchie)", () => {
  const ch = challengeFromLink(link(12).c, link(12).v, TODAY)!;
  let list = addChallenge([], ch, "MEMEME");
  assert.equal(addChallenge(list, ch, "MEMEME"), list, "stessa sfida due volte");
  assert.deepEqual(addChallenge([], ch, "GZULKA"), [], "il proprio link non diventa una sfida");
  list = [];
  for (let i = 0; i < MAX_CHALLENGES + 5; i++) list = addChallenge(list, fromVersus({ ...giulia, level: 3 + i }, expectedCode({ level: 3 + i, date: TODAY })!));
  assert.equal(list.length, MAX_CHALLENGES);
  assert.equal(list[0]!.level, 3 + 5, "le 5 più vecchie sono state tolte");
  assert.equal(list.at(-1)!.level, 3 + MAX_CHALLENGES + 4);
});

test("giocare una sfida: conta il primo risultato, poi passa tra le fatte", () => {
  const ch = challengeFromLink(link(12).c, link(12).v, TODAY)!;
  let list = addChallenge([], ch);
  assert.equal(pendingChallenges(list).length, 1);
  list = resolveChallenge(list, ch.key, { ms: 30000, mistakes: 0 });
  assert.equal(list[0]!.outcome, "win");
  list = resolveChallenge(list, ch.key, { ms: 90000, mistakes: 9 });
  assert.equal(list[0]!.outcome, "win", "un secondo tentativo non cambia l'esito");
  assert.deepEqual(list[0]!.mine, { ms: 30000, mistakes: 0 });
  assert.equal(pendingChallenges(list).length, 0);
  assert.equal(doneChallenges(list).length, 1);
});

test("bilancio per avversario", () => {
  const mk = (id: string, name: string, level: number, mine: number): Challenge => {
    const c = fromVersus({ id, name, level, date: TODAY, ms: 20000, mistakes: 1 }, expectedCode({ level, date: TODAY })!);
    return resolveChallenge([c], c.key, { ms: 20000, mistakes: mine })[0]!;
  };
  const list = [
    mk("GZULKA", "Giulia", 3, 0),
    mk("GZULKA", "Giulia", 4, 0),
    mk("GZULKA", "Giuly", 5, 2), // stesso id, nome cambiato: un solo avversario, nome più recente
    mk("GZULKA", "Giuly", 6, 1), // pari
    mk("MARCXX", "Marco", 7, 3),
    fromVersus({ ...giulia, level: 8 }, expectedCode({ level: 8, date: TODAY })!), // non giocata: non conta
  ];
  assert.deepEqual(tally(list), [
    { key: "GZULKA", id: "GZULKA", name: "Giuly", wins: 2, losses: 1, ties: 1 },
    { key: "MARCXX", id: "MARCXX", name: "Marco", wins: 0, losses: 1, ties: 0 },
  ]);
  assert.deepEqual(tally([]), []);
});

test("sfide salvate ripulite: voci rotte, griglie incoerenti ed esiti falsi", () => {
  const good = challengeFromLink(link(12).c, link(12).v, TODAY)!;
  const played = resolveChallenge([good], good.key, { ms: 50000, mistakes: 3 })[0]!;
  const clean = sanitizeChallenges([
    played,
    { ...played, outcome: "win" }, // doppione con esito falso: scartato come doppione
    { ...good, key: "x", level: 13 }, // griglia che non è quella del livello
    { ...good, theirs: { ms: -1, mistakes: 0 } },
    { ...good, from: { id: "nope", name: "X" } },
    null,
    "rotto",
  ]);
  assert.equal(clean.length, 1);
  assert.equal(clean[0]!.outcome, "loss", "l'esito viene ricalcolato dai risultati");
  const forged = sanitizeChallenges([{ ...played, outcome: "win" }]);
  assert.equal(forged[0]!.outcome, "loss");
  assert.deepEqual(sanitizeChallenges(undefined), []);
});

test("conversione del salvataggio: v3 diventa v4 con sfide e migliori risultati vuoti", () => {
  const v3 = {
    version: 3,
    unlocked: 30,
    stars: { "3": 3 },
    coins: 12,
    playerId: "RZVNXX",
    playerName: "Razvan",
    friends: [{ id: "GZULKA", name: "Giulia", level: 23, stars: 46, streak: 3, date: TODAY }],
  };
  const s = parseSave(v3)!;
  assert.equal(s.version, 4);
  assert.equal(s.unlocked, 30);
  assert.equal(s.playerId, "RZVNXX");
  assert.equal(s.playerName, "Razvan");
  assert.equal(s.friends.length, 1);
  assert.deepEqual(s.challenges, []);
  assert.deepEqual(s.bests, {});
  // v1 e v2 arrivano anche loro alla v4.
  assert.equal(parseSave({ version: 1, unlocked: 3 })!.version, 4);
  assert.equal(parseSave({ version: 2, unlocked: 3 })!.version, 4);
});

test("salvataggio v4: migliori risultati e sfide validati", () => {
  const ch = challengeFromLink(link(12).c, link(12).v, TODAY)!;
  const s = parseSave({
    version: 4,
    bests: { "5": { ms: 6100, mistakes: 0 }, abc: { ms: 1, mistakes: 0 }, "6": { ms: "x", mistakes: 0 } },
    challenges: [ch, { bad: true }],
  })!;
  assert.deepEqual(s.bests, { "5": { ms: 6100, mistakes: 0 } });
  assert.deepEqual(s.challenges, [ch]);
});
