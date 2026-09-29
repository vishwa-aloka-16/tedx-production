import { useEffect, useState } from "react";
import BrandLogos from "./BrandLogos";
import { checkBackend } from "../lib/gameApi";
import { bypassWakeScreen } from "../lib/backendReadiness";

export default function BackendGate({ children }) {
  const bypass = bypassWakeScreen(window.location.hostname, import.meta.env.DEV);
  const [ready, setReady] = useState(bypass);
  const [elapsed, setElapsed] = useState(0);
  const [failure, setFailure] = useState("");
  const [attempt, setAttempt] = useState(0);

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
          finished = true;
          setReady(true);
          window.clearInterval(ticker);
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
    };
  }, [bypass, attempt]);

  if (ready) return children;
  const remaining = Math.max(0, 60 - elapsed);
  return (
    <main className="loading-page backend-wake-page">
      <section className="connection-error-card" aria-busy={!failure}>
        <BrandLogos />
        <h1>{failure ? "Unable to connect" : elapsed < 2 ? "Connecting to the game" : "Getting the game ready"}</h1>
        {failure ? <>
          <p role="alert">{failure}</p>
          <button className="primary-button" onClick={() => {
            setElapsed(0);
            setFailure("");
            setAttempt((value) => value + 1);
          }}>Try again</button>
        </> : elapsed >= 2 && <>
          <p>The server may be waking up. You’ll enter automatically when it’s ready.</p>
          <div className="backend-wake-countdown" role="timer">{remaining > 0 ? `${remaining}s` : "Still connecting…"}</div>
          <p>{remaining > 0 ? "Estimated wait — it may take longer." : "The server is taking longer than expected. We’re still checking."}</p>
          {elapsed >= 90 && <p>If this continues, check your connection or try again later.</p>}
        </>}
      </section>
    </main>
  );
}
