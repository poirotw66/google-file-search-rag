# Google File Search RAG 應用

這是一個基於 Google Gemini File Search API 的 RAG (Retrieval Augmented Generation) 應用，允許使用者上傳檔案並透過對話介面進行提問。

## 功能特色

- 📄 支援多種檔案格式上傳（PDF、Word、圖片等）
- 💬 即時對話介面
- 🔍 基於上傳檔案的語意搜尋
- 📚 顯示 AI 回應的引用來源
- 🎨 現代化的 React + Tailwind CSS 介面

## 技術架構

- **Backend**: FastAPI + Google Gemini SDK
- **Frontend**: React + TypeScript + Vite + Tailwind CSS
- **API**: Google Gemini File Search API

## 環境設定

### 1. 建立 `.env` 檔案

在專案根目錄建立 `.env` 檔案：

```env
GEMINI_API_KEY=your_api_key_here
```

### 2. 安裝後端依賴

```bash
cd backend
pip install -r requirements.txt
```

### 3. 安裝前端依賴

```bash
cd frontend
npm install
```

## 執行方式

### 啟動後端服務

```bash
cd backend
python main.py
```

或者使用 uvicorn：

```bash
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

後端 API 文件可在 http://localhost:8000/docs 查看

### 啟動前端服務

```bash
cd frontend
npm run dev
```

前端應用會在 http://localhost:5173 開啟

## 使用方式

1. 開啟前端應用（http://localhost:5173）
2. 系統會自動建立一個新的對話 session
3. 在左側上傳檔案（支援拖放或點擊上傳）
4. 在右側對話視窗輸入問題
5. AI 會基於上傳的檔案內容進行回答

## 專案結構

```
google-file-search-rag/
├── backend/
│   ├── main.py              # FastAPI 應用入口
│   ├── routes/              # API 路由
│   │   ├── session.py       # Session 管理
│   │   ├── upload.py        # 檔案上傳
│   │   └── chat.py          # 對話 API
│   ├── services/            # 業務邏輯
│   │   ├── gemini.py        # Gemini API 封裝
│   │   └── session_store.py # Session 狀態管理
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.tsx          # 主應用元件
│   │   ├── components/      # React 元件
│   │   │   ├── ChatWindow.tsx
│   │   │   ├── FileUpload.tsx
│   │   │   ├── InputArea.tsx
│   │   │   └── MessageList.tsx
│   │   └── api/
│   │       └── client.ts    # API 客戶端
│   └── package.json
└── README.md
```

## API 端點

### Session 管理
- `POST /api/session/create` - 建立新 session
- `GET /api/session/{session_id}` - 取得 session 資訊
- `DELETE /api/session/{session_id}` - 刪除 session

### 檔案上傳
- `POST /api/upload/file` - 上傳檔案到指定 session

### 對話
- `POST /api/chat/message` - 發送訊息並取得 AI 回應

## 注意事項

- 每個 session 會建立一個獨立的 File Search Store
- Session 結束時會自動清理對應的 Store
- 目前使用記憶體儲存 session 資訊，生產環境建議使用資料庫
- 檔案上傳會等待 Google API 處理完成後才回傳成功

## 支援的檔案格式

根據 Google File Search API 文件，支援的格式包括：
- PDF (application/pdf)
- Word 文件 (.doc, .docx)
- Markdown (.md)
- 圖片（多模態檢索建議 PNG / JPEG；Store 使用 `gemini-embedding-2`）
- 文字檔案 (.txt)
- 以及其他多種格式（詳見 api_doc.md）

查詢模型預設為 `gemini-3.6-flash`。

