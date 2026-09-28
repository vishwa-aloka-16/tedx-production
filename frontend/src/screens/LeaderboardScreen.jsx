import { useEffect, useRef, useState } from "react";

import Brand from "../components/Brand";
import BrandLogos from "../components/BrandLogos";
import { WS_URL } from "../lib/gameApi";

const WINNER_ANNOUNCEMENT_MS = 5000;

export default function LeaderboardScreen() {
  const [players, setPlayers] = useState([]);
  const [games, setGames] = useState([]);
  const [error, setError] = useState("");
  const [announcements, setAnnouncements] = useState([]);
  const winnerAnnouncement = announcements[0];
  const seenRoundsRef = useRef(new Set());
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!winnerAnnouncement) return;
    const timer = window.setTimeout(
      () => setAnnouncements((current) => current.slice(1)),
      WINNER_ANNOUNCEMENT_MS,
    );
    return () => window.clearTimeout(timer);
  }, [winnerAnnouncement]);

  useEffect(() => {
    let active = true;
    let socket;
    let reconnectTimer;

    function applyLeaderboard(result) {
          if (!active) return;
          setPlayers(result.players || []);
          const nextGames = result.games || [];
          const completedWins = nextGames.flatMap((game) =>
            game.round_winners
              .filter((round) => round.winner)
              .map((round) => ({
                key: round.event_id || `${game.id}-${round.round}`,
                name: round.winner,
                round: round.round,
                points: round.points,
              })),
          );

          const completedGames = nextGames.filter((game) => game.game_result).map((game) => ({
            key: game.game_result.event_id,
            name: game.game_result.winners.join(" & "),
            points: game.game_result.score,
            tied: game.game_result.tied,
            isGameWinner: true,
          }));

          if (initializedRef.current) {
            const newWinners = completedWins.filter(
              (round) => !seenRoundsRef.current.has(round.key),
            );

            const newGameWinners = completedGames.filter((game) => !seenRoundsRef.current.has(game.key));
            if (newGameWinners.length) {
              setAnnouncements((current) => [...current.filter((item) => item.isGameWinner), ...newGameWinners]);
            } else if (newWinners.length) {
              // Show the latest decision immediately instead of waiting for
              // an older announcement's three-second animation to finish.
              setAnnouncements((current) => current.some((item) => item.isGameWinner) ? current : newWinners.slice(-1));
            }
          }

          [...completedWins, ...completedGames].forEach((round) =>
            seenRoundsRef.current.add(round.key),
          );
          initializedRef.current = true;
          setGames(nextGames);
          setError("");
    }

    function connect() {
      socket = new WebSocket(`${WS_URL}/ws/leaderboard`);
      socket.onmessage = (event) => {
        if (!active) return;
        applyLeaderboard(JSON.parse(event.data));
      };
      socket.onclose = () => {
        if (!active) return;
        setError("Reconnecting to live results…");
        reconnectTimer = window.setTimeout(connect, 1000);
      };
    }
    connect();

    return () => {
      active = false;
      window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, []);

  return (
    <main className="leaderboard-page">
      {winnerAnnouncement && (
        <div
          className={`winner-announcement${winnerAnnouncement.isGameWinner ? " game-winner-announcement" : ""}`}
          key={winnerAnnouncement.key}
          aria-live="polite"
          style={{ "--announcement-duration": `${WINNER_ANNOUNCEMENT_MS}ms` }}
        >
          <BrandLogos />
          {winnerAnnouncement.isGameWinner && <span className="champion-trophy" aria-hidden="true">🏆</span>}
          <span className="winner-announcement-badge">{winnerAnnouncement.isGameWinner ? (winnerAnnouncement.tied ? "GAME DRAW" : "GAME WINNER") : "WINNER"}</span>
          <strong>{winnerAnnouncement.name}</strong>
          <span>
            {winnerAnnouncement.isGameWinner
              ? `${winnerAnnouncement.tied ? "Tied" : "Champion"} with ${winnerAnnouncement.points.toLocaleString()} points`
              : `won round ${winnerAnnouncement.round}`}
            {!winnerAnnouncement.isGameWinner && winnerAnnouncement.points > 0
              ? ` and earned ${winnerAnnouncement.points} points`
              : ""}
          </span>
        </div>
      )}
      <Brand />
      <section className="leaderboard-card">
        <h1>Leaderboard</h1>
        <p>Top players and round results across the games.</p>

        {error && <div className="error-message">{error}</div>}

        {!error && !players.length && (
          <div className="leaderboard-empty">
            No completed games yet.
          </div>
        )}

        {!!players.length && (
          <div className="leaderboard-table" role="table">
            <div className="leaderboard-row leaderboard-row--header" role="row">
              <span>RANK</span>
              <span>PLAYER</span>
              <span>SCORE</span>
              <span>WINS</span>
              <span>GAMES</span>
            </div>
            {players.map((player) => (
              <div className="leaderboard-row" role="row" key={player.name}>
                <strong>#{player.rank}</strong>
                <strong>{player.name}</strong>
                <span>{player.score.toLocaleString()}</span>
                <span>{player.wins}</span>
                <span>{player.games}</span>
              </div>
            ))}
          </div>
        )}

        <div className="leaderboard-games">
          <div className="leaderboard-section-heading">
            <h2>Game activity</h2>
            <span>Live updates</span>
          </div>

          {!games.length && (
            <div className="leaderboard-empty">
              No games are currently visible.
            </div>
          )}

          {games.map((game) => (
            <article className="game-activity" key={game.id}>
              <div className="game-activity-header">
                <div>
                  <strong>
                    {game.players.join(" vs ") || "Waiting for players"}
                  </strong>
                  <span>
                    {game.status === "in_progress"
                      ? "Game in progress"
                      : "Game completed"}
                  </span>
                </div>
                <span className={`game-status game-status--${game.status}`}>
                  {game.status === "in_progress" ? "LIVE" : "DONE"}
                </span>
              </div>

              {game.round_winners.length ? (
                <div className="round-results">
                  {game.round_winners.map((round) => (
                    <div className="round-result" key={round.round}>
                      <span>Round {round.round}</span>
                      <strong>
                        {round.winner || "No winner"}
                      </strong>
                      {round.points > 0 && <small>+{round.points} pts</small>}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="round-results-empty">
                  No round has finished yet.
                </div>
              )}
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
