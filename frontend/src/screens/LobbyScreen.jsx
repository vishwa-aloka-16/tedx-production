import Brand from "../components/Brand";

export default function LobbyScreen({
  game,
  playerId,
  connection,
  onReady,
  onLeave,
  busy,
  error,
}) {
  const currentPlayer = game.players.find(
    (player) => player.id === playerId,
  );

  return (
    <main className="lobby-page">
      <Brand connection={connection} />

      <section className="lobby-card">
        <span className="eyebrow">
          GAME LOBBY
        </span>

        <h1>
          Room <span>{game.code}</span>
        </h1>

        <p>
          Enter this code on the second iPad.
          Both players must press ready.
        </p>

        <div className="players-grid">
          {[1, 2].map((seat) => {
            const player = game.players.find(
              (item) => item.seat === seat,
            );

            return (
              <article
                className={`player-slot ${
                  player?.ready
                    ? "player-slot--ready"
                    : ""
                }`}
                key={seat}
              >
                <div className="player-avatar">
                  {player
                    ? player.name
                        .charAt(0)
                        .toUpperCase()
                    : "?"}
                </div>

                <div className="player-information">
                  <span>PLAYER {seat}</span>

                  <strong>
                    {player?.name ||
                      "Waiting to join..."}
                  </strong>
                </div>

                <div className="ready-status">
                  {player?.ready
                    ? "Ready"
                    : player
                      ? "Not ready"
                      : "Empty"}
                </div>
              </article>
            );
          })}
        </div>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        <div className="lobby-actions">
          <button
            className="secondary-button"
            onClick={onLeave}
          >
            Leave room
          </button>

          <button
            className="primary-button compact-button"
            onClick={onReady}
            disabled={
              busy ||
              currentPlayer?.ready ||
              game.players.length < 2
            }
          >
            {currentPlayer?.ready
              ? "Waiting for opponent..."
              : game.players.length < 2
                ? "Waiting for player 2"
                : "I'm ready"}
          </button>
        </div>
      </section>
    </main>
  );
}