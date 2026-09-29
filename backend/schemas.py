from pydantic import BaseModel, Field


class MatchmakingRequest(BaseModel):
    name: str = Field(
        min_length=1,
        max_length=24,
    )


class AdminSettingsRequest(BaseModel):
    required_hits: int = Field(default=3, ge=1, le=10, strict=True)
    confidence_threshold: float = Field(default=0.4, ge=0.01, le=1.0)
    class_difficulties: dict[str, str] | None = None
    model_key: str
    round_seconds: int = Field(
        ge=10,
        le=600,
    )
    excluded_classes: list[str] = Field(
        default_factory=list,
    )


class PlayerActionRequest(BaseModel):
    player_id: str


class GamePredictionRequest(
    PlayerActionRequest
):
    image_data_url: str = Field(
        min_length=1,
    )


class DrawingRequest(BaseModel):
    image_data_url: str = Field(
        min_length=1,
    )
