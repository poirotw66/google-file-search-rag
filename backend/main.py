from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os

# 載入環境變數
load_dotenv()

app = FastAPI(title="Google File Search RAG API")

# 設定 CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],  # Vite 預設端口
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 匯入路由
from routes import session, upload, chat

app.include_router(session.router)
app.include_router(upload.router)
app.include_router(chat.router)

@app.get("/")
async def root():
    return {"message": "Google File Search RAG API"}

@app.get("/health")
async def health():
    return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

