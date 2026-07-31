import { useEffect, useState } from 'react';
import MessageList, { Message } from './MessageList';
import InputArea from './InputArea';
import { api, getErrorMessage } from '../api/client';

interface ChatWindowProps {
  sessionId: string;
  hasFiles?: boolean;
}

function historyToMessages(
  history: Array<{ role: string; content: string }>
): Message[] {
  return history.map((item, index) => ({
    id: `history-${index}`,
    role: item.role === 'model' ? 'assistant' : 'user',
    content: item.content,
  }));
}

export default function ChatWindow({ sessionId, hasFiles = false }: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadHistory = async () => {
      try {
        const session = await api.getSession(sessionId);
        if (!cancelled && Array.isArray(session.messages)) {
          setMessages(historyToMessages(session.messages));
        }
      } catch {
        // Fresh session or expired — start empty
      }
    };
    loadHistory();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

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

      const rawCitations =
        response.grounding_metadata?.grounding_chunks
          ?.map((chunk) => chunk.retrieved_context)
          .filter(
            (
              ctx
            ): ctx is {
              uri?: string;
              title?: string;
              page_number?: number | null;
              media_id?: string | null;
              text?: string | null;
            } => Boolean(ctx?.uri || ctx?.title || ctx?.page_number || ctx?.media_id)
          ) || [];

      const seen = new Set<string>();
      const citations = rawCitations.filter((ctx) => {
        const key = [
          ctx.title || '',
          ctx.uri || '',
          ctx.page_number ?? '',
          ctx.media_id || '',
        ].join('|');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.response,
        citations: citations.length > 0 ? citations : undefined,
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error: unknown) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `抱歉，發生錯誤：${getErrorMessage(error, '無法取得回應，請稍後再試')}`,
        isError: true,
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuggestionClick = (text: string) => {
    if (!isLoading) {
      handleSendMessage(text);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-[var(--border)] glass">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-medium text-[var(--text-primary)]">智能對話</h2>
            <p className="text-xs text-[var(--text-secondary)]">
              {hasFiles ? '基於已上傳文件回答（支援多輪對話）' : '上傳文件後開始提問'}
            </p>
          </div>
          {messages.length > 0 && (
            <button
              onClick={async () => {
                try {
                  await api.clearMessages(sessionId);
                  setMessages([]);
                } catch (error: unknown) {
                  setMessages((prev) => [
                    ...prev,
                    {
                      id: Date.now().toString(),
                      role: 'assistant',
                      content: `清除對話失敗：${getErrorMessage(error, '請稍後再試')}`,
                      isError: true,
                    },
                  ]);
                }
              }}
              className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
              清除對話
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <MessageList
          messages={messages}
          isLoading={isLoading}
          hasFiles={hasFiles}
          onSuggestionClick={handleSuggestionClick}
        />
      </div>

      <InputArea onSendMessage={handleSendMessage} disabled={isLoading} />
    </div>
  );
}
