import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GHOST_ALPHA_CAP,
  GHOST_ALPHA_MAX,
  GHOST_ALPHA_MIN,
  HEAT_GOLD,
  type GhostSignals,
  blend,
  burstBoost,
  contrastRatio,
  createGhosts,
  effectiveHeat,
  ghostAlpha,
  ghostCount,
  ghostRgb,
  parseHex,
  shouldDraw,
  speedFactor,
  stepGhosts,
} from "../src/game/ghosts";
import { mulberry32 } from "../src/game/logic";
import { THEMES } from "../src/game/cosmetics";
import { CHAPTERS } from "../src/game/chapters";

const quiet = (): GhostSignals => ({ heat: 0, heatAt: -1e9, missAt: -1e9, burstAt: -1e9 });

test("tra 20 e 30 fantasmi, tenui, di dimensioni e velocità diverse", () => {
  assert.equal(ghostCount(390, 844), 20);
  assert.equal(ghostCount(844, 390), 20);
  assert.equal(ghostCount(2560, 1440), 30);
  const gs = createGhosts(390, 844, mulberry32(7));
  assert.equal(gs.length, 20);
  for (const g of gs) {
    assert.ok(g.alpha >= GHOST_ALPHA_MIN && g.alpha <= GHOST_ALPHA_MAX);
    assert.ok(g.size >= 14 && g.size <= 48);
    assert.ok(g.speed > 0);
  }
  assert.ok(new Set(gs.map((g) => Math.round(g.size))).size > 8, "dimensioni varie");
  assert.ok(new Set(gs.map((g) => Math.round(g.speed))).size > 5, "velocità varie");
});

test("salgono piano e rientrano dal basso", () => {
  const rand = mulberry32(3);
  const gs = createGhosts(390, 844, rand);
  const y0 = gs.map((g) => g.y);
  stepGhosts(gs, 0.1, 390, 844, 0, quiet(), rand);
  gs.forEach((g, i) => assert.ok(g.y < y0[i]!, "salgono"));
  // Dopo molto tempo sono ancora tutte lì (rientrate dal basso), sempre 20.
  for (let i = 0; i < 2000; i++) stepGhosts(gs, 0.1, 390, 844, i * 100, quiet(), rand);
  assert.equal(gs.length, 20);
  for (const g of gs) assert.ok(g.y < 844 * 2 && g.y > -100);
});

test("la combo le accelera e le scalda fino all'oro", () => {
  const now = 10_000;
  const s = { ...quiet(), heat: 0, heatAt: now };
  assert.equal(speedFactor(s, now), 1);
  s.heat = 0.5;
  const mid = speedFactor(s, now);
  s.heat = 1;
  const top = speedFactor(s, now);
  assert.ok(mid > 1 && top > mid && top <= 3);
  assert.deepEqual(ghostRgb("#ff5a1f", 0), parseHex("#ff5a1f"));
  assert.deepEqual(ghostRgb("#ff5a1f", 1), parseHex(HEAT_GOLD));
  // Fuori dalla partita il calore non viene aggiornato e torna a zero.
  assert.equal(effectiveHeat(s, now + 1000), 0);
});

test("un errore le rallenta per un attimo, poi tornano normali", () => {
  const s = { ...quiet(), missAt: 5000 };
  assert.ok(speedFactor(s, 5000) <= 0.21, "subito quasi ferme");
  assert.ok(speedFactor(s, 5350) < 1, "ancora lente");
  assert.equal(speedFactor(s, 5800), 1, "dopo 0,7 s di nuovo normali");
});

test("festa: schizzano via verso l'alto e poi si riformano", () => {
  const rand = mulberry32(11);
  const gs = createGhosts(390, 844, rand);
  const s = { ...quiet(), burstAt: 1000 };
  assert.ok(burstBoost(s, 1000) > 1000, "spinta forte");
  assert.equal(burstBoost(s, 3000), 0, "la spinta finisce");
  assert.equal(burstBoost(quiet(), 1000), 0, "senza festa nessuna spinta");
  const y0 = gs.map((g) => g.y);
  stepGhosts(gs, 0.033, 390, 844, 1000, s, rand);
  const moved = gs.map((g, i) => y0[i]! - g.y);
  assert.ok(Math.min(...moved.filter((m) => m > 0)) > 25, "in un fotogramma salgono molto");
  for (let t = 1033; t < 6000; t += 33) stepGhosts(gs, 0.033, 390, 844, t, s, rand);
  assert.equal(gs.length, 20);
  assert.ok(gs.some((g) => g.y > 0 && g.y < 844), "dopo la festa tornano a vedersi");
});

test("al massimo 30 fotogrammi al secondo", () => {
  let last = 0;
  let frames = 0;
  for (let t = 0; t <= 1000; t += 1000 / 120) {
    if (shouldDraw(last, t)) {
      frames++;
      last = t;
    }
  }
  assert.ok(frames >= 28 && frames <= 31, `${frames} fps`);
});

test("contrasto: i fantasmi non competono mai con le frecce della griglia", () => {
  // Accenti possibili: quelli dei temi e quelli dei capitoli, alla combo massima (oro) compresa.
  const accents = [...THEMES.map((t) => t.colors.accent), ...CHAPTERS.map((c) => c.accent).filter(Boolean)] as string[];
  for (const theme of THEMES) {
    const bg = parseHex(theme.colors.bg);
    const surface = parseHex(theme.colors.surface);
    const arrow = parseHex(theme.colors.fg);
    const arrowContrast = contrastRatio(arrow, surface);
    assert.ok(arrowContrast > 7, `${theme.id}: frecce della griglia ben leggibili (${arrowContrast.toFixed(1)})`);
    for (const accent of accents) {
      for (const heat of [0, 1]) {
        const a = ghostAlpha(GHOST_ALPHA_MAX, heat);
        assert.ok(a <= GHOST_ALPHA_CAP);
        const ghost = blend(ghostRgb(accent, heat), bg, a);
        const ghostContrast = contrastRatio(ghost, bg);
        // Un fantasma si distingue appena dal fondo: almeno 6 volte meno delle frecce di gioco.
        assert.ok(ghostContrast < 1.35, `${theme.id} ${accent} heat ${heat}: ${ghostContrast.toFixed(2)}`);
        assert.ok(arrowContrast / ghostContrast > 6);
      }
    }
  }
});
