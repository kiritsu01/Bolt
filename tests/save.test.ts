import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSave } from "../src/game/save";

test("un salvataggio v1 diventa v2 senza perdere nulla", () => {
  const v1 = {
    version: 1,
    unlocked: 23,
    stars: { "1": 3, "2": 2, "5": 1 },
    bestRush: 4200,
    streak: 4,
    lastDay: "2026-11-16",
    daily: { "2026-11-16": { mistakes: 1, ms: 40000 } },
    sound: false,
    lang: "en",
    clears: 30,
  };
  const s = parseSave(v1)!;
  assert.equal(s.version, 2);
  assert.equal(s.unlocked, 23);
  assert.deepEqual(s.stars, v1.stars);
  assert.equal(s.bestRush, 4200);
  assert.equal(s.streak, 4);
  assert.deepEqual(s.daily, v1.daily);
  assert.equal(s.sound, false);
  assert.equal(s.lang, "en");
  assert.equal(s.clears, 30);
  assert.deepEqual(s.seenChapters, []);
  assert.equal(s.coins, 6, "una moneta per ogni stella già guadagnata");
  assert.equal(s.theme, "notte");
  assert.deepEqual(s.ownedArrows, ["classic"]);
});

test("salvataggi sconosciuti o rotti vengono ignorati", () => {
  assert.equal(parseSave(null), null);
  assert.equal(parseSave({ version: 9 }), null);
  assert.equal(parseSave("x"), null);
});

test("un v2 con campi mancanti prende i valori iniziali", () => {
  const s = parseSave({ version: 2, unlocked: 4 })!;
  assert.equal(s.unlocked, 4);
  assert.deepEqual(s.stars, {});
  assert.deepEqual(s.seenChapters, []);
});

import { coinsFor, THEMES, ARROW_STYLES } from "../src/game/cosmetics";

test("regole delle monete e negozio", () => {
  assert.equal(coinsFor.stars(3, 1), 2);
  assert.equal(coinsFor.stars(2, 3), 0, "rigiocare peggio non toglie e non regala");
  assert.equal(coinsFor.daily(true), 5);
  assert.equal(coinsFor.daily(false), 0);
  assert.equal(coinsFor.rush(1299), 12);
  assert.ok(THEMES.filter((t) => t.price > 0).length >= 6);
  assert.ok(ARROW_STYLES.filter((a) => a.price > 0).length >= 4);
});

import { FREE_HINTS, hintsLeft, msUntilMidnight, spendHint } from "../src/game/hints";

test("indizi: 3 al giorno, ricarica a mezzanotte locale", () => {
  let s = { hintDay: "", hintsLeft: 0 };
  assert.equal(hintsLeft(s, "2026-11-17"), FREE_HINTS, "giorno nuovo: scorta piena");
  for (let i = 0; i < 3; i++) s = spendHint(s, "2026-11-17");
  assert.equal(hintsLeft(s, "2026-11-17"), 0);
  assert.deepEqual(spendHint(s, "2026-11-17"), s, "a zero non scende sotto");
  assert.equal(hintsLeft(s, "2026-11-18"), 3, "dopo mezzanotte si ricarica");
  assert.equal(msUntilMidnight(new Date(2026, 10, 17, 23, 59, 0)), 60000);
});
