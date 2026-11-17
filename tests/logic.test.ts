import { test } from "node:test";
import assert from "node:assert/strict";
import { campaignSpec, dailySpec, decodeSpec, encodeSpec, isSolvable, makeBoard, rushSpec } from "../src/game/logic";

test("i livelli della campagna sono risolvibili", () => {
  for (let level = 1; level <= 40; level++) {
    assert.ok(isSolvable(makeBoard(campaignSpec(level))), `livello ${level}`);
  }
});

test("Sfida di oggi e Rush sono risolvibili", () => {
  for (let d = 1; d <= 28; d++) assert.ok(isSolvable(makeBoard(dailySpec(`2026-02-${String(d).padStart(2, "0")}`))));
  for (let i = 0; i < 12; i++) assert.ok(isSolvable(makeBoard(rushSpec(i, 12345))));
});

test("i codici sfida fanno andata e ritorno", () => {
  const spec = campaignSpec(9);
  const code = encodeSpec(spec)!;
  assert.equal(code.length, 10);
  assert.deepEqual(decodeSpec(code), spec);
});

import { emojiRow, formatClock, shareMessage } from "../src/game/share";

test("riga di emoji della condivisione", () => {
  assert.equal(emojiRow([1, 2, 0]), "⬜🟧🟥");
  assert.equal([...emojiRow(Array.from({ length: 50 }, () => 1))].length, 12);
  assert.ok(emojiRow([...Array(40).fill(2), 0]).endsWith("🟥"));
  assert.equal(formatClock(75.4), "1:15");
  const msg = shareMessage("it", {
    kind: "daily",
    date: "2026-11-17",
    mistakes: 1,
    maxCombo: 5,
    seconds: 42,
    log: [1, 0, 2],
    url: "https://x.y/?c=ABC",
  });
  assert.match(msg, /Sfida di oggi 17\/11/);
  assert.match(msg, /❌ 1  🔥 x5  ⏱️ 0:42/);
  assert.ok(msg.endsWith("https://x.y/?c=ABC"));
});

import { comboPitch } from "../src/game/audio";

test("il tono sale a ogni mossa della combo, per tre ottave", () => {
  for (let c = 1; c < 16; c++) assert.ok(comboPitch(c + 1) > comboPitch(c), `combo ${c}`);
  assert.ok(Math.abs(comboPitch(16) / comboPitch(1) - 8) < 1e-9);
  assert.equal(comboPitch(30), comboPitch(16));
  assert.ok(comboPitch(1) > 200 && comboPitch(16) < 2200, "mai troppo grave né troppo acuto");
});
