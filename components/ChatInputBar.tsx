'use client';

import { useRef } from 'react';

interface ChatInputBarProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  placeholder?: string;
  disabled?: boolean;
  onFocus?: () => void;
}

export function ChatInputBar({
  value,
  onChange,
  onSend,
  placeholder = '메시지를 입력하세요',
  disabled = false,
  onFocus,
}: ChatInputBarProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isComposingRef = useRef(false);

  // IME composition 처리 (한글 입력 중 Enter 버그 방지)
  const handleCompositionStart = () => {
    isComposingRef.current = true;
  };

  const handleCompositionEnd = () => {
    isComposingRef.current = false;
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
    // Auto-resize
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !isComposingRef.current) {
      e.preventDefault();
      onSend();
    }
  };

  const handleSendClick = () => {
    if (!value.trim() || disabled) return;
    onSend();
  };

  return (
    <>
      <style jsx>{`
        @property --angle {
          syntax: '<angle>';
          initial-value: 0deg;
          inherits: false;
        }

        @keyframes rotate {
          to {
            --angle: 360deg;
          }
        }

        .gradient-border-wrapper {
          position: relative;
          display: flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.6rem 1rem 0.6rem 1rem;
          border-radius: 2rem;
          background: rgba(255, 255, 255, 0.9);
          backdrop-filter: blur(10px);
          box-shadow: 0 0.5rem 1.5rem 0 rgba(0, 0, 0, 0.04);
          overflow: hidden;
        }

        .gradient-border-wrapper::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: 2rem;
          padding: 2px;
          background: conic-gradient(
            from var(--angle),
            #5855ff,
            #5cdcdc,
            #71c4fd,
            #5855ff
          );
          -webkit-mask:
            linear-gradient(#fff 0 0) content-box,
            linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          animation: rotate 2s linear infinite;
          pointer-events: none;
          opacity: 0.5;
        }

        .gradient-background {
          position: absolute;
          bottom: 0;
          left: 0;
          width: 100%;
          height: 200%;
          border-radius: 100%;
          background: radial-gradient(
            50% 50% at 50% 50%,
            rgba(217, 233, 255, 0.4) 0%,
            rgba(217, 233, 255, 0) 100%
          );
          pointer-events: none;
          z-index: -1;
        }

        .chat-textarea {
          flex: 1;
          border: none;
          outline: none;
          font-size: 1.6rem;
          font-weight: 500;
          line-height: 1.2;
          background: transparent;
          resize: none;
          overflow-y: auto;
          scrollbar-width: none;
        }

        .chat-textarea::-webkit-scrollbar {
          display: none;
        }

        .chat-textarea::placeholder {
          color: #6b7280;
          transition: all 0.3s ease;
        }

        .chat-textarea:disabled {
          background: transparent;
        }

        .chat-textarea:disabled::placeholder {
          color: #d1d5db;
        }

        .send-button {
          width: 2rem;
          height: 2rem;
          background: #1f2937;
          border-radius: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          border: none;
          cursor: pointer;
          transition: all 0.2s ease;
          flex-shrink: 0;
        }

        .send-button:hover:not(:disabled) {
          background: #374151;
        }

        .send-button:disabled {
          background: #d1d5db;
          cursor: not-allowed;
        }

        .container {
          width: 100%;
          position: relative;
        }
      `}</style>

      <div className="container">
        <div className="gradient-background" />
        <div className="gradient-border-wrapper">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
            onFocus={onFocus}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            className="chat-textarea"
            style={{ fontSize: '16px' }} // iOS 자동 줌 방지
          />
          <button
            onClick={handleSendClick}
            disabled={!value.trim() || disabled}
            className="send-button"
            aria-label="전송"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="white"
            >
              <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
            </svg>
          </button>
        </div>
      </div>
    </>
  );
}
