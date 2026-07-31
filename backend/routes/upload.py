from fastapi import APIRouter, UploadFile, File, HTTPException, Form
from typing import Optional

from services.gemini import GeminiService, GeminiServiceError
from services.session_store import sessions

router = APIRouter(prefix="/api/upload", tags=["upload"])


@router.post("/file")
async def upload_file(
    session_id: str = Form(...),
    file: UploadFile = File(...),
    display_name: Optional[str] = Form(None),
):
    """上傳檔案到指定的 session"""
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found 或已過期，請重新整理頁面")

    try:
        gemini_service = GeminiService()
        session = sessions.get(session_id)
        assert session is not None
        store_name = session["file_search_store_name"]

        file_bytes = await file.read()
        if not file_bytes:
            raise HTTPException(status_code=400, detail="檔案內容為空，請選擇有效檔案")

        original_filename = file.filename or "uploaded_file"
        safe_filename = "".join(
            c if c.isalnum() or c in "._-" else "_" for c in original_filename
        ) or "uploaded_file"
        file_display_name = display_name or original_filename.split("/")[-1]
        mime_type = file.content_type

        result = gemini_service.upload_file_bytes_to_store(
            file_bytes=file_bytes,
            file_search_store_name=store_name,
            display_name=file_display_name,
            file_name=safe_filename,
            mime_type=mime_type,
        )

        sessions.add_file(
            session_id=session_id,
            original_name=file_display_name,
            store_display_name=result["store_display_name"],
        )
        sessions.touch(session_id)

        return {
            "status": "success",
            "file_name": file_display_name,
            "store_display_name": result["store_display_name"],
            "operation_name": result.get("operation_name"),
        }
    except HTTPException:
        raise
    except GeminiServiceError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"上傳失敗: {exc}") from exc
