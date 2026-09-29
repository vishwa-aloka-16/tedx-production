export function bypassWakeScreen(hostname, development) {
  return development || hostname === "localhost" || hostname.endsWith(".localhost") ||
    hostname === "[::1]" || hostname === "::1" || /^127\./.test(hostname);
}

const listeners = new Set();

export function subscribeBackendReady(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifyBackendReady() {
  for (const listener of listeners) listener();
}
