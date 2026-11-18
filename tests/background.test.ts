import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { THEMES } from "../src/game/cosmetics";
import { CHAPTERS } from "../src/game/chapters";
import {
  GHOST_ALPHA_CAP,
  GHOST_ALPHA_MAX,
  GHOST_ALPHA_MIN,
  HEAT_GOLD,
  blend,
  burstBoost,
  contrastRatio,
  ghostAlpha,
  ghostRgb,
  parseHex,
  speedFactor,
  type GhostSignals,
} from "../src/game/ghosts";

/** Il velo scuro dello sfondo: deve restare allineato a `.bolt-bg::after` in features.css. */
const VEIL = 0.45;

function hsl(hex: string) {
  const [r, g, b] = parseHex(hex).map((v) => v / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === r
      ? ((g - b) / d + (g < b ? 6 : 0)) / 6
      : max === g
        ? ((b - r) / d + 2) / 6
        : ((r - g) / d + 4) / 6;
  return { h: h * 360, s: s * 100, l: l * 100 };
}

/** Sfondo composito: cielo + le tre luci sovrapposte (caso peggiore) + velo scuro. */
function veiledSky(sky: [string, string, string], lights: [string, string, string], veil: string) {
  return sky.map((stop) => {
    let bg = parseHex(stop);
    for (const light of lights) bg = blend(parseHex(light), bg, 0.5);
    return blend(parseHex(veil), bg, VEIL);
  });
}

test("temi e capitoli: cielo luminoso, tre luci e testo AA", () => {
  const skies = [
    ...THEMES.map((theme) => ({ name: theme.id, sky: theme.sky, lights: theme.lights })),
    ...CHAPTERS.map((chapter) => ({ name: `capitolo ${chapter.index + 1}`, sky: chapter.sky, lights: chapter.lights })),
  ];
  for (const { name, sky, lights } of skies) {
    assert.equal(sky.length, 3, `${name}: tre tappe`);
    assert.equal(new Set(lights).size, 3, `${name}: tre luci diverse`);
    for (const stop of sky) {
      const { s, l } = hsl(stop);
      assert.ok(l >= 25, `${name} ${stop}: luminosità ${l.toFixed(1)}% (minimo 25%)`);
      assert.ok(s >= 40, `${name} ${stop}: saturazione ${s.toFixed(1)}%`);
    }
    for (const light of lights) assert.match(light, /^#[0-9a-f]{6}$/i, `${name}: luce valida`);
  }
});

test("velo e pannello: testi secondari e frecce leggibili anche con le tre luci sovrapposte", () => {
  for (const theme of THEMES) {
    const fg = parseHex(theme.colors.fg);
    const muted = parseHex(theme.colors.muted);
    const surface = parseHex(theme.colors.surface);
    // Sul tema si vede il suo cielo; in partita può arrivare il cielo di qualsiasi capitolo.
    const skies = [{ sky: theme.sky, lights: theme.lights }, ...CHAPTERS];
    for (const { sky, lights } of skies) {
      for (const stop of sky) {
        // Il testo principale resta AA anche sul cielo nudo.
        assert.ok(
          contrastRatio(fg, parseHex(stop)) >= 4.5,
          `${theme.id} ${stop}: testo principale ${contrastRatio(fg, parseHex(stop)).toFixed(2)}`,
        );
      }
      for (const bg of veiledSky(sky, lights, theme.colors.bg)) {
        assert.ok(
          contrastRatio(muted, bg) >= 4.5,
          `${theme.id}: testo secondario ${contrastRatio(muted, bg).toFixed(2)}`,
        );
        // La tavola è di vetro scuro: le frecce restano ben oltre il minimo AA.
        const panel = blend(surface, bg, 0.86);
        assert.ok(
          contrastRatio(fg, panel) >= 7,
          `${theme.id}: frecce della griglia ${contrastRatio(fg, panel).toFixed(2)}`,
        );
      }
    }
  }
});

test("frecce fantasma: opacità 0,06-0,10, combo, errore e festa", () => {
  assert.ok(GHOST_ALPHA_MIN >= 0.06);
  assert.ok(GHOST_ALPHA_MAX <= 0.1);
  assert.ok(GHOST_ALPHA_CAP <= 0.1);
  assert.ok(ghostAlpha(GHOST_ALPHA_MAX, 1) <= 0.1);

  const quiet = (): GhostSignals => ({ heat: 0, heatAt: -1e9, missAt: -1e9, burstAt: -1e9 });
  const now = 10_000;

  // Combo: accelerano fino a 3x e vanno verso l'oro.
  const hot = { ...quiet(), heat: 1, heatAt: now };
  assert.equal(speedFactor(quiet(), now), 1);
  assert.equal(speedFactor(hot, now), 3);
  assert.deepEqual(ghostRgb("#ff5a1f", 1), parseHex(HEAT_GOLD));

  // Errore: rallentano subito e tornano normali dopo 0,7 s.
  const miss = { ...quiet(), missAt: now };
  assert.ok(speedFactor(miss, now) <= 0.21);
  assert.equal(speedFactor(miss, now + 700), 1);

  // Festa: spinta verso l'alto solo quando il segnale c'è.
  assert.ok(burstBoost({ ...quiet(), burstAt: now }, now) > 1000);
  assert.equal(burstBoost(quiet(), now), 0);
});

test("lo sfondo ruota in 30 s, luci a metà opacità e ferme con movimento ridotto", () => {
  const css = readFileSync(new URL("../src/features.css", import.meta.url), "utf8");
  assert.match(css, /--bg-a:\s*#4a22b8/);
  assert.match(css, /conic-gradient\(from 210deg, var\(--bg-a\), var\(--bg-b\), var\(--bg-c\), var\(--bg-a\)\)/);
  assert.match(css, /animation:\s*bolt-sky-turn 30s linear infinite/);
  assert.match(css, /--light-a:\s*#ff8a1f/);
  assert.match(css, /--light-b:\s*#ff3d8b/);
  assert.match(css, /--light-c:\s*#3ddcff/);
  assert.match(css, /\.bolt-glow\s*\{[^}]*opacity:\s*0\.5/);
  assert.match(css, /background:\s*color-mix\(in srgb, var\(--color-bg\) 45%, transparent\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.bolt-bg::before,[\s\S]*?\.bolt-glow[\s\S]*?animation: none/);
  assert.doesNotMatch(css, /dot-grid/);
  assert.doesNotMatch(css, /animation:[^;]*background-position/);
});
