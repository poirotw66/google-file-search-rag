"""SQLite-backed session store with TTL cleanup."""

from __future__ import annotations

import json
import os
import sqlite3
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional


DEFAULT_TTL_HOURS = float(os.getenv("SESSION_TTL_HOURS", "24"))
DEFAULT_DB_PATH = os.getenv(
    "SESSION_DB_PATH",
    str(Path(__file__).resolve().parents[2] / "data" / "sessions.db"),
)
MAX_HISTORY_MESSAGES = int(os.getenv("MAX_HISTORY_MESSAGES", "40"))


@dataclass
class UploadedFile:
    original_name: str
    store_display_name: str


class SessionStore:
    """Persist sessions, chat history, and uploaded file name maps."""

    def __init__(
        self,
        db_path: str = DEFAULT_DB_PATH,
        ttl_hours: float = DEFAULT_TTL_HOURS,
    ) -> None:
        self.db_path = db_path
        self.ttl_seconds = max(ttl_hours, 0.1) * 3600
        self._lock = threading.Lock()
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        with self._lock, self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS sessions (
                    session_id TEXT PRIMARY KEY,
                    file_search_store_name TEXT NOT NULL,
                    created_at REAL NOT NULL,
                    last_active_at REAL NOT NULL,
                    messages_json TEXT NOT NULL DEFAULT '[]',
                    files_json TEXT NOT NULL DEFAULT '[]'
                )
                """
            )
            conn.commit()

    def create(self, session_id: str, file_search_store_name: str) -> dict[str, Any]:
        now = time.time()
        with self._lock, self._connect() as conn:
            conn.execute(
                """
                INSERT INTO sessions (
                    session_id, file_search_store_name, created_at, last_active_at,
                    messages_json, files_json
                ) VALUES (?, ?, ?, ?, '[]', '[]')
                """,
                (session_id, file_search_store_name, now, now),
            )
            conn.commit()
        return self.get(session_id)  # type: ignore[return-value]

    def get(self, session_id: str) -> Optional[dict[str, Any]]:
        with self._lock, self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM sessions WHERE session_id = ?",
                (session_id,),
            ).fetchone()
        if row is None:
            return None
        return self._row_to_session(row)

    def __contains__(self, session_id: str) -> bool:
        return self.get(session_id) is not None

    def touch(self, session_id: str) -> None:
        with self._lock, self._connect() as conn:
            conn.execute(
                "UPDATE sessions SET last_active_at = ? WHERE session_id = ?",
                (time.time(), session_id),
            )
            conn.commit()

    def delete(self, session_id: str) -> Optional[dict[str, Any]]:
        session = self.get(session_id)
        if session is None:
            return None
        with self._lock, self._connect() as conn:
            conn.execute("DELETE FROM sessions WHERE session_id = ?", (session_id,))
            conn.commit()
        return session

    def append_message(self, session_id: str, role: str, content: str) -> None:
        session = self.get(session_id)
        if session is None:
            raise KeyError(f"Session not found: {session_id}")
        messages = session["messages"]
        messages.append({"role": role, "content": content})
        # ponytail: cap history so context window stays bounded; raise MAX_HISTORY_MESSAGES if needed
        if len(messages) > MAX_HISTORY_MESSAGES:
            messages = messages[-MAX_HISTORY_MESSAGES:]
        self._write_json(session_id, messages_json=json.dumps(messages, ensure_ascii=False))

    def clear_messages(self, session_id: str) -> None:
        session = self.get(session_id)
        if session is None:
            raise KeyError(f"Session not found: {session_id}")
        self._write_json(session_id, messages_json="[]")

    def add_file(self, session_id: str, original_name: str, store_display_name: str) -> None:
        session = self.get(session_id)
        if session is None:
            raise KeyError(f"Session not found: {session_id}")
        files = session["files"]
        files.append(
            {
                "original_name": original_name,
                "store_display_name": store_display_name,
            }
        )
        self._write_json(session_id, files_json=json.dumps(files, ensure_ascii=False))

    def file_name_map(self, session_id: str) -> dict[str, str]:
        session = self.get(session_id)
        if session is None:
            return {}
        return {
            item["store_display_name"]: item["original_name"]
            for item in session["files"]
            if item.get("store_display_name") and item.get("original_name")
        }

    def list_expired(self) -> list[dict[str, Any]]:
        cutoff = time.time() - self.ttl_seconds
        with self._lock, self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM sessions WHERE last_active_at < ?",
                (cutoff,),
            ).fetchall()
        return [self._row_to_session(row) for row in rows]

    def cleanup_expired(self) -> list[dict[str, Any]]:
        expired = self.list_expired()
        for session in expired:
            self.delete(session["session_id"])
        return expired

    def _write_json(
        self,
        session_id: str,
        messages_json: Optional[str] = None,
        files_json: Optional[str] = None,
    ) -> None:
        fields: list[str] = ["last_active_at = ?"]
        values: list[Any] = [time.time()]
        if messages_json is not None:
            fields.append("messages_json = ?")
            values.append(messages_json)
        if files_json is not None:
            fields.append("files_json = ?")
            values.append(files_json)
        values.append(session_id)
        with self._lock, self._connect() as conn:
            conn.execute(
                f"UPDATE sessions SET {', '.join(fields)} WHERE session_id = ?",
                values,
            )
            conn.commit()

    @staticmethod
    def _row_to_session(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "session_id": row["session_id"],
            "file_search_store_name": row["file_search_store_name"],
            "created_at": row["created_at"],
            "last_active_at": row["last_active_at"],
            "messages": json.loads(row["messages_json"] or "[]"),
            "files": json.loads(row["files_json"] or "[]"),
        }


# Module singleton used by routes
sessions = SessionStore()
