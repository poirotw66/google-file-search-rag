"""Self-checks for session store and citation extraction."""

from __future__ import annotations

from types import SimpleNamespace

from services.gemini import extract_grounding_metadata, _strip_store_suffix
from services.session_store import SessionStore


def test_session_store_persists_history_and_files(tmp_path) -> None:
    db_path = tmp_path / "sessions.db"
    store = SessionStore(db_path=str(db_path), ttl_hours=24)

    store.create("s1", "fileSearchStores/demo")
    store.append_message("s1", "user", "第一題")
    store.append_message("s1", "model", "第一答")
    store.add_file("s1", "手冊.pdf", "手冊.pdf-abcd1234")

    loaded = SessionStore(db_path=str(db_path), ttl_hours=24)
    session = loaded.get("s1")
    assert session is not None
    assert session["file_search_store_name"] == "fileSearchStores/demo"
    assert session["messages"] == [
        {"role": "user", "content": "第一題"},
        {"role": "model", "content": "第一答"},
    ]
    assert loaded.file_name_map("s1") == {"手冊.pdf-abcd1234": "手冊.pdf"}

    loaded.clear_messages("s1")
    assert loaded.get("s1")["messages"] == []


def test_session_store_expires_inactive_sessions(tmp_path) -> None:
    db_path = tmp_path / "sessions.db"
    store = SessionStore(db_path=str(db_path), ttl_hours=1)
    store.create("old", "fileSearchStores/old")
    # Backdate last_active_at past TTL
    with store._connect() as conn:
        conn.execute(
            "UPDATE sessions SET last_active_at = ? WHERE session_id = ?",
            (0, "old"),
        )
        conn.commit()
    expired = store.cleanup_expired()
    assert len(expired) == 1
    assert expired[0]["session_id"] == "old"
    assert store.get("old") is None


def test_extract_grounding_resolves_titles_and_page_numbers() -> None:
    response = SimpleNamespace(
        candidates=[
            SimpleNamespace(
                grounding_metadata=SimpleNamespace(
                    grounding_chunks=[
                        SimpleNamespace(
                            retrieved_context=SimpleNamespace(
                                uri="files/abc",
                                title="policy.pdf-deadbeef",
                                page_number=3,
                                media_id=None,
                                text="snippet",
                                custom_metadata=[
                                    SimpleNamespace(
                                        key="original_name",
                                        string_value="公司政策.pdf",
                                    )
                                ],
                            ),
                            web=None,
                        )
                    ],
                    web_search_queries=None,
                )
            )
        ]
    )

    grounding = extract_grounding_metadata(response, file_name_map={})
    assert grounding is not None
    ctx = grounding["grounding_chunks"][0]["retrieved_context"]
    assert ctx["title"] == "公司政策.pdf"
    assert ctx["page_number"] == 3


def test_strip_store_suffix() -> None:
    assert _strip_store_suffix("report.pdf-a1b2c3d4") == "report.pdf"
    assert _strip_store_suffix("plain") == "plain"
