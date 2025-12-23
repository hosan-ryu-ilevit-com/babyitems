'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import {
  logContextInputExampleClick,
  logContextInputSubmit,
  logContextInputButtonClick,
} from '@/lib/logging/clientLogger';

interface ContextInputProps {
  category: string;
  categoryName: string;
  onComplete: (context: string | null) => void;  // null = 스킵
  isCompleted?: boolean;
  submittedText?: string | null;
}

// 통일된 플레이스홀더 (예시 칩이 있으므로 간결하게)
const PLACEHOLDER = '자유롭게 적어주세요';

export default function ContextInput({
  category,
  categoryName,
  onComplete,
  isCompleted = false,
  submittedText = null,
}: ContextInputProps) {
  const [text, setText] = useState('');
  const [examples, setExamples] = useState<string[]>([]);
  const [isLoadingExamples, setIsLoadingExamples] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isLoadedRef = useRef(false);

  useEffect(() => {
    setMounted(true);
    if (!isLoadedRef.current) {
      loadExamples();
    }
  }, [category, categoryName]);

  // 완료 후 submittedText로 텍스트 동기화
  useEffect(() => {
    if (isCompleted && submittedText !== null) {
      setText(submittedText);
    }
  }, [isCompleted, submittedText]);

  const loadExamples = async () => {
    if (isLoadedRef.current) return;
    isLoadedRef.current = true;
    
    setIsLoadingExamples(true);
    try {
      const response = await fetch('/api/ai-selection-helper/generate-context-examples', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, categoryName }),
      });
      const data = await response.json();
      
      if (data.examples && data.examples.length > 0) {
        setExamples(data.examples);
      }
      setIsLoadingExamples(false);
    } catch (err) {
      console.error('Failed to load examples:', err);
      setExamples([
        '지금 쓰는 거 불편해서 바꾸려고요',
        '가성비 좋은 거 추천해주세요',
        '세척 편한 거 찾아요',
        '3개월 아기인데 뭘 사야 할지 모르겠어요',
        '첫째 아이라 추천해주세요',
        '맞벌이라 편한 게 필요해요',
      ]);
      setIsLoadingExamples(false);
    }
  };

  const handleSubmit = () => {
    if (!text.trim()) return;
    if (text.trim().length > 500) {
      setError('500자 이내로 입력해주세요');
      return;
    }
    setError(null);

    // 로깅: 컨텍스트 입력 제출
    logContextInputSubmit(category, categoryName, text.trim());
    logContextInputButtonClick(category, categoryName, 'start', text.trim());

    onComplete(text.trim());
  };

  const handleSkip = () => {
    // 로깅: 건너뛰기 버튼 클릭
    logContextInputButtonClick(category, categoryName, 'skip');

    onComplete(null);
  };

  const handleExampleClick = (example: string, index: number) => {
    // 로깅: 예시 칩 클릭
    logContextInputExampleClick(category, categoryName, example, index);

    setText(example);
  };

  const isSubmitDisabled = !text.trim();

  return (
    <motion.div
      initial={{ opacity: 0, y: 0 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="bg-white space-y-4 transition-all duration-300"
    >
      {/* 헤더 */}
      <div className="space-y-2">
        <h3 className="text-xl font-semibold text-gray-900 leading-snug">
          안녕하세요!<br />
          찾으시는 <span 
            className="rounded-sm"
            style={{ 
              backgroundImage: 'linear-gradient(to top, rgba(186, 230, 253, 0.6) 70%, transparent 70%)',
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'left bottom',
              backgroundSize: '0% 100%',
              boxDecorationBreak: 'clone',
              WebkitBoxDecorationBreak: 'clone',
              animation: 'highlight-draw 0.8s ease-out 0.2s forwards'
            }}
          >{categoryName} 특징</span>이나 <br />
          <span 
            className="rounded-sm"
            style={{ 
              backgroundImage: 'linear-gradient(to top, rgba(253, 230, 138, 0.6) 70%, transparent 70%)',
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'left bottom',
              backgroundSize: '0% 100%',
              boxDecorationBreak: 'clone',
              WebkitBoxDecorationBreak: 'clone',
              animation: 'highlight-draw 0.8s ease-out 0.8s forwards'
            }}
          >아이 상황</span>을 알려주세요.
        </h3>
      </div>

      {/* Textarea with animated gradient border */}
      <div className="relative">
        <div className="gradient-outer-wrapper">
          {!isCompleted && (
            <>
              <div className="gradient-border"></div>
              <div className="gradient-blur"></div>
            </>
          )}
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setError(null);
            }}
            placeholder={PLACEHOLDER}
            className={`textarea-inner ${isCompleted ? 'completed' : ''}`}
            rows={3}
            maxLength={500}
            disabled={isCompleted}
          />
          {text.length > 0 && !isCompleted && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              onClick={() => setText('')}
              className="absolute top-3 right-3 p-1.5 rounded-full bg-gray-100/80 hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors z-10 backdrop-blur-sm"
              aria-label="내용 전체 지우기"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </motion.button>
          )}
        </div>
        {error && (
          <p className="text-xs text-red-500 mt-2">{error}</p>
        )}
      </div>

      {/* 예시 버튼들 - 완료 시 숨김, 페이지 패딩 무시 */}
      {!isCompleted && (
        <div className="-mx-4">
          <div className="overflow-x-auto px-4 scrollbar-hide">
            {isLoadingExamples ? (
              <div className="grid grid-rows-2 grid-flow-col gap-2" style={{ minWidth: 'max-content' }}>
                {[1, 2, 3, 4, 5, 6].map(i => (
                  <div
                    key={i}
                    className="h-10 rounded-full bg-linear-to-r from-gray-200 via-gray-100 to-gray-200 bg-size-[200%_100%] animate-[shimmer_1s_ease-in-out_infinite]"
                    style={{
                      width: '160px', // 스켈레톤 너비 통일
                      animationDelay: `${i * 0.1}s`
                    }}
                  />
                ))}
              </div>
            ) : (
              <div className="grid grid-rows-2 grid-flow-col gap-2" style={{ minWidth: 'max-content' }}>
                {examples.map((example, idx) => (
                  <motion.button
                    key={idx}
                    initial={{ opacity: 0, x: 10, scale: 0.95 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    transition={{
                      duration: 0.3,
                      delay: idx * 0.05,
                      ease: [0.25, 0.1, 0.25, 1]
                    }}
                    onClick={() => handleExampleClick(example, idx)}
                    className="px-4 py-2 text-sm rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors whitespace-nowrap"
                  >
                    {example}
                  </motion.button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 플로팅 버튼 영역 확보용 스페이서 */}
      {!isCompleted && <div className="h-32" />}

      {/* 플로팅 버튼들 - 완료 시 숨김 */}
      {!isCompleted && mounted && createPortal(
        <div
          className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 pb-[env(safe-area-inset-bottom)] pt-3 z-[100]"
          style={{ 
            maxWidth: '480px', 
            margin: '0 auto',
            bottom: 0 
          }}
        >
          <div className="flex flex-col gap-2">
            <button
              onClick={handleSubmit}
              disabled={isSubmitDisabled}
              className={`w-full h-14 rounded-2xl font-semibold text-base transition-all flex items-center justify-center ${
                isSubmitDisabled
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'text-white hover:opacity-90 active:scale-[0.98]'
              }`}
              style={!isSubmitDisabled ? { backgroundColor: '#a855f7' } : undefined}
            >
              추천받기 시작
            </button>
            <button
              onClick={handleSkip}
              className="w-full h-13 rounded-2xl font-semibold text-sm transition-all flex items-center justify-center bg-gray-100 text-gray-500 hover:bg-gray-200 active:scale-[0.98] mb-4"
            >
              잘 모르겠어요 (건너뛰기)
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* Animated gradient border styles */}
      <style jsx>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        @keyframes steam {
          0% {
            background-position: 0 0;
          }
          50% {
            background-position: 400% 0;
          }
          100% {
            background-position: 0 0;
          }
        }

        .gradient-outer-wrapper {
          position: relative;
        }

        .gradient-border {
          position: absolute;
          inset: -2px;
          background: linear-gradient(60deg, #5b21b6, #7c3aed, #a855f7, #e879f9, #f0abfc, #c084fc, #818cf8, #5b21b6,
            #7c3aed, #a855f7, #e879f9, #f0abfc, #c084fc, #818cf8);
          background-size: 300%;
          animation: steam 8s linear infinite;
          border-radius: 14px;
          z-index: 0;
        }

        .gradient-blur {
          position: absolute;
          inset: 10px;
          background: linear-gradient(60deg, #7c3aed, #a855f7, #e879f9, #f0abfc, #c084fc, #818cf8, #5b21b6,
            #7c3aed, #a855f7, #e879f9, #f0abfc, #c084fc, #818cf8);
          background-size: 300%;
          animation: steam 20s linear infinite;
          filter: blur(20px);
          opacity: 0.5;
          border-radius: 0.75rem;
          z-index: 0;
        }

        .textarea-inner {
          position: relative;
          z-index: 1;
          display: block;
          width: 100%;
          padding: 1rem 3rem 1rem 1rem;
          background: white;
          border-radius: 0.75rem;
          font-size: 1rem;
          resize: none;
          min-height: 100px;
          border: none;
          outline: none;
          margin: 0;
          box-sizing: border-box;
        }

        .textarea-inner.completed {
          border: 1px solid #e5e7eb;
          min-height: auto;
        }

        .textarea-inner::placeholder {
          color: #9ca3af;
        }

        @keyframes highlight-draw {
          0% { background-size: 0% 100%; }
          100% { background-size: 100% 100%; }
        }
      `}</style>
    </motion.div>
  );
}
