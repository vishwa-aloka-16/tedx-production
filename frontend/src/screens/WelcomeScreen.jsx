import Brand from "../components/Brand";
import "./WelcomeScreen.css";

const steps = [
  ["Get your prompt", "You and your opponent get the same secret object."],
  ["Make your mark", "Bring it to life on the canvas. You have up to 30 seconds."],
  ["Let the AI guess", "Watch the AI try to recognize your drawing as you go."],
  ["Beat your opponent", "The first drawing the AI recognizes correctly wins."],
];

export default function WelcomeScreen({ onStart }) {
  return (
    <main className="welcome-page">
      <Brand />
      <section className="welcome-layout" aria-labelledby="welcome-title">
        <div className="welcome-content">

          <h1 id="welcome-title">
            A little imagination.
            <br />
            <span>A lot of possibility.</span>
          </h1>
          <p>
            Your doodles. Our AI. One friendly showdown.
            Race your opponent to turn a simple prompt into a winning drawing.
          </p>
          <div className="welcome-actions">
            <button className="primary-button welcome-button" onClick={onStart}>
              Let’s play
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M5 12h14m-6-6 6 6-6 6" />
              </svg>
            </button>
            <span className="welcome-note">No art skills needed. Just give it a go.</span>
          </div>
          <dl className="welcome-stats" aria-label="Game at a glance">
            <div><dt>Players</dt><dd>02</dd></div>
            <div><dt>Rounds</dt><dd>06</dd></div>
            <div><dt>Seconds per round</dt><dd>30</dd></div>
          </dl>
        </div>
        <aside className="how-to-play-card" aria-labelledby="how-to-title">
          <div className="play-card-heading">
            <span className="eyebrow">THE GAME PLAN</span>
            <svg className="sketch-icon" viewBox="0 0 48 48" fill="none" aria-hidden="true">
              <path d="m12 32-2 9 9-2L39 19a4.9 4.9 0 0 0-7-7L12 32Zm0 0 7 7m9-23 7 7M8 12l5 1m8-9-1 5M6 23l5-2" />
            </svg>
          </div>
          <h2 id="how-to-title">Think fast.<br />Draw faster.</h2>
          <p className="play-card-intro">Four simple steps. Endless possibilities.</p>
          <ol className="welcome-steps">
            {steps.map(([title, description], index) => (
              <li key={title}>
                <span className="step-number" aria-hidden="true">0{index + 1}</span>
                <div><h3>{title}</h3><p>{description}</p></div>
              </li>
            ))}
          </ol>
          <div className="play-card-footer">
            <span aria-hidden="true">✦</span>
            A spark of creativity is all it takes.
          </div>
        </aside>
      </section>
      <footer className="welcome-footer">
        <span>Human creativity. Artificial intelligence.</span>
        <span>Let’s see what we can create together.</span>
      </footer>
    </main>
  );
}
