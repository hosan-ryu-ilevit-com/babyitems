'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CaretRight, Sparkle, X, Check } from '@phosphor-icons/react/dist/ssr';
import type { InlineFollowUp as InlineFollowUpType } from '@/lib/knowledge-agent/types';

interface InlineFollowUpProps {
  followUp: InlineFollowUpType;
  onAnswer: (answer: string, label: string) => void;
  onSkip: () => void;
  isLoading?: boolean;
}

/**
 * 인라인 꼬리질문 컴포넌트
 * - 오른쪽 → 왼쪽 슬라이드 애니메이션
 * - 현재 질문의 연장선임을 직관적으로 표현
 */
export function InlineFollowUp({
  followUp,
  onAnswer,
  onSkip,
  isLoading = false,
}: InlineFollowUpProps) {
  const [selectedOption, setSelectedOption] = useState<{ value: string; label: string } | null>(null);

  const handleOptionSelect = (value: string, label: string) => {
    setSelectedOption({ value, label });
    // 선택 후 바로 제출 (간소화된 UX)
    setTimeout(() => {
      onAnswer(value, label);
    }, 300);
  };

  // 타입별 스타일
  const getTypeStyle = () => {
    switch (followUp.type) {
      case 'deepdive':
        return { bg: 'bg-blue-50', accent: 'text-blue-600', border: 'border-blue-200', label: '조금 더 알려주세요' };
      case 'contradiction':
        return { bg: 'bg-amber-50', accent: 'text-amber-600', border: 'border-amber-200', label: '확인이 필요해요' };
      case 'clarify':
        return { bg: 'bg-purple-50', accent: 'text-purple-600', border: 'border-purple-200', label: '구체적으로 알려주세요' };
      default:
        return { bg: 'bg-gray-50', accent: 'text-gray-600', border: 'border-gray-200', label: '추가 질문' };
    }
  };

  const typeStyle = getTypeStyle();

  return (
    <motion.div
      initial={{ x: '100%', opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: '-100%', opacity: 0 }}
      transition={{
        type: 'spring',
        stiffness: 300,
        damping: 30,
        opacity: { duration: 0.2 }
      }}
      className="absolute inset-0 bg-white z-10"
    >
      <div className="h-full flex flex-col px-4 py-6">
        {/* 상단 헤더 */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full ${typeStyle.bg} flex items-center justify-center`}>
              <Sparkle size={16} weight="fill" className={typeStyle.accent} />
            </div>
            <span className={`text-sm font-semibold ${typeStyle.accent}`}>
              {typeStyle.label}
            </span>
          </div>
          <button
            onClick={onSkip}
            className="p-2 -mr-2 rounded-full hover:bg-gray-100 transition-colors"
            title="건너뛰기"
          >
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        {/* 질문 텍스트 */}
        <div className="mb-8">
          <p className="text-xl font-bold text-gray-900 leading-snug">
            {followUp.question}
          </p>
        </div>

        {/* 옵션들 */}
        <div className="flex-1 space-y-3">
          {followUp.options.map((option) => {
            const isSelected = selectedOption?.value === option.value;

            return (
              <motion.button
                key={option.value}
                onClick={() => handleOptionSelect(option.value, option.label)}
                disabled={isLoading || !!selectedOption}
                whileTap={{ scale: 0.98 }}
                className={`w-full flex items-center justify-between px-5 py-4 rounded-2xl border-2 transition-all
                  ${isSelected
                    ? 'border-gray-900 bg-gray-900 text-white'
                    : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                  }
                  ${(isLoading || selectedOption) && !isSelected ? 'opacity-50' : ''}`}
              >
                <span className={`text-[16px] font-semibold ${isSelected ? 'text-white' : 'text-gray-800'}`}>
                  {option.label}
                </span>
                {isSelected ? (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="w-6 h-6 rounded-full bg-white flex items-center justify-center"
                  >
                    <Check size={14} weight="bold" className="text-gray-900" />
                  </motion.div>
                ) : (
                  <CaretRight size={20} className="text-gray-400" />
                )}
              </motion.button>
            );
          })}
        </div>

        {/* 하단 건너뛰기 */}
        <div className="pt-4">
          <button
            onClick={onSkip}
            disabled={!!selectedOption}
            className="w-full py-3 text-gray-400 hover:text-gray-600 text-sm font-medium transition-colors disabled:opacity-50"
          >
            건너뛰기
          </button>
        </div>
      </div>
    </motion.div>
  );
}

/**
 * 인라인 꼬리질문 래퍼 컴포넌트
 * - 기존 질문 위에 오버레이로 슬라이드
 */
interface InlineFollowUpWrapperProps {
  children: React.ReactNode;
  followUp: InlineFollowUpType | null;
  isLoadingFollowUp: boolean;
  onAnswer: (answer: string, label: string) => void;
  onSkip: () => void;
}

export function InlineFollowUpWrapper({
  children,
  followUp,
  isLoadingFollowUp,
  onAnswer,
  onSkip,
}: InlineFollowUpWrapperProps) {
  return (
    <div className="relative overflow-hidden">
      {/* 기존 질문 콘텐츠 */}
      <motion.div
        animate={{
          x: followUp ? '-30%' : 0,
          opacity: followUp ? 0.3 : 1,
          scale: followUp ? 0.95 : 1,
        }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      >
        {children}
      </motion.div>

      {/* 로딩 인디케이터 (슬라이드 전 잠시 표시) */}
      <AnimatePresence>
        {isLoadingFollowUp && !followUp && (
          <motion.div
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            className="absolute inset-0 bg-white/95 backdrop-blur-sm flex items-center justify-center z-10"
          >
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
              <span className="text-sm text-gray-600 font-medium">추가 질문 확인 중...</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 꼬리질문 오버레이 */}
      <AnimatePresence>
        {followUp && (
          <InlineFollowUp
            followUp={followUp}
            onAnswer={onAnswer}
            onSkip={onSkip}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * 로딩 상태 표시 (기존 호환용)
 */
export function InlineFollowUpLoading() {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="rounded-2xl border border-gray-100 bg-gray-50 p-4 mt-4"
    >
      <div className="flex items-center gap-3">
        <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
        <span className="text-sm text-gray-500">추가 질문을 생성하고 있어요...</span>
      </div>
    </motion.div>
  );
}

export default InlineFollowUp;
