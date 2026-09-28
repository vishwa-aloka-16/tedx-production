import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

// Exercise the hook with controlled network responses and a virtual browser clock.
const source = readFileSync(new URL("../src/hooks/useDrawingCanvas.js", import.meta.url), "utf8")
  .replace(/import\s*\{[\s\S]*?\}\s*from\s*"[^"]+";/g, "")
  .replace("export default function", "function");

function harness(respond) {
  const timers = new Map();
  const effects = [];
  let id = 0;
  let calls = 0;
  const context = vm.createContext({
    useRef: (current) => ({ current }),
    useState: (value) => [value, () => {}],
    useCallback: (fn) => fn,
    useEffect: (fn) => effects.push(fn),
    submitDrawing: async () => respond(++calls),
    window: {
      setTimeout: (fn, delay) => { timers.set(++id, { fn, delay }); return id; },
      clearTimeout: (key) => timers.delete(key),
      requestAnimationFrame: (fn) => fn(),
    },
  });
  vm.runInContext(`${source}\nglobalThis.hook = useDrawingCanvas({gameId: 'g', playerId: 'p', roundNumber: 1, phase: 'DRAWING'});`, context);
  const hook = context.hook;
  hook.canvasRef.current = {
    width: 560, height: 560,
    getContext: () => ({ fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {} }),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 560, height: 560 }),
    setPointerCapture() {}, hasPointerCapture: () => false,
    toDataURL: () => "data:image/png;base64,test",
  };
  const cleanups = effects.map((fn) => fn()).filter(Boolean);
  return {
    hook, timers,
    calls: () => calls,
    draw() {
      hook.startDrawing({ isPrimary: true, button: 0, pointerId: 1, clientX: 10, clientY: 10, preventDefault() {} });
      hook.stopDrawing({ pointerId: 1 });
    },
    async tick() {
      const [key, timer] = timers.entries().next().value;
      timers.delete(key); timer.fn();
      await new Promise((resolve) => setImmediate(resolve));
    },
    unmount() { cleanups.forEach((fn) => fn()); },
  };
}

test("finished drawing is retried for three hits and stops on acceptance", async () => {
  const h = harness((n) => ({ accepted: n === 3 }));
  assert.equal(h.timers.size, 0);
  h.draw();
  await h.tick(); await h.tick(); await h.tick();
  assert.equal(h.calls(), 3);
  assert.equal(h.timers.size, 0);
});

test("backend retry delay is honored even when the pen moves", async () => {
  const h = harness(() => ({ retry_after_seconds: 2.5 }));
  h.draw(); await h.tick(); h.draw();
  assert.equal(h.timers.size, 1);
  assert.equal([...h.timers.values()][0].delay, 2500);
});

test("slow requests do not overlap and clearing discards their retry", async () => {
  let resolve;
  const h = harness(() => new Promise((done) => { resolve = done; }));
  h.draw(); await h.tick(); h.draw();
  assert.equal(h.calls(), 1);
  assert.equal(h.timers.size, 0);
  h.hook.clearDrawing(); resolve({ accepted: false });
  await new Promise((done) => setImmediate(done));
  assert.equal(h.timers.size, 0);
});

test("unmount prevents an outstanding response from restarting requests", async () => {
  let resolve;
  const h = harness(() => new Promise((done) => { resolve = done; }));
  h.draw(); await h.tick(); h.unmount(); resolve({ accepted: false });
  await new Promise((done) => setImmediate(done));
  assert.equal(h.timers.size, 0);
});

test("round completion stops retries", async () => {
  const h = harness(() => ({ round_finished: true }));
  h.draw(); await h.tick();
  assert.equal(h.timers.size, 0);
});

test("temporary network errors retry with a backoff", async () => {
  const h = harness(() => { throw new Error("Failed to fetch"); });
  h.draw(); await h.tick();
  assert.equal([...h.timers.values()][0].delay, 1500);
});
