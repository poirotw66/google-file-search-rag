from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import uuid

from services.gemini import GeminiService, GeminiServiceError
from services.session_store import sessions

router = APIRouter(prefix="/api/session", tags=["session"])


class SessionCreate(BaseModel):
    display_name: Optional[str] = None


class SessionResponse(BaseModel):
    session_id: str
    file_search_store_name: str


@router.post("/create", response_model=SessionResponse)
async def create_session(data: SessionCreate = SessionCreate()):
    """建立新的對話 session"""
    try:
        gemini_service = GeminiService()
        session_id = str(uuid.uuid4())
        display_name = data.display_name or f"session-{session_id[:8]}"
        file_search_store_name = gemini_service.create_file_search_store(display_name)
        sessions.create(session_id, file_search_store_name)
        return SessionResponse(
            session_id=session_id,
            file_search_store_name=file_search_store_name,
        )
    except GeminiServiceError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"建立 session 失敗: {exc}") from exc


@router.get("/{session_id}")
async def get_session(session_id: str):
    """取得 session 資訊"""
    session = sessions.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return {
        "session_id": session["session_id"],
        "file_search_store_name": session["file_search_store_name"],
        "created_at": session["created_at"],
        "last_active_at": session["last_active_at"],
        "files": [
            {"original_name": item["original_name"]} for item in session["files"]
        ],
        "messages": session["messages"],
        "message_count": len(session["messages"]),
    }


@router.post("/{session_id}/clear-messages")
async def clear_messages(session_id: str):
    """清除 session 對話歷史（保留已上傳檔案）"""
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found 或已過期，請重新整理頁面")
    sessions.clear_messages(session_id)
    return {"status": "cleared"}


@router.delete("/{session_id}")
async def delete_session(session_id: str):
    """刪除 session 並清理 File Search Store"""
    session = sessions.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    store_name = session["file_search_store_name"]
    try:
        gemini_service = GeminiService()
        gemini_service.delete_file_search_store(store_name)
    except GeminiServiceError as exc:
        # Still drop local session so the client can recover
        sessions.delete(session_id)
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    sessions.delete(session_id)
    return {"status": "deleted"}
