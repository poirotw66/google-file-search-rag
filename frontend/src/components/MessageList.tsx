import { useEffect, useRef, useState } from 'react';
import { mediaUrl } from '../api/client';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: Array<{
    uri?: string;
    title?: string;
    page_number?: number | null;
    media_id?: string | null;
    text?: string | null;
  }>;
  isError?: boolean;
}

interface MessageListProps {
  messages: Message[];
  isLoading?: boolean;
  hasFiles?: boolean;
  sessionId?: string;
  onSuggestionClick?: (text: string) => void;
}

export default function MessageList({
  messages,
  isLoading = false,
  hasFiles = false,
  sessionId,
  onSuggestionClick,
}: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const last = messages[messages.length - 1];
  const showTyping = isLoading && last?.role !== 'assistant';

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      {messages.length === 0 ? (
        <div className="h-full flex flex-col items-center justify-center text-center px-4">
          <div className="w-20 h-20 mb-6 rounded-2xl bg-gradient-to-br from-[var(--primary)]/10 to-[var(--secondary)]/10 flex items-center justify-center">
            <svg className="w-10 h-10 text-[var(--primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-[var(--text-primary)] mb-2">開始對話</h3>
          <p className="text-sm text-[var(--text-secondary)] max-w-sm">
            {hasFiles
              ? '文件已就緒！試著詢問關於文件內容的問題，AI 會幫你找到答案。'
              : '上傳文件後，你可以詢問任何關於文件內容的問題。'}
          </p>
          <div className="mt-6 flex flex-wrap gap-2 justify-center">
            {hasFiles ? (
              <>
                <SuggestionChip text="這份文件的主要內容是什麼？" onClick={onSuggestionClick} />
                <SuggestionChip text="幫我總結重點" onClick={onSuggestionClick} />
                <SuggestionChip text="有哪些注意事項？" onClick={onSuggestionClick} />
              </>
            ) : (
              <p className="text-xs text-[var(--text-secondary)] opacity-60">
                ← 請先在左側上傳文件
              </p>
            )}
          </div>
        </div>
      ) : (
        <>
          {messages.map((message, index) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}
              style={{ animationDelay: `${index * 30}ms` }}
            >
              <div className={`flex gap-3 max-w-[85%] ${message.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div
                  className={`w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center ${
                    message.role === 'user'
                      ? 'bg-gradient-to-br from-[var(--primary)] to-[var(--primary-dark)]'
                      : 'bg-[var(--bg-card)] border border-[var(--border)]'
                  }`}
                >
                  {message.role === 'user' ? (
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 text-[var(--accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  )}
                </div>

                <div
                  className={`rounded-2xl px-4 py-3 ${
                    message.role === 'user'
                      ? 'message-user text-white'
                      : message.isError
                      ? 'bg-red-500/10 border border-red-500/20 text-red-400'
                      : 'message-assistant text-[var(--text-primary)]'
                  }`}
                >
                  <div className="text-sm whitespace-pre-wrap leading-relaxed">
                    {message.content}
                  </div>

                  {message.citations && message.citations.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
                      <div className="flex items-center gap-1 text-xs opacity-70">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                        </svg>
                        引用來源
                      </div>
                      {message.citations.map((citation, idx) => (
                        <CitationCard
                          key={idx}
                          citation={citation}
                          sessionId={sessionId}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {showTyping && (
            <div className="flex justify-start animate-fade-in">
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] flex items-center justify-center">
                  <svg className="w-4 h-4 text-[var(--accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                <div className="message-assistant rounded-2xl px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 rounded-full bg-[var(--primary)] animate-bounce" style={{ animationDelay: '0ms' }}></span>
                      <span className="w-2 h-2 rounded-full bg-[var(--primary)] animate-bounce" style={{ animationDelay: '150ms' }}></span>
                      <span className="w-2 h-2 rounded-full bg-[var(--primary)] animate-bounce" style={{ animationDelay: '300ms' }}></span>
                    </div>
                    <span className="text-xs text-[var(--text-secondary)]">正在思考...</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
}

function CitationCard({
  citation,
  sessionId,
}: {
  citation: NonNullable<Message['citations']>[number];
  sessionId?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const label = citation.title || citation.uri || '文件引用';
  const hasPreview = Boolean(citation.media_id && sessionId);
  const hasSnippet = Boolean(citation.text);

  return (
    <div className="rounded-lg bg-black/10 border border-white/5 p-2">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium truncate">{label}</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {citation.page_number != null && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-[var(--primary)]/20 text-[10px] text-[var(--primary)]">
                第 {citation.page_number} 頁
              </span>
            )}
            {citation.media_id && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-[var(--accent)]/20 text-[10px] text-[var(--accent)]">
                圖片片段
              </span>
            )}
          </div>
        </div>
        {(hasPreview || hasSnippet) && (
          <button
            onClick={() => setExpanded((value) => !value)}
            className="text-[10px] opacity-70 hover:opacity-100 shrink-0"
          >
            {expanded ? '收合' : '詳情'}
          </button>
        )}
      </div>

      {expanded && (
        <div className="mt-2 space-y-2">
          {hasSnippet && (
            <p className="text-[11px] opacity-80 leading-relaxed whitespace-pre-wrap">
              {citation.text}
            </p>
          )}
          {hasPreview && sessionId && citation.media_id && (
            <img
              src={mediaUrl(sessionId, citation.media_id)}
              alt={label}
              className="max-h-40 rounded-md border border-white/10 object-contain bg-black/20"
              loading="lazy"
            />
          )}
        </div>
      )}
    </div>
  );
}

interface SuggestionChipProps {
  text: string;
  onClick?: (text: string) => void;
}

function SuggestionChip({ text, onClick }: SuggestionChipProps) {
  return (
    <button
      onClick={() => onClick?.(text)}
      className="px-3 py-1.5 text-xs text-[var(--text-secondary)] bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)] border border-[var(--border)] hover:border-[var(--primary)]/50 rounded-full transition-all duration-200 hover:scale-105"
    >
      {text}
    </button>
  );
}
