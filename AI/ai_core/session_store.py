from __future__ import annotations

import json
import sqlite3
from pathlib import Path

from .schemas import AnswerAnalysisV2, AssistanceIndicator, InterviewContextV2


class SessionStore:
    """SQLite persistence so interview context survives API reloads/restarts."""

    def __init__(self, path: str | None = None) -> None:
        configured = path or __import__("os").getenv("AI_SESSION_DB", "data/interviewshield_ai.db")
        self.path = Path(configured)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _connect(self):
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS sessions (
                    session_id TEXT PRIMARY KEY,
                    context_json TEXT NOT NULL,
                    analyses_json TEXT NOT NULL,
                    indicators_json TEXT NOT NULL,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )

    def save(self, ctx: InterviewContextV2, analyses: list[AnswerAnalysisV2], indicators: list[AssistanceIndicator]) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO sessions(session_id, context_json, analyses_json, indicators_json, updated_at)
                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(session_id) DO UPDATE SET
                    context_json=excluded.context_json,
                    analyses_json=excluded.analyses_json,
                    indicators_json=excluded.indicators_json,
                    updated_at=CURRENT_TIMESTAMP
                """,
                (
                    ctx.session_id,
                    json.dumps(ctx.model_dump(), ensure_ascii=False),
                    json.dumps([x.model_dump() for x in analyses], ensure_ascii=False),
                    json.dumps([x.model_dump() for x in indicators], ensure_ascii=False),
                ),
            )

    def load(self, session_id: str):
        with self._connect() as conn:
            row = conn.execute(
                "SELECT context_json, analyses_json, indicators_json FROM sessions WHERE session_id=?",
                (session_id,),
            ).fetchone()

        if not row:
            return None

        ctx = InterviewContextV2.model_validate(json.loads(row["context_json"]))
        analyses = [AnswerAnalysisV2.model_validate(x) for x in json.loads(row["analyses_json"])]
        indicators = [AssistanceIndicator.model_validate(x) for x in json.loads(row["indicators_json"])]
        return ctx, analyses, indicators
