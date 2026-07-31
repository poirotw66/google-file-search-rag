import json
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel

from services.gemini import GeminiService, GeminiServiceError
from services.session_store import sessions

router = APIRouter(prefix="/api/chat", tags=["chat"])


class ChatMessage(BaseModel):
    session_id: str
    message: str


class ChatResponse(BaseModel):
    response: str
    grounding_metadata: Optional[dict] = None


def _require_session(session_id: str) -> dict:
    session = sessions.get(session_id)
    if session is None:
        raise HTTPException(
            status_code=404,
            detail="Session not found 或已過期，請重新整理頁面",
        )
    return session


@router.post("/message", response_model=ChatResponse)
async def send_message(data: ChatMessage):
    """發送訊息並取得 AI 回應（含多輪歷史）"""
    session = _require_session(data.session_id)
    message = data.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="訊息不可為空")

    try:
        gemini_service = GeminiService()
        result = gemini_service.generate_content(
            message=message,
            file_search_store_names=[session["file_search_store_name"]],
            history=session["messages"],
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


@router.post("/message/stream")
async def send_message_stream(data: ChatMessage):
    """串流回覆（SSE）：token / done / error 事件"""
    session = _require_session(data.session_id)
    message = data.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="訊息不可為空")

    gemini_service = GeminiService()
    history = list(session["messages"])
    file_name_map = sessions.file_name_map(data.session_id)
    store_name = session["file_search_store_name"]

    def event_stream():
        final_text = ""
        try:
            for event in gemini_service.generate_content_stream(
                message=message,
                file_search_store_names=[store_name],
                history=history,
                file_name_map=file_name_map,
            ):
                if event.get("type") == "done":
                    final_text = event.get("response") or ""
                    sessions.append_message(data.session_id, "user", message)
                    sessions.append_message(data.session_id, "model", final_text)
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
        except Exception as exc:  # noqa: BLE001
            payload = {"type": "error", "detail": f"對話失敗: {exc}"}
            yield f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/media")
async def get_citation_media(
    session_id: str = Query(...),
    media_id: str = Query(...),
):
    """下載 File Search 引用的圖片片段（media_id）"""
    session = _require_session(session_id)
    store_name = session["file_search_store_name"]
    if not media_id.startswith(f"{store_name}/media/"):
        raise HTTPException(status_code=403, detail="media_id 不屬於此 session")

    try:
        data = GeminiService().download_media(media_id)
    except GeminiServiceError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    # ponytail: File Search media is typically PNG/JPEG; sniff lightly
    media_type = "image/jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        media_type = "image/png"
    return Response(content=data, media_type=media_type)
