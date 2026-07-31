from contextlib import asynccontextmanager
import asyncio
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from services.gemini import GeminiService, GeminiServiceError
from services.session_store import sessions

load_dotenv()

logger = logging.getLogger("file_search_rag")


async def _cleanup_expired_sessions() -> None:
    expired = sessions.cleanup_expired()
    if not expired:
        return
    gemini = GeminiService()
    for session in expired:
        store_name = session.get("file_search_store_name")
        if not store_name:
            continue
        try:
            gemini.delete_file_search_store(store_name)
            logger.info("Deleted expired store %s", store_name)
        except GeminiServiceError as exc:
            logger.warning("Failed to delete store %s: %s", store_name, exc)


async def _cleanup_loop(interval_seconds: int = 3600) -> None:
    while True:
        try:
            await _cleanup_expired_sessions()
        except Exception:  # noqa: BLE001
            logger.exception("Session cleanup failed")
        await asyncio.sleep(interval_seconds)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    await _cleanup_expired_sessions()
    task = asyncio.create_task(_cleanup_loop())
    try:
        yield
    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


app = FastAPI(title="Google File Search RAG API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from routes import session, upload, chat  # noqa: E402

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
