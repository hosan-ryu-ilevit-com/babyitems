'use client';

import { useState, useEffect, useRef } from 'react';
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
  const [isSubmitting, setIsSubmitting] = useState(false); // 버튼 중복 클릭 방지
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isLoadedRef = useRef(false);

  // 예시 로드 함수 (useEffect 위에 선언)
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
        '지금 쓰는 게 불편해서 바꾸려고 해요',
        '첫 아이라 뭘 사야 할지 잘 몰라요',
        '가성비 좋으면서 품질 괜찮은 거 찾아요',
      ]);
      setIsLoadingExamples(false);
    }
  };

  useEffect(() => {
    setMounted(true);
    if (!isLoadedRef.current) {
      loadExamples();
    }
  }, [category, categoryName]);

  // 완료 후 submittedText로 텍스트 동기화 & 이전으로 돌아왔을 때 상태 리셋
  useEffect(() => {
    if (isCompleted && submittedText !== null) {
      setText(submittedText);
    }
    // 이전 단계로 돌아왔을 때 (isCompleted가 false가 되면) 상태 리셋
    if (!isCompleted) {
      setIsSubmitting(false);
      // submittedText가 null이면 텍스트도 초기화 (다시 입력 버튼 클릭 시)
      if (submittedText === null) {
        setText('');
      }
    }
  }, [isCompleted, submittedText]);

  const handleSubmit = () => {
    if (!text.trim() || isSubmitting) return;
    if (text.trim().length > 500) {
      setError('500자 이내로 입력해주세요');
      return;
    }
    setError(null);
    setIsSubmitting(true); // 즉시 비활성화

    // 로깅: 컨텍스트 입력 제출
    logContextInputSubmit(category, categoryName, text.trim());
    logContextInputButtonClick(category, categoryName, 'start', text.trim());

    onComplete(text.trim());
  };

  const handleExampleClick = (example: string, index: number) => {
    // 로깅: 예시 칩 클릭
    logContextInputExampleClick(category, categoryName, example, index);

    setText(example);
  };

  return (
    <motion.div
      initial={mounted ? { opacity: 0, y: 0 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`bg-white space-y-4 transition-all duration-300 ${isCompleted ? 'hidden' : ''}`}
    >
      {/* 헤더 */}
      <div className="space-y-3 px-1">
        <h3 className="text-[22px] font-bold text-gray-900 leading-[1.35] tracking-tight">
          찾으시는 <span className="text-purple-600">{categoryName}의 특징</span>이나<br />
          <span className="text-purple-600">아이의 상황</span>을 알려주세요 👋
        </h3>
        <p className="text-[16px] text-gray-600">
          구체적일수록 더 나은 추천을 받을 수 있습니다
        </p>
      </div>

      {/* Textarea with Modern Clean Style */}
      <div className="relative group">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
          placeholder={PLACEHOLDER}
          className={`w-full p-5 pr-14 bg-white border border-gray-200 rounded-2xl text-[16px] leading-relaxed
            placeholder-gray-400 resize-none outline-none transition-all duration-300
            focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10
            shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)]
            ${isCompleted ? 'bg-gray-50 text-gray-500 border-transparent shadow-none' : ''}`}
          rows={3}
          maxLength={500}
          disabled={isCompleted}
        />

        {text.length > 0 && !isCompleted && (
          <>
            {/* 우상단 X 버튼 (지우기) */}
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              onClick={() => setText('')}
              className="absolute top-4 right-4 p-1 text-gray-600 hover:text-gray-800 transition-colors"
              aria-label="내용 전체 지우기"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </motion.button>

            {/* 우하단 보내기 버튼 */}
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="absolute bottom-4 right-4 w-10 h-10 rounded-full bg-purple-600 text-white flex items-center justify-center hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
              aria-label="추천받기 시작"
            >
              {isSubmitting ? (
                <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                  <path fillRule="evenodd" d="M10 17a.75.75 0 01-.75-.75V5.612L5.29 9.77a.75.75 0 01-1.08-1.04l5.25-5.5a.75.75 0 011.08 0l5.25 5.5a.75.75 0 11-1.08 1.04l-3.96-4.158V16.25A.75.75 0 0110 17z" clipRule="evenodd" />
                </svg>
              )}
            </motion.button>
          </>
        )}

        {error && (
          <p className="absolute -bottom-6 left-1 text-xs font-medium text-red-500 animate-fade-in">
            {error}
          </p>
        )}
      </div>

      {/* 예시 버튼들 - 직접 입력 시 숨김 */}
      {text.length === 0 && (
        <div className="mt-2">
          <div className="flex flex-col gap-2 items-start">
            {isLoadingExamples ? (
              <>
                {[1, 2, 3].map(i => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="w-[80%] h-[52px] rounded-xl bg-linear-to-r from-gray-200 via-gray-100 to-gray-200 bg-size-[200%_100%] animate-[shimmer_1s_ease-in-out_infinite]"
                    style={{
                      animationDelay: `${i * 0.1}s`
                    }}
                  />
                ))}
              </>
            ) : (
              examples.map((example, idx) => (
                <motion.button
                  key={idx}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{
                    duration: 0.25,
                    delay: idx * 0.08,
                    ease: "easeOut"
                  }}
                  onClick={() => handleExampleClick(example, idx)}
                  className="w-[80%] px-4 py-3 text-[14px] font-medium rounded-xl bg-gray-50 border border-gray-100
                  text-gray-600 transition-all duration-200 text-left leading-relaxed
                  hover:bg-gray-100 hover:border-gray-200 active:scale-[0.98]"
                >
                  {example}
                </motion.button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Animated gradient border styles */}
      <style jsx>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        @keyframes fade-in {
          0% { opacity: 0; transform: translateY(-4px); }
          100% { opacity: 1; transform: translateY(0); }
        }

        .animate-fade-in {
          animation: fade-in 0.2s ease-out forwards;
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
      `}</style>
    </motion.div>
  );
}
