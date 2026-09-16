import base64
import io
import json
import time
from pathlib import Path

import numpy as np
import torch
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import BaseModel
from torch import nn


MODEL_DIR = Path(__file__).parent / "models"

with (MODEL_DIR / "metadata.json").open(encoding="utf-8") as file:
    metadata = json.load(file)

checkpoint = torch.load(
    MODEL_DIR / "best_drawing_cnn.pt",
    map_location="cpu",
    weights_only=True,
)

classes = metadata["classes"]
if checkpoint["class_to_index"] != metadata["class_to_index"]:
    raise ValueError("Checkpoint and metadata have different class orders")


class DrawingCNN(nn.Module):
    def __init__(self, number_of_classes):
        super().__init__()

        self.features = nn.Sequential(
            nn.Conv2d(1, 32, kernel_size=3, padding=1),
            nn.BatchNorm2d(32),
            nn.ReLU(),
            nn.MaxPool2d(2),
            nn.Conv2d(32, 64, kernel_size=3, padding=1),
            nn.BatchNorm2d(64),
            nn.ReLU(),
            nn.MaxPool2d(2),
            nn.Conv2d(64, 128, kernel_size=3, padding=1),
            nn.BatchNorm2d(128),
            nn.ReLU(),
            nn.AdaptiveAvgPool2d((4, 4)),
        )

        self.classifier = nn.Sequential(
            nn.Flatten(),
            nn.Linear(128 * 4 * 4, 128),
            nn.ReLU(),
            nn.Dropout(0.30),
            nn.Linear(128, number_of_classes),
        )

    def forward(self, images):
        return self.classifier(self.features(images))


model = DrawingCNN(len(classes))
model.load_state_dict(checkpoint["model_state_dict"])
model.eval()


class DrawingRequest(BaseModel):
    image_data_url: str


app = FastAPI(title="AI Pictionary API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


def prepare_canvas(image_data_url: str) -> torch.Tensor:
    try:
        encoded_image = image_data_url.split(",", 1)[1]
        image_bytes = base64.b64decode(encoded_image, validate=True)
        image = Image.open(io.BytesIO(image_bytes)).convert("L")
    except (IndexError, ValueError, UnidentifiedImageError, OSError) as error:
        raise HTTPException(status_code=400, detail="Invalid canvas image") from error

    # Browser canvas: black drawing on white background.
    # Training images: white drawing on black background.
    drawing = ImageOps.invert(image)

    stroke_mask = drawing.point(lambda pixel: 255 if pixel > 32 else 0)
    bounds = stroke_mask.getbbox()
    if bounds is None:
        raise HTTPException(status_code=400, detail="Draw something first")

    drawing = drawing.crop(bounds)
    width, height = drawing.size
    scale = 22 / max(width, height)  # 28 pixels with a 3-pixel margin
    new_size = (
        max(1, round(width * scale)),
        max(1, round(height * scale)),
    )

    drawing = drawing.resize(new_size, Image.Resampling.LANCZOS)
    normalized = Image.new("L", (28, 28), color=0)
    normalized.paste(
        drawing,
        ((28 - new_size[0]) // 2, (28 - new_size[1]) // 2),
    )

    pixels = np.asarray(normalized, dtype=np.float32) / 255.0
    return torch.from_numpy(pixels).unsqueeze(0).unsqueeze(0)


@app.get("/health")
def health():
    return {"status": "ok", "classes": classes}


@app.post("/predict")
def predict(request: DrawingRequest):
    start = time.perf_counter()
    image = prepare_canvas(request.image_data_url)

    with torch.inference_mode():
        probabilities = torch.softmax(model(image), dim=1)[0]

    best_index = int(probabilities.argmax().item())
    return {
        "prediction": classes[best_index],
        "confidence": round(float(probabilities[best_index]), 4),
        "inference_ms": round((time.perf_counter() - start) * 1000, 1),
    }