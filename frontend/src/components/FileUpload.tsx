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
        className={`upload-zone rounded-[18px] p-5 text-center cursor-pointer relative overflow-hidden ${
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

        <p className="font-display text-2xl text-[var(--ink)] mb-1">
          {isDragging ? '放開即可' : '放入文件'}
        </p>
        <p className="text-xs text-[var(--muted)] leading-relaxed">
          拖放或點擊 · 最多同時 {UPLOAD_CONCURRENCY} 檔 · 失敗可重試
        </p>
        {busy && (
          <p className="text-xs text-[var(--accent)] mt-3 tracking-wide">上傳進行中</p>
        )}
      </div>

      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-xl border border-[var(--line)] bg-[rgba(255,255,255,0.65)] px-3 py-2.5"
            >
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-[var(--ink)] truncate">
                    {item.file.name}
                  </div>
                  <div className="text-[11px] text-[var(--muted)] mt-0.5">
                    {formatBytes(item.file.size)} · {phaseLabel(item)}
                  </div>
                </div>
                {item.phase === 'error' ? (
                  <button
                    onClick={() => retryItem(item.id)}
                    className="text-[11px] text-[var(--accent)] hover:underline shrink-0"
                  >
                    重試
                  </button>
                ) : item.phase !== 'done' ? (
                  <button
                    onClick={() => cancelItem(item.id)}
                    className="text-[11px] text-[var(--muted)] hover:text-[var(--danger)] shrink-0"
                  >
                    取消
                  </button>
                ) : null}
              </div>

              {(item.phase === 'uploading' || item.phase === 'indexing') && (
                <div className="mt-2 h-1 rounded-full bg-[rgba(24,32,43,0.08)] overflow-hidden">
                  <div
                    className={`h-full bg-[var(--accent)] transition-all duration-200 ${
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
                <p className="mt-2 text-[11px] text-[var(--danger)] break-words">{item.error}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
