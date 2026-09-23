import Brand from "../components/Brand";

export default function WaitingScreen({
  game,
  playerId,
  connection,
  busy,
  error,
  onReady,
  onExit,
}) {
  const currentPlayer =
    game.players.find(
      (player) =>
        player.id === playerId,
    );

  const opponent =
    game.players.find(
      (player) =>
        player.id !== playerId,
    );

  const bothPlayersConnected =
    game.players.length === 2;

  return (
    <main className="waiting-page">
      <Brand connection={connection} />

      <section className="waiting-card">
        {!bothPlayersConnected ? (
          <>
            <div className="waiting-animation">
              <span />
              <span />
              <span />
            </div>

            {/* <span className="eyebrow">
              MATCHMAKING
            </span> */}

            <h1>
              Waiting for your opponent
            </h1>

            <p>
              You are in the next available
              game. Your opponent will appear
              here automatically.
            </p>
          </>
        ) : (
          <>
            <div className="matched-icon">
              ✓
            </div>

            <span className="eyebrow">
              MATCH FOUND
            </span>

            <h1>Both players connected!</h1>

            <p>
              Press ready when you are prepared
              to begin.
            </p>
          </>
        )}

        <div className="versus-container">
          <article
            className={`waiting-player ${
              currentPlayer?.ready
                ? "waiting-player--ready"
                : ""
            }`}
          >
            <div className="large-avatar">
              {currentPlayer?.name
                ?.charAt(0)
                .toUpperCase()}
            </div>

            <span>YOU</span>

            <strong>
              {currentPlayer?.name}
            </strong>

            <small>
              {currentPlayer?.ready
                ? "Ready"
                : "Not ready"}
            </small>
          </article>

          <div className="versus-label">
            VS
          </div>

          <article
            className={`waiting-player ${
              opponent?.ready
                ? "waiting-player--ready"
                : ""
            }`}
          >
            <div className="large-avatar">
              {opponent
                ? opponent.name
                    .charAt(0)
                    .toUpperCase()
                : "?"}
            </div>

            <span>OPPONENT</span>

            <strong>
              {opponent?.name ||
                "Waiting..."}
            </strong>

            <small>
              {opponent
                ? opponent.ready
                  ? "Ready"
                  : "Not ready"
                : "Joining"}
            </small>
          </article>
        </div>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        <div className="waiting-actions">
          <button
            className="secondary-button"
            onClick={onExit}
          >
            Exit
          </button>

          <button
            className="primary-button compact-button"
            onClick={onReady}
            disabled={
              busy ||
              !bothPlayersConnected ||
              currentPlayer?.ready
            }
          >
            {currentPlayer?.ready
              ? "Waiting for opponent..."
              : bothPlayersConnected
                ? "I'm ready"
                : "Waiting for player 2"}
          </button>
        </div>
      </section>
    </main>
  );
}
