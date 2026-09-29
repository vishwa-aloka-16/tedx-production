import { useEffect, useState } from "react";

import Brand from "../components/Brand";
import {
  getAdminSettings,
  resetDashboard,
  updateAdminSettings,
} from "../lib/gameApi";

export default function AdminScreen() {
  const [models, setModels] = useState([]);
  const [settings, setSettings] = useState(null);
  const [roundSeconds, setRoundSeconds] = useState(30);
  const [requiredHits, setRequiredHits] = useState(1);
  const [confidencePercent, setConfidencePercent] = useState(30);
  const [excludedClasses, setExcludedClasses] = useState([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    getAdminSettings()
      .then((result) => {
        setModels(result.models || []);
        setSettings(result.settings);
        setRoundSeconds(result.settings.round_seconds);
        setRequiredHits(result.settings.required_hits ?? 1);
        setConfidencePercent(Math.round((result.settings.confidence_threshold ?? 0.3) * 100));
        setExcludedClasses(
          result.settings.classes
            .filter((item) => !item.enabled)
            .map((item) => item.name),
        );
      })
      .catch((requestError) => setError(requestError.message))
      .finally(() => setBusy(false));
  }, []);

  function selectModel(event) {
    const modelKey = event.target.value;
    const model = models.find((item) => item.key === modelKey);
    setSettings((current) => ({
      ...current,
      model_key: modelKey,
      classes: model
        ? model.classes.map((name) => ({ name, enabled: true, difficulty: model.class_difficulties[name] }))
        : [],
    }));
    setExcludedClasses([]);
    setStatus("");
  }

  function toggleClass(className) {
    setExcludedClasses((current) =>
      current.includes(className)
        ? current.filter((item) => item !== className)
        : [...current, className],
    );
    setStatus("");
  }

  async function saveSettings(event) {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    setError("");

    try {
      const result = await updateAdminSettings({
        model_key: settings.model_key,
        round_seconds: Number(roundSeconds),
        required_hits: Number(requiredHits),
        confidence_threshold: Number(confidencePercent) / 100,
        excluded_classes: excludedClasses,
        class_difficulties: Object.fromEntries(settings.classes.map((item) => [item.name, item.difficulty])),
      });
      setSettings(result.settings);
      setModels(result.models);
      setStatus("Settings saved for new games.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleResetDashboard() {
    if (
      !window.confirm(
        "Reset leaderboard history and completed dashboard games? Active games will continue.",
      )
    ) {
      return;
    }

    setBusy(true);
    setStatus("");
    setError("");

    try {
      await resetDashboard();
      setStatus("Dashboard reset. Active games were not interrupted.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  const enabledClasses = settings?.classes || [];
  const levels = ["easy", "medium", "hard"];
  const counts = Object.fromEntries(levels.map((level) => [level,
    enabledClasses.filter((item) => item.difficulty === level && !excludedClasses.includes(item.name)).length,
  ]));
  const validGroups = levels.every((level) => counts[level] >= 2);

  function changeDifficulty(name, difficulty) {
    setSettings((current) => ({ ...current, classes: current.classes.map((item) =>
      item.name === name ? { ...item, difficulty } : item),
    }));
    setStatus("");
  }

  return (
    <main className="admin-page">
      <Brand />
      <section className="admin-card">
        <span className="eyebrow">GAME ADMINISTRATION</span>
        <h1>Game settings</h1>
        <p>These settings apply when the next game is created.</p>
        {!settings && error && <div className="error-message">{error}</div>}

        {settings && (
          <form onSubmit={saveSettings}>
            <label className="form-field">
              <span>AI MODEL</span>
              <select value={settings.model_key} onChange={selectModel} disabled={busy}>
                {models.map((model) => (
                  <option key={model.key} value={model.key}>
                    {model.name} ({model.number_of_classes} classes)
                  </option>
                ))}
              </select>
            </label>

            <label className="form-field">
              <span>ROUND TIME: {roundSeconds} SECONDS</span>
              <input
                type="number"
                min="10"
                max="600"
                step="5"
                value={roundSeconds}
                disabled={busy}
                onChange={(event) => setRoundSeconds(event.target.value)}
              />
            </label>

            <label className="form-field">
              <span>REQUIRED STABLE GUESSES</span>
              <input type="number" min="1" max="10" step="1" required
                value={requiredHits} disabled={busy}
                onChange={(event) => { setRequiredHits(event.target.value); setStatus(""); }} />
            </label>
            <label className="form-field">
              <span>PASS CONFIDENCE (%)</span>
              <input type="number" min="1" max="100" step="1" required
                value={confidencePercent} disabled={busy}
                onChange={(event) => { setConfidencePercent(event.target.value); setStatus(""); }} />
            </label>
            <p className="class-picker-note">
              Each consecutive guess must match the prompt and meet this confidence.
              A wrong or lower-confidence guess resets the streak. In the last 20% of
              a round, the existing fallback can award the highest-confidence correct
              guess without meeting these requirements.
            </p>

            <fieldset className="class-picker">
              <legend>PROMPT DIFFICULTY</legend>
              <p className="class-picker-note">
                Rounds 1–2 are easy, 3–4 medium, and 5–6 hard. Enable at least
                two classes in each group. Each topic appears only once per game.
              </p>
              {levels.map((level, index) => (
                <section className="difficulty-group" key={level}>
                  <h3>{level} · Rounds {index * 2 + 1}–{index * 2 + 2} · {counts[level]} enabled</h3>
                  {counts[level] < 2 && <p className="error-message">Enable at least two {level} classes.</p>}
                  <div className="difficulty-grid">
                {enabledClasses.filter((item) => item.difficulty === level).map((item) => (
                  <div className="difficulty-class" key={item.name}>
                  <label className="class-option">
                    <input
                      type="checkbox"
                      disabled={busy}
                      checked={!excludedClasses.includes(item.name)}
                      onChange={() => toggleClass(item.name)}
                    />
                    <span>{item.name.replaceAll("_", " ")}</span>
                  </label>
                  <select aria-label={`Difficulty for ${item.name.replaceAll("_", " ")}`}
                    value={item.difficulty} disabled={busy}
                    onChange={(event) => changeDifficulty(item.name, event.target.value)}>
                    {levels.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                  </div>
                ))}
                  </div>
                </section>
              ))}
            </fieldset>

            {error && <div className="error-message">{error}</div>}
            {status && <div className="admin-status">{status}</div>}

            <button className="primary-button" disabled={busy || !validGroups}>
              {busy ? "Saving..." : "Save settings"}
              <span>→</span>
            </button>

            <div className="admin-danger-zone">
              <div>
                <strong>Reset dashboard history</strong>
                <span>
                  Clears player totals and completed games. Active games stay live.
                </span>
              </div>
              <button
                className="danger-button"
                type="button"
                onClick={handleResetDashboard}
                disabled={busy}
              >
                Reset dashboard
              </button>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}
