export default function Brand({
  connection,
}) {
  let connectionText = "AI ready";

  if (connection === "connecting") {
    connectionText = "Connecting";
  }

  if (connection === "disconnected") {
    connectionText = "Disconnected";
  }

  if (connection === "connected") {
    connectionText = "Game connected";
  }

  return (
    <nav className="navigation">
      <div className="brand">
        <div className="brand-mark">
          AI
        </div>

        <div>
          <div className="brand-name">
            Pictionary
          </div>

          <div className="brand-event">
            TEDx Colombo
          </div>
        </div>
      </div>

      <div
        className={`connection connection--${
          connection || "connected"
        }`}
      >
        <span className="connection-dot" />
        {connectionText}
      </div>
    </nav>
  );
}