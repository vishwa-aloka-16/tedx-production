import { useEffect, useRef, useState } from "react";

const API_URL =
  import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

const PREDICTION_DELAY_MS = 350;

function resetCanvas(canvas) {
  if (!canvas) return;

  const context = canvas.getContext("2d");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.strokeStyle = "#111827";
  context.fillStyle = "#111827";
  context.lineWidth = 16;
  context.lineCap = "round";
  context.lineJoin = "round";
}

function getPointerPosition(event, canvas) {
  const bounds = canvas.getBoundingClientRect();

  return {
    x:
      ((event.clientX - bounds.left) / bounds.width) *
      canvas.width,
    y:
      ((event.clientY - bounds.top) / bounds.height) *
      canvas.height,
  };
}

function formatPrompt(prompt) {
  if (!prompt) return "";

  return prompt
    .split(" ")
    .map(
      (word) =>
        word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(" ");
}

export default function App() {
  const canvasRef = useRef(null);
  const isDrawingRef = useRef(false);
  const predictionTimerRef = useRef(null);
  const predictionRunningRef = useRef(false);
  const drawingChangedRef = useRef(false);
  const drawingVersionRef = useRef(0);

  const [classes, setClasses] = useState([]);
  const [prompt, setPrompt] = useState("");
  const [prediction, setPrediction] = useState(null);
  const [connectionStatus, setConnectionStatus] =
    useState("connecting");
  const [message, setMessage] = useState(
    "Connecting to the AI model...",
  );
  const [error, setError] = useState("");

  useEffect(() => {
    resetCanvas(canvasRef.current);

    async function connectToBackend() {
      try {
        const response = await fetch(`${API_URL}/health`);

        if (!response.ok) {
          throw new Error("The backend returned an error.");
        }

        const data = await response.json();
        const availableClasses = data.classes || [];

        setClasses(availableClasses);
        setPrompt(availableClasses[0] || "");
        setConnectionStatus("connected");
        setMessage("Choose an object and start drawing.");
      } catch {
        setConnectionStatus("disconnected");
        setMessage("The AI backend is not connected.");
        setError(
          "Start the backend on http://127.0.0.1:8000",
        );
      }
    }

    connectToBackend();

    return () => {
      clearTimeout(predictionTimerRef.current);
    };
  }, []);

  function clearDrawing() {
    drawingVersionRef.current += 1;
    isDrawingRef.current = false;
    drawingChangedRef.current = false;

    clearTimeout(predictionTimerRef.current);
    predictionTimerRef.current = null;

    resetCanvas(canvasRef.current);
    setPrediction(null);
    setError("");
    setMessage("Start drawing when you are ready.");
  }

  function selectPrompt(nextPrompt) {
    setPrompt(nextPrompt);
    clearDrawing();
  }

  function chooseRandomPrompt() {
    if (classes.length === 0) return;

    const alternatives = classes.filter(
      (className) => className !== prompt,
    );

    const promptOptions =
      alternatives.length > 0 ? alternatives : classes;

    const nextPrompt =
      promptOptions[
        Math.floor(Math.random() * promptOptions.length)
      ];

    selectPrompt(nextPrompt);
  }

  function schedulePrediction() {
    drawingChangedRef.current = true;

    if (predictionTimerRef.current !== null) return;

    predictionTimerRef.current = window.setTimeout(() => {
      predictionTimerRef.current = null;
      predictDrawing();
    }, PREDICTION_DELAY_MS);
  }

  async function predictDrawing() {
    if (predictionRunningRef.current) return;

    predictionRunningRef.current = true;
    drawingChangedRef.current = false;

    const requestVersion = drawingVersionRef.current;

    try {
      const imageDataUrl =
        canvasRef.current.toDataURL("image/png");

      const response = await fetch(`${API_URL}/predict`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          image_data_url: imageDataUrl,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || "Prediction request failed.",
        );
      }

      if (requestVersion === drawingVersionRef.current) {
        setPrediction(data);
        setError("");

        if (data.prediction === prompt) {
          setMessage("The AI recognized your object.");
        } else {
          setMessage("Keep drawing. The AI is still thinking.");
        }
      }
    } catch (predictionError) {
      if (requestVersion === drawingVersionRef.current) {
        setError(predictionError.message);
      }
    } finally {
      predictionRunningRef.current = false;

      if (drawingChangedRef.current) {
        schedulePrediction();
      }
    }
  }

  function startDrawing(event) {
    event.preventDefault();

    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    const point = getPointerPosition(event, canvas);

    canvas.setPointerCapture(event.pointerId);
    isDrawingRef.current = true;

    context.beginPath();
    context.moveTo(point.x, point.y);
    context.lineTo(point.x + 0.01, point.y + 0.01);
    context.stroke();

    setMessage("Drawing...");
    schedulePrediction();
  }

  function continueDrawing(event) {
    if (!isDrawingRef.current) return;

    event.preventDefault();

    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    const point = getPointerPosition(event, canvas);

    context.lineTo(point.x, point.y);
    context.stroke();

    schedulePrediction();
  }

  function stopDrawing(event) {
    if (!isDrawingRef.current) return;

    isDrawingRef.current = false;

    if (
      event?.pointerId !== undefined &&
      canvasRef.current.hasPointerCapture(event.pointerId)
    ) {
      canvasRef.current.releasePointerCapture(
        event.pointerId,
      );
    }

    schedulePrediction();
  }

  const confidence = prediction
    ? prediction.confidence * 100
    : 0;

  const correctPrediction =
    prediction?.prediction === prompt;

  return (
    <main className="app">
      <nav className="navigation">
        <div className="brand">
          <div className="brand-mark">AI</div>

          <div>
            <div className="brand-name">Pictionary</div>
            <div className="brand-event">TEDx Colombo</div>
          </div>
        </div>

        <div
          className={`connection connection--${connectionStatus}`}
        >
          <span className="connection-dot" />
          {connectionStatus === "connected"
            ? "Model connected"
            : connectionStatus === "connecting"
              ? "Connecting"
              : "Disconnected"}
        </div>
      </nav>

      <header className="hero">
        <div className="hero-label">LIVE AI CHALLENGE</div>

        <h1>
          Draw it.
          <br />
          Let AI guess it.
        </h1>

        <p>
          Your drawing is analyzed continuously by the
          recognition model while you draw.
        </p>
      </header>

      <section className="workspace">
        <div className="drawing-panel">
          <div className="panel-heading">
            <div>
              <span className="section-label">
                YOUR CHALLENGE
              </span>

              <h2>
                Draw a{" "}
                <span>{formatPrompt(prompt)}</span>
              </h2>
            </div>

            <button
              className="icon-button"
              type="button"
              onClick={chooseRandomPrompt}
              disabled={classes.length === 0}
              title="Choose another prompt"
            >
              ↻
            </button>
          </div>

          <div className="prompt-selector">
            <label htmlFor="prompt">Change object</label>

            <select
              id="prompt"
              value={prompt}
              onChange={(event) =>
                selectPrompt(event.target.value)
              }
              disabled={classes.length === 0}
            >
              {classes.map((className) => (
                <option
                  value={className}
                  key={className}
                >
                  {formatPrompt(className)}
                </option>
              ))}
            </select>
          </div>

          <div className="canvas-container">
            <canvas
              ref={canvasRef}
              width="600"
              height="600"
              className="drawing-canvas"
              aria-label="Drawing area"
              onPointerDown={startDrawing}
              onPointerMove={continueDrawing}
              onPointerUp={stopDrawing}
              onPointerCancel={stopDrawing}
              onPointerLeave={stopDrawing}
            />

            {!prediction && (
              <div className="canvas-hint">
                <span className="canvas-hint-icon">✦</span>
                <span>Start drawing here</span>
              </div>
            )}
          </div>

          <div className="canvas-footer">
            <p>Mouse, touchscreen and stylus supported</p>

            <button
              className="text-button"
              type="button"
              onClick={clearDrawing}
            >
              Clear canvas
            </button>
          </div>
        </div>

        <aside className="prediction-panel">
          <div>
            <span className="section-label">
              LIVE PREDICTION
            </span>

            <div className="guess-area">
              <p className="guess-intro">
                The AI thinks this is
              </p>

              <h2
                className={
                  correctPrediction
                    ? "guess guess--correct"
                    : "guess"
                }
              >
                {prediction
                  ? formatPrompt(prediction.prediction)
                  : "Waiting..."}
              </h2>
            </div>

            <div className="confidence-section">
              <div className="confidence-header">
                <span>Confidence</span>
                <strong>
                  {prediction
                    ? `${confidence.toFixed(1)}%`
                    : "—"}
                </strong>
              </div>

              <div className="confidence-track">
                <div
                  className="confidence-value"
                  style={{ width: `${confidence}%` }}
                />
              </div>
            </div>

            {prediction && (
              <div className="metrics">
                <div className="metric">
                  <span>Response</span>
                  <strong>
                    {prediction.inference_ms} ms
                  </strong>
                </div>

                <div className="metric">
                  <span>Match</span>
                  <strong>
                    {correctPrediction ? "Yes" : "Not yet"}
                  </strong>
                </div>
              </div>
            )}

            <div
              className={
                correctPrediction
                  ? "result-message result-message--success"
                  : "result-message"
              }
            >
              <span>
                {correctPrediction ? "✓" : "✦"}
              </span>
              <p>{message}</p>
            </div>

            {error && (
              <div className="error-message">
                {error}
              </div>
            )}
          </div>

          <div className="test-notice">
            <span>TEST MODE</span>
            <p>
              This version records a model match only. The
              final competition win threshold will be decided
              after real-user testing.
            </p>
          </div>
        </aside>
      </section>
    </main>
  );
}