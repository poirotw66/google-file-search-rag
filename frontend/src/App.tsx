import { useState, useEffect, useRef } from 'react';
import FileUpload from './components/FileUpload';
import ChatWindow from './components/ChatWindow';
import { api } from './api/client';

function App() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    const initializeSession = async () => {
      try {
        const session = await api.createSession();
        sessionIdRef.current = session.session_id;
        setSessionId(session.session_id);
        setError(null);
      } catch (err: any) {
        console.error('Session creation error:', err);
        const errorMessage = err.response?.data?.detail || err.message || '無法連接到後端服務';
        setError('無法建立 session: ' + errorMessage);
      }
    };

    initializeSession();

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

  const handleRemoveFile = (index: number) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // Loading state
  if (!sessionId && !error) {
    return (
      <div className="h-screen flex items-center justify-center bg-[var(--bg-dark)]">
        <div className="text-center animate-fade-in">
          <div className="w-16 h-16 mx-auto mb-6 relative">
            <div className="absolute inset-0 rounded-full bg-gradient-to-r from-[var(--primary)] to-[var(--secondary)] animate-spin" style={{ animationDuration: '2s' }}></div>
            <div className="absolute inset-1 rounded-full bg-[var(--bg-dark)]"></div>
            <div className="absolute inset-3 rounded-full bg-gradient-to-r from-[var(--primary)] to-[var(--accent)] animate-pulse"></div>
          </div>
          <div className="text-[var(--text-primary)] text-xl font-medium mb-2">初始化中</div>
          <div className="text-[var(--text-secondary)] text-sm">正在建立安全連線...</div>
        </div>
      </div>
    );
  }

  // Error state
  if (error && !sessionId) {
    return (
      <div className="h-screen flex items-center justify-center bg-[var(--bg-dark)] p-4">
        <div className="glass rounded-2xl p-8 max-w-md w-full animate-fade-in">
          <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-red-500/20 flex items-center justify-center">
            <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-center text-[var(--text-primary)] mb-2">連線錯誤</h2>
          <p className="text-[var(--text-secondary)] text-center text-sm mb-6">{error}</p>
          <div className="bg-[var(--bg-dark)] rounded-lg p-4 mb-6">
            <p className="text-xs text-[var(--text-secondary)] mb-2">請確認：</p>
            <ul className="text-xs text-[var(--text-secondary)] space-y-1">
              <li className="flex items-center gap-2">
                <span className="w-1 h-1 rounded-full bg-[var(--accent)]"></span>
                後端服務正在運行
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1 h-1 rounded-full bg-[var(--accent)]"></span>
                已設定 GEMINI_API_KEY
              </li>
            </ul>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="w-full py-3 rounded-xl btn-primary text-white font-medium"
          >
            重新連線
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-[var(--bg-dark)] overflow-hidden">
      {/* Header */}
      <header className="glass border-b border-[var(--border)] px-4 py-3 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 rounded-lg hover:bg-[var(--bg-card)] transition-colors lg:hidden"
          >
            <svg className="w-5 h-5 text-[var(--text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--primary)] to-[var(--secondary)] flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h1 className="text-lg font-semibold gradient-text hidden sm:block">DocuChat AI</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
            <span className="text-xs text-green-400">已連線</span>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside className={`${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 fixed lg:relative z-20 h-[calc(100vh-57px)] w-80 glass border-r border-[var(--border)] transition-transform duration-300 ease-in-out`}>
          <div className="h-full flex flex-col p-4">
            {/* Upload Section */}
            <div className="mb-6">
              <h2 className="text-sm font-medium text-[var(--text-secondary)] mb-3 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                上傳文件
              </h2>
              <FileUpload
                sessionId={sessionId!}
                onUploadSuccess={handleUploadSuccess}
                onUploadError={handleUploadError}
              />
            </div>

            {/* Error Message */}
            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 animate-fade-in">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            {/* Uploaded Files */}
            <div className="flex-1 overflow-y-auto">
              <h2 className="text-sm font-medium text-[var(--text-secondary)] mb-3 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
                </svg>
                已上傳檔案 ({uploadedFiles.length})
              </h2>
              {uploadedFiles.length === 0 ? (
                <div className="text-center py-8">
                  <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[var(--bg-card)] flex items-center justify-center">
                    <svg className="w-6 h-6 text-[var(--text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <p className="text-sm text-[var(--text-secondary)]">尚無上傳檔案</p>
                  <p className="text-xs text-[var(--text-secondary)] opacity-60 mt-1">上傳文件後可進行問答</p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {uploadedFiles.map((file, idx) => (
                    <li
                      key={idx}
                      className="group flex items-center gap-3 p-3 rounded-lg bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] transition-colors animate-fade-in"
                      style={{ animationDelay: `${idx * 50}ms` }}
                    >
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--primary)]/20 to-[var(--accent)]/20 flex items-center justify-center flex-shrink-0">
                        <svg className="w-4 h-4 text-[var(--primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <span className="flex-1 text-sm text-[var(--text-primary)] truncate">{file}</span>
                      <button
                        onClick={() => handleRemoveFile(idx)}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/20 transition-all"
                      >
                        <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Footer */}
            <div className="pt-4 border-t border-[var(--border)]">
              <p className="text-xs text-[var(--text-secondary)] text-center opacity-60">
                Powered by Google Gemini
              </p>
            </div>
          </div>
        </aside>

        {/* Overlay for mobile */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-10 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main Chat Area */}
        <main className="flex-1 flex flex-col min-w-0">
          <ChatWindow sessionId={sessionId!} hasFiles={uploadedFiles.length > 0} uploadedFileNames={uploadedFiles} />
        </main>
      </div>
    </div>
  );
}

export default App;
