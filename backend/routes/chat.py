from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from services.gemini import GeminiService, GeminiServiceError
from services.session_store import sessions

router = APIRouter(prefix="/api/chat", tags=["chat"])


class ChatMessage(BaseModel):
    session_id: str
    message: str


class ChatResponse(BaseModel):
    response: str
    grounding_metadata: Optional[dict] = None


@router.post("/message", response_model=ChatResponse)
async def send_message(data: ChatMessage):
    """發送訊息並取得 AI 回應（含多輪歷史）"""
    session = sessions.get(data.session_id)
    if session is None:
        raise HTTPException(
            status_code=404,
            detail="Session not found 或已過期，請重新整理頁面",
        )

    message = data.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="訊息不可為空")

    try:
        gemini_service = GeminiService()
        history = session["messages"]
        result = gemini_service.generate_content(
            message=message,
            file_search_store_names=[session["file_search_store_name"]],
            history=history,
            file_name_map=sessions.file_name_map(data.session_id),
        )

        sessions.append_message(data.session_id, "user", message)
        sessions.append_message(data.session_id, "model", result["text"])

        return ChatResponse(
            response=result["text"],
            grounding_metadata=result.get("grounding_metadata"),
        )
    except GeminiServiceError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"對話失敗: {exc}") from exc
