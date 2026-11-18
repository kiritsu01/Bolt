import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

const root = fileURLToPath(new URL(".", import.meta.url));

function git(cmd: string) {
  try {
    return execSync(`git ${cmd}`, { cwd: root, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "";
  }
}

/** Versione del gioco: commit corto della build (con "+" se ci sono modifiche non salvate). */
function buildVersion() {
  const sha = git("rev-parse --short=7 HEAD") || "dev";
  const dirty = git("status --porcelain --untracked-files=no");
  return dirty ? `${sha}+` : sha;
}

/** I file della pagina /dev/ (Tracker) non fanno parte del gioco: niente precache, niente service worker del gioco. */
const isTrackerFile = (f: string) => f.startsWith("dev/") || /^assets\/tracker-/.test(f);

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

/**
 * Crea dist/sw.js (service worker per giocare offline) a partire da src/pwa/sw-template.js,
 * con l'elenco di tutti i file della build e di public/. Nessuna dipendenza esterna.
 */
function serviceWorker(): Plugin {
  return {
    name: "bolt-service-worker",
    apply: "build",
    generateBundle(_options, bundle) {
      const publicDir = join(root, "public");
      const publicFiles = listFiles(publicDir).map((f) => relative(publicDir, f).split("\\").join("/"));
      const files = ["./", "index.html", ...publicFiles, ...Object.keys(bundle)]
        .filter((f) => f !== "sw.js" && !f.endsWith(".map") && !isTrackerFile(f))
        .map((f) => (f === "./" ? f : `./${f}`));
      const unique = [...new Set(files)].sort();
      const template = readFileSync(join(root, "src/pwa/sw-template.js"), "utf8");
      const version = createHash("sha256").update(unique.join("|") + template).digest("hex").slice(0, 12);
      const source = template
        .replace("__VERSION__", version)
        .replace("__PRECACHE__", JSON.stringify(unique, null, 2));
      this.emitFile({ type: "asset", fileName: "sw.js", source });
    },
  };
}

/**
 * Per il Tracker: dev/releases.json (rilasci dai commit: versione, data, note) e
 * dev/build-info.json (versione, numero di test, peso della build).
 */
function trackerData(version: string): Plugin {
  return {
    name: "bolt-tracker-data",
    apply: "build",
    generateBundle(_options, bundle) {
      const raw = git("log -n 80 --no-merges --date=iso-strict --pretty=format:%h%x1f%cI%x1f%s%x1f%b%x1e");
      const releases = raw
        .split("\x1e")
        .map((r) => r.trim())
        .filter(Boolean)
        .map((r) => {
          const [sha, date, title, body] = r.split("\x1f");
          const notes = (body ?? "")
            .split("\n")
            .filter((l) => l.trim() && !/^(Co-Authored-By|Claude-Session):/i.test(l))
            .join(" ")
            .slice(0, 400);
          return { version: sha, date, title, notes };
        });
      this.emitFile({ type: "asset", fileName: "dev/releases.json", source: JSON.stringify(releases) });
      let tests = 0;
      try {
        for (const f of readdirSync(join(root, "tests"))) {
          if (f.endsWith(".test.ts")) tests += (readFileSync(join(root, "tests", f), "utf8").match(/^test\(/gm) ?? []).length;
        }
      } catch {
        tests = 0;
      }
      let total = 0;
      let game = 0;
      for (const [name, item] of Object.entries(bundle)) {
        const size = item.type === "chunk" ? Buffer.byteLength(item.code) : typeof item.source === "string" ? Buffer.byteLength(item.source) : item.source.byteLength;
        total += size;
        if (!isTrackerFile(name)) game += size;
      }
      this.emitFile({
        type: "asset",
        fileName: "dev/build-info.json",
        source: JSON.stringify({ version, builtAt: new Date().toISOString(), tests, bytesTotal: total, bytesGame: game }),
      });
    },
  };
}

// `npm run build`         -> dist/        (sito statico: GitHub Pages, Netlify, itch.io, portali) + PWA
// `npm run build:single`  -> dist-single/ (un solo file index.html, da aprire o inviare; senza service worker)
export default defineConfig(({ mode }) => {
  const single = mode === "single";
  const version = buildVersion();
  return {
    base: "./",
    define: { __BOLT_VERSION__: JSON.stringify(version) },
    plugins: [react(), ...(single ? [viteSingleFile()] : [serviceWorker(), trackerData(version)])],
    resolve: {
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    },
    build: {
      outDir: single ? "dist-single" : "dist",
      emptyOutDir: true,
      // Due pagine: il gioco (index.html) e il Tracker (dev/index.html), con file separati.
      rollupOptions: single
        ? undefined
        : {
            input: { index: join(root, "index.html"), tracker: join(root, "dev/index.html") },
          },
    },
  };
});
