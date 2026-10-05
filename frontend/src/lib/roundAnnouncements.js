export function collectRoundStarts(games, seen, initialized) {
  const announcements = [];
  for (const game of games) {
    const event = game.round_start;
    if (!event?.event_id || game.players.length < 2) continue;
    const key = `start-${game.id}-${event.event_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // Opening the leaderboard mid-round must not replay an old introduction.
    if (!initialized && game.phase !== "COUNTDOWN") continue;
    announcements.push({ key, isRoundStart: true, round: event.round, players: game.players.slice(0, 2) });
  }
  return announcements;
}
