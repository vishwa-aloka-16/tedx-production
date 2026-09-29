import { useEffect, useState } from "react";
import BrandLogos from "./BrandLogos";
import { checkBackend } from "../lib/gameApi";
import { bypassWakeScreen } from "../lib/backendReadiness";

export default function BackendGate({ children }) {
  const bypass = bypassWakeScreen(window.location.hostname, import.meta.env.DEV);
  const [ready, setReady] = useState(bypass);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (bypass) return undefined;
    let active = true;
    let retryTimer;
    let controller;
    const started = Date.now();
    const ticker = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);

    async function check() {
      controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 15000);
      try {
        const result = await checkBackend(controller.signal);
        if (active && result.status === "ok") {
          setReady(true);
          window.clearInterval(ticker);
          return;
        }
      } catch {
        // A slow startup, temporary outage, or network error can recover.
      } finally {
        window.clearTimeout(timeout);
      }
      if (active) retryTimer = window.setTimeout(check, 2000);
    }
    check();
    return () => {
      active = false;
      controller?.abort();
      window.clearTimeout(retryTimer);
      window.clearInterval(ticker);
    };
  }, [bypass]);

  if (ready) return children;
  const remaining = Math.max(0, 60 - elapsed);
  return (
    <main className="loading-page backend-wake-page">
      <section className="connection-error-card" aria-busy="true">
        <BrandLogos />
        <h1>{elapsed < 2 ? "Connecting to the game" : "Getting the game ready"}</h1>
        {elapsed >= 2 && <>
          <p>The server may be waking up. You’ll enter automatically when it’s ready.</p>
          <div className="backend-wake-countdown" role="timer">{remaining > 0 ? `${remaining}s` : "Still connecting…"}</div>
          <p>{remaining > 0 ? "Estimated wait — it may take longer." : "The server is taking longer than expected. We’re still checking."}</p>
          {elapsed >= 90 && <p>If this continues, check your connection or try again later.</p>}
        </>}
      </section>
    </main>
  );
}
