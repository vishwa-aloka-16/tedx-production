import { useState } from "react";
import Brand from "../components/Brand";

export default function EntryScreen({
  onCreate,
  onJoin,
  busy,
  error,
}) {
  const [mode, setMode] = useState("create");
  const [name, setName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [validationError, setValidationError] =
    useState("");

  function submit(event) {
    event.preventDefault();

    const cleanedName = name.trim();
    const cleanedCode = roomCode
      .trim()
      .toUpperCase();

    if (!cleanedName) {
      setValidationError(
        "Enter your name to continue.",
      );
      return;
    }

    if (
      mode === "join" &&
      cleanedCode.length !== 6
    ) {
      setValidationError(
        "Enter the six-character room code.",
      );
      return;
    }

    setValidationError("");

    if (mode === "create") {
      onCreate(cleanedName);
    } else {
      onJoin(cleanedCode, cleanedName);
    }
  }

  return (
    <main className="entry-page">
      <div className="background-orb background-orb--one" />
      <div className="background-orb background-orb--two" />

      <Brand />

      <section className="entry-layout">
        <div className="entry-content">
          <span className="eyebrow">
            LIVE AI DRAWING BATTLE
          </span>

          <h1>
            Draw fast.
            <br />
            <span>Beat the AI.</span>
          </h1>

          <p>
            Six prompts. Ninety seconds each.
            Make the AI recognize your drawing
            before your opponent.
          </p>

          <div className="game-statistics">
            <div>
              <strong>5</strong>
              <span>Rounds</span>
            </div>

            <div>
              <strong>30</strong>
              <span>Seconds</span>
            </div>

            <div>
              <strong>2</strong>
              <span>Players</span>
            </div>
          </div>
        </div>

        <form
          className="entry-card"
          onSubmit={submit}
        >
          <span className="eyebrow">
            PLAYER SETUP
          </span>

          <h2>Ready to draw?</h2>

          <p>
            Create a game on the first iPad.
            Join it from the second.
          </p>

          <div className="mode-switch">
            <button
              type="button"
              className={
                mode === "create" ? "active" : ""
              }
              onClick={() => {
                setMode("create");
                setValidationError("");
              }}
            >
              Create room
            </button>

            <button
              type="button"
              className={
                mode === "join" ? "active" : ""
              }
              onClick={() => {
                setMode("join");
                setValidationError("");
              }}
            >
              Join room
            </button>
          </div>

          <label className="form-field">
            <span>Your name</span>

            <input
              value={name}
              maxLength={24}
              autoComplete="off"
              placeholder="Enter player name"
              onChange={(event) =>
                setName(event.target.value)
              }
            />
          </label>

          {mode === "join" && (
            <label className="form-field">
              <span>Room code</span>

              <input
                className="room-code-input"
                value={roomCode}
                maxLength={6}
                autoComplete="off"
                placeholder="ABC123"
                onChange={(event) => {
                  const value = event.target.value
                    .toUpperCase()
                    .replace(/[^A-Z0-9]/g, "")
                    .slice(0, 6);

                  setRoomCode(value);
                }}
              />
            </label>
          )}

          {(validationError || error) && (
            <div className="error-message">
              {validationError || error}
            </div>
          )}

          <button
            className="primary-button"
            disabled={busy}
          >
            {busy
              ? "Connecting..."
              : mode === "create"
                ? "Create game"
                : "Join game"}

            <span>→</span>
          </button>
        </form>
      </section>
    </main>
  );
}
