import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  submitDrawing,
} from "../lib/gameApi";

const PREDICTION_DELAY_MS = 350;

function resetCanvas(canvas) {
  if (!canvas) return;

  const context =
    canvas.getContext("2d");

  context.fillStyle = "#ffffff";

  context.fillRect(
    0,
    0,
    canvas.width,
    canvas.height,
  );

  context.strokeStyle = "#181426";
  context.fillStyle = "#181426";
  context.lineWidth = 15;
  context.lineCap = "round";
  context.lineJoin = "round";
}

function getPointerPosition(
  event,
  canvas,
) {
  const bounds =
    canvas.getBoundingClientRect();

  return {
    x:
      ((event.clientX - bounds.left) /
        bounds.width) *
      canvas.width,

    y:
      ((event.clientY - bounds.top) /
        bounds.height) *
      canvas.height,
  };
}

export default function useDrawingCanvas({
  gameId,
  playerId,
  roundNumber,
  phase,
}) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const activePointerRef = useRef(null);
  const enabledRef = useRef(false);

  const predictionTimerRef = useRef(null);

  const predictionRunningRef =
    useRef(false);

  const drawingChangedRef =
    useRef(false);

  const drawingVersionRef = useRef(0);

  const [prediction, setPrediction] =
    useState(null);

  const [
    predictionError,
    setPredictionError,
  ] = useState("");

  const drawingEnabled =
    phase === "DRAWING";

  useEffect(() => {
    enabledRef.current =
      drawingEnabled;

    if (!drawingEnabled) {
      drawingRef.current = false;
      activePointerRef.current = null;

      window.clearTimeout(
        predictionTimerRef.current,
      );

      predictionTimerRef.current = null;
    }
  }, [drawingEnabled]);

  useEffect(() => {
    drawingVersionRef.current += 1;
    drawingRef.current = false;
    activePointerRef.current = null;
    drawingChangedRef.current = false;

    window.clearTimeout(
      predictionTimerRef.current,
    );

    predictionTimerRef.current = null;

    setPrediction(null);
    setPredictionError("");

    window.requestAnimationFrame(() => {
      resetCanvas(canvasRef.current);
    });
  }, [roundNumber, phase]);

  useEffect(() => {
    return () => {
      window.clearTimeout(
        predictionTimerRef.current,
      );
    };
  }, []);

  const predictDrawing =
    useCallback(async () => {
      if (
        predictionRunningRef.current ||
        !canvasRef.current ||
        !enabledRef.current
      ) {
        return;
      }

      predictionRunningRef.current = true;
      drawingChangedRef.current = false;

      const requestVersion =
        drawingVersionRef.current;

      try {
        const imageDataUrl =
          canvasRef.current.toDataURL(
            "image/png",
          );

        const result =
          await submitDrawing(
            gameId,
            playerId,
            imageDataUrl,
          );

        if (
          requestVersion ===
          drawingVersionRef.current
        ) {
          setPrediction(result);
          setPredictionError("");
        }
      } catch (error) {
        const roundFinished =
          error.message
            .toLowerCase()
            .includes("not accepting");

        if (
          requestVersion ===
            drawingVersionRef.current &&
          !roundFinished
        ) {
          setPredictionError(
            error.message,
          );
        }
      } finally {
        predictionRunningRef.current =
          false;

        if (
          drawingChangedRef.current &&
          enabledRef.current
        ) {
          predictionTimerRef.current =
            window.setTimeout(() => {
              predictionTimerRef.current =
                null;

              predictDrawing();
            }, PREDICTION_DELAY_MS);
        }
      }
    }, [gameId, playerId]);

  const schedulePrediction =
    useCallback(() => {
      if (!enabledRef.current) return;

      drawingChangedRef.current = true;

      if (
        predictionTimerRef.current !==
        null
      ) {
        return;
      }

      predictionTimerRef.current =
        window.setTimeout(() => {
          predictionTimerRef.current =
            null;

          predictDrawing();
        }, PREDICTION_DELAY_MS);
    }, [predictDrawing]);

  function startDrawing(event) {
    if (!enabledRef.current || !event.isPrimary || event.button !== 0 || drawingRef.current) return;

    event.preventDefault();

    const canvas = canvasRef.current;

    const context =
      canvas.getContext("2d");

    const point = getPointerPosition(
      event,
      canvas,
    );

    canvas.setPointerCapture(
      event.pointerId,
    );

    drawingRef.current = true;
    activePointerRef.current = event.pointerId;

    context.beginPath();
    context.moveTo(point.x, point.y);

    context.lineTo(
      point.x + 0.01,
      point.y + 0.01,
    );

    context.stroke();

    schedulePrediction();
  }

  function continueDrawing(event) {
    if (
      !drawingRef.current ||
      event.pointerId !== activePointerRef.current ||
      !enabledRef.current
    ) {
      return;
    }

    event.preventDefault();

    const canvas = canvasRef.current;

    const context =
      canvas.getContext("2d");

    const point = getPointerPosition(
      event,
      canvas,
    );

    context.lineTo(point.x, point.y);
    context.stroke();

    schedulePrediction();
  }

  function stopDrawing(event) {
    if (!drawingRef.current) return;
    if (event?.pointerId !== undefined && event.pointerId !== activePointerRef.current) return;

    drawingRef.current = false;
    activePointerRef.current = null;

    if (
      event?.pointerId !== undefined &&
      canvasRef.current?.hasPointerCapture(
        event.pointerId,
      )
    ) {
      canvasRef.current.releasePointerCapture(
        event.pointerId,
      );
    }

    schedulePrediction();
  }

  function clearDrawing() {
    drawingVersionRef.current += 1;
    drawingRef.current = false;
    activePointerRef.current = null;
    drawingChangedRef.current = false;

    window.clearTimeout(
      predictionTimerRef.current,
    );

    predictionTimerRef.current = null;

    resetCanvas(canvasRef.current);

    setPrediction(null);
    setPredictionError("");
  }

  return {
    canvasRef,
    prediction,
    predictionError,
    clearDrawing,
    startDrawing,
    continueDrawing,
    stopDrawing,
  };
}
