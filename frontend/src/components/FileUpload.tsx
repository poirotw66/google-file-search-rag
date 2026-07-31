import { useState, useRef } from 'react';
import { api, UploadResponse, getErrorMessage, SessionFile } from '../api/client';

interface FileUploadProps {
  sessionId: string;
  onUploadSuccess: (file: SessionFile) => void;
  onUploadError: (error: string) => void;
}

export default function FileUpload({
  sessionId,
  onUploadSuccess,
  onUploadError,
}: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file) return;

    setIsUploading(true);
    setUploadProgress(0);

    const progressInterval = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return prev;
        }
        return prev + Math.random() * 15;
      });
    }, 500);

    try {
      const result: UploadResponse = await api.uploadFile(
        sessionId,
        file,
        file.name
      );
      clearInterval(progressInterval);
      setUploadProgress(100);
      setTimeout(() => {
        onUploadSuccess({
          original_name: result.file_name,
          store_display_name: result.store_display_name,
          document_name: result.document_name,
        });
        setIsUploading(false);
        setUploadProgress(0);
      }, 300);
    } catch (error: unknown) {
      clearInterval(progressInterval);
      onUploadError(getErrorMessage(error, '上傳失敗，請重試'));
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFile(files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div
      className={`upload-zone rounded-xl p-6 text-center cursor-pointer relative overflow-hidden ${
        isDragging ? 'dragging' : ''
      } ${isUploading ? 'pointer-events-none' : ''}`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={() => !isUploading && fileInputRef.current?.click()}
    >
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileSelect}
        disabled={isUploading}
        accept=".pdf,.doc,.docx,.txt,.md,.jpg,.jpeg,.png,.json,.csv,.html,.xml"
      />

      {/* Progress bar */}
      {isUploading && (
        <div className="absolute inset-x-0 bottom-0 h-1 bg-[var(--bg-dark)]">
          <div
            className="h-full bg-gradient-to-r from-[var(--primary)] to-[var(--accent)] transition-all duration-300"
            style={{ width: `${uploadProgress}%` }}
          />
        </div>
      )}

      {isUploading ? (
        <div className="py-2">
          <div className="w-10 h-10 mx-auto mb-3 relative">
            <svg className="animate-spin text-[var(--primary)]" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeOpacity="0.2" />
              <path d="M12 2C6.48 2 2 6.48 2 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <p className="text-sm text-[var(--text-primary)] font-medium">上傳處理中...</p>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            {uploadProgress < 90 ? '正在上傳檔案' : '正在建立索引'}
          </p>
        </div>
      ) : (
        <>
          <div className={`w-12 h-12 mx-auto mb-3 rounded-xl flex items-center justify-center transition-all ${
            isDragging 
              ? 'bg-[var(--accent)]/20 scale-110' 
              : 'bg-gradient-to-br from-[var(--primary)]/10 to-[var(--secondary)]/10'
          }`}>
            <svg className={`w-6 h-6 transition-colors ${isDragging ? 'text-[var(--accent)]' : 'text-[var(--primary)]'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          <p className="text-sm text-[var(--text-primary)] font-medium mb-1">
            {isDragging ? '放開以上傳' : '拖放或點擊上傳'}
          </p>
          <p className="text-xs text-[var(--text-secondary)]">
            支援 PDF、Word、TXT、Markdown 等格式
          </p>
        </>
      )}
    </div>
  );
}
