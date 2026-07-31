import { useEffect, useRef, useState } from 'react';
import MessageList, { Message } from './MessageList';
import InputArea from './InputArea';
import {
  api,
  ChatResponse,
  CitationContext,
  getErrorMessage,
} from '../api/client';

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

function dedupeCitations(raw: CitationContext[]): CitationContext[] {
  const seen = new Set<string>();
  return raw.filter((ctx) => {
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
}

function citationsFromGrounding(
  grounding: ChatResponse['grounding_metadata'] | undefined
): CitationContext[] | undefined {
  const raw =
    grounding?.grounding_chunks
      ?.map((chunk) => chunk.retrieved_context)
      .filter(
        (ctx): ctx is CitationContext =>
          Boolean(ctx?.uri || ctx?.title || ctx?.page_number || ctx?.media_id)
      ) || [];
  const unique = dedupeCitations(raw);
  return unique.length > 0 ? unique : undefined;
}

export default function ChatWindow({ sessionId, hasFiles = false }: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadHistory = async () => {
      try {
        const session = await api.getSession(sessionId);
        if (!cancelled && Array.isArray(session.messages)) {
          setMessages(historyToMessages(session.messages));
        }
      } catch {
        if (!cancelled) setMessages([]);
      }
    };
    loadHistory();
    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, [sessionId]);

  const handleSendMessage = async (content: string) => {
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
    };
    const assistantId = `${Date.now() + 1}`;
    let assistantCreated = false;
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    const ensureAssistant = () => {
      if (assistantCreated) return;
      assistantCreated = true;
      setMessages((prev) => [
        ...prev,
        { id: assistantId, role: 'assistant', content: '' },
      ]);
    };

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await api.streamMessage(
        sessionId,
        content,
        (event) => {
          if (event.type === 'token') {
            ensureAssistant();
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantId
                  ? { ...msg, content: msg.content + event.text }
                  : msg
              )
            );
          } else if (event.type === 'done') {
            ensureAssistant();
            const citations = citationsFromGrounding(event.grounding_metadata);
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantId
                  ? {
                      ...msg,
                      content: event.response || msg.content,
                      citations,
                    }
                  : msg
              )
            );
          } else if (event.type === 'error') {
            ensureAssistant();
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantId
                  ? {
                      ...msg,
                      content: `抱歉，發生錯誤：${event.detail}`,
                      isError: true,
                    }
                  : msg
              )
            );
          }
        },
        controller.signal
      );
    } catch (error: unknown) {
      if ((error as { name?: string })?.name === 'AbortError') {
        return;
      }
      ensureAssistant();
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantId
            ? {
                ...msg,
                content: `抱歉，發生錯誤：${getErrorMessage(error, '無法取得回應，請稍後再試')}`,
                isError: true,
              }
            : msg
        )
      );
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
    <div className="flex flex-col h-full bg-[rgba(255,255,255,0.35)]">
      <div className="px-5 sm:px-7 py-4 border-b border-[var(--line)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] tracking-[0.16em] uppercase text-[var(--muted)]">Conversation</p>
            <h2 className="font-display text-xl text-[var(--ink)] mt-0.5">智能對話</h2>
            <p className="text-xs text-[var(--muted)] mt-1">
              {hasFiles ? '依典藏文件作答 · 串流 · 多輪上下文' : '上傳文件後即可開始精準提問'}
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
              className="text-xs px-3 py-1.5 rounded-lg btn-ghost"
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
          sessionId={sessionId}
          onSuggestionClick={handleSuggestionClick}
        />
      </div>

      <InputArea onSendMessage={handleSendMessage} disabled={isLoading} />
    </div>
  );
}
