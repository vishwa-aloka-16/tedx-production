import assert from "node:assert/strict";
import { test, mock } from "node:test";
import { newerGame, observeServerClock, serverNow } from "../src/lib/serverClock.js";
import { bypassWakeScreen } from "../src/lib/backendReadiness.js";

test("late HTTP snapshots cannot roll back the prompt or phase", () => {
  const current = { id: "g", snapshot_seq: 200, phase: "DRAWING", prompt: "cat" };
  assert.equal(newerGame(current, { id: "g", snapshot_seq: 100, phase: "COUNTDOWN" }), current);
  assert.equal(newerGame(current, null), null);
  const other = { id: "new", snapshot_seq: 1 };
  assert.equal(newerGame(current, other), other);
});

test("clock uses request midpoint and ignores slower samples", () => {
  mock.method(Date, "now", () => 10000);
  try {
    observeServerClock(100, 9800, 10000);
    assert.ok(Math.abs(serverNow() - 100.1) < 0.0001);
    observeServerClock(500, 9000, 10000);
    assert.ok(Math.abs(serverNow() - 100.1) < 0.0001);
    observeServerClock(101, 9950, 10000);
    assert.ok(Math.abs(serverNow() - 101.025) < 0.0001);
  } finally { mock.restoreAll(); }
});

test("wake screen is bypassed on localhost and development only", () => {
  for (const host of ["localhost", "127.0.0.1", "[::1]", "::1", "game.localhost"]) {
    assert.equal(bypassWakeScreen(host, false), true);
  }
  assert.equal(bypassWakeScreen("192.168.1.2", true), true);
  assert.equal(bypassWakeScreen("jkit-tedx.onrender.com", false), false);
});
