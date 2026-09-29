import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  submitDrawing,
  submitRoundDrawing,
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
  roundEventId,
  roundWinnerId,
}) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const activePointerRef = useRef(null);
  const enabledRef = useRef(false);
  const predictionEnabledRef = useRef(false);
  const [capturedEventId, setCapturedEventId] = useState(null);
  const cosmeticDrawing = phase === "ROUND_RESULT" && Boolean(roundWinnerId && roundEventId) && capturedEventId !== roundEventId;

  const predictionTimerRef = useRef(null);

  const predictionRunningRef =
    useRef(false);

  const drawingChangedRef =
    useRef(false);

  const drawingVersionRef = useRef(0);
  const hasDrawingRef = useRef(false);
  const cachedImageRef = useRef(null);

  const [prediction, setPrediction] =
    useState(null);

  const [
    predictionError,
    setPredictionError,
  ] = useState("");

  const drawingEnabled =
    phase === "DRAWING" || cosmeticDrawing;

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
    predictionEnabledRef.current = phase === "DRAWING";
    if (phase !== "DRAWING") {
      drawingVersionRef.current += 1;
      window.clearTimeout(predictionTimerRef.current);
      predictionTimerRef.current = null;
    }
  }, [phase]);

  useEffect(() => {
    if (!cosmeticDrawing) return undefined;
    const timer = window.setTimeout(() => {
      enabledRef.current = false;
      drawingRef.current = false;
      activePointerRef.current = null;
      const image = playerId === roundWinnerId && hasDrawingRef.current ? canvasRef.current?.toDataURL("image/png") : null;
      setCapturedEventId(roundEventId);
      if (image) {
        // This endpoint only attaches display media; it never runs inference.
        submitRoundDrawing(gameId, playerId, roundEventId, image).catch(() => {});
      }
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [cosmeticDrawing, gameId, playerId, roundEventId, roundWinnerId]);

  useEffect(() => {
    if (phase === "ROUND_RESULT") return;
    drawingVersionRef.current += 1;
    drawingRef.current = false;
    activePointerRef.current = null;
    drawingChangedRef.current = false;
    hasDrawingRef.current = false;
    cachedImageRef.current = null;

    window.clearTimeout(
      predictionTimerRef.current,
    );

    predictionTimerRef.current = null;

    setPrediction(null);
    setPredictionError("");

    window.requestAnimationFrame(() => {
      resetCanvas(canvasRef.current);
    });
  }, [gameId, playerId, roundNumber, phase]);

  useEffect(() => {
    return () => {
      enabledRef.current = false;
      predictionEnabledRef.current = false;
      drawingVersionRef.current += 1;
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
        !hasDrawingRef.current ||
        !predictionEnabledRef.current
      ) {
        return;
      }

      predictionRunningRef.current = true;
      drawingChangedRef.current = false;

      const requestVersion =
        drawingVersionRef.current;
      let retry = false;
      let retryDelay = PREDICTION_DELAY_MS;

      try {
        const imageDataUrl = cachedImageRef.current ?? canvasRef.current.toDataURL("image/png");
        cachedImageRef.current = imageDataUrl;

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
          if (result.accepted || result.round_finished) {
            predictionEnabledRef.current = false;
          } else {
            retry = true;
            retryDelay = Math.max(
              PREDICTION_DELAY_MS,
              (Number(result.retry_after_seconds) || 0) * 1000,
            );
          }
        }
      } catch (error) {
        const roundFinished =
          error.message
            .toLowerCase()
            .includes("not accepting");

        if (requestVersion === drawingVersionRef.current && roundFinished) {
          predictionEnabledRef.current = false;
        }

        if (
          requestVersion ===
            drawingVersionRef.current &&
          !roundFinished
        ) {
          setPredictionError(
            error.message,
          );
          retry = !error.message.toLowerCase().includes("draw something first");
          retryDelay = 1500;
        }
      } finally {
        predictionRunningRef.current =
          false;

        if (
          predictionEnabledRef.current &&
          hasDrawingRef.current &&
          (drawingChangedRef.current ||
            (retry && requestVersion === drawingVersionRef.current))
        ) {
          window.clearTimeout(predictionTimerRef.current);
          predictionTimerRef.current =
            window.setTimeout(() => {
              predictionTimerRef.current =
                null;

              predictDrawing();
            }, requestVersion === drawingVersionRef.current ? retryDelay : PREDICTION_DELAY_MS);
        }
      }
    }, [gameId, playerId]);

  const schedulePrediction =
    useCallback(() => {
      if (!enabledRef.current) return;

      drawingChangedRef.current = true;
      hasDrawingRef.current = true;
      cachedImageRef.current = null;

      if (!predictionEnabledRef.current) return;

      if (
        predictionRunningRef.current ||
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
    cachedImageRef.current = null;
    drawingVersionRef.current += 1;
    drawingRef.current = false;
    activePointerRef.current = null;
    drawingChangedRef.current = false;
    hasDrawingRef.current = false;

    window.clearTimeout(
      predictionTimerRef.current,
    );

    predictionTimerRef.current = null;

    resetCanvas(canvasRef.current);

    setPrediction(null);
    setPredictionError("");
  }

  return {
    cosmeticDrawing,
    canvasRef,
    prediction,
    predictionError,
    clearDrawing,
    startDrawing,
    continueDrawing,
    stopDrawing,
  };
}
