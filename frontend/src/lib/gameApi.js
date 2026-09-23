export const API_URL =
  import.meta.env.VITE_API_URL ||
  "http://127.0.0.1:8000";

export const WS_URL = API_URL.replace(
  /^http/,
  "ws",
);

async function apiRequest(path, options = {}) {
  const response = await fetch(
    `${API_URL}${path}`,
    {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    },
  );

  const data = await response
    .json()
    .catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.detail || "Something went wrong.",
    );
  }

  return data;
}

export function joinMatchmaking(name) {
  return apiRequest("/matchmaking/join", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function getGame(gameId, playerId) {
  return apiRequest(
    `/games/${gameId}?player_id=${encodeURIComponent(
      playerId,
    )}`,
  );
}

export function markPlayerReady(
  gameId,
  playerId,
) {
  return apiRequest(`/games/${gameId}/ready`, {
    method: "POST",
    body: JSON.stringify({
      player_id: playerId,
    }),
  });
}

export function submitDrawing(
  gameId,
  playerId,
  imageDataUrl,
) {
  return apiRequest(`/games/${gameId}/predict`, {
    method: "POST",
    body: JSON.stringify({
      player_id: playerId,
      image_data_url: imageDataUrl,
    }),
  });
}

export function restartGame(
  gameId,
  playerId,
) {
  return apiRequest(`/games/${gameId}/restart`, {
    method: "POST",
    body: JSON.stringify({
      player_id: playerId,
    }),
  });
}

export function leaveGame(gameId, playerId) {
  return apiRequest(`/games/${gameId}/leave`, {
    method: "POST",
    body: JSON.stringify({
      player_id: playerId,
    }),
  });
}