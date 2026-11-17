import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

const root = fileURLToPath(new URL(".", import.meta.url));

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
        .filter((f) => f !== "sw.js" && !f.endsWith(".map"))
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

// `npm run build`         -> dist/        (sito statico: GitHub Pages, Netlify, itch.io, portali) + PWA
// `npm run build:single`  -> dist-single/ (un solo file index.html, da aprire o inviare; senza service worker)
export default defineConfig(({ mode }) => {
  const single = mode === "single";
  return {
    base: "./",
    plugins: [react(), ...(single ? [viteSingleFile()] : [serviceWorker()])],
    resolve: {
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    },
    build: {
      outDir: single ? "dist-single" : "dist",
      emptyOutDir: true,
    },
  };
});
