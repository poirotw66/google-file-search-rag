import { useState, useRef } from 'react';
import { api, UploadResponse } from '../api/client';

interface FileUploadProps {
  sessionId: string;
  onUploadSuccess: (fileName: string) => void;
  onUploadError: (error: string) => void;
}

export default function FileUpload({
  sessionId,
  onUploadSuccess,
  onUploadError,
}: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file) return;

    setIsUploading(true);
    try {
      const result: UploadResponse = await api.uploadFile(
        sessionId,
        file,
        file.name
      );
      onUploadSuccess(result.file_name);
    } catch (error: any) {
      onUploadError(error.response?.data?.detail || '上傳失敗');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      handleFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
  };

  return (
    <div
      className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
        isDragging
          ? 'border-blue-500 bg-blue-50'
          : 'border-gray-300 hover:border-gray-400'
      } ${isUploading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
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
        accept=".pdf,.doc,.docx,.txt,.md,.jpg,.jpeg,.png"
      />
      {isUploading ? (
        <div className="text-gray-500">
          <div className="animate-pulse">上傳處理中...</div>
          <div className="text-xs mt-1">檔案正在上傳並建立索引，請稍候</div>
        </div>
      ) : (
        <>
          <div className="text-4xl mb-2">📄</div>
          <div className="text-gray-600">
            點擊或拖放檔案到此處上傳
          </div>
          <div className="text-sm text-gray-400 mt-2">
            支援 PDF、Word、圖片等格式
          </div>
        </>
      )}
    </div>
  );
}

