'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';

interface FinalNaturalInputProps {
  categoryName: string;
  onSubmit: (input: string) => Promise<void>;
  onSkip: () => void;
  isLoading: boolean;
  placeholder?: string;
}

/**
 * 마지막 자연어 인풋 컴포넌트
 * - 추가 질문 유무와 관계없이 항상 마지막에 표시
 * - 사용자가 빠뜨린 조건을 자유롭게 입력 가능
 * - 건너뛰기 가능
 */
export function FinalNaturalInput({
  categoryName,
  onSubmit,
  onSkip,
  isLoading,
  placeholder = '예: 여행용으로 쓸 거라 휴대성이 중요해요',
}: FinalNaturalInputProps) {
  const [input, setInput] = useState('');

  const handleSubmit = async () => {
    if (input.trim().length >= 2) {
      await onSubmit(input.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isLoading && input.trim().length >= 2) {
        handleSubmit();
      }
    }
  };

  const canSubmit = input.trim().length >= 2;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="w-full max-w-lg mx-auto px-4"
    >
      {/* 헤더 - 왼쪽 정렬 */}
      <div className="text-left mb-6">
        <div className="flex items-center gap-2 mb-3">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L14.85 9.15L22 12L14.85 14.85L12 22L9.15 14.85L2 12L9.15 9.15L12 2Z" fill="url(#final_gradient)" />
            <defs>
              <linearGradient id="final_gradient" x1="2" y1="12" x2="22" y2="12" gradientUnits="userSpaceOnUse">
                <stop stopColor="#77A0FF" />
                <stop offset="0.7" stopColor="#907FFF" />
                <stop offset="1" stopColor="#6947FF" />
              </linearGradient>
            </defs>
          </svg>
          <span className="text-sm font-medium text-gray-500">마지막 단계</span>
        </div>
        <h2 className="text-lg font-bold text-gray-900 mb-2">
          추가로 반영했으면 하는 조건이 있으신가요?
        </h2>
        <p className="text-sm text-gray-500">
          {categoryName} 선택에 중요한 조건을 자유롭게 적어주세요
        </p>
      </div>

      {/* 입력 영역 */}
      <div className="mb-6">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isLoading}
          className={`
            w-full h-24 px-4 py-3 rounded-2xl border resize-none
            text-gray-800 placeholder-gray-400 text-sm
            focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-900
            transition-all duration-200
            ${isLoading ? 'bg-gray-50 cursor-not-allowed border-gray-200' : 'bg-white border-gray-200'}
          `}
        />

        {/* 입력 완료 버튼 */}
        {input.trim().length > 0 && (
          <motion.button
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={handleSubmit}
            disabled={!canSubmit || isLoading}
            className={`
              mt-3 w-full py-3 rounded-2xl font-semibold text-base
              transition-all duration-200
              ${canSubmit && !isLoading
                ? 'bg-gray-900 text-white hover:bg-gray-800 active:scale-[0.98]'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }
            `}
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                분석 중...
              </span>
            ) : (
              '입력 완료'
            )}
          </motion.button>
        )}
      </div>

      {/* 건너뛰기 버튼 */}
      <button
        onClick={onSkip}
        disabled={isLoading}
        className="w-full h-14 rounded-2xl font-semibold text-base
          bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors
          disabled:opacity-50 disabled:cursor-not-allowed"
      >
        건너뛰기
      </button>
    </motion.div>
  );
}
