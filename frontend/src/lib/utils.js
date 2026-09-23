const SESSION_KEY = "ai-pictionary-session";

export function formatPrompt(prompt = "") {
  return prompt
    .split(" ")
    .map(
      (word) =>
        word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(" ");
}

export function getStoredSession() {
  try {
    const storedSession = localStorage.getItem(SESSION_KEY);

    return storedSession
      ? JSON.parse(storedSession)
      : null;
  } catch {
    return null;
  }
}

export function saveSession(session) {
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify(session),
  );
}

export function deleteSession() {
  localStorage.removeItem(SESSION_KEY);
}