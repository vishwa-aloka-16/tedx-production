import { useState } from "react";

import useGameConnection from "./hooks/useGameConnection";

import {
  joinMatchmaking,
  leaveGame,
  markPlayerReady,
  restartGame,
} from "./lib/gameApi";

import {
  getStoredSession,
  removeSession,
  saveSession,
} from "./lib/session";

import WelcomeScreen from "./screens/WelcomeScreen";
import NameScreen from "./screens/NameScreen";
import WaitingScreen from "./screens/WaitingScreen";
import GameScreen from "./screens/GameScreen";

export default function App() {
  const initialSession = getStoredSession();

  const [session, setSession] =
    useState(initialSession);

  const [page, setPage] = useState(
    initialSession ? "GAME" : "WELCOME",
  );

  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] =
    useState("");

  const {
    game,
    setGame,
    connection,
    connectionError,
  } = useGameConnection(session);

  function showNameScreen() {
    setActionError("");
    setPage("NAME");
  }

  function showWelcomeScreen() {
    setActionError("");
    setPage("WELCOME");
  }

  async function handleJoin(name) {
    setBusy(true);
    setActionError("");

    try {
      const result =
        await joinMatchmaking(name);

      const nextSession = {
        gameId: result.game.id,
        playerId: result.player_id,
      };

      saveSession(nextSession);

      setGame(result.game);
      setSession(nextSession);
      setPage("GAME");
    } catch (error) {
      setActionError(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleReady() {
    if (!session) return;

    setBusy(true);
    setActionError("");

    try {
      const updatedGame =
        await markPlayerReady(
          session.gameId,
          session.playerId,
        );

      setGame(updatedGame);
    } catch (error) {
      setActionError(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleRestart() {
    if (!session) return;

    setBusy(true);
    setActionError("");

    try {
      const updatedGame =
        await restartGame(
          session.gameId,
          session.playerId,
        );

      setGame(updatedGame);
    } catch (error) {
      setActionError(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleExit() {
    if (session) {
      try {
        await leaveGame(
          session.gameId,
          session.playerId,
        );
      } catch {
        // Clear the browser session even
        // if the backend is unavailable.
      }
    }

    removeSession();

    setSession(null);
    setGame(null);
    setActionError("");
    setPage("WELCOME");
  }

  if (!session && page === "WELCOME") {
    return (
      <WelcomeScreen
        onStart={showNameScreen}
      />
    );
  }

  if (!session && page === "NAME") {
    return (
      <NameScreen
        onJoin={handleJoin}
        onBack={showWelcomeScreen}
        busy={busy}
        error={actionError}
      />
    );
  }

  if (
    session &&
    !game &&
    connectionError
  ) {
    return (
      <main className="error-page">
        <section className="connection-error-card">
          <div className="brand-mark">
            AI
          </div>

          <h1>Unable to reconnect</h1>

          <p>{connectionError}</p>

          <button
            className="primary-button"
            onClick={handleExit}
          >
            Return to welcome screen
          </button>
        </section>
      </main>
    );
  }

  if (session && !game) {
    return (
      <main className="loading-page">
        <div className="loading-logo">
          AI
        </div>

        <p>Joining the game...</p>
      </main>
    );
  }

  if (
    game?.phase === "WAITING" ||
    game?.phase === "LOBBY"
  ) {
    return (
      <WaitingScreen
        game={game}
        playerId={session.playerId}
        connection={connection}
        busy={busy}
        error={actionError}
        onReady={handleReady}
        onExit={handleExit}
      />
    );
  }

  return (
    <GameScreen
      game={game}
      playerId={session.playerId}
      connection={connection}
      onRestart={handleRestart}
      onExit={handleExit}
    />
  );
}