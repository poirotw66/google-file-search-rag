"""Gemini File Search client wrappers."""

from __future__ import annotations

import io
import os
import time
import uuid
from typing import Any, Optional

from google import genai
from google.genai import types


MIME_TYPE_MAP = {
    "txt": "text/plain",
    "md": "text/markdown",
    "pdf": "application/pdf",
    "doc": "application/msword",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "json": "application/json",
    "html": "text/html",
    "css": "text/css",
    "js": "text/javascript",
    "py": "text/x-python",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
    "csv": "text/csv",
    "xml": "application/xml",
}

UPLOAD_TIMEOUT_SECONDS = float(os.getenv("UPLOAD_TIMEOUT_SECONDS", "180"))
OPERATION_POLL_SECONDS = float(os.getenv("OPERATION_POLL_SECONDS", "2"))
MODEL_NAME = os.getenv("GEMINI_MODEL", "gemini-3.6-flash")
EMBEDDING_MODEL = "models/gemini-embedding-2"


class GeminiServiceError(Exception):
    """User-facing Gemini / File Search failure."""


class GeminiService:
    def __init__(self) -> None:
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise GeminiServiceError("GEMINI_API_KEY not found in environment variables")
        self.client = genai.Client(api_key=api_key)

    def create_file_search_store(self, display_name: str) -> str:
        """Create a multimodal File Search store and return its resource name."""
        try:
            store = self.client.file_search_stores.create(
                config={
                    "display_name": display_name,
                    "embedding_model": EMBEDDING_MODEL,
                }
            )
        except Exception as exc:  # noqa: BLE001 — surface SDK errors cleanly
            raise GeminiServiceError(f"建立 File Search Store 失敗: {exc}") from exc
        if not getattr(store, "name", None):
            raise GeminiServiceError("建立 File Search Store 失敗: 回應缺少 name")
        return store.name

    def upload_file_bytes_to_store(
        self,
        file_bytes: bytes,
        file_search_store_name: str,
        display_name: str,
        file_name: str,
        mime_type: Optional[str] = None,
    ) -> dict[str, Any]:
        """Upload bytes into a File Search store via the official SDK."""
        resolved_mime = mime_type or self._guess_mime_type(file_name)
        store_display_name = f"{display_name}-{uuid.uuid4().hex[:8]}"

        try:
            operation = self.client.file_search_stores.upload_to_file_search_store(
                file_search_store_name=file_search_store_name,
                file=io.BytesIO(file_bytes),
                config={
                    "display_name": store_display_name,
                    "mime_type": resolved_mime,
                    "custom_metadata": [
                        {"key": "original_name", "string_value": display_name},
                    ],
                },
            )
            operation = self._wait_for_operation(operation)
        except GeminiServiceError:
            raise
        except Exception as exc:  # noqa: BLE001
            raise GeminiServiceError(f"上傳檔案失敗: {exc}") from exc

        if getattr(operation, "error", None):
            raise GeminiServiceError(f"上傳檔案失敗: {operation.error}")

        document_name = None
        response_payload = getattr(operation, "response", None)
        if response_payload is not None:
            document_name = getattr(response_payload, "document_name", None)

        return {
            "status": "completed",
            "operation_name": getattr(operation, "name", None),
            "store_display_name": store_display_name,
            "original_name": display_name,
            "document_name": document_name,
        }

    def generate_content(
        self,
        message: str,
        file_search_store_names: list[str],
        history: Optional[list[dict[str, str]]] = None,
        file_name_map: Optional[dict[str, str]] = None,
    ) -> dict[str, Any]:
        """Generate a File Search grounded reply, optionally with chat history."""
        contents = self._build_contents(history or [], message)
        try:
            response = self.client.models.generate_content(
                model=MODEL_NAME,
                contents=contents,
                config=self._file_search_config(file_search_store_names),
            )
        except Exception as exc:  # noqa: BLE001
            raise GeminiServiceError(f"產生回應失敗: {exc}") from exc

        text = getattr(response, "text", None) or ""
        grounding = extract_grounding_metadata(
            response,
            file_name_map=file_name_map or {},
        )
        return {"text": text, "grounding_metadata": grounding}

    def generate_content_stream(
        self,
        message: str,
        file_search_store_names: list[str],
        history: Optional[list[dict[str, str]]] = None,
        file_name_map: Optional[dict[str, str]] = None,
    ):
        """Yield token/done/error events for SSE streaming."""
        contents = self._build_contents(history or [], message)
        chunks: list[str] = []
        last_response: Any = None
        try:
            stream = self.client.models.generate_content_stream(
                model=MODEL_NAME,
                contents=contents,
                config=self._file_search_config(file_search_store_names),
            )
            for response in stream:
                last_response = response
                text = getattr(response, "text", None) or ""
                if text:
                    chunks.append(text)
                    yield {"type": "token", "text": text}
        except Exception as exc:  # noqa: BLE001
            yield {"type": "error", "detail": f"產生回應失敗: {exc}"}
            return

        full_text = "".join(chunks)
        grounding = extract_grounding_metadata(
            last_response,
            file_name_map=file_name_map or {},
        )
        yield {
            "type": "done",
            "response": full_text,
            "grounding_metadata": grounding,
        }

    def list_documents(self, store_name: str) -> list[dict[str, Any]]:
        try:
            pager = self.client.file_search_stores.documents.list(parent=store_name)
        except Exception as exc:  # noqa: BLE001
            raise GeminiServiceError(f"列出文件失敗: {exc}") from exc
        documents: list[dict[str, Any]] = []
        for doc in pager:
            documents.append(
                {
                    "document_name": getattr(doc, "name", None),
                    "display_name": getattr(doc, "display_name", None),
                    "mime_type": getattr(doc, "mime_type", None),
                    "size_bytes": getattr(doc, "size_bytes", None),
                }
            )
        return documents

    def delete_document(self, document_name: str) -> None:
        try:
            self.client.file_search_stores.documents.delete(
                name=document_name,
                config={"force": True},
            )
        except Exception as exc:  # noqa: BLE001
            raise GeminiServiceError(f"刪除文件失敗: {exc}") from exc

    def download_media(self, media_id: str) -> bytes:
        try:
            return self.client.file_search_stores.download_media(media_id=media_id)
        except Exception as exc:  # noqa: BLE001
            raise GeminiServiceError(f"下載引用圖片失敗: {exc}") from exc

    def delete_file_search_store(self, store_name: str) -> None:
        try:
            self.client.file_search_stores.delete(
                name=store_name,
                config={"force": True},
            )
        except Exception as exc:  # noqa: BLE001
            raise GeminiServiceError(f"刪除 File Search Store 失敗: {exc}") from exc

    @staticmethod
    def _file_search_config(file_search_store_names: list[str]) -> types.GenerateContentConfig:
        return types.GenerateContentConfig(
            tools=[
                types.Tool(
                    file_search=types.FileSearch(
                        file_search_store_names=file_search_store_names
                    )
                )
            ]
        )

    def _wait_for_operation(self, operation: Any) -> Any:
        deadline = time.time() + UPLOAD_TIMEOUT_SECONDS
        current = operation
        while not getattr(current, "done", False):
            if time.time() > deadline:
                raise GeminiServiceError(
                    f"上傳逾時（超過 {int(UPLOAD_TIMEOUT_SECONDS)} 秒），請稍後再試"
                )
            time.sleep(OPERATION_POLL_SECONDS)
            try:
                current = self.client.operations.get(current)
            except Exception as exc:  # noqa: BLE001
                raise GeminiServiceError(f"查詢上傳狀態失敗: {exc}") from exc
        return current

    @staticmethod
    def _guess_mime_type(file_name: str) -> str:
        ext = file_name.lower().rsplit(".", 1)[-1] if "." in file_name else ""
        return MIME_TYPE_MAP.get(ext, "application/octet-stream")

    @staticmethod
    def _build_contents(
        history: list[dict[str, str]],
        message: str,
    ) -> list[types.Content]:
        contents: list[types.Content] = []
        for item in history:
            role = item.get("role")
            text = item.get("content")
            if role not in {"user", "model"} or not text:
                continue
            contents.append(
                types.Content(role=role, parts=[types.Part(text=text)])
            )
        contents.append(
            types.Content(role="user", parts=[types.Part(text=message)])
        )
        return contents


def extract_grounding_metadata(
    response: Any,
    file_name_map: Optional[dict[str, str]] = None,
) -> Optional[dict[str, Any]]:
    """Pull citation fields from generate_content grounding metadata."""
    file_name_map = file_name_map or {}
    candidates = getattr(response, "candidates", None)
    if not candidates:
        return None
    candidate = candidates[0]
    grounding = getattr(candidate, "grounding_metadata", None)
    if not grounding:
        return None

    result: dict[str, Any] = {}
    chunks = getattr(grounding, "grounding_chunks", None) or []
    parsed_chunks: list[dict[str, Any]] = []

    for chunk in chunks:
        chunk_data: dict[str, Any] = {}
        retrieved = getattr(chunk, "retrieved_context", None)
        if retrieved:
            title = getattr(retrieved, "title", None)
            original_from_meta = _original_name_from_custom_metadata(
                getattr(retrieved, "custom_metadata", None)
            )
            resolved_title = (
                original_from_meta
                or file_name_map.get(title or "")
                or _strip_store_suffix(title)
                or title
            )
            chunk_data["retrieved_context"] = {
                "uri": getattr(retrieved, "uri", None),
                "title": resolved_title,
                "page_number": getattr(retrieved, "page_number", None),
                "media_id": getattr(retrieved, "media_id", None),
                "text": getattr(retrieved, "text", None),
            }

        web = getattr(chunk, "web", None)
        if web:
            chunk_data["web"] = {
                "uri": getattr(web, "uri", None),
                "title": getattr(web, "title", None),
            }

        if chunk_data:
            parsed_chunks.append(chunk_data)

    if parsed_chunks:
        result["grounding_chunks"] = parsed_chunks

    queries = getattr(grounding, "web_search_queries", None)
    if queries:
        result["web_search_queries"] = list(queries)

    return result or None


def _original_name_from_custom_metadata(metadata: Any) -> Optional[str]:
    if not metadata:
        return None
    for item in metadata:
        if getattr(item, "key", None) == "original_name":
            value = getattr(item, "string_value", None)
            if value:
                return value
    return None


def _strip_store_suffix(title: Optional[str]) -> Optional[str]:
    if not title:
        return None
    # Matches display names we create as "{name}-{8 hex}"
    if len(title) > 9 and title[-9] == "-" and all(
        ch in "0123456789abcdef" for ch in title[-8:].lower()
    ):
        return title[:-9]
    return title
