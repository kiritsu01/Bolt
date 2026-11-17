/**
 * Pubblicità: questo è l'UNICO punto da collegare a un circuito vero
 * (AdMob, AppLixir, Poki/CrazyGames SDK, ...). Il resto del gioco chiama solo showRewardedAd().
 *
 * Oggi l'annuncio è simulato: un pannello a tutto schermo con un conto alla rovescia di 3 secondi.
 * Contratto da rispettare anche con l'SDK vero:
 * - restituisce una Promise che si risolve a true solo se l'annuncio è stato visto fino in fondo
 *   (allora il gioco dà la ricompensa), a false se è stato chiuso prima, non disponibile o in errore;
 * - non deve mai rifiutare (reject): in caso di problemi risolve a false.
 */

export type AdLabels = { title: string; wait: string; close: string; reward: string };

const SIMULATED_MS = 3000;

let showing = false;

export function showRewardedAd(labels: AdLabels): Promise<boolean> {
  if (showing || typeof document === "undefined") return Promise.resolve(false);
  showing = true;
  return new Promise<boolean>((resolve) => {
    const shade = document.createElement("div");
    shade.className = "bolt-ad";
    shade.setAttribute("role", "dialog");
    shade.setAttribute("aria-modal", "true");
    shade.setAttribute("aria-label", labels.title);
    const tag = document.createElement("p");
    tag.className = "bolt-ad-tag";
    tag.textContent = labels.title;
    const count = document.createElement("p");
    count.className = "bolt-ad-count";
    const note = document.createElement("p");
    note.className = "bolt-ad-note";
    note.textContent = labels.wait;
    const close = document.createElement("button");
    close.type = "button";
    close.className = "bolt-ad-close";
    close.textContent = labels.close;
    shade.append(tag, count, note, close);
    document.body.append(shade);

    const started = performance.now();
    let timer = 0;
    const finish = (watched: boolean) => {
      window.clearInterval(timer);
      shade.remove();
      showing = false;
      resolve(watched);
    };
    const tick = () => {
      const left = Math.max(0, SIMULATED_MS - (performance.now() - started));
      count.textContent = String(Math.ceil(left / 1000));
      if (left <= 0) {
        note.textContent = labels.reward;
        window.clearInterval(timer);
        window.setTimeout(() => finish(true), 450);
      }
    };
    close.addEventListener("click", () => finish(false));
    tick();
    timer = window.setInterval(tick, 100);
    close.focus();
  });
}
