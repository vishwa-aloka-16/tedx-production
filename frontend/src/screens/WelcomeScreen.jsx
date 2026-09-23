import Brand from "../components/Brand";

export default function WelcomeScreen({
  onStart,
}) {
  return (
    <main className="welcome-page">
      <div className="background-orb background-orb--one" />
      <div className="background-orb background-orb--two" />

      <Brand />

      <section className="welcome-layout">
        <div className="welcome-content">
          <span className="eyebrow">
            LIVE AI DRAWING CHALLENGE
          </span>

          <h1>
            Welcome to
            <br />
            <span>AI Pictionary.</span>
          </h1>

          <p>
            Draw fast and make the AI
            understand your creation before
            your opponent.
          </p>

          <button
            className="primary-button welcome-button"
            onClick={onStart}
          >
            Start playing
            <span>→</span>
          </button>
        </div>

        <div className="how-to-play-card">
          <span className="eyebrow">
            HOW TO PLAY
          </span>

          <h2>Think fast. Draw faster.</h2>

          <div className="instruction-list">
            <article>
              <div>01</div>

              <div>
                <strong>
                  Receive the same prompt
                </strong>

                <p>
                  Both players receive one
                  secret object.
                </p>
              </div>
            </article>

            <article>
              <div>02</div>

              <div>
                <strong>
                  Start drawing
                </strong>

                <p>
                  You have a maximum of 90
                  seconds.
                </p>
              </div>
            </article>

            <article>
              <div>03</div>

              <div>
                <strong>
                  Let the AI guess
                </strong>

                <p>
                  The AI analyzes your drawing
                  continuously.
                </p>
              </div>
            </article>

            <article>
              <div>04</div>

              <div>
                <strong>
                  Beat your opponent
                </strong>

                <p>
                  The first correctly recognized
                  drawing wins.
                </p>
              </div>
            </article>
          </div>

          <div className="game-summary">
            <div>
              <strong>5</strong>
              <span>Rounds</span>
            </div>

            <div>
              <strong>90</strong>
              <span>Seconds</span>
            </div>

            <div>
              <strong>2</strong>
              <span>Players</span>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}