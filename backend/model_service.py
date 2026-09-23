import base64
import io
import json
import threading
import time
from pathlib import Path

import numpy as np
import torch
from fastapi import HTTPException
from PIL import (
    Image,
    ImageOps,
    UnidentifiedImageError,
)
from torch import nn


MODEL_DIR = Path(__file__).parent / "models"

METADATA_PATH = (
    MODEL_DIR / "metadata_20.json"
)

MODEL_PATH = (
    MODEL_DIR / "best_drawing_cnn_20.pt"
)


class DrawingCNN(nn.Module):
    def __init__(
        self,
        number_of_classes: int,
    ):
        super().__init__()

        self.features = nn.Sequential(
            nn.Conv2d(
                1,
                32,
                kernel_size=3,
                padding=1,
            ),
            nn.BatchNorm2d(32),
            nn.ReLU(),
            nn.MaxPool2d(2),

            nn.Conv2d(
                32,
                64,
                kernel_size=3,
                padding=1,
            ),
            nn.BatchNorm2d(64),
            nn.ReLU(),
            nn.MaxPool2d(2),

            nn.Conv2d(
                64,
                128,
                kernel_size=3,
                padding=1,
            ),
            nn.BatchNorm2d(128),
            nn.ReLU(),

            nn.AdaptiveAvgPool2d(
                (4, 4),
            ),
        )

        self.classifier = nn.Sequential(
            nn.Flatten(),

            nn.Linear(
                128 * 4 * 4,
                128,
            ),

            nn.ReLU(),
            nn.Dropout(0.30),

            nn.Linear(
                128,
                number_of_classes,
            ),
        )

    def forward(self, images):
        features = self.features(images)

        return self.classifier(features)


def load_model():
    if not METADATA_PATH.exists():
        raise FileNotFoundError(
            "Metadata file was not found: "
            f"{METADATA_PATH}"
        )

    if not MODEL_PATH.exists():
        raise FileNotFoundError(
            "Model checkpoint was not found: "
            f"{MODEL_PATH}"
        )

    with METADATA_PATH.open(
        encoding="utf-8",
    ) as file:
        metadata = json.load(file)

    checkpoint = torch.load(
        MODEL_PATH,
        map_location="cpu",
        weights_only=True,
    )

    loaded_classes = metadata["classes"]

    checkpoint_class_order = checkpoint.get(
        "class_to_index"
    )

    metadata_class_order = metadata.get(
        "class_to_index"
    )

    if (
        checkpoint_class_order
        != metadata_class_order
    ):
        raise ValueError(
            "Checkpoint and metadata have "
            "different class orders."
        )

    loaded_model = DrawingCNN(
        len(loaded_classes)
    )

    loaded_model.load_state_dict(
        checkpoint["model_state_dict"]
    )

    loaded_model.eval()

    return (
        loaded_model,
        loaded_classes,
        metadata,
    )


model, classes, metadata = load_model()

inference_lock = threading.Lock()


def prepare_canvas(
    image_data_url: str,
) -> torch.Tensor:
    try:
        encoded_image = (
            image_data_url.split(",", 1)[1]
        )

        image_bytes = base64.b64decode(
            encoded_image,
            validate=True,
        )

        image = Image.open(
            io.BytesIO(image_bytes)
        ).convert("L")

    except (
        IndexError,
        ValueError,
        UnidentifiedImageError,
        OSError,
    ) as error:
        raise HTTPException(
            status_code=400,
            detail="Invalid canvas image.",
        ) from error

    # Browser:
    # black drawing on white background.
    #
    # Training:
    # white drawing on black background.
    drawing = ImageOps.invert(image)

    stroke_mask = drawing.point(
        lambda pixel:
        255 if pixel > 32 else 0
    )

    bounds = stroke_mask.getbbox()

    if bounds is None:
        raise HTTPException(
            status_code=400,
            detail="Draw something first.",
        )

    drawing = drawing.crop(bounds)

    width, height = drawing.size

    scale = 22 / max(width, height)

    new_size = (
        max(
            1,
            round(width * scale),
        ),
        max(
            1,
            round(height * scale),
        ),
    )

    drawing = drawing.resize(
        new_size,
        Image.Resampling.LANCZOS,
    )

    normalized = Image.new(
        "L",
        (28, 28),
        color=0,
    )

    normalized.paste(
        drawing,
        (
            (28 - new_size[0]) // 2,
            (28 - new_size[1]) // 2,
        ),
    )

    pixels = (
        np.asarray(
            normalized,
            dtype=np.float32,
        )
        / 255.0
    )

    return (
        torch.from_numpy(pixels)
        .unsqueeze(0)
        .unsqueeze(0)
    )


def predict_drawing(
    image_data_url: str,
) -> dict:
    start = time.perf_counter()

    image = prepare_canvas(
        image_data_url
    )

    # Two players could submit at the
    # same time. Serialize CPU inference.
    with inference_lock:
        with torch.inference_mode():
            logits = model(image)

            probabilities = torch.softmax(
                logits,
                dim=1,
            )[0]

    best_index = int(
        probabilities.argmax().item()
    )

    top_count = min(
        3,
        len(classes),
    )

    top_values, top_indices = torch.topk(
        probabilities,
        top_count,
    )

    top_predictions = [
        {
            "prediction": classes[
                int(index.item())
            ],
            "confidence": round(
                float(value.item()),
                4,
            ),
        }
        for value, index in zip(
            top_values,
            top_indices,
        )
    ]

    elapsed_ms = (
        time.perf_counter() - start
    ) * 1000

    return {
        "prediction": classes[best_index],
        "confidence": round(
            float(
                probabilities[
                    best_index
                ].item()
            ),
            4,
        ),
        "inference_ms": round(
            elapsed_ms,
            1,
        ),
        "top_predictions": (
            top_predictions
        ),
    }