import { useEffect, useRef, useState } from "react";

import Brand from "../components/Brand";
import BrandLogos from "../components/BrandLogos";
import { API_URL, WS_URL } from "../lib/gameApi";
import { formatPrompt } from "../lib/session";
import { collectRoundStarts } from "../lib/roundAnnouncements";

const WINNER_ANNOUNCEMENT_MS = 5000;
const ROUND_START_ANNOUNCEMENT_MS = 2200;

function WinningDrawing({ url, name, prompt }) {
  if (!url) return null;
  const target = prompt ? formatPrompt(prompt.replaceAll("_", " ")) : "";
  return (
    <figure className="winning-drawing-figure">
      {target && <figcaption className="winning-drawing-target">Target: {target}</figcaption>}
      <img className="winning-drawing" src={`${API_URL}${url}`}
        alt={`${name}'s winning drawing${target ? ` of ${target}` : ""}`}
        onError={(event) => { event.currentTarget.hidden = true; }} />
    </figure>
  );
}

export default function LeaderboardScreen() {
  const [players, setPlayers] = useState([]);
  const [games, setGames] = useState([]);
  const [error, setError] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(() => Boolean(document.fullscreenElement));
  const [fullscreenError, setFullscreenError] = useState("");
  const [announcements, setAnnouncements] = useState([]);
  const winnerAnnouncement = announcements[0];
  const seenRoundsRef = useRef(new Set());
  const initializedRef = useRef(false);
  const seenStartsRef = useRef(new Set());

  useEffect(() => {
    const updateFullscreen = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", updateFullscreen);
    return () => document.removeEventListener("fullscreenchange", updateFullscreen);
  }, []);

  async function toggleFullscreen() {
    setFullscreenError("");
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      setFullscreenError("Unable to switch fullscreen. Please try again.");
    }
  }

  useEffect(() => {
    if (!winnerAnnouncement) return;
    const timer = window.setTimeout(
      () => setAnnouncements((current) => current.slice(1)),
      winnerAnnouncement.isRoundStart ? ROUND_START_ANNOUNCEMENT_MS : WINNER_ANNOUNCEMENT_MS,
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
          const roundStarts = collectRoundStarts(nextGames, seenStartsRef.current, initializedRef.current);
          const completedWins = nextGames.flatMap((game) =>
            game.round_winners
              .filter((round) => round.winner)
              .map((round) => ({
                key: round.event_id || `${game.id}-${round.round}`,
                name: round.winner,
                round: round.round,
                points: round.points,
                drawingUrl: round.drawing_url,
                prompt: round.prompt,
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
            // The final canvas arrives after the already-decided winner event.
            // Update that announcement rather than announcing the round twice.
            setAnnouncements((current) => current.map((item) => {
              const updated = completedWins.find((round) => round.key === item.key);
              return updated?.drawingUrl && updated.drawingUrl !== item.drawingUrl
                ? { ...item, drawingUrl: updated.drawingUrl, prompt: updated.prompt } : item;
            }));
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
          if (roundStarts.length) {
            setAnnouncements((current) => current.some((item) => item.isGameWinner)
              ? current : roundStarts.slice(-1));
          }
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
      {winnerAnnouncement?.isRoundStart && (
        <div className="winner-announcement round-start-announcement"
          key={winnerAnnouncement.key} role="status"
          style={{ "--announcement-duration": `${ROUND_START_ANNOUNCEMENT_MS}ms` }}>
          <BrandLogos />
          <span className="round-start-badge">ROUND {winnerAnnouncement.round} · GET READY</span>
          <div className="round-start-matchup">
            <div className="round-start-player round-start-player--one">
              <span>PLAYER 1</span><strong>{winnerAnnouncement.players[0]}</strong>
            </div>
            <span className="round-start-versus" aria-label="versus">×</span>
            <div className="round-start-player round-start-player--two">
              <span>PLAYER 2</span><strong>{winnerAnnouncement.players[1]}</strong>
            </div>
          </div>
          <span>Let the drawing begin</span>
        </div>
      )}
      {winnerAnnouncement && !winnerAnnouncement.isRoundStart && (
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
          <WinningDrawing url={winnerAnnouncement.drawingUrl} name={winnerAnnouncement.name} prompt={winnerAnnouncement.prompt} />
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
        <div className="leaderboard-title-bar">
          <h1>Leaderboard</h1>
          <button type="button" className="leaderboard-fullscreen-button"
            onClick={toggleFullscreen} aria-pressed={isFullscreen}
            disabled={!document.fullscreenEnabled}
            title={document.fullscreenEnabled ? "Press Esc to leave fullscreen" : "Fullscreen is unavailable in this browser"}>
            {isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          </button>
        </div>
        <p>Top players and round results across the games.</p>

        {fullscreenError && <div className="error-message" role="alert">{fullscreenError}</div>}
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
                      <WinningDrawing url={round.drawing_url} name={round.winner} prompt={round.prompt} />
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
