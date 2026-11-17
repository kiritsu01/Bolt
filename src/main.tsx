import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/bricolage-grotesque/latin-600.css";
import "@fontsource/bricolage-grotesque/latin-800.css";
import "@fontsource/outfit/latin-400.css";
import "@fontsource/outfit/latin-500.css";
import "./styles.css";
import "./effects.css";
import "./features.css";
import { BoltApp } from "@/components/bolt-app";
import { initPwa } from "@/game/pwa";

initPwa();

// Parametri dei link: ?c= sfida (griglia), ?f= amico, ?v= risultato della Sfida di oggi da battere.
function readParam(name: string): string | undefined {
  try {
    return new URLSearchParams(window.location.search).get(name) ?? undefined;
  } catch {
    return undefined;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BoltApp code={readParam("c")} friendCode={readParam("f")} versusCode={readParam("v")} />
  </StrictMode>,
);
