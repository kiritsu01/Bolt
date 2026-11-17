/**
 * Quanto festeggiare a fine partita. Regola d'oro: si festeggiano SOLO i successi veri.
 * Una sfida persa o pareggiata non riceve mai coriandoli, titolo trionfale o jingle di vittoria,
 * anche se la griglia è stata chiusa senza errori.
 */

export type Celebration = {
  /** Titolo del pannello: "perfect" (Perfetto), "clear" (Pulito), "done" (Completato), "won" (Vinta!). */
  title: "perfect" | "clear" | "done" | "won";
  confetti: boolean;
  /** Suono finale: accordo di vittoria, nota calma o nulla. */
  sound: "win" | "calm" | "none";
  /** Le stelle guadagnate suonano mentre vengono contate. */
  starSounds: boolean;
};

export function celebrationFor(input: { stars: number; versus?: "me" | "other" | "tie" }): Celebration {
  const { stars, versus } = input;
  if (versus === "other") return { title: "done", confetti: false, sound: "calm", starSounds: false };
  if (versus === "tie") return { title: "done", confetti: false, sound: "calm", starSounds: false };
  if (versus === "me") return { title: "won", confetti: true, sound: "win", starSounds: true };
  if (stars >= 3) return { title: "perfect", confetti: true, sound: "win", starSounds: true };
  if (stars === 2) return { title: "clear", confetti: true, sound: "win", starSounds: true };
  // Una sola stella: livello superato ma con molti errori. Nessuna festa, solo il conteggio.
  return { title: "clear", confetti: false, sound: "calm", starSounds: true };
}

/** Fine del Rush: si festeggia solo un record nuovo (e con punti veri). */
export function rushCelebration(score: number, previousBest: number): Celebration {
  if (score > 0 && score > previousBest) return { title: "won", confetti: true, sound: "win", starSounds: false };
  return { title: "done", confetti: false, sound: "calm", starSounds: false };
}
