export function bypassWakeScreen(hostname, development) {
  return development || hostname === "localhost" || hostname.endsWith(".localhost") ||
    hostname === "[::1]" || hostname === "::1" || /^127\./.test(hostname);
}
