'use client';

import { useState, forwardRef, useImperativeHandle } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  logFollowupQuestionAnswer,
  logFollowupQuestionOtherInput,
  logFinalNaturalInput,
  logSkipToRecommendation,
  logRecommendWithNaturalInput,
} from '@/lib/logging/clientLogger';

// 추가 질문 옵션 타입
interface FollowupQuestionOption {
  value: string;
  label: string;
  description: string;
  scoreImpact?: number;
}

// 추가 질문 타입
interface FollowupQuestion {
  id: string;
  title: string;
  options: FollowupQuestionOption[];
  allowOther?: boolean;
  reason?: string;
}

// 캐러셀 아이템 타입 (질문 또는 자연어 입력)
type CarouselItem =
  | { type: 'question'; question: FollowupQuestion }
  | { type: 'natural_input' };

export interface FollowupCarouselRef {
  goToPrevious: () => boolean;
  goToNext: () => boolean;
}

interface FollowupCarouselProps {
  questions: FollowupQuestion[];
  categoryKey: string;
  categoryName: string;
  onComplete: (answers: Array<{ questionId: string; answer: string; isOther: boolean; otherText?: string }>, naturalInput?: string) => void;
  onSkipAll: () => void;
  onBack: () => void;  // 이전 단계(예산)로 돌아가기
  isLoading?: boolean;
}

// 슬라이드 애니메이션
const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 100 : -100,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -100 : 100,
    opacity: 0,
  }),
};

/**
 * 추가 질문 + 마지막 자연어 입력 캐러셀
 * - 밸런스게임 UI 스타일 (슬라이드, 인디케이터, 화살표)
 * - 옵션 선택 시 자동 다음 이동
 * - 마지막에 자연어 입력 포함
 */
export const FollowupCarousel = forwardRef<FollowupCarouselRef, FollowupCarouselProps>(
  function FollowupCarousel({ questions, categoryKey, categoryName, onComplete, onSkipAll, onBack, isLoading = false }, ref) {
    // 캐러셀 아이템 구성: 질문들 + 마지막 자연어 입력
    const items: CarouselItem[] = [
      ...questions.map(q => ({ type: 'question' as const, question: q })),
      { type: 'natural_input' as const },
    ];

    const [currentIndex, setCurrentIndex] = useState(0);
    const [direction, setDirection] = useState(1);
    const [answers, setAnswers] = useState<Map<string, { answer: string; isOther: boolean; otherText?: string }>>(new Map());
    const [otherInputs, setOtherInputs] = useState<Map<string, string>>(new Map());
    const [showOtherInput, setShowOtherInput] = useState<string | null>(null);
    const [naturalInput, setNaturalInput] = useState('');

    const currentItem = items[currentIndex];
    const isLastItem = currentIndex === items.length - 1;
    const totalItems = items.length;

    // 인덱스 변경
    const goToIndex = (newIndex: number) => {
      if (newIndex === currentIndex || newIndex < 0 || newIndex >= totalItems) return;
      setDirection(newIndex > currentIndex ? 1 : -1);
      setCurrentIndex(newIndex);
      setShowOtherInput(null);
    };

    // 외부에서 호출 가능한 메서드
    useImperativeHandle(ref, () => ({
      goToPrevious: () => {
        if (currentIndex > 0) {
          goToIndex(currentIndex - 1);
          return true;
        }
        return false;
      },
      goToNext: () => {
        if (currentIndex < totalItems - 1) {
          goToIndex(currentIndex + 1);
          return true;
        }
        return false;
      },
    }));

    // 질문 옵션 선택
    const handleOptionSelect = (questionId: string, value: string, label: string) => {
      if (isLoading) return;

      // 로깅: 추가 질문 응답
      const currentQuestion = questions.find(q => q.id === questionId);
      if (currentQuestion) {
        logFollowupQuestionAnswer(
          categoryKey,
          categoryName,
          questionId,
          currentQuestion.title,
          value,
          label,
          currentIndex,
          questions.length,
          false
        );
      }

      setAnswers(prev => {
        const newAnswers = new Map(prev);
        newAnswers.set(questionId, { answer: value, isOther: false });
        return newAnswers;
      });
      setShowOtherInput(null);

      // 자동 다음 이동 (300ms 후)
      setTimeout(() => {
        if (currentIndex < totalItems - 1) {
          goToIndex(currentIndex + 1);
        }
      }, 300);
    };

    // 직접 입력 선택
    const handleOtherSelect = (questionId: string) => {
      if (isLoading) return;
      setShowOtherInput(questionId);
    };

    // 직접 입력 완료
    const handleOtherSubmit = (questionId: string) => {
      const otherText = otherInputs.get(questionId) || '';
      if (otherText.trim().length < 2) return;

      // 로깅: 추가 질문 직접 입력
      const currentQuestion = questions.find(q => q.id === questionId);
      if (currentQuestion) {
        logFollowupQuestionOtherInput(
          categoryKey,
          categoryName,
          questionId,
          currentQuestion.title,
          otherText.trim(),
          currentIndex,
          questions.length
        );
      }

      setAnswers(prev => {
        const newAnswers = new Map(prev);
        newAnswers.set(questionId, { answer: otherText.trim(), isOther: true, otherText: otherText.trim() });
        return newAnswers;
      });
      setShowOtherInput(null);

      // 자동 다음 이동
      setTimeout(() => {
        if (currentIndex < totalItems - 1) {
          goToIndex(currentIndex + 1);
        }
      }, 300);
    };

    // 현재 아이템 건너뛰기
    const handleSkip = () => {
      if (isLastItem) {
        // 로깅: 건너뛰고 바로 추천받기
        logSkipToRecommendation(
          categoryKey,
          categoryName,
          'natural_input',
          currentIndex,
          questions.length
        );
        // 마지막(자연어 입력)에서 건너뛰기 = 완료
        handleComplete();
      } else {
        // 로깅: 추가 질문 건너뛰기
        logSkipToRecommendation(
          categoryKey,
          categoryName,
          'question',
          currentIndex,
          questions.length
        );
        goToIndex(currentIndex + 1);
      }
    };

    // 전체 완료
    const handleComplete = () => {
      const answersArray = Array.from(answers.entries()).map(([questionId, data]) => ({
        questionId,
        ...data,
      }));

      // 로깅: 자연어 입력이 있으면 마지막 자연어 입력 로깅
      if (naturalInput.trim().length >= 2) {
        logFinalNaturalInput(categoryKey, categoryName, naturalInput.trim());
        logRecommendWithNaturalInput(categoryKey, categoryName, naturalInput.trim(), answersArray);
      }

      onComplete(answersArray, naturalInput.trim() || undefined);
    };

    // 자연어 입력 완료
    const handleNaturalInputSubmit = () => {
      if (naturalInput.trim().length >= 2) {
        handleComplete();
      }
    };

    // 아이템이 답변됐는지 확인
    const isItemAnswered = (index: number) => {
      const item = items[index];
      if (item.type === 'question') {
        return answers.has(item.question.id);
      }
      return naturalInput.trim().length >= 2;
    };

    return (
      <>
        {/* 메인 콘텐츠 영역 */}
        <div className="w-full max-w-lg mx-auto pb-36">
          {/* 헤더 */}
          <div className="text-left">
            <div className="flex items-center gap-2 mb-3">
             
              <span className="text-sm font-medium text-gray-500">
                {isLastItem ? (
                  <>
                    추가 입력 <span className="text-gray-400 text-[12px] font-normal ml-1">(건너뛰기 가능)</span>
                  </>
                ) : `추가 확인 ${currentIndex + 1}/${questions.length}`}
              </span>
            </div>
          </div>

          {/* 캐러셀 콘텐츠 */}
          <div className="relative min-h-[280px]">
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={currentIndex}
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.25, ease: 'easeInOut' }}
              >
                {currentItem.type === 'question' ? (
                  // 질문 아이템
                  <div>
                    <h2 className="text-lg font-bold text-gray-900 mb-2">
                      {currentItem.question.title}
                    </h2>
                    {currentItem.question.reason && (
                      <p className="text-sm text-gray-500 mb-4">
                        {currentItem.question.reason}
                      </p>
                    )}

                    {/* 옵션 목록 */}
                    <div className="space-y-2">
                      {currentItem.question.options.map((option) => {
                        const isSelected = answers.get(currentItem.question.id)?.answer === option.value;
                        return (
                          <button
                            key={option.value}
                            onClick={() => handleOptionSelect(currentItem.question.id, option.value, option.label)}
                            disabled={isLoading}
                            className={`
                              w-full text-left p-4 rounded-2xl border transition-all duration-200
                              ${isSelected
                                ? 'border-gray-900 bg-gray-900 text-white'
                                : 'border-gray-200 bg-white hover:border-gray-300 text-gray-900'
                              }
                              ${isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer active:scale-[0.98]'}
                            `}
                          >
                            <div className="font-medium">{option.label}</div>
                            {option.description && (
                              <div className={`text-sm mt-0.5 ${isSelected ? 'text-gray-300' : 'text-gray-500'}`}>
                                {option.description}
                              </div>
                            )}
                          </button>
                        );
                      })}

                      {/* 직접 입력 옵션 */}
                      <div
                        onClick={() => !isLoading && handleOtherSelect(currentItem.question.id)}
                        className={`
                          w-full text-left p-4 rounded-2xl border transition-all duration-200
                          ${showOtherInput === currentItem.question.id || answers.get(currentItem.question.id)?.isOther
                            ? 'border-gray-900 bg-gray-50'
                            : 'border-gray-200 bg-white hover:border-gray-300'
                          }
                          ${isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                        `}
                      >
                        <div className="font-medium text-gray-900">직접 입력</div>
                        {showOtherInput === currentItem.question.id && (
                          <div className="mt-3">
                            <input
                              type="text"
                              value={otherInputs.get(currentItem.question.id) || ''}
                              onChange={(e) => setOtherInputs(prev => {
                                const newInputs = new Map(prev);
                                newInputs.set(currentItem.question.id, e.target.value);
                                return newInputs;
                              })}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && (otherInputs.get(currentItem.question.id) || '').trim().length >= 2) {
                                  e.preventDefault();
                                  handleOtherSubmit(currentItem.question.id);
                                }
                              }}
                              placeholder="원하시는 조건을 입력해주세요"
                              disabled={isLoading}
                              autoFocus
                              className="w-full px-4 py-3 border border-gray-300 rounded-xl
                                focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-900
                                text-gray-800 placeholder-gray-400 text-base"
                              onClick={(e) => e.stopPropagation()}
                            />
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOtherSubmit(currentItem.question.id);
                              }}
                              disabled={(otherInputs.get(currentItem.question.id) || '').trim().length < 2 || isLoading}
                              className={`
                                mt-3 w-full py-3 rounded-xl font-semibold text-sm
                                transition-all duration-200
                                ${(otherInputs.get(currentItem.question.id) || '').trim().length >= 2 && !isLoading
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
                  </div>
                ) : (
                  // 자연어 입력 아이템 (마지막)
                  <div>
                    <h2 className="text-lg font-bold text-gray-800 mb-3">
                      입력하지 못한 정보가 있다면 적어주세요.<br></br>추천에 우선적으로 반영할게요! ✏️
                    </h2>
                    

                    <textarea
                      value={naturalInput}
                      onChange={(e) => setNaturalInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey && naturalInput.trim().length >= 2) {
                          e.preventDefault();
                          handleNaturalInputSubmit();
                        }
                      }}
                      placeholder="바로 추천받기를 누르시거나, 자유롭게 적어주세요"
                      disabled={isLoading}
                      className={`
                        w-full h-24 px-4 py-3 rounded-2xl border resize-none
                        text-gray-800 placeholder-gray-400 text-base
                        focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-900
                        transition-all duration-200
                        ${isLoading ? 'bg-gray-50 cursor-not-allowed border-gray-200' : 'bg-white border-gray-200'}
                      `}
                    />

                    {/* 건너뛰고 바로 추천받기 - 버튼형 (입력 시 fade out) */}
                    <AnimatePresence>
                      {naturalInput.length === 0 && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="mt-3 flex justify-center"
                        >
                          <button
                            onClick={handleSkip}
                            disabled={isLoading}
                            className="px-4 py-2 rounded-xl bg-gray-50 hover:bg-gray-200
                              transition-all duration-200 flex items-center justify-center gap-1.5
                              disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
                          >
                            <img src="/icons/ic-ai.svg" alt="" className="w-4 h-4 opacity-90" />
                            <span className="font-semibold text-base text-gray-600">건너뛰고 바로 추천받기</span>
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* 진행률 인디케이터 (dots) + 좌우 화살표 - 추가 질문이 있을 때만 표시 */}
          {questions.length > 0 && (
            <div className="flex items-center justify-center gap-3 mt-6">
              {/* 이전 화살표 */}
              <button
                onClick={() => goToIndex(currentIndex - 1)}
                disabled={currentIndex === 0 || isLoading}
                className={`p-1.5 rounded-full transition-all ${
                  currentIndex === 0 || isLoading
                    ? 'text-gray-200 cursor-not-allowed'
                    : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>

              {/* Dots */}
              <div className="flex gap-2">
                {items.map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => !isLoading && goToIndex(idx)}
                    disabled={isLoading}
                    className={`h-1.5 rounded-full transition-all ${
                      idx === currentIndex
                        ? 'w-6 bg-[#111827]'
                        : isItemAnswered(idx)
                        ? 'w-1.5 bg-gray-400'
                        : 'w-1.5 bg-gray-200'
                    }`}
                  />
                ))}
              </div>

              {/* 다음 화살표 */}
              <button
                onClick={() => goToIndex(currentIndex + 1)}
                disabled={currentIndex >= totalItems - 1 || isLoading}
                className={`p-1.5 rounded-full transition-all ${
                  currentIndex >= totalItems - 1 || isLoading
                    ? 'text-gray-200 cursor-not-allowed'
                    : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* 하단 플로팅 버튼 영역 - 버튼만 포함 */}
        <div
          className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-4 z-40"
          style={{ maxWidth: '480px', margin: '0 auto' }}
        >
          {isLastItem ? (
            // 마지막 단계 (자연어 입력): 이전 + 추천받기
            <div className="flex gap-2">
              <button
                onClick={currentIndex === 0 ? onBack : () => goToIndex(currentIndex - 1)}
                disabled={isLoading}
                className="flex-[3] h-14 rounded-2xl bg-gray-100 hover:bg-gray-200
                  transition-all duration-300 flex items-center justify-center
                  disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="font-semibold text-base text-gray-700">이전</span>
              </button>
              <div className="flex-[7]">
                <AnimatePresence>
                  {naturalInput.length > 0 && (
                    <motion.button
                      key="submit-button"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      onClick={handleComplete}
                      disabled={isLoading}
                      className={`
                        w-full h-14 rounded-2xl font-semibold text-base
                        transition-all duration-200
                        ${!isLoading
                          ? 'bg-[#111827] text-white hover:bg-gray-800 active:scale-[0.98]'
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
                        <span className="flex items-center justify-center gap-1.5">
                          <img src="/icons/ic-ai.svg" alt="" className="w-4 h-4" />
                          추천받기
                        </span>
                      )}
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>
            </div>
          ) : (
            // 질문 단계: 이전 + 건너뛰기 버튼
            <div className="flex gap-2">
              <button
                onClick={currentIndex === 0 ? onBack : () => goToIndex(currentIndex - 1)}
                disabled={isLoading}
                className="flex-[3] h-14 rounded-2xl bg-gray-100 hover:bg-gray-200
                  transition-all flex items-center justify-center
                  disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="font-semibold text-base text-gray-700">이전</span>
              </button>
              <button
                onClick={handleSkip}
                disabled={isLoading}
                className="flex-[7] h-14 rounded-2xl border border-gray-100 bg-white hover:border-gray-200
                  transition-all flex items-center justify-center gap-1.5
                  disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="text-base font-medium text-gray-600">
                  건너뛰기
                </span>
                <span className="text-sm font-medium text-gray-300">
                  Skip
                </span>
              </button>
            </div>
          )}
        </div>
      </>
    );
  }
);
