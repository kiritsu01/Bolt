/**
 * Domande ai giocatori (anonime, via telemetria):
 * - "Ti piace BOLT?" 1-5 stelle + commento facoltativo: una volta sola, dopo il livello 5;
 * - domande veloci da un tocco: al massimo una ogni 3 giorni, solo in home (mai in partita),
 *   dalla terza apertura del gioco, ognuna una volta sola (risposta o saltata).
 * Lo stato sta in una chiave a parte (il salvataggio resta alla versione 4).
 */

export type QuestionId = "fav_chapter" | "mode_pref" | "play_time" | "would_buy" | "discovery" | "game_name";
export const QUESTION_IDS: QuestionId[] = ["mode_pref", "fav_chapter", "play_time", "discovery", "would_buy", "game_name"];

export const PROMPT_KEY = "bolt-prompts";
export const QUESTION_GAP_MS = 3 * 86_400_000;
export const COMMENT_MAX = 200;
export const NAME_MAX = 30;

export type PromptState = {
  opens: number;
  ratingDone: boolean;
  asked: Partial<Record<QuestionId, number>>;
  lastQuestionAt: number;
};

export const freshPromptState = (): PromptState => ({ opens: 0, ratingDone: false, asked: {}, lastQuestionAt: 0 });

export function parsePromptState(raw: string | null): PromptState {
  try {
    const p = raw ? (JSON.parse(raw) as Partial<PromptState>) : {};
    return {
      opens: Number.isFinite(p.opens) ? Number(p.opens) : 0,
      ratingDone: p.ratingDone === true,
      asked: p.asked && typeof p.asked === "object" ? p.asked : {},
      lastQuestionAt: Number.isFinite(p.lastQuestionAt) ? Number(p.lastQuestionAt) : 0,
    };
  } catch {
    return freshPromptState();
  }
}

/** "Ti piace BOLT?": dopo aver finito il livello 5, una volta. */
export function ratingDue(s: PromptState, unlocked: number, enabled: boolean) {
  return enabled && !s.ratingDone && unlocked > 5;
}

/** Prossima domanda veloce, oppure null se non è il momento. */
export function nextQuestion(s: PromptState, now: number, enabled: boolean, unlocked: number): QuestionId | null {
  if (!enabled || s.opens < 3 || !s.ratingDone || unlocked < 3) return null;
  if (now - s.lastQuestionAt < QUESTION_GAP_MS) return null;
  return QUESTION_IDS.find((q) => s.asked[q] === undefined) ?? null;
}

export function markAsked(s: PromptState, q: QuestionId, now: number): PromptState {
  return { ...s, asked: { ...s.asked, [q]: now }, lastQuestionAt: now };
}
