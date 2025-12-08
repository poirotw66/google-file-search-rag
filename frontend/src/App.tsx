import { useState, useEffect, useRef } from 'react';
import FileUpload from './components/FileUpload';
import ChatWindow from './components/ChatWindow';
import { api } from './api/client';

function App() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    // 建立新的 session
    const initializeSession = async () => {
      try {
        const session = await api.createSession();
        sessionIdRef.current = session.session_id;
        setSessionId(session.session_id);
        setError(null);
      } catch (err: any) {
        console.error('Session creation error:', err);
        const errorMessage = err.response?.data?.detail || err.message || '無法連接到後端服務，請確認後端是否正在運行';
        setError('無法建立 session: ' + errorMessage);
      }
    };

    initializeSession();

    // 清理：當組件卸載時刪除 session
    return () => {
      if (sessionIdRef.current) {
        api.deleteSession(sessionIdRef.current).catch(console.error);
      }
    };
  }, []);

  const handleUploadSuccess = (fileName: string) => {
    setUploadedFiles((prev) => [...prev, fileName]);
    setError(null);
  };

  const handleUploadError = (errorMsg: string) => {
    setError(errorMsg);
  };

  if (!sessionId && !error) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="text-gray-500 text-lg mb-2">載入中...</div>
          <div className="text-gray-400 text-sm">正在建立對話 session</div>
        </div>
      </div>
    );
  }

  if (error && !sessionId) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md mx-auto p-6">
          <div className="text-red-500 text-xl mb-4">⚠️ 連線錯誤</div>
          <div className="text-gray-700 mb-4">{error}</div>
          <div className="text-sm text-gray-500 mb-4">
            請確認：
            <ul className="list-disc list-inside mt-2 text-left">
              <li>後端服務是否正在運行 (http://localhost:8000)</li>
              <li>.env 檔案中是否設定了 GEMINI_API_KEY</li>
              <li>瀏覽器控制台是否有更多錯誤訊息</li>
            </ul>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            重新載入
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <h1 className="text-2xl font-bold text-gray-800">
          File Search RAG
        </h1>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* 左側：檔案上傳區域 */}
        <div className="w-80 bg-white border-r border-gray-200 p-6 overflow-y-auto">
          <h2 className="text-lg font-semibold mb-4">檔案上傳</h2>
          <FileUpload
            sessionId={sessionId}
            onUploadSuccess={handleUploadSuccess}
            onUploadError={handleUploadError}
          />

          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
              {error}
            </div>
          )}

          {uploadedFiles.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">
                已上傳檔案：
              </h3>
              <ul className="space-y-2">
                {uploadedFiles.map((file, idx) => (
                  <li
                    key={idx}
                    className="text-sm text-gray-600 bg-gray-50 p-2 rounded"
                  >
                    📄 {file}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* 右側：對話視窗 */}
        <div className="flex-1 flex flex-col bg-white">
          <ChatWindow sessionId={sessionId} />
        </div>
      </div>
    </div>
  );
}

export default App;

