from fastapi import APIRouter, UploadFile, File, HTTPException, Form
from typing import Optional
import os
import tempfile
from services.gemini import GeminiService
from services.session_store import sessions

router = APIRouter(prefix="/api/upload", tags=["upload"])

@router.post("/file")
async def upload_file(
    session_id: str = Form(...),
    file: UploadFile = File(...),
    display_name: Optional[str] = Form(None)
):
    """上傳檔案到指定的 session"""
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    try:
        gemini_service = GeminiService()
        store_name = sessions[session_id]['file_search_store_name']
        
        # 讀取檔案內容
        file_bytes = await file.read()
        
        # 處理檔名 (避免中文編碼問題)
        original_filename = file.filename or "uploaded_file"
        # 使用純英文檔名作為 HTTP header 中的檔名
        safe_filename = "".join(c if c.isalnum() or c in "._-" else "_" for c in original_filename)
        if not safe_filename:
            safe_filename = "uploaded_file"
        
        # 使用 display_name 或原始檔名 (不含路徑)
        file_display_name = display_name or original_filename.split('/')[-1]
        
        # 取得檔案的 MIME type
        mime_type = file.content_type
        
        # 上傳檔案
        result = gemini_service.upload_file_bytes_to_store(
            file_bytes=file_bytes,
            file_search_store_name=store_name,
            display_name=file_display_name,
            file_name=safe_filename,
            mime_type=mime_type
        )
        
        return {
            "status": "success",
            "file_name": file_display_name,
            "operation_name": result.get('operation_name')
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

