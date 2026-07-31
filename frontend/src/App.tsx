import { useState, useEffect, useRef } from 'react';
import FileUpload from './components/FileUpload';
import ChatWindow from './components/ChatWindow';
import {
  api,
  getErrorMessage,
  SESSION_STORAGE_KEY,
  SessionFile,
} from './api/client';

function App() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<SessionFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isDeletingFile, setIsDeletingFile] = useState(false);
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const initializeSession = async () => {
      try {
        const savedId = localStorage.getItem(SESSION_STORAGE_KEY);
        if (savedId) {
          try {
            const existing = await api.getSession(savedId);
            if (cancelled) return;
            sessionIdRef.current = existing.session_id;
            localStorage.setItem(SESSION_STORAGE_KEY, existing.session_id);
            setSessionId(existing.session_id);
            setUploadedFiles(existing.files || []);
            setError(null);
            return;
          } catch {
            localStorage.removeItem(SESSION_STORAGE_KEY);
          }
        }

        const session = await api.createSession();
        if (cancelled) return;
        sessionIdRef.current = session.session_id;
        localStorage.setItem(SESSION_STORAGE_KEY, session.session_id);
        setSessionId(session.session_id);
        setUploadedFiles([]);
        setError(null);
      } catch (err: unknown) {
        console.error('Session creation error:', err);
        if (!cancelled) {
          setError('無法建立 session: ' + getErrorMessage(err, '無法連接到後端服務'));
        }
      }
    };

    initializeSession();
    return () => {
      cancelled = true;
    };
  }, []);

  const startNewSession = async () => {
    const previous = sessionIdRef.current;
    setError(null);
    try {
      const session = await api.createSession();
      sessionIdRef.current = session.session_id;
      localStorage.setItem(SESSION_STORAGE_KEY, session.session_id);
      setSessionId(session.session_id);
      setUploadedFiles([]);
      if (previous) {
        api.deleteSession(previous).catch(console.error);
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err, '無法建立新對話'));
    }
  };

  const handleUploadSuccess = (file: SessionFile) => {
    setUploadedFiles((prev) => [...prev, file]);
    setError(null);
  };

  const handleUploadError = (errorMsg: string) => {
    setError(errorMsg);
  };

  const handleRemoveFile = async (index: number) => {
    const target = uploadedFiles[index];
    if (!target || !sessionId) return;
    setIsDeletingFile(true);
    setError(null);
    try {
      await api.deleteFile(sessionId, {
        document_name: target.document_name || undefined,
        store_display_name: target.store_display_name,
      });
      setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
    } catch (err: unknown) {
      setError(getErrorMessage(err, '刪除檔案失敗'));
    } finally {
      setIsDeletingFile(false);
    }
  };

  if (!sessionId && !error) {
    return (
      <div className="h-screen flex items-center justify-center relative overflow-hidden">
        <div className="app-ambience app-ambience-a" />
        <div className="app-ambience app-ambience-b" />
        <div className="text-center animate-rise relative z-10 px-6">
          <p className="font-display text-4xl brand-mark text-[var(--ink)] mb-3">DocuChat</p>
          <p className="text-sm text-[var(--muted)] tracking-wide">正在準備你的文件工作台</p>
          <div className="mt-8 mx-auto h-[2px] w-24 overflow-hidden rounded-full bg-[var(--line)]">
            <div className="h-full w-1/2 bg-[var(--accent)] animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (error && !sessionId) {
    return (
      <div className="h-screen flex items-center justify-center p-4 relative overflow-hidden">
        <div className="app-ambience app-ambience-a" />
        <div className="shell-panel rounded-[24px] p-8 max-w-md w-full animate-rise relative z-10">
          <p className="font-display text-3xl brand-mark mb-2">DocuChat</p>
          <h2 className="text-lg font-medium text-[var(--ink)] mb-2">無法連線</h2>
          <p className="text-sm text-[var(--muted)] leading-relaxed mb-6">{error}</p>
          <ul className="text-xs text-[var(--ink-soft)] space-y-2 mb-6">
            <li className="flex gap-2"><span className="text-[var(--accent)]">—</span>後端服務是否已啟動</li>
            <li className="flex gap-2"><span className="text-[var(--accent)]">—</span>是否已設定 GEMINI_API_KEY</li>
          </ul>
          <button
            onClick={() => window.location.reload()}
            className="w-full py-3 rounded-xl btn-primary font-medium"
          >
            重新連線
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden relative">
      <div className="app-ambience app-ambience-a" />
      <div className="app-ambience app-ambience-b" />

      <header className="relative z-20 px-4 sm:px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 rounded-xl btn-ghost lg:hidden"
            aria-label="切換側欄"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 7h16M4 12h16M4 17h10" />
            </svg>
          </button>
          <div>
            <h1 className="font-display text-2xl sm:text-3xl brand-mark leading-none">DocuChat</h1>
            <p className="hidden sm:block text-[11px] tracking-[0.18em] uppercase text-[var(--muted)] mt-1">
              Document intelligence
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <button onClick={startNewSession} className="px-3.5 py-2 text-xs rounded-xl btn-ghost font-medium">
            新對話
          </button>
          <div className="hidden sm:flex items-center gap-2 px-3 py-2 text-xs text-[var(--ink-soft)]">
            <span className="status-dot" />
            連線就緒
          </div>
        </div>
      </header>

      <div className="relative z-10 flex-1 flex overflow-hidden px-3 sm:px-5 pb-3 sm:pb-5 gap-0 lg:gap-4">
        <aside
          className={`${
            sidebarOpen ? 'translate-x-0' : '-translate-x-[110%]'
          } lg:translate-x-0 fixed lg:relative z-30 h-[calc(100%-0.25rem)] lg:h-full w-[min(100vw-1.5rem,20rem)] lg:w-80 shell-panel rounded-[24px] transition-transform duration-300 ease-out`}
        >
          <div className="h-full flex flex-col p-5">
            <div className="mb-6">
              <div className="flex items-end justify-between mb-3">
                <div>
                  <p className="text-[11px] tracking-[0.16em] uppercase text-[var(--muted)]">Knowledge</p>
                  <h2 className="font-display text-xl text-[var(--ink)] mt-1">上傳文件</h2>
                </div>
              </div>
              <FileUpload
                sessionId={sessionId!}
                onUploadSuccess={handleUploadSuccess}
                onUploadError={handleUploadError}
              />
            </div>

            {error && (
              <div className="mb-4 px-3 py-2.5 rounded-xl bg-[var(--danger-mist)] border border-[rgba(180,35,24,0.15)] animate-fade-in">
                <p className="text-sm text-[var(--danger)] leading-relaxed">{error}</p>
              </div>
            )}

            <div className="flex-1 overflow-y-auto min-h-0">
              <div className="flex items-baseline justify-between mb-2">
                <h2 className="font-display text-lg text-[var(--ink)]">典藏庫</h2>
                <span className="text-[11px] text-[var(--muted)] tabular-nums">{uploadedFiles.length} 份</span>
              </div>

              {uploadedFiles.length === 0 ? (
                <div className="py-10">
                  <p className="text-sm text-[var(--ink-soft)]">尚無文件</p>
                  <p className="text-xs text-[var(--muted)] mt-1 leading-relaxed">
                    上傳 PDF、Markdown 或圖片後即可開始提問。
                  </p>
                </div>
              ) : (
                <ul>
                  {uploadedFiles.map((file, idx) => (
                    <li
                      key={`${file.document_name || file.store_display_name || file.original_name}-${idx}`}
                      className="file-row group flex items-center gap-3 py-3 animate-fade-in"
                      style={{ animationDelay: `${idx * 40}ms` }}
                    >
                      <span className="w-7 text-[11px] tabular-nums text-[var(--muted)]">
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      <span className="flex-1 text-sm text-[var(--ink)] truncate">
                        {file.original_name}
                      </span>
                      <button
                        onClick={() => handleRemoveFile(idx)}
                        disabled={isDeletingFile}
                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-mist)] transition-all disabled:opacity-40"
                        title="從知識庫刪除"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="pt-4 mt-2 border-t border-[var(--line)]">
              <p className="text-[11px] text-[var(--muted)] text-center tracking-wide">
                Powered by Gemini File Search
              </p>
            </div>
          </div>
        </aside>

        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-[rgba(24,32,43,0.28)] backdrop-blur-[2px] z-20 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <main className="flex-1 flex flex-col min-w-0 shell-panel rounded-[24px] overflow-hidden animate-rise">
          <ChatWindow sessionId={sessionId!} hasFiles={uploadedFiles.length > 0} />
        </main>
      </div>
    </div>
  );
}

export default App;
