/** PWA: registrazione del service worker e invito ad aggiungere BOLT alla schermata Home. */

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferred: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((cb) => cb());

export function isStandalone() {
  try {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true
    );
  } catch {
    return false;
  }
}

function isIos() {
  const ua = navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/** Da chiamare all'avvio: registra il service worker (solo build pubblicata) e intercetta l'invito del browser. */
export function initPwa() {
  if (typeof window === "undefined") return;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    installed = true;
    deferred = null;
    notify();
  });
  const servable = location.protocol === "https:" || location.hostname === "localhost";
  if (import.meta.env.MODE === "production" && servable && "serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {
        /* offline non disponibile: il gioco funziona lo stesso */
      });
    });
  }
}

/**
 * Come si può installare qui: "prompt" (Chrome/Edge/Android: pulsante Installa),
 * "ios" (Safari: istruzioni Condividi > Aggiungi a Home), "none" (già installata o non possibile).
 */
export function installMode(): "prompt" | "ios" | "none" {
  if (installed || isStandalone()) return "none";
  if (deferred) return "prompt";
  if (isIos()) return "ios";
  return "none";
}

export async function promptInstall() {
  const ev = deferred;
  if (!ev) return false;
  deferred = null;
  notify();
  try {
    await ev.prompt();
    const choice = await ev.userChoice;
    return choice.outcome === "accepted";
  } catch {
    return false;
  }
}

export function onPwaChange(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
