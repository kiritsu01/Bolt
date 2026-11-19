import { test } from "node:test";
import assert from "node:assert/strict";
import { isNewerBuild } from "../src/game/pwa";

test("aggiornamento: versione online diversa da quella in uso → aggiorna", () => {
  assert.equal(isNewerBuild("fae19af", "a1b2c3d"), true);
});

test("aggiornamento: stessa versione, risposta vuota o build di sviluppo → non aggiorna", () => {
  assert.equal(isNewerBuild("fae19af", "fae19af"), false);
  assert.equal(isNewerBuild("fae19af", undefined), false);
  assert.equal(isNewerBuild("fae19af", ""), false);
  assert.equal(isNewerBuild("fae19af", 42), false);
  assert.equal(isNewerBuild("dev", "a1b2c3d"), false);
  assert.equal(isNewerBuild("fae19af", "dev"), false);
});
