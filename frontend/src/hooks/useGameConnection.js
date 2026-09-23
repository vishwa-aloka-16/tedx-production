import { useEffect, useRef, useState } from "react";
import { getGame, WS_URL } from "../lib/gameApi";

export default function useGameConnection(session) {
  const socketRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const heartbeatRef = useRef(null);

  const [game, setGame] = useState(null);
  const [connection, setConnection] =
    useState("disconnected");

  const [connectionError, setConnectionError] =
    useState("");

  useEffect(() => {
    // Do not call the backend with an incomplete session.
    if (!session?.gameId || !session?.playerId) {
      setGame(null);
      setConnection("disconnected");

      if (session) {
        setConnectionError(
          "Invalid saved game session. Please return to the welcome screen.",
        );
      }

      return undefined;
    }

    let active = true;

    async function loadInitialState() {
      try {
        const state = await getGame(
          session.gameId,
          session.playerId,
        );

        if (active) {
          setGame(state);
          setConnectionError("");
        }
      } catch (error) {
        if (active) {
          setConnectionError(
            error.message || "Could not load the game.",
          );
        }
      }
    }

    function connectWebSocket() {
      if (!active) return;

      setConnection("connecting");

      const socketUrl =
        `${WS_URL}/ws/games/${encodeURIComponent(
          session.gameId,
        )}` +
        `?player_id=${encodeURIComponent(
          session.playerId,
        )}`;

      const socket = new WebSocket(socketUrl);

      socketRef.current = socket;

      socket.onopen = () => {
        if (!active) return;

        setConnection("connected");
        setConnectionError("");

        window.clearInterval(heartbeatRef.current);

        heartbeatRef.current = window.setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send("ping");
          }
        }, 15000);
      };

      socket.onmessage = (event) => {
        if (!active) return;

        try {
          const message = JSON.parse(event.data);

          if (message.type === "game_state") {
            setGame(message.game);
          }
        } catch {
          // Ignore malformed WebSocket messages.
        }
      };

      socket.onerror = () => {
        if (!active) return;

        setConnection("disconnected");
      };

      socket.onclose = () => {
        window.clearInterval(heartbeatRef.current);

        if (!active) return;

        setConnection("connecting");

        reconnectTimerRef.current =
          window.setTimeout(
            connectWebSocket,
            1500,
          );
      };
    }

    loadInitialState();
    connectWebSocket();

    return () => {
      active = false;

      window.clearTimeout(
        reconnectTimerRef.current,
      );

      window.clearInterval(
        heartbeatRef.current,
      );

      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [session?.gameId, session?.playerId]);

  return {
    game,
    setGame,
    connection,
    connectionError,
  };
}