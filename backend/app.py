import asyncio

from fastapi import (
    FastAPI,
    HTTPException,
    Query,
    WebSocket,
    WebSocketDisconnect,
)

from fastapi.middleware.cors import (
    CORSMiddleware,
)

from .game_manager import GameManager

from .model_service import (
    classes,
    metadata,
    predict_drawing,
)

from .schemas import (
    DrawingRequest,
    GamePredictionRequest,
    MatchmakingRequest,
    PlayerActionRequest,
)


app = FastAPI(
    title="AI Pictionary Game API",
    version="1.0.0",
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://172.20.10.2:5173",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)


game_manager = GameManager(
    available_classes=classes
)


@app.get("/")
def root():
    return {
        "name": "AI Pictionary Game API",
        "status": "running",
        "documentation": "/docs",
    }


@app.get("/health")
def health():
    return {
        "status": "ok",

        "model": {
            "number_of_classes": len(classes),
            "classes": classes,

            "image_size": metadata.get(
                "image_size",
                28,
            ),

            "pixel_format": metadata.get(
                "pixel_format",
                "white strokes on black background",
            ),
        },

        "game": {
            "maximum_players": 2,
            "maximum_rounds": 5,
            "round_seconds": 90,
        },
    }


# Standalone model test endpoint.
@app.post("/predict")
async def predict(
    request: DrawingRequest,
):
    return await asyncio.to_thread(
        predict_drawing,
        request.image_data_url,
    )


# Player enters their name.
# The backend automatically creates or
# finds a waiting two-player game.
@app.post("/matchmaking/join")
async def join_matchmaking(
    request: MatchmakingRequest,
):
    game, player = (
        await game_manager.join_matchmaking(
            request.name
        )
    )

    return {
        "player_id": player.id,

        "game": game_manager.public_state(
            game
        ),
    }


@app.get("/games/{game_id}")
def get_game(
    game_id: str,
    player_id: str = Query(...),
):
    game = game_manager.get_game(
        game_id
    )

    game_manager.get_player(
        game,
        player_id,
    )

    return game_manager.public_state(
        game
    )


@app.post("/games/{game_id}/ready")
async def player_ready(
    game_id: str,
    request: PlayerActionRequest,
):
    return await game_manager.mark_ready(
        game_id=game_id,
        player_id=request.player_id,
    )


@app.post("/games/{game_id}/predict")
async def game_prediction(
    game_id: str,
    request: GamePredictionRequest,
):
    game = game_manager.get_game(
        game_id
    )

    game_manager.get_player(
        game,
        request.player_id,
    )

    if game.phase != "DRAWING":
        raise HTTPException(
            status_code=409,
            detail=(
                "The round is not accepting "
                "drawings."
            ),
        )

    prediction_result = (
        await asyncio.to_thread(
            predict_drawing,
            request.image_data_url,
        )
    )

    return await game_manager.record_prediction(
        game_id=game_id,
        player_id=request.player_id,
        prediction_result=prediction_result,
    )


@app.post("/games/{game_id}/restart")
async def restart_game(
    game_id: str,
    request: PlayerActionRequest,
):
    return await game_manager.restart_game(
        game_id=game_id,
        player_id=request.player_id,
    )


@app.post("/games/{game_id}/leave")
async def leave_game(
    game_id: str,
    request: PlayerActionRequest,
):
    await game_manager.leave_game(
        game_id=game_id,
        player_id=request.player_id,
    )

    return {
        "status": "left",
    }


@app.websocket("/ws/games/{game_id}")
async def game_websocket(
    websocket: WebSocket,
    game_id: str,
    player_id: str,
):
    try:
        game = game_manager.get_game(
            game_id
        )

        game_manager.get_player(
            game,
            player_id,
        )

    except HTTPException:
        await websocket.close(
            code=4403
        )

        return

    await websocket.accept()

    await game_manager.connect_websocket(
        game=game,
        player_id=player_id,
        websocket=websocket,
    )

    try:
        while True:
            # Receives the frontend's
            # WebSocket heartbeat.
            await websocket.receive_text()

    except WebSocketDisconnect:
        pass

    except Exception:
        pass

    finally:
        game_manager.disconnect_websocket(
            game_id=game_id,
            websocket=websocket,
        )