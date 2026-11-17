import { test } from "node:test";
import assert from "node:assert/strict";
import { celebrationFor, rushCelebration } from "../src/game/celebrate";

test("si festeggiano solo i successi veri", () => {
  // Sfida persa o pari: mai coriandoli né jingle di vittoria, anche con 3 stelle.
  for (const versus of ["other", "tie"] as const) {
    for (const stars of [1, 2, 3]) {
      const c = celebrationFor({ stars, versus });
      assert.equal(c.confetti, false, `${versus} ${stars}`);
      assert.notEqual(c.sound, "win");
      assert.equal(c.title, "done");
      assert.equal(c.starSounds, false);
    }
  }
  // Sfida vinta: festa piena.
  const won = celebrationFor({ stars: 1, versus: "me" });
  assert.equal(won.confetti, true);
  assert.equal(won.sound, "win");
  assert.equal(won.title, "won");
  // Senza confronto: 3 e 2 stelle si festeggiano, 1 stella no.
  assert.equal(celebrationFor({ stars: 3 }).title, "perfect");
  assert.equal(celebrationFor({ stars: 3 }).confetti, true);
  assert.equal(celebrationFor({ stars: 2 }).confetti, true);
  assert.equal(celebrationFor({ stars: 1 }).confetti, false);
  assert.equal(celebrationFor({ stars: 1 }).sound, "calm");
});

test("Rush: festa solo con un record nuovo vero", () => {
  assert.equal(rushCelebration(5000, 4000).confetti, true);
  assert.equal(rushCelebration(4000, 4000).confetti, false, "pareggiare il record non è un record");
  assert.equal(rushCelebration(3000, 4000).confetti, false);
  assert.equal(rushCelebration(0, 0).confetti, false, "zero punti non si festeggia");
});

import { coinSteps } from "../src/game/celebrate";

test("monete contate: arrivano esattamente al totale, al massimo 12 tic", () => {
  assert.deepEqual(coinSteps(3), [1, 2, 3]);
  assert.deepEqual(coinSteps(0), []);
  const big = coinSteps(47);
  assert.equal(big.length, 12);
  assert.equal(big.at(-1), 47);
  for (let i = 1; i < big.length; i++) assert.ok(big[i]! > big[i - 1]!);
});

import { copy } from "../src/game/i18n";

test("errori: singolare quando è uno", () => {
  assert.equal(copy.it.mistakesN(1), "1 errore");
  assert.equal(copy.it.mistakesN(0), "0 errori");
  assert.equal(copy.it.mistakesN(3), "3 errori");
  assert.equal(copy.en.mistakesN(1), "1 miss");
  assert.equal(copy.en.mistakesN(2), "2 misses");
});
