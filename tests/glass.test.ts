import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { THEMES } from "../src/game/cosmetics";
import { CHAPTERS } from "../src/game/chapters";
import { blend, contrastRatio, parseHex } from "../src/game/ghosts";
import { applyPerfHints, isLowPowerDevice } from "../src/game/perf";

const css = readFileSync(new URL("../src/features.css", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/components/bolt-app.tsx", import.meta.url), "utf8");
/** Deve restare allineato alla tinta di `.bolt-glass-soft` in features.css. */
const GLASS = 0.42;
/** Velo scuro dello sfondo, come `.bolt-bg::after`. */
const VEIL = 0.45;

/** Solo la sezione del vetro, per non pescare regole omonime altrove. */
const glassCss = css.slice(css.indexOf("/* --- Vetro liquido"), css.indexOf(".bolt-duel-screen"));

function veiledSky(sky: [string, string, string], lights: [string, string, string], veil: string) {
  return sky.map((stop) => {
    let bg = parseHex(stop);
    for (const light of lights) bg = blend(parseHex(light), bg, 0.5);
    return blend(parseHex(veil), bg, VEIL);
  });
}

test("i sei pulsanti della home sono di vetro, con bagliori sfalsati", () => {
  for (let i = 0; i < 6; i++) {
    assert.ok(app.includes(`"--glass-i": ${i}`), `pulsante ${i + 1}: sfalsamento presente`);
  }
  assert.equal((app.match(/bolt-glass-soft/g) ?? []).length, 4, "quattro secondari di vetro");
  assert.ok((app.match(/bolt-glass-main/g) ?? []).length >= 2, "Livello e Duello mantengono il loro gradiente");
  assert.match(app, /bolt-main-btn bolt-glass bolt-glass-main/);
  assert.match(app, /bolt-main-btn bolt-duel-btn bolt-glass bolt-glass-main/);
});

test("vetro leggero: tinta 42%, bordo chiaro, riflesso 15% e blur max 8px", () => {
  assert.match(glassCss, /\.bolt-glass-soft\s*\{[^}]*color-mix\(in srgb, var\(--color-surface\) 42%, transparent\)/);
  assert.match(glassCss, /\.bolt-glass-soft\s*\{[^}]*border-color:\s*rgb\(255 255 255 \/ 0\.22\)/);
  assert.match(glassCss, /\.bolt-glass::before\s*\{[^}]*rgb\(255 255 255 \/ 0\.15\)/);
  assert.match(glassCss, /backdrop-filter:\s*blur\(8px\)/);
  assert.doesNotMatch(glassCss, /blur\((?:9|1\d|[2-9]\d|\d{3,})px\)/);
  assert.doesNotMatch(glassCss, /(?:filter|backdrop-filter):\s*url\(/);
  assert.doesNotMatch(glassCss, /feDisplacementMap|feTurbulence|filter:\s*url\(#/);
});

test("bagliore ogni 7 s, sfalsato, e nessun filtro SVG di distorsione", () => {
  assert.match(glassCss, /animation:\s*bolt-glass-sheen 7s calc\(var\(--glass-i, 0\) \* -1\.15s\)/);
  assert.match(glassCss, /@keyframes bolt-glass-sheen[\s\S]*?translateX\(-140%\)[\s\S]*?translateX\(430%\)/);
  assert.doesNotMatch(css, /<filter|feDisplacementMap|feTurbulence/);
});

test("tocco a goccia con rimbalzo, spento con movimento ridotto", () => {
  assert.match(glassCss, /\.bolt-glass:active:not\(:disabled\)\s*\{[^}]*transform:\s*scale\(0\.94\) scaleX\(1\.035\)/);
  assert.match(glassCss, /transition:\s*transform 420ms cubic-bezier\(0\.34, 1\.56, 0\.64, 1\)/);
  assert.match(
    glassCss,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.bolt-glass::after\s*\{[^}]*animation:\s*none[^}]*\}[\s\S]*?\.bolt-glass:active:not\(:disabled\)\s*\{[^}]*transform:\s*none/,
  );
});

test("blur spento su dispositivi lenti e con trasparenza ridotta", () => {
  assert.match(
    glassCss,
    /:root\[data-low-power="true"\] \.bolt-glass-soft\s*\{[^}]*backdrop-filter:\s*none/,
  );
  assert.match(
    glassCss,
    /@media \(prefers-reduced-transparency: reduce\)[\s\S]*?\.bolt-glass-soft\s*\{[^}]*backdrop-filter:\s*none/,
  );
});

test("rilevamento dispositivo lento e attributo su <html>", () => {
  assert.equal(isLowPowerDevice({ cores: 4 }), true);
  assert.equal(isLowPowerDevice({ memory: 3 }), true);
  assert.equal(isLowPowerDevice({ saveData: true }), true);
  assert.equal(isLowPowerDevice({ cores: 8, memory: 8 }), false);
  assert.equal(isLowPowerDevice({}), false);

  const root = { dataset: {} as Record<string, string> };
  const doc = { documentElement: root } as unknown as Document;

  applyPerfHints(doc, { hardwareConcurrency: 4 } as Navigator);
  assert.equal(root.dataset.lowPower, "true");
  applyPerfHints(doc, { hardwareConcurrency: 8, deviceMemory: 8 } as unknown as Navigator);
  assert.equal(root.dataset.lowPower, "false");
});

test("testo e icone del vetro restano AA su ogni tema e capitolo", () => {
  for (const theme of THEMES) {
    const fg = parseHex(theme.colors.fg);
    const accent = parseHex(theme.colors.accent);
    const surface = parseHex(theme.colors.surface);
    let minText = Infinity;
    let minIcon = Infinity;
    // Sul tema si vede il suo cielo; in partita può arrivare il cielo di qualsiasi capitolo.
    for (const { sky, lights } of [{ sky: theme.sky, lights: theme.lights }, ...CHAPTERS]) {
      for (const bg of veiledSky(sky, lights, theme.colors.bg)) {
        const glass = blend(surface, bg, GLASS);
        // Il testo può finire sotto il riflesso più intenso: si misura lì.
        const glossy = blend([255, 255, 255], glass, 0.15);
        minText = Math.min(minText, contrastRatio(fg, glossy));
        // Le icone stanno al centro, dove il riflesso è già svanito.
        minIcon = Math.min(minIcon, contrastRatio(accent, glass));
      }
    }
    assert.ok(minText >= 4.5, `${theme.id}: testo ${minText.toFixed(2)}:1`);
    assert.ok(minIcon >= 3, `${theme.id}: icone ${minIcon.toFixed(2)}:1`);
  }
});
