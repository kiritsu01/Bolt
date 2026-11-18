import { useState } from "react";
import { Star, X } from "lucide-react";
import { copy, type Lang } from "@/game/i18n";
import { COMMENT_MAX, NAME_MAX, type QuestionId } from "@/game/prompts";

type T = (typeof copy)[Lang];

/** "Ti piace BOLT?": 1-5 stelle e un commento facoltativo (max 200 caratteri). */
export function RatingSheet({
  t,
  onSend,
  onLater,
}: {
  t: T;
  onSend: (rating: number, comment: string) => void;
  onLater: () => void;
}) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  return (
    <div className="scrim bolt-sheet-wrap bolt-sheet-top">
      <div className="bolt-rise bolt-sheet rounded-card bg-surface p-6 text-center" role="dialog" aria-modal="true" aria-label={t.rateTitle}>
        <p className="font-display text-2xl font-extrabold">{t.rateTitle}</p>
        <div className="bolt-rate-stars" role="radiogroup" aria-label={t.rateTitle}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={t.rateStars(n)}
              className={n <= rating ? "bolt-rate-star is-on" : "bolt-rate-star"}
              onClick={() => setRating(n)}
            >
              <Star className="size-8" />
            </button>
          ))}
        </div>
        <textarea
          className="bolt-code-box bolt-comment"
          value={comment}
          maxLength={COMMENT_MAX}
          onChange={(e) => setComment(e.target.value.slice(0, COMMENT_MAX))}
          placeholder={t.rateComment}
          aria-label={t.rateComment}
          rows={3}
        />
        <p className="bolt-counter tabular-nums">
          {comment.length}/{COMMENT_MAX}
        </p>
        <div className="mt-3 flex flex-col gap-2">
          <button
            type="button"
            disabled={!rating}
            onClick={() => onSend(rating, comment.trim())}
            className="flex h-12 items-center justify-center rounded-2xl bg-accent font-display font-extrabold text-accent-ink disabled:opacity-40"
          >
            {t.rateSend}
          </button>
          <button type="button" onClick={onLater} className="h-11 text-sm font-semibold text-muted">
            {t.rateLater}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Domanda veloce da un tocco, in home (mai durante la partita). */
export function QuickQuestion({
  t,
  id,
  onAnswer,
  onSkip,
}: {
  t: T;
  id: QuestionId;
  onAnswer: (answer: string) => void;
  onSkip: () => void;
}) {
  const [name, setName] = useState("");
  const q = t.questions[id];
  // Le risposte si registrano sempre con le parole italiane, così i conteggi non dipendono dalla lingua.
  const canonical = copy.it.questions[id].a;
  return (
    <section className="bolt-quick bolt-rise" aria-label={t.quickTitle}>
      <div className="bolt-quick-head">
        <p className="text-xs font-semibold text-muted">{t.quickTitle}</p>
        <button type="button" className="bolt-quick-skip" onClick={onSkip} aria-label={t.quickSkip}>
          <X className="size-4" />
        </button>
      </div>
      <p className="font-display text-lg font-extrabold text-pretty">{q.q}</p>
      {q.a.length ? (
        <div className="bolt-quick-options">
          {q.a.map((label, i) => (
            <button key={label} type="button" className="bolt-quick-option" onClick={() => onAnswer(canonical[i] ?? label)}>
              {label}
            </button>
          ))}
        </div>
      ) : (
        <form
          className="bolt-quick-name"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) onAnswer(name.trim());
          }}
        >
          <input
            className="bolt-input"
            value={name}
            maxLength={NAME_MAX}
            onChange={(e) => setName(e.target.value.slice(0, NAME_MAX))}
            placeholder={t.namePlaceholderGame}
            aria-label={q.q}
            enterKeyHint="send"
          />
          <button type="submit" disabled={!name.trim()} className="bolt-quick-option is-send">
            {t.quickSend}
          </button>
        </form>
      )}
    </section>
  );
}
