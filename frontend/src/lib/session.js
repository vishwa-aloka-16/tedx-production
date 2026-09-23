const SESSION_KEY =
  "ai-pictionary-player-session";

export function getStoredSession() {
  try {
    const value =
      sessionStorage.getItem(SESSION_KEY);

    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

export function saveSession(session) {
  sessionStorage.setItem(
    SESSION_KEY,
    JSON.stringify(session),
  );
}

export function removeSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

export function formatPrompt(prompt = "") {
  return prompt
    .split(" ")
    .map(
      (word) =>
        word.charAt(0).toUpperCase() +
        word.slice(1),
    )
    .join(" ");
}