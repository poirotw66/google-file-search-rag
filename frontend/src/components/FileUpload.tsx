import { useEffect, useRef, useState } from 'react';
import {
  api,
  getErrorMessage,
  isRetryableUploadError,
  SessionFile,
} from '../api/client';

interface FileUploadProps {
  sessionId: string;
  onUploadSuccess: (file: SessionFile) => void;
  onUploadError: (error: string) => void;
}

type UploadPhase = 'queued' | 'uploading' | 'indexing' | 'done' | 'error';

interface UploadItem {
  id: string;
  file: File;
  phase: UploadPhase;
  transferPercent: number;
  attempt: number;
  error?: string;
}

const UPLOAD_CONCURRENCY = 3;
const MAX_ATTEMPTS = 3;

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function phaseLabel(item: UploadItem): string {
  switch (item.phase) {
    case 'queued':
      return item.error ? `排隊重試 · ${item.error}` : '排隊中';
    case 'uploading':
      return `傳輸中 ${item.transferPercent}%`;
    case 'indexing':
      return '伺服器建立索引中';
    case 'done':
      return '完成';
    case 'error':
      return '失敗';
    default:
      return '';
  }
}

export default function FileUpload({
  sessionId,
  onUploadSuccess,
  onUploadError,
}: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [items, setItems] = useState<UploadItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef<UploadItem[]>([]);
  const abortMapRef = useRef<Map<string, AbortController>>(new Map());
  const activeCountRef = useRef(0);
  const pumpScheduledRef = useRef(false);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const setItemsBoth = (
    updater: (prev: UploadItem[]) => UploadItem[]
  ) => {
    setItems((prev) => {
      const next = updater(prev);
      itemsRef.current = next;
      return next;
    });
  };

  const patchItem = (id: string, patch: Partial<UploadItem>) => {
    setItemsBoth((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  };

  const schedulePump = () => {
    if (pumpScheduledRef.current) return;
    pumpScheduledRef.current = true;
    queueMicrotask(() => {
      pumpScheduledRef.current = false;
      void pumpQueue();
    });
  };

  const pumpQueue = async () => {
    while (activeCountRef.current < UPLOAD_CONCURRENCY) {
      const next = itemsRef.current.find((item) => item.phase === 'queued');
      if (!next) break;

      // Claim synchronously on the ref to avoid double-start races
      itemsRef.current = itemsRef.current.map((item) =>
        item.id === next.id
          ? { ...item, phase: 'uploading', transferPercent: 0, error: undefined }
          : item
      );
      setItems([...itemsRef.current]);
      activeCountRef.current += 1;

      void runUpload(next.id).finally(() => {
        activeCountRef.current = Math.max(0, activeCountRef.current - 1);
        schedulePump();
      });
    }
  };

  const runUpload = async (id: string) => {
    const current = itemsRef.current.find((item) => item.id === id);
    if (!current) return;

    const attempt = current.attempt + 1;
    const controller = new AbortController();
    abortMapRef.current.set(id, controller);
    patchItem(id, { attempt, phase: 'uploading', transferPercent: 0 });

    try {
      const result = await api.uploadFile(sessionId, current.file, current.file.name, {
        signal: controller.signal,
        onUploadProgress: ({ percent }) => {
          if (percent >= 100) {
            patchItem(id, { phase: 'indexing', transferPercent: 100 });
          } else {
            patchItem(id, { phase: 'uploading', transferPercent: percent });
          }
        },
      });

      patchItem(id, { phase: 'done', transferPercent: 100, error: undefined });
      onUploadSuccess({
        original_name: result.file_name,
        store_display_name: result.store_display_name,
        document_name: result.document_name,
      });

      window.setTimeout(() => {
        setItemsBoth((prev) => prev.filter((item) => item.id !== id));
        abortMapRef.current.delete(id);
      }, 800);
    } catch (error: unknown) {
      abortMapRef.current.delete(id);
      if (
        (error as { code?: string; name?: string })?.code === 'ERR_CANCELED' ||
        (error as { name?: string })?.name === 'CanceledError'
      ) {
        setItemsBoth((prev) => prev.filter((item) => item.id !== id));
        return;
      }

      const message = getErrorMessage(error, '上傳失敗，請重試');
      if (attempt < MAX_ATTEMPTS && isRetryableUploadError(error)) {
        patchItem(id, {
          phase: 'queued',
          transferPercent: 0,
          attempt,
          error: `自動重試 ${attempt}/${MAX_ATTEMPTS - 1}：${message}`,
        });
        await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
        return;
      }

      patchItem(id, { phase: 'error', error: message, attempt });
      onUploadError(`${current.file.name}: ${message}`);
    }
  };

  const enqueueFiles = (files: File[]) => {
    if (files.length === 0) return;
    const nextItems: UploadItem[] = files.map((file) => ({
      id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
      file,
      phase: 'queued' as const,
      transferPercent: 0,
      attempt: 0,
    }));
    setItemsBoth((prev) => [...prev, ...nextItems]);
    schedulePump();
  };

  const retryItem = (id: string) => {
    patchItem(id, {
      phase: 'queued',
      transferPercent: 0,
      error: undefined,
      attempt: 0,
    });
    schedulePump();
  };

  const cancelItem = (id: string) => {
    abortMapRef.current.get(id)?.abort();
    abortMapRef.current.delete(id);
    setItemsBoth((prev) => prev.filter((item) => item.id !== id));
  };

  const busy = items.some(
    (item) =>
      item.phase === 'queued' ||
      item.phase === 'uploading' ||
      item.phase === 'indexing'
  );

  return (
    <div className="space-y-3">
      <div
        className={`upload-zone rounded-xl p-6 text-center cursor-pointer relative overflow-hidden ${
          isDragging ? 'dragging' : ''
        }`}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          enqueueFiles(Array.from(e.dataTransfer.files));
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setIsDragging(false);
        }}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          multiple
          onChange={(e) => {
            enqueueFiles(Array.from(e.target.files || []));
            if (fileInputRef.current) fileInputRef.current.value = '';
          }}
          accept=".pdf,.doc,.docx,.txt,.md,.jpg,.jpeg,.png,.json,.csv,.html,.xml"
        />

        <div
          className={`w-12 h-12 mx-auto mb-3 rounded-xl flex items-center justify-center transition-all ${
            isDragging
              ? 'bg-[var(--accent)]/20 scale-110'
              : 'bg-gradient-to-br from-[var(--primary)]/10 to-[var(--secondary)]/10'
          }`}
        >
          <svg
            className={`w-6 h-6 transition-colors ${
              isDragging ? 'text-[var(--accent)]' : 'text-[var(--primary)]'
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
        </div>
        <p className="text-sm text-[var(--text-primary)] font-medium mb-1">
          {isDragging ? '放開以上傳' : '拖放或點擊上傳'}
        </p>
        <p className="text-xs text-[var(--text-secondary)]">
          多檔並行（最多 {UPLOAD_CONCURRENCY}）· 真實傳輸進度 · 失敗可重試
        </p>
        {busy && (
          <p className="text-xs text-[var(--accent)] mt-2">上傳進行中...</p>
        )}
      </div>

      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3"
            >
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-[var(--text-primary)] truncate">
                    {item.file.name}
                  </div>
                  <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                    {formatBytes(item.file.size)} · {phaseLabel(item)}
                  </div>
                </div>
                {item.phase === 'error' ? (
                  <button
                    onClick={() => retryItem(item.id)}
                    className="text-[11px] text-[var(--primary)] hover:underline shrink-0"
                  >
                    重試
                  </button>
                ) : item.phase !== 'done' ? (
                  <button
                    onClick={() => cancelItem(item.id)}
                    className="text-[11px] text-[var(--text-secondary)] hover:text-red-400 shrink-0"
                  >
                    取消
                  </button>
                ) : null}
              </div>

              {(item.phase === 'uploading' || item.phase === 'indexing') && (
                <div className="mt-2 h-1.5 rounded-full bg-[var(--bg-dark)] overflow-hidden">
                  <div
                    className={`h-full bg-gradient-to-r from-[var(--primary)] to-[var(--accent)] transition-all duration-200 ${
                      item.phase === 'indexing' ? 'animate-pulse w-full' : ''
                    }`}
                    style={
                      item.phase === 'uploading'
                        ? { width: `${item.transferPercent}%` }
                        : undefined
                    }
                  />
                </div>
              )}

              {item.error && item.phase === 'error' && (
                <p className="mt-2 text-[11px] text-red-400 break-words">{item.error}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
