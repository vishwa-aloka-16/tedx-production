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
  const context = vm.createContext({
    AbortController, bypassWakeScreen, checkBackend: check,
    useState: (value) => {
      const index = states.push(value) - 1;
      return [value, (next) => { states[index] = next; }];
    },
    useEffect: (effect) => { cleanup = effect(); },
    window: {
      location: { hostname },
      setInterval: () => 99, clearInterval() {},
      setTimeout: (fn, ms) => { timers.set(++id, { fn, ms }); return id; },
      clearTimeout: (key) => timers.delete(key),
    },
  });
  vm.runInContext(source, context);
  context.run({ children: null });
  return { states, timers, cleanup: () => cleanup?.() };
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
