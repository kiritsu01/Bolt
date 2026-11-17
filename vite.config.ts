import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// `npm run build`         -> dist/        (sito statico: GitHub Pages, Netlify, itch.io, portali)
// `npm run build:single`  -> dist-single/ (un solo file index.html, da aprire o inviare)
export default defineConfig(({ mode }) => {
  const single = mode === "single";
  return {
    base: "./",
    plugins: [react(), ...(single ? [viteSingleFile()] : [])],
    resolve: {
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    },
    build: {
      outDir: single ? "dist-single" : "dist",
      emptyOutDir: true,
    },
  };
});
