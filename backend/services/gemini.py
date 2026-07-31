from google import genai
from google.genai import types
import os
import time
import requests
import io
import json
import uuid
from typing import Optional


class GeminiService:
    def __init__(self):
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY not found in environment variables")
        self.api_key = api_key
        self.client = genai.Client(api_key=api_key)
        self.base_url = "https://generativelanguage.googleapis.com/v1beta"
        self.upload_url = "https://generativelanguage.googleapis.com/upload/v1beta"
    
    def create_file_search_store(self, display_name: str) -> str:
        """建立一個新的 File Search Store 並回傳 store name

        Uses gemini-embedding-2 so text and image uploads are searchable.
        """
        url = f"{self.base_url}/fileSearchStores"
        headers = {"Content-Type": "application/json"}
        params = {"key": self.api_key}
        # ponytail: multimodal File Search requires embeddingModel at create time
        data = {
            "displayName": display_name,
            "embeddingModel": "models/gemini-embedding-2",
        }

        response = requests.post(url, headers=headers, params=params, json=data)
        response.raise_for_status()
        result = response.json()
        return result["name"]
    
    def upload_file_bytes_to_store(
        self,
        file_bytes: bytes,
        file_search_store_name: str,
        display_name: str,
        file_name: str,
        mime_type: Optional[str] = None
    ) -> dict:
        """直接上傳檔案到 File Search Store
        
        根據官方文件，使用 uploadToFileSearchStore 方法：
        operation = client.file_search_stores.upload_to_file_search_store(
            file='sample.txt',
            file_search_store_name=file_search_store.name,
            config={'display_name': 'display-file-name'}
        )
        
        REST API 端點: POST /upload/v1beta/{fileSearchStoreName}:uploadToFileSearchStore
        """
        # 根據檔名推斷 MIME type（如果沒有提供）
        if not mime_type:
            ext = file_name.lower().split('.')[-1] if '.' in file_name else ''
            mime_type_map = {
                'txt': 'text/plain',
                'md': 'text/markdown',
                'pdf': 'application/pdf',
                'doc': 'application/msword',
                'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'json': 'application/json',
                'html': 'text/html',
                'css': 'text/css',
                'js': 'text/javascript',
                'py': 'text/x-python',
                'jpg': 'image/jpeg',
                'jpeg': 'image/jpeg',
                'png': 'image/png',
                'gif': 'image/gif',
                'csv': 'text/csv',
                'xml': 'application/xml',
            }
            mime_type = mime_type_map.get(ext, 'text/plain')
        
        # 產生唯一的檔案名稱
        unique_display_name = f"{display_name}-{uuid.uuid4().hex[:8]}"
        
        # 使用 uploadToFileSearchStore REST API 直接上傳
        # 端點格式: POST /upload/v1beta/{fileSearchStoreName}:uploadToFileSearchStore
        upload_url = f"{self.upload_url}/{file_search_store_name}:uploadToFileSearchStore"
        params = {"key": self.api_key}
        
        # 準備 multipart/form-data
        # 檔案資料和 config JSON
        files = {
            'file': (file_name, io.BytesIO(file_bytes), mime_type)
        }
        data = {
            'config': json.dumps({'displayName': unique_display_name})
        }
        
        upload_response = requests.post(
            upload_url,
            params=params,
            files=files,
            data=data
        )
        
        if upload_response.status_code not in [200, 201]:
            error_text = upload_response.text[:500] if upload_response.text else "No error message"
            raise Exception(f"Upload to file search store failed: {upload_response.status_code} - {error_text}")
        
        try:
            operation = upload_response.json()
        except ValueError:
            raise Exception(f"Invalid JSON response: {upload_response.text[:500]}")
        
        # 等待 operation 完成
        operation_name = operation.get("name")
        if not operation_name:
            if operation.get("done"):
                return {'status': 'completed', 'operation_name': None}
            raise Exception(f"Invalid operation response: {operation}")
        
        # 輪詢 operation 狀態直到完成
        while not operation.get("done", False):
            time.sleep(2)
            op_url = f"{self.base_url}/{operation_name}"
            op_response = requests.get(op_url, params={"key": self.api_key})
            op_response.raise_for_status()
            operation = op_response.json()
        
        return {
            'status': 'completed',
            'operation_name': operation_name
        }
    
    def generate_content(
        self,
        contents: str,
        file_search_store_names: list[str]
    ) -> dict:
        """使用 File Search 生成回應
        
        根據官方文件使用 SDK 的 generate_content
        """
        response = self.client.models.generate_content(
            model="gemini-3.6-flash",
            contents=contents,
            config=types.GenerateContentConfig(
                tools=[
                    types.Tool(
                        file_search=types.FileSearch(
                            file_search_store_names=file_search_store_names
                        )
                    )
                ]
            )
        )
        
        result = {
            'text': response.text,
            'grounding_metadata': None
        }
        
        # 提取引用資訊
        # 根據官方文件: response.candidates[0].grounding_metadata
        if hasattr(response, 'candidates') and response.candidates:
            candidate = response.candidates[0]
            if hasattr(candidate, 'grounding_metadata'):
                grounding = candidate.grounding_metadata
                if grounding:
                    result['grounding_metadata'] = {}
                    
                    # 提取 grounding_chunks
                    if hasattr(grounding, 'grounding_chunks') and grounding.grounding_chunks:
                        chunks = []
                        for chunk in grounding.grounding_chunks:
                            chunk_data = {}
                            
                            # 提取 retrieved_context
                            if hasattr(chunk, 'retrieved_context') and chunk.retrieved_context:
                                rc = chunk.retrieved_context
                                chunk_data['retrieved_context'] = {
                                    'uri': getattr(rc, 'uri', None),
                                    'title': getattr(rc, 'title', None)
                                }
                            
                            # 提取 web
                            if hasattr(chunk, 'web') and chunk.web:
                                chunk_data['web'] = {
                                    'uri': getattr(chunk.web, 'uri', None),
                                    'title': getattr(chunk.web, 'title', None)
                                }
                            
                            if chunk_data:
                                chunks.append(chunk_data)
                        
                        if chunks:
                            result['grounding_metadata']['grounding_chunks'] = chunks
                    
                    # 提取 web_search_queries
                    if hasattr(grounding, 'web_search_queries') and grounding.web_search_queries:
                        result['grounding_metadata']['web_search_queries'] = list(grounding.web_search_queries)
        
        return result
    
    def delete_file_search_store(self, store_name: str):
        """刪除 File Search Store
        
        根據官方文件:
        curl -X DELETE "https://generativelanguage.googleapis.com/v1beta/fileSearchStores/my-file_search-store-123?key=${GEMINI_API_KEY}"
        
        或 SDK: client.file_search_stores.delete(name='fileSearchStores/my-file_search-store-123', config={'force': True})
        """
        url = f"{self.base_url}/{store_name}"
        params = {"key": self.api_key, "force": "true"}
        response = requests.delete(url, params=params)
        response.raise_for_status()
