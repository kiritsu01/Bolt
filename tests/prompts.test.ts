import { test } from "node:test";
import assert from "node:assert/strict";
import { QUESTION_GAP_MS, freshPromptState, markAsked, nextQuestion, parsePromptState, ratingDue } from "../src/game/prompts";

test("valutazione: una volta, solo dopo il livello 5 e con le statistiche attive", () => {
  const s = freshPromptState();
  assert.equal(ratingDue(s, 5, true), false);
  assert.equal(ratingDue(s, 6, true), true);
  assert.equal(ratingDue(s, 6, false), false);
  assert.equal(ratingDue({ ...s, ratingDone: true }, 30, true), false);
});

test("domande veloci: non prima della terza apertura, una ogni 3 giorni, ognuna una volta", () => {
  const now = Date.UTC(2026, 10, 18);
  let s = { ...freshPromptState(), ratingDone: true, opens: 2 };
  assert.equal(nextQuestion(s, now, true, 8), null, "troppo presto");
  s = { ...s, opens: 3 };
  const q1 = nextQuestion(s, now, true, 8)!;
  assert.ok(q1);
  s = markAsked(s, q1, now);
  assert.equal(nextQuestion(s, now + 3600_000, true, 8), null, "non subito un'altra");
  const q2 = nextQuestion(s, now + QUESTION_GAP_MS, true, 8)!;
  assert.ok(q2 && q2 !== q1);
  let t = now;
  for (let i = 0; i < 10; i++) {
    t += QUESTION_GAP_MS;
    const q = nextQuestion(s, t, true, 8);
    if (!q) break;
    s = markAsked(s, q, t);
  }
  assert.equal(Object.keys(s.asked).length, 6, "tutte e sei, poi basta");
  assert.equal(nextQuestion(s, t + 10 * QUESTION_GAP_MS, true, 8), null);
  assert.equal(nextQuestion({ ...freshPromptState(), ratingDone: true, opens: 9 }, now, false, 8), null, "statistiche spente");
});

test("stato delle domande: lettura robusta", () => {
  assert.deepEqual(parsePromptState(null), freshPromptState());
  assert.deepEqual(parsePromptState("{rotto"), freshPromptState());
  assert.equal(parsePromptState(JSON.stringify({ opens: 4, ratingDone: true })).opens, 4);
});
