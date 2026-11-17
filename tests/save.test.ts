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
