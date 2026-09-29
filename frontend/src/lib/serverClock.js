let offsetSeconds = 0;
let bestRoundTrip = Infinity;

export function observeServerClock(serverTime, started, finished) {
  const roundTrip = finished - started;
  if (Number.isFinite(serverTime) && roundTrip < bestRoundTrip) {
    bestRoundTrip = roundTrip;
    offsetSeconds = serverTime - (started + finished) / 2000;
  }
}

export function serverNow() {
  return Date.now() / 1000 + offsetSeconds;
}

export function newerGame(current, incoming) {
  if (!incoming || !current || incoming.id !== current.id) return incoming;
  return (incoming.snapshot_seq ?? 0) < (current.snapshot_seq ?? 0) ? current : incoming;
}
