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
    <div className="h-full overflow-y-auto px-5 sm:px-7 py-6 space-y-5">
      {messages.length === 0 ? (
        <div className="h-full flex flex-col items-center justify-center text-center px-2 animate-rise">
          <p className="font-display text-4xl sm:text-5xl text-[var(--ink)] brand-mark leading-none mb-4">
            開始對話
          </p>
          <p className="text-sm text-[var(--muted)] max-w-md leading-relaxed">
            {hasFiles
              ? '文件已就緒。提出一個具體問題，我們會從典藏內容中找出可核對的依據。'
              : '先從左側上傳文件，再回到這裡提問。答案會附上引用來源。'}
          </p>
          <div className="mt-8 flex flex-wrap gap-2 justify-center">
            {hasFiles ? (
              <>
                <SuggestionChip text="這份文件的主要內容是什麼？" onClick={onSuggestionClick} />
                <SuggestionChip text="幫我總結重點" onClick={onSuggestionClick} />
                <SuggestionChip text="有哪些注意事項？" onClick={onSuggestionClick} />
              </>
            ) : (
              <p className="text-xs tracking-wide text-[var(--muted)]">← 請先上傳文件</p>
            )}
          </div>
        </div>
      ) : (
        <>
          {messages.map((message, index) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}
              style={{ animationDelay: `${Math.min(index, 8) * 28}ms` }}
            >
              <div className={`max-w-[min(100%,42rem)] ${message.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div className="mb-1.5 px-1 text-[10px] tracking-[0.14em] uppercase text-[var(--muted)]">
                  {message.role === 'user' ? 'You' : 'DocuChat'}
                </div>
                <div
                  className={`rounded-[20px] px-4 py-3.5 ${
                    message.role === 'user'
                      ? 'message-user'
                      : message.isError
                      ? 'bg-[var(--danger-mist)] border border-[rgba(180,35,24,0.16)] text-[var(--danger)]'
                      : 'message-assistant text-[var(--ink)]'
                  }`}
                >
                  <div className="text-[14px] sm:text-[15px] whitespace-pre-wrap leading-[1.7]">
                    {message.content}
                  </div>

                  {message.citations && message.citations.length > 0 && (
                    <div
                      className={`mt-3.5 pt-3 space-y-2 ${
                        message.role === 'user'
                          ? 'border-t border-white/15'
                          : 'border-t border-[var(--line)]'
                      }`}
                    >
                      <div
                        className={`text-[11px] tracking-wide ${
                          message.role === 'user' ? 'text-white/70' : 'text-[var(--muted)]'
                        }`}
                      >
                        引用來源
                      </div>
                      {message.citations.map((citation, idx) => (
                        <CitationCard
                          key={idx}
                          citation={citation}
                          sessionId={sessionId}
                          onDark={message.role === 'user'}
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
              <div className="message-assistant rounded-[20px] px-4 py-3.5">
                <div className="flex items-center gap-2">
                  <span className="status-dot" />
                  <span className="text-xs text-[var(--muted)] tracking-wide">正在整理回答</span>
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
  onDark = false,
}: {
  citation: NonNullable<Message['citations']>[number];
  sessionId?: string;
  onDark?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const label = citation.title || citation.uri || '文件引用';
  const hasPreview = Boolean(citation.media_id && sessionId);
  const hasSnippet = Boolean(citation.text);

  return (
    <div
      className={`rounded-xl p-2.5 ${
        onDark
          ? 'bg-white/10 border border-white/10'
          : 'bg-[rgba(24,32,43,0.03)] border border-[var(--line)]'
      }`}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className={`text-xs font-medium truncate ${onDark ? 'text-white' : 'text-[var(--ink)]'}`}>
            {label}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {citation.page_number != null && (
              <span
                className={`inline-flex items-center px-1.5 py-0.5 text-[10px] tracking-wide ${
                  onDark
                    ? 'bg-white/15 text-white/90'
                    : 'bg-[var(--accent-mist)] text-[var(--accent)]'
                }`}
              >
                第 {citation.page_number} 頁
              </span>
            )}
            {citation.media_id && (
              <span
                className={`inline-flex items-center px-1.5 py-0.5 text-[10px] tracking-wide ${
                  onDark ? 'bg-white/15 text-white/90' : 'bg-[rgba(184,137,74,0.12)] text-[var(--warm)]'
                }`}
              >
                圖片片段
              </span>
            )}
          </div>
        </div>
        {(hasPreview || hasSnippet) && (
          <button
            onClick={() => setExpanded((value) => !value)}
            className={`text-[10px] shrink-0 ${onDark ? 'text-white/70 hover:text-white' : 'text-[var(--muted)] hover:text-[var(--accent)]'}`}
          >
            {expanded ? '收合' : '詳情'}
          </button>
        )}
      </div>

      {expanded && (
        <div className="mt-2 space-y-2">
          {hasSnippet && (
            <p
              className={`text-[11px] leading-relaxed whitespace-pre-wrap ${
                onDark ? 'text-white/80' : 'text-[var(--ink-soft)]'
              }`}
            >
              {citation.text}
            </p>
          )}
          {hasPreview && sessionId && citation.media_id && (
            <img
              src={mediaUrl(sessionId, citation.media_id)}
              alt={label}
              className="max-h-40 rounded-lg border border-[var(--line)] object-contain bg-white"
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
    <button onClick={() => onClick?.(text)} className="suggestion-chip px-3.5 py-2 text-xs rounded-xl">
      {text}
    </button>
  );
}
