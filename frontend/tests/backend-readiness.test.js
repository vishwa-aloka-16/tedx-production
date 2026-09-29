import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import { bypassWakeScreen } from "../src/lib/backendReadiness.js";

// Test readiness lifecycle independently of the component's presentation.
const source = readFileSync(new URL("../src/components/BackendGate.jsx", import.meta.url), "utf8")
  .replace(/^import .*;\r?$/gm, "")
  .replace("export default function", "function")
  .replace("import.meta.env.DEV", "false")
  .split("  if (ready) return children;")[0] + "}\nglobalThis.run = BackendGate;";

function setup(hostname, check) {
  const timers = new Map();
  const states = [];
  let cleanup;
  let id = 0;
  let now = 0;
  let tick;
  const listeners = new Map();
  const context = vm.createContext({
    AbortController, bypassWakeScreen, checkBackend: check,
    Date: { now: () => now },
    document: {
      visibilityState: "visible",
      addEventListener: (name, fn) => listeners.set(name, fn),
      removeEventListener: (name) => listeners.delete(name),
    },
    useState: (value) => {
      const index = states.push(value) - 1;
      return [value, (next) => { states[index] = next; }];
    },
    useEffect: (effect) => { cleanup = effect(); },
    window: {
      location: { hostname },
      setInterval: (fn) => { tick = fn; return 99; }, clearInterval() {},
      addEventListener: (name, fn) => listeners.set(name, fn),
      removeEventListener: (name) => listeners.delete(name),
      setTimeout: (fn, ms) => { timers.set(++id, { fn, ms }); return id; },
      clearTimeout: (key) => timers.delete(key),
    },
  });
  vm.runInContext(source, context);
  context.run({ children: null });
  return { states, timers, listeners, advance(ms) { now += ms; tick?.(); }, cleanup: () => cleanup?.() };
}

test("production retries a failed health check and opens only when ready", async () => {
  let calls = 0;
  const h = setup("jkit-tedx.onrender.com", async () => {
    if (++calls === 1) throw new Error("server starting");
    return { status: "ok" };
  });
  await new Promise((done) => setImmediate(done));
  assert.equal(h.states[0], false);
  const [key, timer] = h.timers.entries().next().value;
  assert.equal(timer.ms, 2000);
  h.timers.delete(key); await timer.fn();
  assert.equal(h.states[0], true);
  assert.equal(h.timers.size, 0);
  h.cleanup();
});

test("localhost enters immediately without a readiness request", () => {
  const h = setup("localhost", () => { throw new Error("must not call"); });
  assert.equal(h.states[0], true);
  assert.equal(h.timers.size, 0);
});

test("leaving cancels the request and prevents retries", async () => {
  let signal;
  const h = setup("jkit-tedx.onrender.com", (current) => {
    signal = current;
    return new Promise((resolve, reject) => current.addEventListener("abort", () => reject(new Error("aborted"))));
  });
  h.cleanup();
  await new Promise((done) => setImmediate(done));
  assert.equal(signal.aborted, true);
  assert.equal(h.timers.size, 0);
});

test("wake-up request allows a full minute on slow mobile connections", () => {
  const h = setup("jkit-tedx.onrender.com", () => new Promise(() => {}));
  assert.equal([...h.timers.values()][0].ms, 60000);
  h.cleanup();
});

test("two-minute failure ends the countdown instead of silently retrying forever", async () => {
  const h = setup("jkit-tedx.onrender.com", async () => { throw new Error("network unavailable"); });
  await new Promise((done) => setImmediate(done));
  h.advance(120000);
  assert.equal(h.states[0], false);
  assert.match(h.states[2], /couldn’t connect/);
  assert.equal(h.timers.size, 0);
  h.cleanup();
});

test("returning to the phone tab immediately retries an idle check", async () => {
  let calls = 0;
  const h = setup("jkit-tedx.onrender.com", async () => {
    if (++calls === 1) throw new Error("offline");
    return { status: "ok" };
  });
  await new Promise((done) => setImmediate(done));
  h.listeners.get("visibilitychange")();
  await new Promise((done) => setImmediate(done));
  assert.equal(calls, 2);
  assert.equal(h.states[0], true);
  h.cleanup();
  assert.equal(h.listeners.size, 0);
});
