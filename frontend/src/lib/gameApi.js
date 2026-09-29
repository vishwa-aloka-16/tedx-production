import { observeServerClock } from "./serverClock";
import { notifyBackendReady } from "./backendReadiness";

export const API_URL =
  import.meta.env.VITE_API_URL ||
  "http://127.0.0.1:8000";

export const WS_URL = API_URL.replace(
  /^http/,
  "ws",
);

async function apiRequest(path, options = {}) {
  const started = Date.now();
  // AbortSignal.timeout is unavailable in some mobile browsers.
  const controller = options.signal ? null : new AbortController();
  const timeout = controller ? window.setTimeout(() => controller.abort(), 15000) : null;
  try {
  const response = await fetch(
    `${API_URL}${path}`,
    {
      ...options,
      signal: options.signal ?? controller.signal,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
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

  const state = data.game ?? data;
  observeServerClock(state.server_time, started, Date.now());
  notifyBackendReady();

  return data;
  } finally {
    if (timeout !== null) window.clearTimeout(timeout);
  }
}

export function getAdminSettings() {
  return apiRequest("/admin");
}

export function updateAdminSettings(settings) {
  return apiRequest("/admin", {
    method: "PUT",
    body: JSON.stringify(settings),
  });
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

export function getLeaderboard() {
  return apiRequest("/leaderbord");
}

export function resetDashboard() {
  return apiRequest("/admin/reset-dashboard", {
    method: "POST",
  });
}

export function submitRoundDrawing(gameId, playerId, eventId, imageDataUrl) {
  return apiRequest(`/games/${gameId}/round-drawing`, {
    method: "POST",
    body: JSON.stringify({ player_id: playerId, event_id: eventId, image_data_url: imageDataUrl }),
  });
}

export function checkBackend(signal) {
  return apiRequest("/health", { signal, cache: "no-store" });
}
