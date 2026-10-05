import assert from "node:assert/strict";
import { test } from "node:test";
import { collectRoundStarts } from "../src/lib/roundAnnouncements.js";

const game = { id: "game", phase: "DRAWING", players: ["Alice", "Bob"], round_start: { event_id: "start-1", round: 1, prompt: "cat" } };

test("round intro shows both player names and only appears once across countdown and drawing", () => {
  const seen = new Set();
  const [intro] = collectRoundStarts([game], seen, true);
  assert.deepEqual(intro.players, ["Alice", "Bob"]);
  assert.equal(intro.round, 1);
  assert.equal(intro.prompt, "cat");
  assert.equal(intro.isRoundStart, true);
  assert.deepEqual(collectRoundStarts([{ ...game, phase: "DRAWING" }], seen, true), []);
});

test("opening mid-round does not replay an introduction, but the next round does", () => {
  const seen = new Set();
  assert.deepEqual(collectRoundStarts([{ ...game, phase: "DRAWING" }], seen, false), []);
  const next = { ...game, round_start: { event_id: "start-2", round: 2, prompt: "dog" } };
  assert.equal(collectRoundStarts([next], seen, true)[0].round, 2);
});

test("a replay of round one with a fresh event gets a new introduction", () => {
  const seen = new Set();
  collectRoundStarts([game], seen, true);
  assert.equal(collectRoundStarts([{ ...game, round_start: { event_id: "replay", round: 1, prompt: "cat" } }], seen, true).length, 1);
});

test("countdown does not consume the intro before the target is revealed", () => {
  const seen = new Set();
  const countdown = { ...game, phase: "COUNTDOWN", round_start: { ...game.round_start, prompt: null } };
  assert.deepEqual(collectRoundStarts([countdown], seen, false), []);
  assert.equal(seen.size, 0);
  assert.equal(collectRoundStarts([game], seen, true)[0].prompt, "cat");
});
