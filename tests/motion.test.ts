import { test } from "node:test";
import assert from "node:assert/strict";
import { OVERSHOOT, crossTime, flyDistance, flyDuration, flyFade, flyStretch } from "../src/game/motion";

test("volo delle frecce: carica breve, poi accelerazione continua fino oltre il bordo", () => {
  for (const dist of [1, 3, 8]) {
    assert.ok(Math.abs(flyDistance(0, dist, false)) < 1e-12);
    assert.ok(Math.abs(flyDistance(1, dist, false) - (dist + OVERSHOOT)) < 1e-9);
    // Carica: arretra poco (mai più di un sesto di cella).
    let min = 0;
    for (let t = 0; t <= 0.2; t += 0.005) min = Math.min(min, flyDistance(t, dist, false));
    assert.ok(min < 0 && min > -0.17);
    // Dopo la carica non torna mai indietro e non rallenta: niente scatti.
    let prev = flyDistance(0.16, dist, false);
    let prevStep = 0;
    for (let t = 0.17; t <= 1.0001; t += 0.01) {
      const p = flyDistance(t, dist, false);
      const step = p - prev;
      assert.ok(step >= -1e-9, `t=${t}`);
      assert.ok(step >= prevStep - 1e-6, `accelerazione t=${t}`);
      prev = p;
      prevStep = step;
    }
    const tc = crossTime(dist, false);
    assert.ok(Math.abs(flyDistance(tc, dist, false) - dist) < 1e-3, "il bordo si passa al tempo calcolato");
  }
});

test("deformazione, dissolvenza e durata restano in limiti gradevoli", () => {
  for (let t = 0; t <= 1; t += 0.02) {
    const s = flyStretch(t, false);
    assert.ok(s >= 0.83 && s <= 1.43, `stretch ${s}`);
  }
  assert.equal(flyFade(0, 5).alpha, 1);
  assert.ok(flyFade(5 + OVERSHOOT, 5).alpha < 0.05);
  assert.ok(flyDuration(1, false) < flyDuration(8, false));
  assert.ok(flyDuration(8, false) < 0.55, "anche i voli lunghi restano rapidi");
  assert.equal(flyStretch(0.5, true), 1, "con movimento ridotto niente deformazioni");
});
