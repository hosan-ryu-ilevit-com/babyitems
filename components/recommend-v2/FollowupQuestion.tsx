'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface FollowupQuestionOption {
  value: string;
  label: string;
  description: string;
  scoreImpact?: number;
}

interface FollowupQuestionProps {
  question: {
    id: string;
    title: string;
    options: FollowupQuestionOption[];
    allowOther?: boolean;
    reason?: string;
  };
  onAnswer: (value: string, isOther: boolean, otherText?: string) => void;
  onSkip?: () => void;
  onPrevious?: () => void;
  currentIndex: number;
  totalCount: number;
  isLoading?: boolean;
}

/**
 * 추가 질문 컴포넌트
 * - 옵션 선택 시 자동으로 다음 질문으로 이동
 * - 직접 입력 옵션 항상 포함
 * - 이전/다음 버튼으로 네비게이션
 */
export function FollowupQuestion({
  question,
  onAnswer,
  onSkip,
  onPrevious,
  currentIndex,
  totalCount,
  isLoading = false,
}: FollowupQuestionProps) {
  const [selectedValue, setSelectedValue] = useState<string | null>(null);
  const [isOther, setIsOther] = useState(false);
  const [otherText, setOtherText] = useState('');

  // 질문이 바뀔 때 상태 초기화
  useEffect(() => {
    setSelectedValue(null);
    setIsOther(false);
    setOtherText('');
  }, [question.id]);

  // 일반 옵션 선택 - 선택 후 자동 다음으로 이동
  const handleOptionSelect = (value: string) => {
    if (isLoading) return;
    setSelectedValue(value);
    setIsOther(false);

    // 잠시 선택 상태 표시 후 자동 이동
    setTimeout(() => {
      onAnswer(value, false);
    }, 300);
  };

  // 직접 입력 선택
  const handleOtherSelect = () => {
    if (isLoading) return;
    setSelectedValue(null);
    setIsOther(true);
  };

  // 직접 입력 제출
  const handleOtherSubmit = () => {
    if (otherText.trim().length >= 2) {
      onAnswer(otherText.trim(), true, otherText.trim());
    }
  };

  // 엔터키로 직접 입력 제출
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && otherText.trim().length >= 2) {
      e.preventDefault();
      handleOtherSubmit();
    }
  };

  const canSubmitOther = isOther && otherText.trim().length >= 2;
  const canGoPrevious = currentIndex > 0 && onPrevious;

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
            <path d="M12 2L14.85 9.15L22 12L14.85 14.85L12 22L9.15 14.85L2 12L9.15 9.15L12 2Z" fill="url(#followup_gradient)" />
            <defs>
              <linearGradient id="followup_gradient" x1="2" y1="12" x2="22" y2="12" gradientUnits="userSpaceOnUse">
                <stop stopColor="#77A0FF" />
                <stop offset="0.7" stopColor="#907FFF" />
                <stop offset="1" stopColor="#6947FF" />
              </linearGradient>
            </defs>
          </svg>
          <span className="text-sm font-medium text-gray-500">
            추가 확인 ({currentIndex + 1}/{totalCount})
          </span>
        </div>
        <h2 className="text-lg font-bold text-gray-900 mb-2">
          {question.title}
        </h2>
        {question.reason && (
          <p className="text-sm text-gray-500">
            {question.reason}
          </p>
        )}
      </div>

      {/* 옵션 목록 */}
      <div className="space-y-2 mb-6">
        {question.options.map((option) => (
          <button
            key={option.value}
            onClick={() => handleOptionSelect(option.value)}
            disabled={isLoading}
            className={`
              w-full text-left p-4 rounded-2xl border transition-all duration-200
              ${selectedValue === option.value
                ? 'border-gray-900 bg-gray-900 text-white'
                : 'border-gray-200 bg-white hover:border-gray-300 text-gray-900'
              }
              ${isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer active:scale-[0.98]'}
            `}
          >
            <div className="font-medium">{option.label}</div>
            {option.description && (
              <div className={`text-sm mt-0.5 ${
                selectedValue === option.value ? 'text-gray-300' : 'text-gray-500'
              }`}>
                {option.description}
              </div>
            )}
          </button>
        ))}

        {/* 직접 입력 옵션 (항상 표시) */}
        <div
          onClick={handleOtherSelect}
          className={`
            w-full text-left p-4 rounded-2xl border transition-all duration-200
            ${isOther
              ? 'border-gray-900 bg-gray-50'
              : 'border-gray-200 bg-white hover:border-gray-300'
            }
            ${isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          `}
        >
          <div className="font-medium text-gray-900">직접 입력</div>
          {isOther && (
            <div className="mt-3">
              <input
                type="text"
                value={otherText}
                onChange={(e) => setOtherText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="원하시는 조건을 입력해주세요"
                disabled={isLoading}
                autoFocus
                className="w-full px-4 py-3 border border-gray-300 rounded-xl
                  focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-900
                  text-gray-800 placeholder-gray-400 text-base"
                onClick={(e) => e.stopPropagation()}
              />
              {/* 직접 입력 확인 버튼 */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleOtherSubmit();
                }}
                disabled={!canSubmitOther || isLoading}
                className={`
                  mt-3 w-full py-3 rounded-xl font-semibold text-sm
                  transition-all duration-200
                  ${canSubmitOther && !isLoading
                    ? 'bg-gray-900 text-white hover:bg-gray-800 active:scale-[0.98]'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }
                `}
              >
                입력 완료
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 네비게이션 버튼 */}
      <div className="flex gap-3">
        {canGoPrevious && (
          <button
            onClick={onPrevious}
            disabled={isLoading}
            className="flex-[3] h-14 rounded-2xl font-semibold text-base
              bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors
              disabled:opacity-50 disabled:cursor-not-allowed"
          >
            이전
          </button>
        )}
        {onSkip && (
          <button
            onClick={onSkip}
            disabled={isLoading}
            className={`
              ${canGoPrevious ? 'flex-[7]' : 'w-full'} h-14 rounded-2xl font-semibold text-base
              bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors
              disabled:opacity-50 disabled:cursor-not-allowed
            `}
          >
            건너뛰기
          </button>
        )}
      </div>
    </motion.div>
  );
}
