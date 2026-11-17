import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/bricolage-grotesque/latin-600.css";
import "@fontsource/bricolage-grotesque/latin-800.css";
import "@fontsource/outfit/latin-400.css";
import "@fontsource/outfit/latin-500.css";
import "./styles.css";
import "./effects.css";
import { BoltApp } from "@/components/bolt-app";

// Il codice di una sfida arriva nel link come ?c=CODICE (lo crea "Sfida un amico").
function readChallengeCode(): string | undefined {
  try {
    const c = new URLSearchParams(window.location.search).get("c");
    return c ?? undefined;
  } catch {
    return undefined;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BoltApp code={readChallengeCode()} />
  </StrictMode>,
);
