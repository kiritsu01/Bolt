import { test } from "node:test";
import assert from "node:assert/strict";
import { backupSummary, decodeBackup, encodeBackup } from "../src/game/backup";
import { defaultSave, parseSave } from "../src/game/save";
import { iosHomeTipDue } from "../src/game/pwa-tip";

const rich = () =>
  parseSave({
    version: 4,
    unlocked: 23,
    stars: { "1": 3, "2": 3, "3": 2 },
    coins: 87,
    playerId: "RZVNXX",
    playerName: "Zoë 🎈",
    friends: [{ id: "GZULKA", name: "Giulia", level: 23, stars: 46, streak: 3, date: "2026-11-17" }],
    theme: "oceano",
    ownedThemes: ["notte", "oceano"],
  })!;

test("esporta e reimporta: stesso salvataggio, versione 4", () => {
  const save = rich();
  const code = encodeBackup(save);
  assert.match(code, /^BOLT1\.[A-Za-z0-9_-]+\.[0-9a-z]+$/);
  const back = decodeBackup(code)!;
  assert.equal(back.version, 4);
  assert.deepEqual(back, save);
  assert.deepEqual(backupSummary(back), { level: 23, stars: 8, coins: 87, friends: 1, name: "Zoë 🎈" });
});

test("il codice incollato tollera spazi e a capo", () => {
  const code = encodeBackup(rich());
  const messy = `  ${code.slice(0, 30)}\n${code.slice(30, 80)} \r\n${code.slice(80)}  `;
  assert.deepEqual(decodeBackup(messy), rich());
});

test("codici rotti, manomessi o di altro tipo vengono rifiutati", () => {
  const code = encodeBackup(rich());
  const [p, body, sum] = code.split(".");
  const flipped = body!.slice(0, 10) + (body![10] === "A" ? "B" : "A") + body!.slice(11);
  for (const bad of ["", "ciao", `${p}.${body}`, `${p}.${flipped}.${sum}`, `BOLT2.${body}.${sum}`, code.slice(0, -2), "BOLT1.!!!.x"]) {
    assert.equal(decodeBackup(bad), null, bad.slice(0, 20));
  }
  assert.equal(decodeBackup(null), null);
});

test("un codice creato da un salvataggio convertito dalla v1 resta v4", () => {
  const v1 = { version: 1, unlocked: 9, stars: { "1": 3 }, bestRush: 900, streak: 2, lastDay: "", daily: {}, sound: true, lang: "it", clears: 9 };
  const back = decodeBackup(encodeBackup(parseSave(v1)!))!;
  assert.equal(back.version, 4);
  assert.equal(back.unlocked, 9);
  assert.equal(back.bestRush, 900);
});

test("il salvataggio iniziale si esporta e reimporta", () => {
  const s = defaultSave();
  assert.deepEqual(decodeBackup(encodeBackup(s)), s);
});

test("invito iPhone: una volta sola, dopo il livello 5, solo su Safari non installato", () => {
  assert.equal(iosHomeTipDue({ ios: true, standalone: false, unlocked: 5, seen: false }), false, "livello 5 non ancora finito");
  assert.equal(iosHomeTipDue({ ios: true, standalone: false, unlocked: 6, seen: false }), true);
  assert.equal(iosHomeTipDue({ ios: true, standalone: false, unlocked: 6, seen: true }), false, "una volta sola");
  assert.equal(iosHomeTipDue({ ios: false, standalone: false, unlocked: 30, seen: false }), false, "non iPhone");
  assert.equal(iosHomeTipDue({ ios: true, standalone: true, unlocked: 30, seen: false }), false, "già sulla Home");
});
