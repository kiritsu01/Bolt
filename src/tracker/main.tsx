import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/bricolage-grotesque/latin-600.css";
import "@fontsource/bricolage-grotesque/latin-800.css";
import "@fontsource/outfit/latin-400.css";
import "@fontsource/outfit/latin-500.css";
import "./tracker.css";
import { TrackerApp } from "./app";

// Service worker proprio del Tracker (scope /Bolt/dev/), separato da quello del gioco.
if (import.meta.env.PROD && "serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch(() => {});
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TrackerApp />
  </StrictMode>,
);
