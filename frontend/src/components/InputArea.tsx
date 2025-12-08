import { useState, KeyboardEvent, useRef, useEffect } from 'react';

interface InputAreaProps {
  onSendMessage: (message: string) => void;
  disabled?: boolean;
}

export default function InputArea({
  onSendMessage,
  disabled = false,
}: InputAreaProps) {
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 150) + 'px';
    }
  }, [message]);

  const handleSend = () => {
    if (message.trim() && !disabled) {
      onSendMessage(message.trim());
      setMessage('');
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="p-4 glass border-t border-[var(--border)]">
      <div className="flex gap-3 items-end">
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="輸入問題，按 Enter 發送..."
            className="w-full bg-[var(--bg-card)] text-[var(--text-primary)] placeholder-[var(--text-secondary)] border border-[var(--border)] rounded-xl px-4 py-3 pr-12 resize-none input-focus text-sm leading-relaxed"
            rows={1}
            disabled={disabled}
            style={{ minHeight: '48px', maxHeight: '150px' }}
          />
          <div className="absolute right-3 bottom-3 text-xs text-[var(--text-secondary)] opacity-50">
            Shift+Enter 換行
          </div>
        </div>
        <button
          onClick={handleSend}
          disabled={!message.trim() || disabled}
          className={`flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center transition-all ${
            !message.trim() || disabled
              ? 'bg-[var(--bg-card)] text-[var(--text-secondary)] cursor-not-allowed'
              : 'btn-primary text-white glow'
          }`}
        >
          {disabled ? (
            <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeOpacity="0.2" />
              <path d="M12 2C6.48 2 2 6.48 2 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
