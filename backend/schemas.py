from pydantic import BaseModel, Field


class MatchmakingRequest(BaseModel):
    name: str = Field(
        min_length=1,
        max_length=24,
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