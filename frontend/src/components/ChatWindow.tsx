import { useState } from 'react';
import MessageList, { Message } from './MessageList';
import InputArea from './InputArea';
import { api } from '../api/client';

interface ChatWindowProps {
  sessionId: string;
  hasFiles?: boolean;
  uploadedFileNames?: string[];
}

export default function ChatWindow({ sessionId, hasFiles = false, uploadedFileNames = [] }: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleSendMessage = async (content: string) => {
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
    };
    setMessages((prev) => [...prev, userMessage]);

    setIsLoading(true);
    try {
      const response = await api.sendMessage(sessionId, content);
      
      // 處理引用：去重
      const rawCitations = response.grounding_metadata?.grounding_chunks
        ?.map((chunk) => chunk.retrieved_context)
        .filter((ctx) => ctx?.uri || ctx?.title) || [];
      
      // 去重（根據 title 或 uri）
      const seenTitles = new Set<string>();
      const uniqueCitations = rawCitations.filter((ctx) => {
        const key = ctx?.title || ctx?.uri || '';
        if (seenTitles.has(key)) return false;
        seenTitles.add(key);
        return true;
      });
      
      // 將內部檔名映射到用戶上傳的檔名
      const cleanedCitations = uniqueCitations.map((ctx, index) => {
        const rawTitle = ctx?.title || ctx?.uri || '';
        let title = '文件引用';
        
        // 判斷是否為內部生成的檔名格式 (file + hex 或 純 hex)
        const isInternalName = /^file[a-f0-9]+$/i.test(rawTitle) || /^[a-f0-9]{12,}$/i.test(rawTitle);
        
        if (isInternalName && uploadedFileNames.length > 0) {
          // 使用上傳的檔案名稱（根據索引或使用第一個）
          title = uploadedFileNames[Math.min(index, uploadedFileNames.length - 1)];
        } else if (rawTitle) {
          title = rawTitle;
          // 移除 -xxxxxxxx 格式的 UUID 後綴
          title = title.replace(/-[a-f0-9]{8}$/i, '');
          // 如果是 files/xxx 格式，只取檔名部分
          if (title.startsWith('files/')) {
            title = title.replace('files/', '');
          }
        }
        
        return { ...ctx, title };
      });

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.response,
        citations: cleanedCitations.length > 0 ? cleanedCitations : undefined,
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error: any) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `抱歉，發生錯誤：${error.response?.data?.detail || '無法取得回應，請稍後再試'}`,
        isError: true,
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // 點擊推薦問題時直接發送
  const handleSuggestionClick = (text: string) => {
    if (!isLoading) {
      handleSendMessage(text);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Chat Header */}
      <div className="px-4 py-3 border-b border-[var(--border)] glass">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-medium text-[var(--text-primary)]">智能對話</h2>
            <p className="text-xs text-[var(--text-secondary)]">
              {hasFiles ? '已準備就緒，可以開始提問' : '請先上傳文件'}
            </p>
          </div>
          {messages.length > 0 && (
            <button
              onClick={() => setMessages([])}
              className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors px-2 py-1 rounded hover:bg-[var(--bg-card)]"
            >
              清除對話
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-hidden">
        <MessageList 
          messages={messages} 
          isLoading={isLoading} 
          hasFiles={hasFiles}
          onSuggestionClick={handleSuggestionClick}
        />
      </div>

      {/* Input */}
      <InputArea onSendMessage={handleSendMessage} disabled={isLoading} />
    </div>
  );
}
