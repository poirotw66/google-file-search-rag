from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import uuid
from services.gemini import GeminiService
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
        
        sessions[session_id] = {
            'file_search_store_name': file_search_store_name,
            'created_at': None  # 可以加入時間戳記
        }
        
        return SessionResponse(
            session_id=session_id,
            file_search_store_name=file_search_store_name
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{session_id}")
async def get_session(session_id: str):
    """取得 session 資訊"""
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    return sessions[session_id]

@router.delete("/{session_id}")
async def delete_session(session_id: str):
    """刪除 session 並清理 File Search Store"""
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    try:
        gemini_service = GeminiService()
        store_name = sessions[session_id]['file_search_store_name']
        gemini_service.delete_file_search_store(store_name)
        del sessions[session_id]
        return {"status": "deleted"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

