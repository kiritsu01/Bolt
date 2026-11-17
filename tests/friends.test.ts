import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_FRIENDS,
  type Friend,
  cleanName,
  decodeFriend,
  decodeVersus,
  encodeFriend,
  encodeVersus,
  mergeFriend,
  nudge,
  ranking,
  sanitizeFriends,
  versusWinner,
} from "../src/game/friends";
import { parseSave } from "../src/game/save";

const TODAY = "2026-11-17";
const giulia: Friend = { id: "GZULKA", name: "Giulia", level: 23, stars: 61, streak: 4, date: TODAY };

/** Cambia un campo del codice lasciando il controllo vecchio, come farebbe chi ritocca il link a mano. */
function forge(code: string, index: number, value: string) {
  const parts = code.split(".");
  parts[index] = value;
  return parts.join(".");
}

test("link amico: andata e ritorno", () => {
  const code = encodeFriend(giulia);
  assert.ok(code.length < 60, `codice compatto (${code.length} caratteri)`);
  assert.match(code, /^[A-Za-z0-9._-]+$/, "solo caratteri sicuri in un URL");
  assert.deepEqual(decodeFriend(code, TODAY), giulia);
  const emoji = { ...giulia, name: "Zoë 🎈" };
  assert.deepEqual(decodeFriend(encodeFriend(emoji), TODAY), emoji);
});

test("link amico manomessi o rotti vengono ignorati", () => {
  const code = encodeFriend(giulia);
  const bad = [
    "",
    "abc",
    code.slice(0, -1),
    code + "x",
    code.toUpperCase(),
    forge(code, 2, "zz"), // livello cambiato: il checksum non torna
    forge(code, 1, "QUFBQUFBQUFBQUFBQUFBQUFB"), // nome cambiato
    code.replace(/\./g, ","),
    "GZULKA.R2l1bGlh.n.1a.3.t7.0000",
    "x".repeat(500),
  ];
  for (const c of bad) assert.equal(decodeFriend(c, TODAY), null, c);
  assert.equal(decodeFriend(null, TODAY), null);
  assert.equal(decodeFriend(undefined, TODAY), null);
});

test("valori impossibili rifiutati anche con codice ben formato", () => {
  const cases: Array<Partial<Friend>> = [
    { level: 0 }, // livello minimo 1
    { level: 999999 }, // oltre il massimo credibile
    { stars: 70 }, // più di 3 stelle per livello (23 * 3 = 69)
    { streak: 99999 }, // serie più lunga dei giorni passati dal 2024
    { date: "2031-01-01" }, // data nel futuro
    { id: "giulia" }, // id non valido
    { id: "IIIIII" }, // lettere escluse dall'alfabeto
    { name: "" },
    { name: "   " },
  ];
  for (const c of cases) {
    const code = encodeFriend({ ...giulia, ...c } as Friend);
    assert.equal(decodeFriend(code, TODAY), null, JSON.stringify(c));
  }
});

test("nomi troppo lunghi o con caratteri strani: mai più di 12 caratteri puliti", () => {
  for (const name of ["Nome lunghissimo oltre dodici", "a\u0000b\u202e"]) {
    const back = decodeFriend(encodeFriend({ ...giulia, name }), TODAY)!;
    assert.ok([...back.name].length <= 12);
    assert.doesNotMatch(back.name, /[\u0000-\u001f\u202e]/);
  }
});

test("pulizia dei nomi", () => {
  assert.equal(cleanName("  Anna   Maria  "), "Anna Maria");
  assert.equal(cleanName("ABCDEFGHIJKLMNOP"), "ABCDEFGHIJKL");
  assert.equal(cleanName("<b>x</b>"), "bx/b");
  assert.equal(cleanName(42), "");
});

test("unione degli amici: aggiunge, aggiorna solo se più recente, max 20", () => {
  let r = mergeFriend([], giulia, "MEMEME");
  assert.equal(r.status, "added");
  assert.equal(r.friends.length, 1);

  const older = { ...giulia, level: 30, date: "2026-11-10" };
  r = mergeFriend(r.friends, older, "MEMEME");
  assert.equal(r.status, "same", "un dato più vecchio non sovrascrive");
  assert.equal(r.friends[0]!.level, 23);

  const newer = { ...giulia, level: 25, name: "Giuly", date: "2026-11-18" };
  r = mergeFriend(r.friends, newer, "MEMEME");
  assert.equal(r.status, "updated");
  assert.equal(r.friends[0]!.name, "Giuly");
  assert.equal(r.friends.length, 1, "stesso id: niente doppioni");

  assert.equal(mergeFriend(r.friends, { ...giulia, id: "MEMEME" }, "MEMEME").status, "self");

  let list: Friend[] = [];
  for (let i = 0; i < MAX_FRIENDS; i++) list = mergeFriend(list, { ...giulia, id: `AAAA${"ABCDEFGHJKLMNPQRSTUV"[i]}A` }, "MEMEME").friends;
  assert.equal(list.length, MAX_FRIENDS);
  const full = mergeFriend(list, { ...giulia, id: "ZZZZZZ" }, "MEMEME");
  assert.equal(full.status, "full");
  assert.equal(full.friends.length, MAX_FRIENDS);
  // Aggiornare un amico già presente funziona anche a elenco pieno.
  assert.equal(mergeFriend(list, { ...list[3]!, date: "2026-11-18" }, "MEMEME").status, "updated");
});

test("elenco salvato ripulito: voci rotte e doppie scartate", () => {
  const clean = sanitizeFriends(
    [giulia, { ...giulia }, { id: "BAD", name: "x" }, null, 7, { ...giulia, id: "MARCXX", stars: -1 }, { ...giulia, id: "ANNA22" }],
    TODAY,
  );
  assert.deepEqual(
    clean.map((f) => f.id),
    ["GZULKA", "ANNA22"],
  );
  assert.deepEqual(sanitizeFriends("niente", TODAY), []);
});

test("classifica e riga di spinta", () => {
  const me: Friend = { id: "MEMEME", name: "Io", level: 20, stars: 50, streak: 2, date: TODAY };
  const friends = [giulia, { ...giulia, id: "LUCA33", name: "Luca", level: 5 }];
  const rows = ranking(me, friends);
  assert.deepEqual(
    rows.map((r) => r.name),
    ["Giulia", "Io", "Luca"],
  );
  assert.equal(rows[1]!.me, true);
  assert.deepEqual(nudge(20, friends), { kind: "behind", name: "Giulia", gap: 3 });
  assert.deepEqual(nudge(23, friends), { kind: "tied", name: "Giulia", gap: 0 });
  assert.deepEqual(nudge(30, friends), { kind: "ahead" });
  assert.equal(nudge(30, []), null);
});

test("confronto della Sfida di oggi: codifica, manomissioni e vincitore", () => {
  const v = { name: "Giulia", date: TODAY, ms: 42350, mistakes: 1 };
  const code = encodeVersus(v);
  assert.deepEqual(decodeVersus(code, TODAY), v);
  assert.equal(decodeVersus(code.replace(/\.(\w+)\.(\w+)\./, ".$1.0.") , TODAY), null, "tempo cambiato");
  assert.equal(decodeVersus(encodeVersus({ ...v, ms: 10 }), TODAY), null, "tempo impossibile");
  assert.equal(decodeVersus(encodeVersus({ ...v, mistakes: 5000 }), TODAY), null, "errori impossibili");
  assert.equal(decodeVersus(encodeVersus({ ...v, date: "2030-01-01" }), TODAY), null, "data futura");
  assert.equal(decodeVersus("a.b.c", TODAY), null);

  assert.equal(versusWinner({ ms: 50000, mistakes: 0 }, { ms: 20000, mistakes: 1 }), "me", "meno errori vince");
  assert.equal(versusWinner({ ms: 30000, mistakes: 1 }, { ms: 20000, mistakes: 1 }), "other", "a parità, tempo");
  assert.equal(versusWinner({ ms: 20010, mistakes: 1 }, { ms: 20000, mistakes: 1 }), "tie");
});

test("conversione del salvataggio: v2 diventa v3 con identità e amici vuoti", () => {
  const v2 = {
    version: 2,
    unlocked: 34,
    stars: { "1": 3, "20": 2 },
    bestRush: 900,
    streak: 6,
    lastDay: "2026-11-16",
    daily: {},
    sound: true,
    lang: "it",
    clears: 40,
    seenChapters: [1, 2],
    coins: 77,
    theme: "oceano",
    arrowStyle: "dart",
    ownedThemes: ["notte", "oceano"],
    ownedArrows: ["classic", "dart"],
    hintDay: "2026-11-16",
    hintsLeft: 1,
    installDismissed: true,
  };
  const s = parseSave(v2)!;
  assert.equal(s.version, 3);
  for (const k of Object.keys(v2) as Array<keyof typeof v2>) {
    if (k !== "version") assert.deepEqual(s[k as keyof typeof s], v2[k], k);
  }
  assert.match(s.playerId, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.equal(s.playerName, "");
  assert.deepEqual(s.friends, []);
});

test("salvataggio v3: nome e amici rotti vengono ripuliti", () => {
  const s = parseSave({
    version: 3,
    unlocked: 5,
    playerId: "??",
    playerName: "  Razvan  con un nome troppo lungo",
    friends: [giulia, { id: "nope" }],
  })!;
  assert.match(s.playerId, /^[A-HJ-NP-Z2-9]{6}$/, "id non valido rigenerato");
  assert.equal(s.playerName, "Razvan con u");
  assert.deepEqual(
    s.friends.map((f) => f.id),
    ["GZULKA"],
  );
});
