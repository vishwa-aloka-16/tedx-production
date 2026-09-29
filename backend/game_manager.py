import asyncio
import math
import random
import secrets
import sqlite3
import time
from dataclasses import (
    dataclass,
    field,
)
from typing import Any
from .config import LEADERBOARD_PATH
from .difficulty import LEVELS, default_difficulties, round_difficulty

from fastapi import (
    HTTPException,
    WebSocket,
)


MAX_PLAYERS = 2
MAX_ROUNDS = 6
ROUND_SECONDS = 90
COUNTDOWN_SECONDS = 3
ROUND_RESULT_SECONDS = 6

CONFIDENCE_THRESHOLD = 0.4
REQUIRED_CONSECUTIVE_HITS = 3
MINIMUM_JUDGE_SECONDS = 1.5
FINAL_ROUND_DRAW_SECONDS = 3.0
LATE_ROUND_FRACTION = 0.8


@dataclass
class Player:
    id: str
    name: str
    seat: int

    ready: bool = False

    score: int = 0
    round_wins: int = 0

    last_guess: str = ""
    confidence: float = 0.0

    predictions_seen: int = 0
    consecutive_hits: int = 0

    recognized_at: (
        float | None
    ) = None


@dataclass
class Game:
    id: str
    required_hits: int = REQUIRED_CONSECUTIVE_HITS
    confidence_threshold: float = CONFIDENCE_THRESHOLD
    model_key: str = "pytorch_20"
    classes: list[str] = field(default_factory=list)
    class_difficulties: dict[str, str] = field(default_factory=dict)
    round_seconds: int = ROUND_SECONDS

    phase: str = "WAITING"

    players: dict[
        str,
        Player,
    ] = field(default_factory=dict)

    round_number: int = 0

    prompt: str = ""
    previous_prompt: str = ""
    used_prompts: set[str] = field(default_factory=set)

    countdown_ends_at: (
        float | None
    ) = None

    round_started_at: (
        float | None
    ) = None

    round_deadline: (
        float | None
    ) = None

    round_winner_id: (
        str | None
    ) = None

    round_points: int = 0

    created_at: float = field(
        default_factory=time.time
    )

    transition_token: int = 0
    leaderboard_recorded: bool = False
    round_winners: list[dict[str, Any]] = field(
        default_factory=list
    )

    @property
    def max_rounds(self) -> int:
        return min(MAX_ROUNDS, len(set(self.classes)))


class GameManager:
    def __init__(
        self,
        available_classes: list[str],
        classes_by_model: dict[str, list[str]],
    ):
        self.classes = (
            available_classes.copy()
        )
        self.classes_by_model = {
            model_key: classes.copy()
            for model_key, classes
            in classes_by_model.items()
        }
        self.model_key = next(iter(self.classes_by_model))
        self.round_seconds = ROUND_SECONDS
        self.required_hits = REQUIRED_CONSECUTIVE_HITS
        self.confidence_threshold = CONFIDENCE_THRESHOLD
        self.excluded_classes: set[str] = set()
        self.difficulties_by_model = {
            key: default_difficulties(classes)
            for key, classes in self.classes_by_model.items()
        }
        self.dashboard_reset_at = 0.0
        self.leaderboard_subscribers: set[asyncio.Queue] = set()

        self.games: dict[
            str,
            Game,
        ] = {}

        self.game_locks: dict[
            str,
            asyncio.Lock,
        ] = {}

        self.connections: dict[
            str,
            list[
                tuple[
                    WebSocket,
                    str,
                ]
            ],
        ] = {}

        self.matchmaking_lock = (
            asyncio.Lock()
        )
        self.leaderboard_path = LEADERBOARD_PATH
        self.initialize_leaderboard()

    def initialize_leaderboard(self):
        self.leaderboard_path.parent.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(self.leaderboard_path) as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS leaderboard (
                    player_name TEXT PRIMARY KEY,
                    score INTEGER NOT NULL DEFAULT 0,
                    wins INTEGER NOT NULL DEFAULT 0,
                    games INTEGER NOT NULL DEFAULT 0
                )
                """
            )

    def record_leaderboard(self, game: Game):
        if game.leaderboard_recorded:
            return

        with sqlite3.connect(self.leaderboard_path) as connection:
            for player in game.players.values():
                connection.execute(
                    """
                    INSERT INTO leaderboard (player_name, score, wins, games)
                    VALUES (?, ?, ?, 1)
                    ON CONFLICT(player_name) DO UPDATE SET
                        score = score + excluded.score,
                        wins = wins + excluded.wins,
                        games = games + 1
                    """,
                    (
                        player.name,
                        player.score,
                        player.round_wins,
                    ),
                )

        game.leaderboard_recorded = True

    def leaderboard(self) -> dict[str, Any]:
        with sqlite3.connect(self.leaderboard_path) as connection:
            connection.row_factory = sqlite3.Row
            rows = connection.execute(
                """
                SELECT player_name, score, wins, games
                FROM leaderboard
                ORDER BY score DESC, wins DESC, player_name ASC
                LIMIT 20
                """
            ).fetchall()

        players = [
            {
                "rank": rank,
                "name": row["player_name"],
                "score": row["score"],
                "wins": row["wins"],
                "games": row["games"],
            }
            for rank, row in enumerate(rows, start=1)
        ]

        games = [
            {
                "id": game.id,
                "status": (
                    "in_progress"
                    if game.phase != "FINAL_RESULT"
                    else "completed"
                ),
                "phase": game.phase,
                "players": [
                    player.name
                    for player in sorted(
                        game.players.values(),
                        key=lambda player: player.seat,
                    )
                ],
                "round_winners": game.round_winners,
                "game_result": self.game_result(game),
            }
            for game in self.games.values()
            if game.players
            and (
                game.phase != "FINAL_RESULT"
                or game.created_at >= self.dashboard_reset_at
            )
        ]

        return {
            "players": players,
            "games": games,
        }

    @staticmethod
    def game_result(game: Game) -> dict | None:
        if game.phase != "FINAL_RESULT" or not game.players:
            return None
        top_score = max(player.score for player in game.players.values())
        winners = [player.name for player in game.players.values() if player.score == top_score]
        return {
            "event_id": f"{game.id}-final-{game.transition_token}",
            "winners": winners,
            "score": top_score,
            "tied": len(winners) > 1,
        }

    def reset_dashboard(self) -> dict[str, Any]:
        with sqlite3.connect(self.leaderboard_path) as connection:
            connection.execute("DELETE FROM leaderboard")

        self.dashboard_reset_at = time.time()
        return self.leaderboard()

    @staticmethod
    def clean_name(name: str) -> str:
        cleaned_name = " ".join(
            name.strip().split()
        )

        if not cleaned_name:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Please enter your name."
                ),
            )

        return cleaned_name[:24]

    def admin_state(self) -> dict[str, Any]:
        classes = self.classes_by_model[self.model_key]
        return {
            "model_key": self.model_key,
            "round_seconds": self.round_seconds,
            "required_hits": self.required_hits,
            "confidence_threshold": self.confidence_threshold,
            "classes": [
                {
                    "name": class_name,
                    "enabled": class_name not in self.excluded_classes,
                    "difficulty": self.difficulties_by_model[self.model_key][class_name],
                }
                for class_name in classes
            ],
        }

    def update_admin_settings(
        self,
        model_key: str,
        round_seconds: int,
        excluded_classes: list[str],
        class_difficulties: dict[str, str] | None = None,
        required_hits: int = REQUIRED_CONSECUTIVE_HITS,
        confidence_threshold: float = CONFIDENCE_THRESHOLD,
    ) -> dict[str, Any]:
        if type(required_hits) is not int or not 1 <= required_hits <= 10:
            raise HTTPException(status_code=400, detail="Required stable guesses must be an integer from 1 to 10.")
        if not 0.01 <= confidence_threshold <= 1.0:
            raise HTTPException(status_code=400, detail="Pass confidence must be between 1% and 100%.")
        classes = self.classes_by_model.get(model_key)

        if classes is None:
            raise HTTPException(
                status_code=400,
                detail="Please choose a supported AI model.",
            )

        unknown_classes = set(excluded_classes) - set(classes)
        if unknown_classes:
            raise HTTPException(
                status_code=400,
                detail="One or more excluded classes are not in the selected model.",
            )

        if len(unknown_classes) == len(classes):
            raise HTTPException(
                status_code=400,
                detail="At least one class must remain enabled.",
            )

        if len(set(excluded_classes)) >= len(classes):
            raise HTTPException(
                status_code=400,
                detail="At least one class must remain enabled.",
            )

        difficulties = (self.difficulties_by_model[model_key].copy()
                        if class_difficulties is None else class_difficulties.copy())
        if set(difficulties) != set(classes) or any(
            level not in LEVELS for level in difficulties.values()
        ):
            raise HTTPException(status_code=400, detail="Assign every class to easy, medium, or hard.")
        for level in LEVELS:
            if sum(name not in excluded_classes and difficulties[name] == level
                   for name in classes) < 2:
                raise HTTPException(status_code=400, detail=f"Enable at least two {level} classes for six unique rounds.")

        self.difficulties_by_model[model_key] = difficulties
        self.model_key = model_key
        self.round_seconds = round_seconds
        self.required_hits = required_hits
        self.confidence_threshold = confidence_threshold
        self.excluded_classes = set(excluded_classes)
        return self.admin_state()

    @staticmethod
    def create_game_id() -> str:
        return secrets.token_urlsafe(12)

    @staticmethod
    def create_player_id() -> str:
        return secrets.token_urlsafe(18)

    def get_game(
        self,
        game_id: str,
    ) -> Game:
        game = self.games.get(game_id)

        if game is None:
            raise HTTPException(
                status_code=404,
                detail=(
                    "Game was not found. "
                    "Please join a new game."
                ),
            )

        return game

    @staticmethod
    def get_player(
        game: Game,
        player_id: str,
    ) -> Player:
        player = game.players.get(
            player_id
        )

        if player is None:
            raise HTTPException(
                status_code=403,
                detail=(
                    "This player is not part "
                    "of the game."
                ),
            )

        return player

    @staticmethod
    def reset_player_round(
        player: Player,
    ):
        player.last_guess = ""
        player.confidence = 0.0

        player.predictions_seen = 0
        player.consecutive_hits = 0

        player.recognized_at = None

    def public_state(
        self,
        game: Game,
    ) -> dict[str, Any]:
        ordered_players = sorted(
            game.players.values(),
            key=lambda player:
            player.seat,
        )

        round_winner = (
            game.players.get(
                game.round_winner_id or ""
            )
        )

        return {
            "id": game.id,
            "model_key": game.model_key,
            "phase": game.phase,

            "round_number": (
                game.round_number
            ),

            "max_rounds": game.max_rounds,
            "difficulty": round_difficulty(
                game.round_number + 1 if game.phase == "COUNTDOWN" else game.round_number
            ),
            "round_seconds": (
                game.round_seconds
            ),

            "prompt": game.prompt,

            "countdown_ends_at": (
                game.countdown_ends_at
            ),

            "round_started_at": (
                game.round_started_at
            ),

            "round_deadline": (
                game.round_deadline
            ),

            "round_winner_id": (
                game.round_winner_id
            ),

            "round_winner_name": (
                round_winner.name
                if round_winner
                else None
            ),

            "round_points": (
                game.round_points
            ),

            "players": [
                {
                    "id": player.id,
                    "name": player.name,
                    "seat": player.seat,
                    "ready": player.ready,

                    "score": player.score,

                    "round_wins": (
                        player.round_wins
                    ),

                    "last_guess": (
                        player.last_guess
                    ),

                    "confidence": (
                        player.confidence
                    ),

                    "consecutive_hits": (
                        player
                        .consecutive_hits
                    ),

                    "recognized": (
                        player.recognized_at
                        is not None
                    ),
                }
                for player
                in ordered_players
            ],

            "judge": {
                "confidence_threshold": (
                    game.confidence_threshold
                ),

                "required_hits": (
                    game.required_hits
                ),

                "minimum_seconds": (
                    MINIMUM_JUDGE_SECONDS
                ),
            },
        }

    async def broadcast(
        self,
        game: Game,
    ):
        payload = {
            "type": "game_state",
            "game": self.public_state(game),
        }

        active_connections = []

        for (
            websocket,
            player_id,
        ) in self.connections.get(
            game.id,
            [],
        ):
            try:
                await websocket.send_json(
                    payload
                )

                active_connections.append(
                    (
                        websocket,
                        player_id,
                    )
                )

            except Exception:
                # Remove dead connections.
                pass

        self.connections[
            game.id
        ] = active_connections

    async def connect_websocket(
        self,
        game: Game,
        player_id: str,
        websocket: WebSocket,
    ):
        self.connections.setdefault(
            game.id,
            [],
        ).append(
            (
                websocket,
                player_id,
            )
        )

        await websocket.send_json(
            {
                "type": "game_state",
                "game": (
                    self.public_state(game)
                ),
            }
        )

    def disconnect_websocket(
        self,
        game_id: str,
        websocket: WebSocket,
    ):
        current_connections = (
            self.connections.get(
                game_id,
                [],
            )
        )

        self.connections[game_id] = [
            (
                connected_socket,
                player_id,
            )
            for (
                connected_socket,
                player_id,
            )
            in current_connections
            if (
                connected_socket
                is not websocket
            )
        ]

    async def join_matchmaking(
        self,
        name: str,
        model_key: str | None = None,
    ) -> tuple[Game, Player]:
        player_name = self.clean_name(
            name
        )

        model_key = model_key or self.model_key

        if model_key not in self.classes_by_model:
            raise HTTPException(
                status_code=400,
                detail="Please choose a supported AI model.",
            )

        async with self.matchmaking_lock:
            waiting_game = None

            for existing_game in (
                self.games.values()
            ):
                if (
                    existing_game.phase
                    == "WAITING"
                    and existing_game.model_key
                    == model_key
                    and len(
                        existing_game.players
                    )
                    == 1
                ):
                    waiting_game = (
                        existing_game
                    )
                    break

            if waiting_game:
                player = Player(
                    id=(
                        self
                        .create_player_id()
                    ),
                    name=player_name,
                    seat=2,
                )

                waiting_game.players[
                    player.id
                ] = player

                waiting_game.phase = "LOBBY"

                await self.broadcast(
                    waiting_game
                )

                return (
                    waiting_game,
                    player,
                )

            game = Game(
                id=self.create_game_id(),
                model_key=model_key,
                classes=[
                    item
                    for item in self.classes_by_model[model_key]
                    if item not in self.excluded_classes
                ],
                round_seconds=self.round_seconds,
                required_hits=self.required_hits,
                confidence_threshold=self.confidence_threshold,
                class_difficulties=self.difficulties_by_model[model_key].copy(),
            )

            if not game.classes:
                raise HTTPException(
                    status_code=400,
                    detail="At least one class must remain enabled.",
                )

            player = Player(
                id=self.create_player_id(),
                name=player_name,
                seat=1,
            )

            game.players[player.id] = (
                player
            )

            self.games[game.id] = game

            self.game_locks[game.id] = (
                asyncio.Lock()
            )

            self.connections[game.id] = []

            return game, player

    async def mark_ready(
        self,
        game_id: str,
        player_id: str,
    ) -> dict:
        game = self.get_game(game_id)

        game_lock = self.game_locks[
            game.id
        ]

        async with game_lock:
            player = self.get_player(
                game,
                player_id,
            )

            if game.phase not in {
                "WAITING",
                "LOBBY",
            }:
                raise HTTPException(
                    status_code=409,
                    detail=(
                        "The game has already "
                        "started."
                    ),
                )

            player.ready = True

            both_players_ready = (
                len(game.players)
                == MAX_PLAYERS
                and all(
                    current_player.ready
                    for current_player
                    in game.players.values()
                )
            )

            if both_players_ready:
                await self.start_countdown(
                    game
                )
            else:
                await self.broadcast(game)

            return self.public_state(game)

    async def start_countdown(
        self,
        game: Game,
    ):
        game.transition_token += 1

        countdown_token = (
            game.transition_token
        )

        game.phase = "COUNTDOWN"

        game.countdown_ends_at = (
            time.time()
            + COUNTDOWN_SECONDS
        )

        game.round_winner_id = None
        game.round_points = 0

        await self.broadcast(game)

        asyncio.create_task(
            self.begin_round_after_countdown(
                game.id,
                countdown_token,
            )
        )

    async def begin_round_after_countdown(
        self,
        game_id: str,
        countdown_token: int,
    ):
        await asyncio.sleep(
            COUNTDOWN_SECONDS
        )

        game = self.games.get(game_id)

        if game is None:
            return

        game_lock = self.game_locks.get(
            game_id
        )

        if game_lock is None:
            return

        async with game_lock:
            if (
                game.transition_token
                != countdown_token
                or game.phase
                != "COUNTDOWN"
            ):
                return

            last_prompt = game.prompt

            prompt_options = [
                prompt
                for prompt in dict.fromkeys(game.classes)
                if prompt not in game.used_prompts
                and (not game.class_difficulties or
                     game.class_difficulties.get(prompt) == round_difficulty(game.round_number + 1))
            ]

            if not prompt_options:
                game.phase = "FINAL_RESULT"
                game.countdown_ends_at = None
                game.transition_token += 1
                self.record_leaderboard(game)
                await self.broadcast(game)
                return

            game.previous_prompt = (
                last_prompt
            )

            game.prompt = random.choice(
                prompt_options
            )
            game.used_prompts.add(game.prompt)

            game.round_number += 1
            game.phase = "DRAWING"

            game.countdown_ends_at = None

            game.round_started_at = (
                time.time()
            )

            game.round_deadline = (
                game.round_started_at
                + game.round_seconds
            )

            game.round_winner_id = None
            game.round_points = 0

            for player in (
                game.players.values()
            ):
                self.reset_player_round(
                    player
                )

            game.transition_token += 1

            round_token = (
                game.transition_token
            )

            await self.broadcast(game)

            asyncio.create_task(
                self.end_round_on_timeout(
                    game.id,
                    round_token,
                )
            )

    async def end_round_on_timeout(
        self,
        game_id: str,
        round_token: int,
    ):
        game = self.games.get(game_id)

        if game is None:
            return

        await asyncio.sleep(game.round_seconds * LATE_ROUND_FRACTION)

        game_lock = self.game_locks.get(game_id)
        if game_lock is None:
            return
        async with game_lock:
            if game.transition_token != round_token or game.phase != "DRAWING":
                return
            winner = self.highest_confidence_player(game)
            if winner is not None:
                await self.finish_round(game, winner=winner)
                return

        await asyncio.sleep(game.round_seconds * (1 - LATE_ROUND_FRACTION))

        game = self.games.get(game_id)

        if game is None:
            return

        game_lock = self.game_locks.get(
            game_id
        )

        if game_lock is None:
            return

        async with game_lock:
            if (
                game.transition_token
                != round_token
                or game.phase
                != "DRAWING"
            ):
                return

            await self.finish_round(
                game,
                winner=self.highest_confidence_player(game),
            )

    @staticmethod
    def highest_confidence_player(game: Game) -> Player | None:
        candidates = sorted(
            (player for player in game.players.values()
             if player.predictions_seen > 0 and player.last_guess == game.prompt
             and player.confidence > 0),
            key=lambda player: player.confidence,
            reverse=True,
        )
        if not candidates:
            return None
        # Equal confidence is not a win; keep drawing until the tie breaks.
        if len(candidates) > 1 and candidates[0].confidence == candidates[1].confidence:
            return None
        return candidates[0]

    @staticmethod
    def prediction_wait_response(game: Game) -> dict | None:
        if game.phase != "DRAWING" or game.round_number != game.max_rounds:
            return None
        elapsed = (time.time() - game.round_started_at
                   if game.round_started_at is not None else 0)
        remaining = FINAL_ROUND_DRAW_SECONDS - elapsed
        if remaining <= 0:
            return None
        return {
            "prediction": "",
            "confidence": 0.0,
            "accepted": False,
            "round_finished": False,
            "consecutive_hits": 0,
            "required_hits": game.required_hits,
            "retry_after_seconds": remaining,
        }

    async def record_prediction(
        self,
        game_id: str,
        player_id: str,
        prediction_result: dict,
    ) -> dict:
        game = self.get_game(game_id)

        game_lock = self.game_locks[
            game.id
        ]

        async with game_lock:
            player = self.get_player(
                game,
                player_id,
            )

            if game.phase != "DRAWING":
                return {
                    **prediction_result,
                    "accepted": False,
                    "round_finished": True,
                    "consecutive_hits": 0,
                    "required_hits": (
                        game.required_hits
                    ),
                }

            waiting = self.prediction_wait_response(game)
            if waiting is not None:
                return waiting

            player.predictions_seen += 1

            player.last_guess = (
                prediction_result[
                    "prediction"
                ]
            )

            player.confidence = (
                prediction_result[
                    "confidence"
                ]
            )

            prediction_is_correct = (
                player.last_guess
                == game.prompt
                and player.confidence
                >= game.confidence_threshold
            )

            if prediction_is_correct:
                player.consecutive_hits += 1
            else:
                player.consecutive_hits = 0

            current_time = time.time()

            elapsed_seconds = (
                current_time
                - (
                    game.round_started_at
                    or current_time
                )
            )

            prediction_accepted = (
                elapsed_seconds
                >= MINIMUM_JUDGE_SECONDS
                and player.predictions_seen
                >= game.required_hits
                and player.consecutive_hits
                >= game.required_hits
            )

            winner = player if prediction_accepted else None
            if elapsed_seconds >= game.round_seconds * LATE_ROUND_FRACTION:
                winner = self.highest_confidence_player(game)
                prediction_accepted = winner is not None and winner.id == player.id

            response = {
                **prediction_result,

                "accepted": (
                    prediction_accepted
                ),

                "consecutive_hits": (
                    player
                    .consecutive_hits
                ),

                "required_hits": (
                    game.required_hits
                ),
            }

            if winner is not None:
                await self.finish_round(
                    game,
                    winner=winner,
                )
            else:
                await self.broadcast(game)

            return response

    async def finish_round(
        self,
        game: Game,
        winner: Player | None,
    ):
        current_time = time.time()

        game.phase = "ROUND_RESULT"

        # Invalidates the timeout task.
        game.transition_token += 1

        result_token = (
            game.transition_token
        )

        if winner:
            remaining_seconds = max(
                0,
                math.ceil(
                    (
                        game.round_deadline
                        or current_time
                    )
                    - current_time
                ),
            )

            round_points = (
                1000
                + remaining_seconds * 10
            )

            winner.score += round_points
            winner.round_wins += 1
            winner.recognized_at = (
                current_time
            )

            game.round_winner_id = (
                winner.id
            )

            game.round_points = (
                round_points
            )

        else:
            game.round_winner_id = None
            game.round_points = 0

        game.round_winners.append(
            {
                "event_id": secrets.token_urlsafe(12),
                "round": game.round_number,
                "winner": winner.name if winner else None,
                "points": game.round_points,
            }
        )

        game.round_deadline = None

        for queue in self.leaderboard_subscribers:
            if not queue.full():
                queue.put_nowait(True)
        await self.broadcast(game)

        asyncio.create_task(
            self.advance_after_result(
                game.id,
                result_token,
            )
        )

    async def advance_after_result(
        self,
        game_id: str,
        result_token: int,
    ):
        await asyncio.sleep(
            ROUND_RESULT_SECONDS
        )

        game = self.games.get(game_id)

        if game is None:
            return

        game_lock = self.game_locks.get(
            game_id
        )

        if game_lock is None:
            return

        async with game_lock:
            if (
                game.transition_token
                != result_token
                or game.phase
                != "ROUND_RESULT"
            ):
                return

            if (
                game.round_number
                >= game.max_rounds
            ):
                game.phase = "FINAL_RESULT"
                self.record_leaderboard(game)
                game.transition_token += 1

                for queue in self.leaderboard_subscribers:
                    if not queue.full():
                        queue.put_nowait(True)
                await self.broadcast(game)

                return

            await self.start_countdown(game)

    async def restart_game(
        self,
        game_id: str,
        player_id: str,
    ) -> dict:
        game = self.get_game(game_id)

        game_lock = self.game_locks[
            game.id
        ]

        async with game_lock:
            self.get_player(
                game,
                player_id,
            )

            if (
                game.phase
                != "FINAL_RESULT"
            ):
                raise HTTPException(
                    status_code=409,
                    detail=(
                        "The game has not "
                        "finished yet."
                    ),
                )

            game.transition_token += 1

            game.phase = "LOBBY"
            game.round_number = 0

            game.prompt = ""
            game.previous_prompt = ""
            game.used_prompts.clear()
            game.leaderboard_recorded = False

            game.countdown_ends_at = None
            game.round_started_at = None
            game.round_deadline = None

            game.round_winner_id = None
            game.round_points = 0
            game.round_winners = []

            for player in (
                game.players.values()
            ):
                player.ready = False
                player.score = 0
                player.round_wins = 0

                self.reset_player_round(
                    player
                )

            await self.broadcast(game)

            return self.public_state(game)

    async def leave_game(
        self,
        game_id: str,
        player_id: str,
    ):
        game = self.get_game(game_id)

        game_lock = self.game_locks[
            game.id
        ]

        async with self.matchmaking_lock:
            async with game_lock:
                self.get_player(
                    game,
                    player_id,
                )

                game.players.pop(
                    player_id,
                    None,
                )

                game.transition_token += 1

                # Remove WebSockets belonging
                # to the leaving player.
                self.connections[
                    game.id
                ] = [
                    (
                        websocket,
                        connected_player_id,
                    )
                    for (
                        websocket,
                        connected_player_id,
                    )
                    in self.connections.get(
                        game.id,
                        [],
                    )
                    if (
                        connected_player_id
                        != player_id
                    )
                ]

                if not game.players:
                    self.games.pop(
                        game.id,
                        None,
                    )

                    self.game_locks.pop(
                        game.id,
                        None,
                    )

                    self.connections.pop(
                        game.id,
                        None,
                    )

                    return

                remaining_player = next(
                    iter(
                        game.players.values()
                    )
                )

                remaining_player.seat = 1
                remaining_player.ready = False
                remaining_player.score = 0
                remaining_player.round_wins = 0

                self.reset_player_round(
                    remaining_player
                )

                game.phase = "WAITING"
                game.round_number = 0

                game.prompt = ""
                game.previous_prompt = ""
                game.used_prompts.clear()
                game.round_winners = []
                game.leaderboard_recorded = False

                game.countdown_ends_at = None
                game.round_started_at = None
                game.round_deadline = None

                game.round_winner_id = None
                game.round_points = 0

                await self.broadcast(game)
