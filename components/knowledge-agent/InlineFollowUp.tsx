'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkle, X } from '@phosphor-icons/react/dist/ssr';
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
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [customInput, setCustomInput] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);

  const toggleOption = (label: string) => {
    setSelectedOptions(prev =>
      prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label]
    );
  };

  const handleSubmit = () => {
    const finalSelections = [...selectedOptions];
    if (customInput.trim()) {
      finalSelections.push(customInput.trim());
    }
    // Join all selections
    const combinedValue = finalSelections.join(', ');
    const combinedLabel = finalSelections.join(', ');
    onAnswer(combinedValue, combinedLabel);
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
        <div className="mb-6">
          <p className="text-[18px] font-semibold text-gray-900 leading-snug break-keep">
            {followUp.question} <span className="text-blue-500">*</span>
          </p>
        </div>

        {/* 복수 선택 가능 안내 텍스트 */}
        <div className="mb-4">
          <span className="text-[14px] text-gray-400 font-medium">복수 선택 가능</span>
        </div>

        {/* 옵션들 */}
        <div className="flex-1 space-y-3">
          {(() => {
            // "상관없어요" 선택 여부 확인
            const hasNotCareSelected = selectedOptions.includes('상관없어요');
            // 다른 옵션이 선택되었는지 확인
            const hasOtherSelected = selectedOptions.some(opt => opt !== '상관없어요');

            return (
              <>
                {followUp.options.map((option) => {
                  const isSelected = selectedOptions.includes(option.label);
                  const isDisabled = isLoading || hasNotCareSelected;

                  return (
                    <motion.button
                      key={option.value}
                      onClick={() => toggleOption(option.label)}
                      disabled={isDisabled}
                      whileHover={!isDisabled ? { scale: 1.005 } : {}}
                      whileTap={!isDisabled ? { scale: 0.99 } : {}}
                      className={`w-full py-4 px-5 rounded-[12px] border text-left transition-all ${
                        isDisabled
                          ? 'bg-gray-50 border-gray-100 opacity-70 cursor-not-allowed'
                          : isSelected
                          ? 'bg-blue-50 border-blue-100'
                          : 'bg-white border-gray-100 text-gray-600 hover:border-blue-200 hover:bg-blue-50/30'
                      }`}
                    >
                      <span className={`text-[16px] font-medium leading-[1.4] ${
                        isDisabled ? 'text-gray-400' : isSelected ? 'text-blue-500' : 'text-gray-600'
                      }`}>
                        {option.label}
                      </span>
                    </motion.button>
                  );
                })}

                {/* 상관없어요 버튼 */}
                <motion.button
                  onClick={() => toggleOption('상관없어요')}
                  disabled={isLoading || hasOtherSelected}
                  whileHover={!isLoading && !hasOtherSelected ? { scale: 1.005 } : {}}
                  whileTap={!isLoading && !hasOtherSelected ? { scale: 0.99 } : {}}
                  className={`w-full py-4 px-5 rounded-[12px] border text-left transition-all ${
                    isLoading || hasOtherSelected
                      ? 'bg-gray-50 border-gray-100 opacity-70 cursor-not-allowed'
                      : hasNotCareSelected
                      ? 'bg-blue-50 border-blue-100'
                      : 'bg-white border-gray-100 text-gray-600 hover:border-blue-200 hover:bg-blue-50/30'
                  }`}
                >
                  <span className={`text-[16px] font-medium leading-[1.4] ${
                    isLoading || hasOtherSelected ? 'text-gray-400' : hasNotCareSelected ? 'text-blue-500' : 'text-gray-600'
                  }`}>
                    상관없어요
                  </span>
                </motion.button>

                {/* 기타 (직접 입력) */}
                {!showCustomInput ? (
                  <div
                    className="w-full py-4 px-5 relative transition-all cursor-pointer hover:bg-gray-50"
                    style={{
                      backgroundImage: `url("data:image/svg+xml,%3csvg width='100%25' height='100%25' xmlns='http://www.w3.org/2000/svg'%3e%3crect width='100%25' height='100%25' fill='none' rx='12' ry='12' stroke='%23D1D5DB' stroke-width='2' stroke-dasharray='6%2c 6' stroke-dashoffset='0' stroke-linecap='round'/%3e%3c/svg%3e")`,
                      borderRadius: '12px'
                    }}
                    onClick={() => setShowCustomInput(true)}
                  >
                    <span className="text-[16px] font-medium text-gray-500">기타 (직접 입력)</span>
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      type="text"
                      value={customInput}
                      onChange={(e) => setCustomInput(e.target.value)}
                      placeholder="직접 입력해주세요"
                      className="w-full px-5 py-4 rounded-[12px] border border-gray-200 focus:border-gray-400 focus:outline-none text-[16px]"
                      autoFocus
                    />
                  </div>
                )}
              </>
            );
          })()}
        </div>

        {/* 하단 다음 버튼 */}
        <div className="pt-6">
          <motion.button
            onClick={handleSubmit}
            disabled={selectedOptions.length === 0 && !customInput.trim()}
            whileHover={selectedOptions.length > 0 || customInput.trim() ? { scale: 1.02 } : {}}
            whileTap={selectedOptions.length > 0 || customInput.trim() ? { scale: 0.98 } : {}}
            className={`w-full py-4 rounded-[12px] text-[16px] font-semibold transition-all ${
              selectedOptions.length > 0 || customInput.trim()
                ? 'bg-gray-900 text-white hover:bg-gray-800'
                : 'bg-gray-100 text-gray-300 opacity-50 cursor-not-allowed'
            }`}
          >
            다음
          </motion.button>
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
