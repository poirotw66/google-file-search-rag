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

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 150) + 'px';
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
    <div className="p-4 sm:p-5 border-t border-[var(--line)] bg-[rgba(255,255,255,0.45)]">
      <div className="composer-shell rounded-[22px] p-2.5 sm:p-3 flex gap-2.5 items-end">
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="提出問題，Enter 發送"
            className="w-full bg-transparent text-[var(--ink)] placeholder-[var(--muted)] border-0 rounded-xl px-3 py-2.5 resize-none input-focus text-sm leading-relaxed"
            rows={1}
            disabled={disabled}
            style={{ minHeight: '44px', maxHeight: '150px', boxShadow: 'none' }}
          />
          <div className="hidden sm:block absolute right-2 bottom-2 text-[10px] tracking-wide text-[var(--muted)]">
            Shift+Enter 換行
          </div>
        </div>
        <button
          onClick={handleSend}
          disabled={!message.trim() || disabled}
          className={`flex-shrink-0 h-11 px-4 rounded-xl flex items-center justify-center gap-2 text-sm font-medium transition-all ${
            !message.trim() || disabled
              ? 'bg-[rgba(24,32,43,0.06)] text-[var(--muted)] cursor-not-allowed'
              : 'btn-primary'
          }`}
        >
          {disabled ? (
            <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeOpacity="0.2" />
              <path d="M12 2C6.48 2 2 6.48 2 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          ) : (
            <>
              <span className="hidden sm:inline">送出</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
