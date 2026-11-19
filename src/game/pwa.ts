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

export function isIos() {
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
      navigator.serviceWorker
        .register("./sw.js", { updateViaCache: "none" })
        .then((reg) => {
          registration = reg;
        })
        .catch(() => {
          /* offline non disponibile: il gioco funziona lo stesso */
        });
    });
  }
  if (import.meta.env.MODE === "production" && servable) initAutoUpdate();
}

/* --- Aggiornamento automatico --------------------------------------------------------
 * Ogni volta che BOLT torna in primo piano (e ogni 30 minuti) controlla se è uscita una
 * versione nuova. Se sì, si ricarica da solo, ma solo in un momento sicuro: app in
 * sottofondo oppure giocatore in home. Mai durante un livello o un duello. */

let registration: ServiceWorkerRegistration | null = null;
let updatePending = false;
let reloadSafe = true;
let lastCheck = 0;

const CURRENT_VERSION = typeof __BOLT_VERSION__ === "string" ? __BOLT_VERSION__ : "dev";

/** Da chiamare dal gioco: true quando un ricaricamento non fa perdere nulla (es. in home). */
export function setUpdateSafe(safe: boolean) {
  reloadSafe = safe;
  if (safe) applyUpdateIfPending();
}

/** true se la versione online è diversa da quella in uso (logica pura, testata). */
export function isNewerBuild(current: string, online: unknown): boolean {
  if (typeof online !== "string" || !online || online === "dev" || current === "dev") return false;
  return online !== current;
}

let pendingVersion = "";
const RELOAD_KEY = "bolt-update-reloaded-for";

function applyUpdateIfPending() {
  if (!updatePending) return;
  if (document.visibilityState === "hidden" || reloadSafe) {
    updatePending = false;
    // Una sola ricarica per versione: se il server serve ancora la pagina vecchia per qualche
    // minuto, non si entra in un ciclo di ricariche.
    try {
      if (sessionStorage.getItem(RELOAD_KEY) === pendingVersion) return;
      sessionStorage.setItem(RELOAD_KEY, pendingVersion);
    } catch {
      /* senza sessionStorage si ricarica comunque una volta */
    }
    location.reload();
  }
}

async function checkForUpdate() {
  const now = Date.now();
  if (now - lastCheck < 60_000 || !navigator.onLine) return;
  lastCheck = now;
  void registration?.update().catch(() => {});
  try {
    const res = await fetch(`./dev/build-info.json?t=${now}`, { cache: "no-store" });
    if (!res.ok) return;
    const info = (await res.json()) as { version?: unknown };
    if (isNewerBuild(CURRENT_VERSION, info.version)) {
      pendingVersion = String(info.version);
      updatePending = true;
      applyUpdateIfPending();
    }
  } catch {
    /* senza rete si gioca con la versione salvata */
  }
}

function initAutoUpdate() {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void checkForUpdate();
    else applyUpdateIfPending();
  });
  window.addEventListener("online", () => void checkForUpdate());
  window.setInterval(() => void checkForUpdate(), 30 * 60_000);
  window.addEventListener("load", () => void checkForUpdate());
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
