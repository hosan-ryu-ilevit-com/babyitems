'use client';

import { useState, useImperativeHandle, forwardRef, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import type { InlineFollowUp as InlineFollowUpType } from '@/lib/knowledge-agent/types';

interface InlineFollowUpProps {
  followUp: InlineFollowUpType;
  onAnswer: (answer: string, label: string) => void;
  isLoading?: boolean;
  onSelectionChange?: (hasSelection: boolean) => void;
}

export interface InlineFollowUpHandle {
  submit: () => void;
  hasSelection: () => boolean;
  setSelections: (labels: string[]) => void;
}

/**
 * 인라인 꼬리질문 컴포넌트
 * - 오른쪽 → 왼쪽 슬라이드 애니메이션
 * - 현재 질문의 연장선임을 직관적으로 표현
 */
export const InlineFollowUp = forwardRef<InlineFollowUpHandle, InlineFollowUpProps>(
  ({ followUp, onAnswer, isLoading = false, onSelectionChange }, ref) => {
    const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
    const [customInput, setCustomInput] = useState('');
    const [showCustomInput, setShowCustomInput] = useState(false);
    const [addedCustomOption, setAddedCustomOption] = useState<string | null>(null);
    const customInputRef = useRef<HTMLInputElement>(null);

    const activateCustomInput = () => {
      if (showCustomInput) return;
      // Keep focus within the user gesture on mobile.
      flushSync(() => setShowCustomInput(true));
      const inputEl = customInputRef.current;
      if (inputEl) {
        inputEl.focus();
        inputEl.click();
      }
    };

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

    // Expose submit method to parent via ref
    useImperativeHandle(ref, () => ({
      submit: handleSubmit,
      hasSelection: () => selectedOptions.length > 0 || customInput.trim().length > 0,
      setSelections: (labels: string[]) => {
        setSelectedOptions(labels);
        setCustomInput('');
        setShowCustomInput(false);
      },
    }));

    // Track selection changes for customInput
    useEffect(() => {
      onSelectionChange?.(selectedOptions.length > 0 || customInput.trim().length > 0);
    }, [customInput, selectedOptions.length, onSelectionChange]);

    useEffect(() => {
      if (!showCustomInput) return;
      const inputEl = customInputRef.current;
      if (!inputEl) return;
      const rafId = requestAnimationFrame(() => inputEl.focus());
      return () => cancelAnimationFrame(rafId);
    }, [showCustomInput]);

  // 타입별 스타일
  const getTypeStyle = () => {
    switch (followUp.type) {
      case 'deepdive':
        return { bg: 'bg-blue-50', accent: 'text-blue-600', border: 'border-blue-200', label: '꼬리 질문' };
      case 'contradiction':
        return { bg: 'bg-amber-50', accent: 'text-gray-600', border: 'border-amber-200', label: '꼬리 질문' };
      case 'clarify':
        return { bg: 'bg-purple-50', accent: 'text-gray-600', border: 'border-gray-200', label: '꼬리 질문' };
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
      className="absolute top-0 -left-4 -right-4 bg-white z-10"
    >
      <div className="px-6 py-6 pb-24 max-w-full mx-auto w-full">
        {/* 상단 헤더 */}
        <div className="flex items-center gap-2 mb-6">
          <span className={`text-sm font-semibold ${typeStyle.accent}`}>
            {typeStyle.label}
          </span>
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
        <div className="space-y-3">
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
                      className={`w-full py-4 px-5 rounded-[12px] border text-left transition-all flex items-center justify-between ${
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

                      {/* 추천/인기 태그 */}
                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        {option.isRecommend && !isDisabled && (
                          <span className={`px-1.5 py-0.5 text-[11px] font-semibold rounded-md transition-colors ${
                            isSelected ? 'bg-white text-purple-600' : 'bg-purple-50 text-purple-600'
                          }`}>
                            추천
                          </span>
                        )}
                        {option.isPopular && !isDisabled && (
                          <span className={`px-1.5 py-0.5 text-[11px] font-semibold rounded-md transition-colors ${
                            isSelected ? 'bg-white text-blue-500' : 'bg-blue-50 text-blue-600'
                          }`}>
                            인기
                          </span>
                        )}
                      </div>
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
                {addedCustomOption ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="w-full py-4 px-5 bg-blue-50 border border-blue-100 rounded-[12px] flex items-center justify-between"
                  >
                    <span className="text-[16px] font-medium text-blue-500">{addedCustomOption}</span>
                    <button
                      onClick={() => {
                        toggleOption(addedCustomOption);
                        setAddedCustomOption(null);
                      }}
                      className="ml-2 p-1 hover:bg-blue-100 rounded-full transition-colors"
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-blue-400">
                        <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                    </button>
                  </motion.div>
                ) : (
                  <div
                    className="w-full py-4 px-5 relative transition-all cursor-pointer hover:bg-gray-50"
                    style={{
                      backgroundImage: `url("data:image/svg+xml,%3csvg width='100%25' height='100%25' xmlns='http://www.w3.org/2000/svg'%3e%3crect width='100%25' height='100%25' fill='none' rx='12' ry='12' stroke='%23D1D5DB' stroke-width='2' stroke-dasharray='6%2c 6' stroke-dashoffset='0' stroke-linecap='round'/%3e%3c/svg%3e")`,
                      borderRadius: '12px'
                    }}
                    onPointerDown={activateCustomInput}
                    onClick={activateCustomInput}
                  >
                    <div className="relative" onClick={(e) => e.stopPropagation()}>
                      <input
                        ref={customInputRef}
                        type="text"
                        value={customInput}
                        onChange={(e) => setCustomInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && customInput.trim()) {
                            e.preventDefault();
                            const value = customInput.trim();
                            toggleOption(value);
                            setAddedCustomOption(value);
                            setCustomInput('');
                            setShowCustomInput(false);
                          } else if (e.key === 'Escape') {
                            setShowCustomInput(false);
                            setCustomInput('');
                          }
                        }}
                        placeholder="자유롭게 입력하세요"
                        className={`w-full bg-transparent text-[16px] text-gray-700 focus:outline-none pr-[120px] transition-opacity duration-150
                          ${showCustomInput ? 'opacity-100' : 'opacity-0'}`}
                        style={{ pointerEvents: showCustomInput ? 'auto' : 'none' }}
                        autoFocus={showCustomInput}
                      />
                      {/* 버튼 오버레이 */}
                      {!showCustomInput && (
                        <div className="absolute inset-0 flex items-center">
                          <span className="text-[16px] font-medium text-blue-400">기타 - 직접 입력</span>
                        </div>
                      )}

                      {/* 입력 액션 버튼 */}
                      {showCustomInput && (
                        <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                          <button
                            onClick={() => {
                              setShowCustomInput(false);
                              setCustomInput('');
                            }}
                            className="px-3 py-2 rounded-[10px] text-[14px] font-medium text-gray-500 hover:bg-gray-100 transition-all"
                          >
                            취소
                          </button>
                          <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => {
                              if (customInput.trim()) {
                                const value = customInput.trim();
                                toggleOption(value);
                                setAddedCustomOption(value);
                                setCustomInput('');
                                setShowCustomInput(false);
                              }
                            }}
                            disabled={!customInput.trim()}
                            className={`px-4 py-2 rounded-[10px] text-[14px] font-semibold transition-all
                              ${customInput.trim()
                                ? 'bg-gray-900 text-white'
                                : 'bg-gray-100 text-gray-400'}`}
                          >
                            추가
                          </motion.button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </div>
    </motion.div>
  );
});

InlineFollowUp.displayName = 'InlineFollowUp';

/**
 * 인라인 꼬리질문 래퍼 컴포넌트
 * - 기존 질문 위에 오버레이로 슬라이드
 */
interface InlineFollowUpWrapperProps {
  children: React.ReactNode;
  followUp: InlineFollowUpType | null;
  isLoadingFollowUp: boolean;
  onAnswer: (answer: string, label: string) => void;
  followUpRef?: React.RefObject<InlineFollowUpHandle | null>;
  onSelectionChange?: (hasSelection: boolean) => void;
}

export function InlineFollowUpWrapper({
  children,
  followUp,
  isLoadingFollowUp,
  onAnswer,
  followUpRef,
  onSelectionChange,
}: InlineFollowUpWrapperProps) {
  return (
    <div className={`relative ${!followUp ? 'overflow-hidden' : ''}`}>
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

      {/* 로딩 인디케이터 (맞춤질문 하단에 표시) */}
      <AnimatePresence>
        {isLoadingFollowUp && !followUp && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="mt-4 flex items-center gap-2"
          >
            <div className="flex gap-1">
              <motion.div
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                className="w-1.5 h-1.5 rounded-full bg-gray-400"
              />
              <motion.div
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut", delay: 0.2 }}
                className="w-1.5 h-1.5 rounded-full bg-gray-400"
              />
              <motion.div
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
                className="w-1.5 h-1.5 rounded-full bg-gray-400"
              />
            </div>
            <motion.span
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
              className="text-[14px] text-gray-700"
            >
              꼬리 질문 생각하는 중...
            </motion.span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 꼬리질문 오버레이 */}
      <AnimatePresence>
        {followUp && (
          <InlineFollowUp
            ref={followUpRef}
            followUp={followUp}
            onAnswer={onAnswer}
            onSelectionChange={onSelectionChange}
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
