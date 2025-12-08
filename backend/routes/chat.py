from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from services.gemini import GeminiService
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
    """發送訊息並取得 AI 回應"""
    if data.session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    try:
        gemini_service = GeminiService()
        store_name = sessions[data.session_id]['file_search_store_name']
        
        result = gemini_service.generate_content(
            contents=data.message,
            file_search_store_names=[store_name]
        )
        
        return ChatResponse(
            response=result['text'],
            grounding_metadata=result.get('grounding_metadata')
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

