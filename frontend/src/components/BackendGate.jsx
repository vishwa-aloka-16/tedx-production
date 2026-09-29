import { useEffect, useState } from "react";
import { checkBackend } from "../lib/gameApi";
import { bypassWakeScreen, subscribeBackendReady } from "../lib/backendReadiness";

export default function BackendGate({ children }) {
  const bypass = bypassWakeScreen(window.location.hostname, import.meta.env.DEV);
  const [ready, setReady] = useState(bypass);
  const [elapsed, setElapsed] = useState(0);
  const [failure, setFailure] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (bypass) return undefined;
    let active = true;
    let retryTimer;
    let controller;
    let inFlight = false;
    let finished = false;
    const started = Date.now();
    function stopWaiting() {
      if (!active || finished) return;
      finished = true;
      controller?.abort();
      window.clearTimeout(retryTimer);
      window.clearInterval(ticker);
      setFailure("We couldn’t connect to the game server. Check your connection and try again. If this keeps happening, try another network.");
    }
    function updateElapsed() {
      if (!active || finished) return;
      const seconds = Math.floor((Date.now() - started) / 1000);
      setElapsed(seconds);
      if (seconds >= 120) stopWaiting();
    }
    const ticker = window.setInterval(updateElapsed, 1000);

    function markReady() {
      if (!active) return;
      finished = true;
      setReady(true);
      window.clearInterval(ticker);
      window.clearTimeout(retryTimer);
      controller?.abort();
    }
    // A working game request proves reachability even if /health is delayed.
    const unsubscribe = subscribeBackendReady(markReady);

    async function check() {
      if (!active || finished || inFlight) return;
      if (Date.now() - started >= 120000) { stopWaiting(); return; }
      inFlight = true;
      controller = new AbortController();
      // Let a cold backend finish starting instead of repeatedly cutting off
      // mobile requests after 15 seconds. Keep an overall two-minute limit.
      const timeout = window.setTimeout(() => controller.abort(), Math.min(60000, 120000 - (Date.now() - started)));
      try {
        const result = await checkBackend(controller.signal);
        if (active && !finished && result.status === "ok") {
          markReady();
          return;
        }
      } catch {
        // A slow startup, temporary outage, or network error can recover.
      } finally {
        inFlight = false;
        window.clearTimeout(timeout);
      }
      if (active && !finished) retryTimer = window.setTimeout(check, 2000);
    }
    function resume() {
      if (document.visibilityState === "hidden") return;
      updateElapsed();
      if (!inFlight && !finished) {
        window.clearTimeout(retryTimer);
        check();
      }
    }
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    window.addEventListener("pageshow", resume);
    check();
    return () => {
      active = false;
      controller?.abort();
      window.clearTimeout(retryTimer);
      window.clearInterval(ticker);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
      window.removeEventListener("pageshow", resume);
      unsubscribe();
    };
  }, [bypass, attempt]);

  const remaining = Math.max(0, 60 - elapsed);
  return (
    <>
      {children}
      {!ready && !dismissed && elapsed >= 5 && <aside className="backend-connection-notice">
        <button type="button" className="connection-notice-dismiss" aria-label="Dismiss connection notice" onClick={() => setDismissed(true)}>×</button>
        <strong>{failure ? "Unable to reach the game server" : "Checking the game connection"}</strong>
        {failure ? <>
          <p role="alert">{failure}</p>
          <button className="primary-button" onClick={() => {
            setElapsed(0);
            setFailure("");
            setAttempt((value) => value + 1);
          }}>Try again</button>
        </> : <>
          <p>{remaining > 0 ? `Startup estimate: ${remaining}s. The welcome page is available while we check.` : "The game server hasn’t responded. Check your connection or try another network."}</p>
        </>}
      </aside>}
    </>
  );
}
