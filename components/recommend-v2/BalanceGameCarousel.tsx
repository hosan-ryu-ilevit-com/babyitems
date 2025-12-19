'use client';

import { useState, useEffect, useImperativeHandle, forwardRef, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { BalanceQuestion, UserSelections } from '@/types/recommend-v2';
import { AIHelperButton } from './AIHelperButton';
import { AIHelperBottomSheet } from './AIHelperBottomSheet';

export interface BalanceGameCarouselRef {
  goToPrevious: () => boolean; // returns true if moved, false if already at first
  goToNext: () => boolean; // returns true if moved, false if already at last
}

interface BalanceGameCarouselProps {
  questions: BalanceQuestion[];
  onComplete: (selections: Set<string>) => void;
  onStateChange?: (state: {
    selectionsCount: number;
    allAnswered: boolean;
    currentSelections: Set<string>;
    currentIndex: number;
    canGoPrevious: boolean;
    canGoNext: boolean;
    totalQuestions: number;
    currentQuestionAnswered: boolean;
  }) => void;
  // 로깅 콜백: 개별 선택 시 호출
  onSelectionMade?: (params: {
    questionId: string;
    questionIndex: number;
    totalQuestions: number;
    selectedOption: 'A' | 'B';
    optionALabel: string;
    optionBLabel: string;
    ruleKey: string;
  }) => void;
  // AI 도움 기능
  showAIHelper?: boolean;
  category?: string;
  categoryName?: string;
  // 이전 선택 정보 (AI Helper용)
  userSelections?: UserSelections;
  onNaturalLanguageInput?: (stage: string, input: string) => void;
}

/**
 * 밸런스 게임 컴포넌트 (세로 스크롤 방식, 하드필터 디자인 통일)
 * - 선택지 사이 VS 표시
 * - 선택 시 다음 질문이 아래에 추가됨
 * - 이전 버튼으로 이전 질문으로 이동 가능
 */
// 슬라이드 애니메이션 variants
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

export const BalanceGameCarousel = forwardRef<BalanceGameCarouselRef, BalanceGameCarouselProps>(
  function BalanceGameCarousel({ questions, onComplete, onStateChange, onSelectionMade, showAIHelper = false, category = '', categoryName = '', userSelections, onNaturalLanguageInput }, ref) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [selections, setSelections] = useState<Map<string, string>>(new Map());
    const [bothSelections, setBothSelections] = useState<Map<string, [string, string]>>(new Map()); // "둘 다 중요해요" 선택
    const [skipped, setSkipped] = useState<Set<string>>(new Set());
    const [direction, setDirection] = useState(1); // 1: next, -1: previous
    const [isAIHelperOpen, setIsAIHelperOpen] = useState(false);
    const isTransitioningRef = useRef(false); // 자동 이동 중 클릭 방지 (ref 사용으로 리렌더링 방지)

    const currentQuestion = questions[currentIndex];
    const isLastQuestion = currentIndex >= questions.length - 1;
    const isCurrentSkipped = skipped.has(currentQuestion?.id);
    const isCurrentBoth = bothSelections.has(currentQuestion?.id);

    // 인덱스 변경 함수 (방향을 먼저 설정하여 애니메이션 방향 보장)
    const goToIndex = (newIndex: number) => {
      if (newIndex === currentIndex) return;
      setDirection(newIndex > currentIndex ? 1 : -1);
      setCurrentIndex(newIndex);
    };

    // 외부에서 호출 가능한 메서드 노출
    useImperativeHandle(ref, () => ({
      goToPrevious: () => {
        if (currentIndex > 0) {
          goToIndex(currentIndex - 1);
          return true;
        }
        return false;
      },
      goToNext: () => {
        if (currentIndex < questions.length - 1) {
          goToIndex(currentIndex + 1);
          return true;
        }
        return false;
      },
    }), [currentIndex, questions.length, goToIndex]);

    // 선택 처리 (토글 방식 + 자동 다음 이동)
    const handleSelect = (questionId: string, ruleKey: string) => {
      // 자동 이동 중이면 클릭 무시 (중복 선택 방지)
      if (isTransitioningRef.current) return;

      const newSelections = new Map(selections);
      const wasAlreadySelected = selections.get(questionId) === ruleKey;

      // 이미 같은 값이 선택되어 있으면 선택 해제
      if (wasAlreadySelected) {
        newSelections.delete(questionId);
      } else {
        newSelections.set(questionId, ruleKey);

        // 로깅 콜백 호출 (새로 선택한 경우에만)
        const question = questions.find(q => q.id === questionId);
        if (question && onSelectionMade) {
          const isOptionA = ruleKey === question.option_A.target_rule_key;
          onSelectionMade({
            questionId,
            questionIndex: currentIndex,
            totalQuestions: questions.length,
            selectedOption: isOptionA ? 'A' : 'B',
            optionALabel: question.option_A.text,
            optionBLabel: question.option_B.text,
            ruleKey,
          });
        }
      }

      setSelections(newSelections);

      // "둘 다" 선택 해제 (단일 선택했으므로)
      const newBothSelections = new Map(bothSelections);
      newBothSelections.delete(questionId);
      setBothSelections(newBothSelections);

      // 스킵 해제 (선택했으므로)
      const newSkipped = new Set(skipped);
      newSkipped.delete(questionId);
      setSkipped(newSkipped);

      // 새로 선택한 경우에만 자동으로 다음 문제로 이동 (마지막이 아닌 경우)
      if (!wasAlreadySelected && !isLastQuestion) {
        isTransitioningRef.current = true;
        setTimeout(() => {
          goToIndex(currentIndex + 1);
          isTransitioningRef.current = false;
        }, 350);
      }
    };

    // 스킵 처리 (스킵하면 다음 질문으로 이동)
    const handleSkip = (questionId: string) => {
      const newSkipped = new Set(skipped);

      if (skipped.has(questionId)) {
        // 이미 스킵된 상태면 스킵 해제만
        newSkipped.delete(questionId);
        setSkipped(newSkipped);
      } else {
        // 스킵 처리
        newSkipped.add(questionId);
        // 스킵하면 선택 해제
        const newSelections = new Map(selections);
        newSelections.delete(questionId);
        setSelections(newSelections);
        // both 선택도 해제
        const newBothSelections = new Map(bothSelections);
        newBothSelections.delete(questionId);
        setBothSelections(newBothSelections);
        setSkipped(newSkipped);

        // 다음 질문으로 자동 이동 (마지막이 아닌 경우)
        if (!isLastQuestion) {
          goToIndex(currentIndex + 1);
        }
      }
    };

    // "둘 다 중요해요" 선택 처리 (priority 타입용)
    const handleSelectBoth = (questionId: string) => {
      // 자동 이동 중이면 클릭 무시 (중복 선택 방지)
      if (isTransitioningRef.current) return;

      const question = questions.find(q => q.id === questionId);
      if (!question) return;

      const newBothSelections = new Map(bothSelections);
      const wasAlreadyBoth = bothSelections.has(questionId);

      if (wasAlreadyBoth) {
        // 이미 "둘 다" 선택된 상태면 해제
        newBothSelections.delete(questionId);
      } else {
        // "둘 다" 선택
        newBothSelections.set(questionId, [
          question.option_A.target_rule_key,
          question.option_B.target_rule_key,
        ]);
        // 단일 선택은 해제
        const newSelections = new Map(selections);
        newSelections.delete(questionId);
        setSelections(newSelections);
      }

      setBothSelections(newBothSelections);

      // 스킵 해제
      const newSkipped = new Set(skipped);
      newSkipped.delete(questionId);
      setSkipped(newSkipped);

      // 새로 선택한 경우에만 자동으로 다음 문제로 이동
      if (!wasAlreadyBoth && !isLastQuestion) {
        isTransitioningRef.current = true;
        setTimeout(() => {
          goToIndex(currentIndex + 1);
          isTransitioningRef.current = false;
        }, 350);
      }
    };

    // 답변 상태 확인
    const isAnswered = (questionId: string) => {
      return selections.has(questionId) || bothSelections.has(questionId) || skipped.has(questionId);
    };

    const allAnswered = questions.every(q => isAnswered(q.id));

    // AI 추천 결과 처리
    const handleAISelectOptions = (selectedOptions: string[]) => {
      const selected = selectedOptions[0];
      if (selected === 'A') {
        handleSelect(currentQuestion.id, currentQuestion.option_A.target_rule_key);
      } else if (selected === 'B') {
        handleSelect(currentQuestion.id, currentQuestion.option_B.target_rule_key);
      } else if (selected === 'both') {
        handleSelectBoth(currentQuestion.id);
      }
    };

    // 상태 변경 시 부모에 알림
    useEffect(() => {
      // 단일 선택 + "둘 다" 선택 모두 포함
      const selectedRuleKeys = new Set(selections.values());
      bothSelections.forEach(([keyA, keyB]) => {
        selectedRuleKeys.add(keyA);
        selectedRuleKeys.add(keyB);
      });
      const currentQuestionId = questions[currentIndex]?.id;
      const currentQuestionAnswered = currentQuestionId ? isAnswered(currentQuestionId) : false;

      onStateChange?.({
        selectionsCount: selections.size + bothSelections.size,
        allAnswered,
        currentSelections: selectedRuleKeys,
        currentIndex,
        canGoPrevious: currentIndex > 0,
        canGoNext: currentIndex < questions.length - 1,
        totalQuestions: questions.length,
        currentQuestionAnswered,
      });
    }, [selections, bothSelections, skipped, allAnswered, currentIndex, questions, onStateChange]);

    if (questions.length === 0) return null;

    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-3"
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <span className="px-2.5 py-1 bg-emerald-100 text-emerald-600 rounded-full text-xs font-bold">
            취향 선택
          </span>
          <span className="text-xs text-gray-400">
            {currentIndex + 1} / {questions.length}
          </span>
        </div>

        {/* 질문 영역 - 슬라이드 애니메이션 */}
        <div className="overflow-hidden">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={currentQuestion.id}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.25, ease: 'easeInOut' }}
            >
              {/* 질문 제목 */}
              <h3 className="text-base font-bold text-gray-900 leading-snug mb-3">
                {currentQuestion.title}
              </h3>

              {/* AI 도움받기 버튼 */}
              {showAIHelper && (
                <div className="mb-3">
                  <AIHelperButton
                    onClick={() => setIsAIHelperOpen(true)}
                    questionType="balance_game"
                    questionId={currentQuestion.id}
                    questionText={currentQuestion.title}
                    category={category}
                    categoryName={categoryName}
                    step={currentIndex}
                  />
                </div>
              )}

              {/* 선택지 - VS 포함 */}
              <div className={`space-y-2 transition-opacity ${isCurrentSkipped ? 'opacity-40' : ''}`}>
                {/* Option A */}
                <motion.button
                  whileTap={isCurrentSkipped ? undefined : { scale: 0.98 }}
                  onClick={() => handleSelect(currentQuestion.id, currentQuestion.option_A.target_rule_key)}
                  className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
                    isCurrentSkipped
                      ? 'border-gray-200 bg-gray-50 cursor-default'
                      : isCurrentBoth || selections.get(currentQuestion.id) === currentQuestion.option_A.target_rule_key
                      ? 'border-emerald-400 bg-emerald-50'
                      : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {/* 체크박스 스타일 */}
                    <div
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                        isCurrentSkipped
                          ? 'border-gray-300 bg-white'
                          : isCurrentBoth || selections.get(currentQuestion.id) === currentQuestion.option_A.target_rule_key
                          ? 'border-emerald-500 bg-emerald-500'
                          : 'border-gray-300 bg-white'
                      }`}
                    >
                      {!isCurrentSkipped && (isCurrentBoth || selections.get(currentQuestion.id) === currentQuestion.option_A.target_rule_key) && (
                        <motion.svg
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="w-3 h-3 text-white"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </motion.svg>
                      )}
                    </div>
                    <span className={`text-sm font-medium leading-snug ${
                      isCurrentSkipped
                        ? 'text-gray-400'
                        : isCurrentBoth || selections.get(currentQuestion.id) === currentQuestion.option_A.target_rule_key
                        ? 'text-emerald-700'
                        : 'text-gray-700'
                    }`}>
                      {currentQuestion.option_A.text}
                    </span>
                  </div>
                </motion.button>

                {/* VS 구분선 */}
                <div className="flex items-center justify-center py-1">
                  <div className="flex-1 h-px bg-gray-200" />
                  <span className="px-3 text-xs font-bold text-gray-400">VS</span>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>

                {/* Option B */}
                <motion.button
                  whileTap={isCurrentSkipped ? undefined : { scale: 0.98 }}
                  onClick={() => handleSelect(currentQuestion.id, currentQuestion.option_B.target_rule_key)}
                  className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
                    isCurrentSkipped
                      ? 'border-gray-200 bg-gray-50 cursor-default'
                      : isCurrentBoth || selections.get(currentQuestion.id) === currentQuestion.option_B.target_rule_key
                      ? 'border-emerald-400 bg-emerald-50'
                      : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {/* 체크박스 스타일 */}
                    <div
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                        isCurrentSkipped
                          ? 'border-gray-300 bg-white'
                          : isCurrentBoth || selections.get(currentQuestion.id) === currentQuestion.option_B.target_rule_key
                          ? 'border-emerald-500 bg-emerald-500'
                          : 'border-gray-300 bg-white'
                      }`}
                    >
                      {!isCurrentSkipped && (isCurrentBoth || selections.get(currentQuestion.id) === currentQuestion.option_B.target_rule_key) && (
                        <motion.svg
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="w-3 h-3 text-white"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </motion.svg>
                      )}
                    </div>
                    <span className={`text-sm font-medium leading-snug ${
                      isCurrentSkipped
                        ? 'text-gray-400'
                        : isCurrentBoth || selections.get(currentQuestion.id) === currentQuestion.option_B.target_rule_key
                        ? 'text-emerald-700'
                        : 'text-gray-700'
                    }`}>
                      {currentQuestion.option_B.text}
                    </span>
                  </div>
                </motion.button>
              </div>

              {/* 하단 버튼 영역 - 모든 질문에 동일하게 표시 */}
              <div className="text-center pt-3">
                <button
                  onClick={() => handleSelectBoth(currentQuestion.id)}
                  className={`text-sm transition-colors py-2 px-4 rounded-lg hover:bg-gray-100 ${
                    isCurrentBoth
                      ? 'text-gray-700 font-semibold bg-gray-100'
                      : 'text-gray-400 font-semibold hover:text-gray-600'
                  }`}
                >
                  {isCurrentBoth ? '둘 다 중요해요 (스킵) ✓' : '둘 다 중요해요 (스킵)'}
                </button>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* 진행률 인디케이터 (dots) + 좌우 화살표 */}
        <div className="flex items-center justify-center gap-3 pt-2">
          {/* 이전 화살표 */}
          <button
            onClick={() => currentIndex > 0 && goToIndex(currentIndex - 1)}
            disabled={currentIndex === 0}
            className={`p-1.5 rounded-full transition-all ${
              currentIndex === 0
                ? 'text-gray-300 cursor-not-allowed'
                : 'text-gray-500 hover:text-emerald-600 hover:bg-emerald-50'
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          {/* Dots */}
          <div className="flex gap-2">
            {questions.map((q, idx) => (
              <button
                key={q.id}
                onClick={() => goToIndex(idx)}
                className={`h-1.5 rounded-full transition-all ${
                  idx === currentIndex
                    ? 'w-6 bg-emerald-500'
                    : isAnswered(q.id)
                    ? 'w-1.5 bg-emerald-300'
                    : 'w-1.5 bg-gray-300'
                }`}
              />
            ))}
          </div>

          {/* 다음 화살표 */}
          <button
            onClick={() => currentIndex < questions.length - 1 && goToIndex(currentIndex + 1)}
            disabled={currentIndex >= questions.length - 1}
            className={`p-1.5 rounded-full transition-all ${
              currentIndex >= questions.length - 1
                ? 'text-gray-300 cursor-not-allowed'
                : 'text-gray-500 hover:text-emerald-600 hover:bg-emerald-50'
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* AI 도움 바텀시트 */}
        {showAIHelper && currentQuestion && (
          <AIHelperBottomSheet
            isOpen={isAIHelperOpen}
            onClose={() => setIsAIHelperOpen(false)}
            questionType="balance_game"
            questionId={currentQuestion.id}
            questionText={currentQuestion.title}
            options={{
              A: { text: currentQuestion.option_A.text, target_rule_key: currentQuestion.option_A.target_rule_key },
              B: { text: currentQuestion.option_B.text, target_rule_key: currentQuestion.option_B.target_rule_key },
            }}
            category={category}
            categoryName={categoryName}
            onSelectOptions={handleAISelectOptions}
            userSelections={userSelections}
            onNaturalLanguageInput={onNaturalLanguageInput}
          />
        )}
      </motion.div>
    );
  }
);
