import asyncio
import math
import random
import secrets
import time
from dataclasses import (
    dataclass,
    field,
)
from typing import Any

from fastapi import (
    HTTPException,
    WebSocket,
)


MAX_PLAYERS = 2
MAX_ROUNDS = 5
ROUND_SECONDS = 90
COUNTDOWN_SECONDS = 3
ROUND_RESULT_SECONDS = 6

CONFIDENCE_THRESHOLD = 0.4
REQUIRED_CONSECUTIVE_HITS = 3
MINIMUM_JUDGE_SECONDS = 1.5


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

    phase: str = "WAITING"

    players: dict[
        str,
        Player,
    ] = field(default_factory=dict)

    round_number: int = 0

    prompt: str = ""
    previous_prompt: str = ""

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


class GameManager:
    def __init__(
        self,
        available_classes: list[str],
    ):
        self.classes = (
            available_classes.copy()
        )

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
            "phase": game.phase,

            "round_number": (
                game.round_number
            ),

            "max_rounds": MAX_ROUNDS,
            "round_seconds": (
                ROUND_SECONDS
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
                    CONFIDENCE_THRESHOLD
                ),

                "required_hits": (
                    REQUIRED_CONSECUTIVE_HITS
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
    ) -> tuple[Game, Player]:
        player_name = self.clean_name(
            name
        )

        async with self.matchmaking_lock:
            waiting_game = None

            for existing_game in (
                self.games.values()
            ):
                if (
                    existing_game.phase
                    == "WAITING"
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
                id=self.create_game_id()
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
                for prompt in self.classes
                if prompt != last_prompt
            ]

            if not prompt_options:
                prompt_options = (
                    self.classes
                )

            game.previous_prompt = (
                last_prompt
            )

            game.prompt = random.choice(
                prompt_options
            )

            game.round_number += 1
            game.phase = "DRAWING"

            game.countdown_ends_at = None

            game.round_started_at = (
                time.time()
            )

            game.round_deadline = (
                game.round_started_at
                + ROUND_SECONDS
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
        await asyncio.sleep(
            ROUND_SECONDS
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
                != round_token
                or game.phase
                != "DRAWING"
            ):
                return

            await self.finish_round(
                game,
                winner=None,
            )

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
                        REQUIRED_CONSECUTIVE_HITS
                    ),
                }

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
                >= CONFIDENCE_THRESHOLD
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
                >= REQUIRED_CONSECUTIVE_HITS
                and player.consecutive_hits
                >= REQUIRED_CONSECUTIVE_HITS
            )

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
                    REQUIRED_CONSECUTIVE_HITS
                ),
            }

            if prediction_accepted:
                await self.finish_round(
                    game,
                    winner=player,
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

        game.round_deadline = None

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
                >= MAX_ROUNDS
            ):
                game.phase = "FINAL_RESULT"
                game.transition_token += 1

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

            game.countdown_ends_at = None
            game.round_started_at = None
            game.round_deadline = None

            game.round_winner_id = None
            game.round_points = 0

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

                game.countdown_ends_at = None
                game.round_started_at = None
                game.round_deadline = None

                game.round_winner_id = None
                game.round_points = 0

                await self.broadcast(game)