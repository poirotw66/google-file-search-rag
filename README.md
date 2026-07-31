# DocuChat — Google File Search RAG

以 [Gemini File Search](https://ai.google.dev/gemini-api/docs/file-search) 為核心的文件問答應用：上傳文件後即可多輪對話，回覆會附上可核對的引用來源。

## 功能

- **文件問答**：語意檢索上傳內容，並以 File Search 接地回答
- **多模態 Store**：建立 Store 時使用 `gemini-embedding-2`（文字 + PNG/JPEG）
- **多輪對話**：Session 保存歷史；支援 SSE 串流回覆
- **Session 續用**：`localStorage` 還原對話與檔案列表；可開「新對話」
- **上傳體驗**：多檔並行（最多 3）、真實 HTTP 傳輸進度、暫時性錯誤自動重試
- **檔案管理**：側邊欄刪除會同步刪除遠端 File Search document
- **引用體驗**：檔名、PDF 頁碼、圖片片段（`media_id`）預覽
- **介面**：DocuChat atelier 風格（Fraunces / Sora + 松綠強調色）

## 技術架構

| 層級 | 技術 |
|------|------|
| Backend | FastAPI、`google-genai`、SQLite session store |
| Frontend | React、TypeScript、Vite、Tailwind CSS |
| 模型 | 查詢：`gemini-3.6-flash`；Embedding：`models/gemini-embedding-2` |
| API | Gemini File Search（`generateContent` + File Search tool） |

```
上傳檔案 → File Search Store（索引）
                ↓
使用者提問 → generateContent / stream（含對話歷史）
                ↓
回覆 + grounding（頁碼 / media_id）
```

## 快速開始

### 1. 環境變數

專案根目錄建立 `.env`：

```env
GEMINI_API_KEY=your_api_key_here

# 可選
# GEMINI_MODEL=gemini-3.6-flash
# SESSION_TTL_HOURS=24
# SESSION_DB_PATH=data/sessions.db
# MAX_HISTORY_MESSAGES=40
# UPLOAD_TIMEOUT_SECONDS=180
```

### 2. 安裝依賴

```bash
cd backend && pip install -r requirements.txt
cd ../frontend && npm install
```

### 3. 啟動

後端（http://localhost:8000，文件：http://localhost:8000/docs）：

```bash
cd backend
python main.py
# 或
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

前端（http://localhost:5173）：

```bash
cd frontend
npm run dev
```

## 使用方式

1. 開啟前端；若本機已有 session 會自動還原，否則建立新 session
2. 左側上傳 PDF / Markdown / 圖片等（可一次多檔）
3. 右側提問；回答會串流顯示，並可展開引用詳情
4. 需要重來時點「新對話」（會清理舊的遠端 Store）

## 專案結構

```
google-file-search-rag/
├── backend/
│   ├── main.py                 # FastAPI 入口、TTL 清理
│   ├── routes/
│   │   ├── session.py          # Session CRUD / 續用
│   │   ├── upload.py           # 上傳與刪檔
│   │   └── chat.py             # 對話、串流、media
│   ├── services/
│   │   ├── gemini.py           # File Search / generateContent
│   │   └── session_store.py    # SQLite session
│   ├── tests/
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── ChatWindow.tsx
│   │   │   ├── FileUpload.tsx
│   │   │   ├── InputArea.tsx
│   │   │   └── MessageList.tsx
│   │   ├── api/client.ts
│   │   └── index.css
│   └── package.json
├── data/                       # 本機 SQLite（gitignore）
└── README.md
```

## API 端點

### Session
- `POST /api/session/create` — 建立 session + File Search Store
- `GET /api/session/{session_id}` — 取得歷史、檔案列表（續用）
- `POST /api/session/{session_id}/clear-messages` — 清除對話（保留檔案）
- `DELETE /api/session/{session_id}` — 刪除 session 與遠端 Store

### 上傳
- `POST /api/upload/file` — 上傳並索引到該 session 的 Store
- `DELETE /api/upload/file` — 刪除單一 document（需 `session_id` + `document_name` 或 `store_display_name`）

### 對話
- `POST /api/chat/message` — 完整回覆
- `POST /api/chat/message/stream` — SSE：`token` / `done` / `error`
- `GET /api/chat/media` — 下載引用圖片（`session_id` + `media_id`）

## 測試

```bash
cd backend
python -m pytest tests/ -v
```

## 支援格式

依官方 File Search 規格，常見可用格式包括：

- PDF、Word（`.doc` / `.docx`）
- Markdown、純文字、CSV、HTML、JSON
- 圖片：多模態檢索建議 **PNG / JPEG**（Store 需 `gemini-embedding-2`）

完整列表見官方文件或專案內 `api_doc.md`（可能非最新快照）。

## 注意事項

- 每個 session 對應一個獨立 File Search Store
- Session 資料預設寫入 `data/sessions.db`；閒置超過 `SESSION_TTL_HOURS`（預設 24）會清本機紀錄與遠端 Store
- 上傳會等待 Google 索引完成才回傳成功；前端在傳輸完成後會顯示「建立索引中」
- 單機 SQLite + 單一 worker 適用本專案規模；多 worker 部署需改為共享 session store
- 生產環境請另行設定 CORS、域名與金鑰管理

## 參考

- [Gemini File Search 文件](https://ai.google.dev/gemini-api/docs/file-search)
- [generateContent 版 File Search](https://ai.google.dev/gemini-api/docs/generate-content/file-search)
