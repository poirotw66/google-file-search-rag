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
            document_name=result.get("document_name"),
        )
        sessions.touch(session_id)

        return {
            "status": "success",
            "file_name": file_display_name,
            "store_display_name": result["store_display_name"],
            "document_name": result.get("document_name"),
            "operation_name": result.get("operation_name"),
        }
    except HTTPException:
        raise
    except GeminiServiceError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"上傳失敗: {exc}") from exc


@router.delete("/file")
async def delete_file(
    session_id: str,
    document_name: Optional[str] = None,
    store_display_name: Optional[str] = None,
):
    """刪除 session 中的單一文件（同步刪除遠端 File Search document）"""
    session = sessions.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found 或已過期，請重新整理頁面")
    if not document_name and not store_display_name:
        raise HTTPException(status_code=400, detail="需要 document_name 或 store_display_name")

    removed = sessions.remove_file(
        session_id,
        document_name=document_name,
        store_display_name=store_display_name,
    )
    if removed is None:
        raise HTTPException(status_code=404, detail="找不到要刪除的檔案")

    remote_name = removed.get("document_name") or document_name
    if remote_name:
        try:
            GeminiService().delete_document(remote_name)
        except GeminiServiceError as exc:
            # Restore local record if remote delete failed
            sessions.add_file(
                session_id=session_id,
                original_name=removed["original_name"],
                store_display_name=removed["store_display_name"],
                document_name=removed.get("document_name"),
            )
            raise HTTPException(status_code=502, detail=str(exc)) from exc

    return {"status": "deleted", "file": removed}
