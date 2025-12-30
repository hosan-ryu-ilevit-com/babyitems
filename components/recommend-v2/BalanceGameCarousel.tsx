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
  // 컨텍스트 입력에서 AI가 미리 선택한 답변
  preselectedAnswers?: Record<string, 'A' | 'B' | 'both'>;
  // 미리 선택 변경 콜백
  onPreselectionChanged?: (questionId: string, from: string, to: string) => void;
  // 사용자가 입력한 컨텍스트 (설명 표시용)
  userContext?: string | null;
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
  function BalanceGameCarousel({ questions, onComplete, onStateChange, onSelectionMade, showAIHelper = false, category = '', categoryName = '', userSelections, onNaturalLanguageInput, preselectedAnswers, onPreselectionChanged, userContext }, ref) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [selections, setSelections] = useState<Map<string, string>>(new Map());
    const [bothSelections, setBothSelections] = useState<Map<string, [string, string]>>(new Map()); // "둘 다 중요해요" 선택
    const [skipped, setSkipped] = useState<Set<string>>(new Set());
    const [direction, setDirection] = useState(1); // 1: next, -1: previous
    const [isAIHelperOpen, setIsAIHelperOpen] = useState(false);
    const [isAIHelperAutoSubmit, setIsAIHelperAutoSubmit] = useState(false);
    const [aiHelperAutoSubmitText, setAiHelperAutoSubmitText] = useState<string | undefined>(undefined);
    const isTransitioningRef = useRef(false); // 자동 이동 중 클릭 방지 (ref 사용으로 리렌더링 방지)
    const [appliedPreselections, setAppliedPreselections] = useState<Set<string>>(new Set()); // 이미 적용된 미리 선택

    const hasContext = !!userContext || 
      (userSelections?.naturalLanguageInputs && userSelections.naturalLanguageInputs.length > 0) ||
      (userSelections?.hardFilters && userSelections.hardFilters.length > 0) ||
      (userSelections?.balanceGames && userSelections.balanceGames.length > 0);

    const preselectionAppliedRef = useRef(false); // 미리 선택 적용 여부 추적

    const currentQuestion = questions[currentIndex];
    const isLastQuestion = currentIndex >= questions.length - 1;
    const isCurrentSkipped = skipped.has(currentQuestion?.id);
    const isCurrentBoth = bothSelections.has(currentQuestion?.id);

    // 미리 선택 적용 (preselectedAnswers가 변경될 때마다 체크)
    useEffect(() => {
      if (!preselectedAnswers || Object.keys(preselectedAnswers).length === 0) return;
      if (preselectionAppliedRef.current) return; // 이미 적용됨
      if (questions.length === 0) return; // 질문이 없으면 스킵

      const newSelections = new Map<string, string>();
      const newBothSelections = new Map<string, [string, string]>();
      const newApplied = new Set<string>();

      for (const question of questions) {
        const preselection = preselectedAnswers[question.id];
        if (!preselection) continue;

        if (preselection === 'A') {
          newSelections.set(question.id, question.option_A.target_rule_key);
          newApplied.add(question.id);
        } else if (preselection === 'B') {
          newSelections.set(question.id, question.option_B.target_rule_key);
          newApplied.add(question.id);
        } else if (preselection === 'both') {
          newBothSelections.set(question.id, [
            question.option_A.target_rule_key,
            question.option_B.target_rule_key,
          ]);
          newApplied.add(question.id);
        }
      }

      if (newApplied.size > 0) {
        preselectionAppliedRef.current = true;
        setSelections(newSelections);
        setBothSelections(newBothSelections);
        setAppliedPreselections(newApplied);
        console.log('🎯 Applied preselections:', Object.fromEntries(newSelections));
        console.log('🎯 Applied both selections:', Object.fromEntries(newBothSelections));
      }
    }, [preselectedAnswers, questions]);

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
      const previousSelection = selections.get(questionId);

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

        // 미리 선택된 것을 변경한 경우 콜백 호출
        if (appliedPreselections.has(questionId) && previousSelection && onPreselectionChanged) {
          const question = questions.find(q => q.id === questionId);
          if (question) {
            const fromOption = previousSelection === question.option_A.target_rule_key ? 'A' : 'B';
            const toOption = ruleKey === question.option_A.target_rule_key ? 'A' : 'B';
            onPreselectionChanged(questionId, fromOption, toOption);
          }
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

    const handleContextRecommend = () => {
      setAiHelperAutoSubmitText(undefined);
      setIsAIHelperAutoSubmit(true);
      setIsAIHelperOpen(true);
    };

    const handlePopularRecommend = () => {
      setAiHelperAutoSubmitText('가장 많은 사람들이 구매하는게 뭔가요?');
      setIsAIHelperAutoSubmit(false);
      setIsAIHelperOpen(true);
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
        initial={{ opacity: 0, y: 0 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-3"
      >
        <div className="w-full h-[1px] bg-gray-100 mb-5" />

        {/* 헤더 - 디자인 변경 */}
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <span className="text-[16px] text-gray-400 font-semibold">
              밸런스 게임
            </span>
            <span className="text-[14px] text-gray-300 font-medium">
              {currentIndex + 1}/{questions.length}
            </span>
          </div>
        </div>

        {/* 미리 선택 설명 (userContext 기반) */}
        {userContext && appliedPreselections.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-blue-50 border border-blue-100 rounded-xl p-4"
          >
            <div className="flex items-start gap-3">
              <span className="text-lg">💡</span>
              <div className="flex-1 text-sm">
                <div className="text-blue-500 font-medium mb-1">
                  &ldquo;{userContext}&rdquo; 에 맞춰 미리 선택했어요
                </div>
                <div className="text-gray-600 text-xs leading-relaxed">
                  {(() => {
                    const preselectedItems: string[] = [];
                    questions.forEach(q => {
                      const presel = preselectedAnswers?.[q.id];
                      if (presel === 'A') {
                        preselectedItems.push(q.option_A.text);
                      } else if (presel === 'B') {
                        preselectedItems.push(q.option_B.text);
                      } else if (presel === 'both') {
                        preselectedItems.push(`${q.option_A.text} & ${q.option_B.text}`);
                      }
                    });
                    return preselectedItems.length > 0 
                      ? `선택: ${preselectedItems.join(', ')}`
                      : '';
                  })()}
                </div>
                <div className="text-gray-500 text-xs mt-1">
                  원하시면 아래에서 직접 변경하실 수 있어요
                </div>
              </div>
            </div>
          </motion.div>
        )}

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
              <h3 className="text-[18px] font-semibold text-gray-900 leading-snug break-keep mb-3">
                {currentQuestion.title} <span className="text-blue-500 font-bold">*</span>
              </h3>

              {/* AI 도움받기 버튼 */}
              {showAIHelper && (
                <div className="mb-3">
                  <AIHelperButton
                    onClick={() => {
                      setAiHelperAutoSubmitText(undefined);
                      setIsAIHelperAutoSubmit(false);
                      setIsAIHelperOpen(true);
                    }}
                    label="뭘 골라야 할지 모르겠어요"
                    questionType="balance_game"
                    questionId={currentQuestion.id}
                    questionText={currentQuestion.title}
                    category={category}
                    categoryName={categoryName}
                    step={currentIndex}
                    hasContext={hasContext}
                    onContextRecommend={handleContextRecommend}
                    onPopularRecommend={handlePopularRecommend}
                  />
                </div>
              )}

              {/* 선택지 - VS 포함 */}
              <div className={`space-y-2 transition-opacity ${isCurrentSkipped ? 'opacity-40' : ''}`}>
                <motion.button
                  whileTap={isCurrentSkipped ? undefined : { scale: 0.98 }}
                  onClick={() => handleSelect(currentQuestion.id, currentQuestion.option_A.target_rule_key)}
                  className={`w-full min-h-[50px] py-[14px] px-4 rounded-xl border text-left flex items-center justify-start ${
                    isCurrentSkipped
                      ? 'border-gray-50 bg-gray-50 cursor-not-allowed opacity-50'
                      : selections.get(currentQuestion.id) === currentQuestion.option_A.target_rule_key
                      ? 'border-blue-100 bg-blue-50'
                      : isCurrentBoth
                      ? 'border-gray-200 bg-gray-200'
                      : 'border-gray-100 bg-white hover:border-gray-200'
                  }`}
                >
                  <span className={`text-[16px] font-medium leading-tight break-keep ${
                    isCurrentSkipped
                      ? 'text-gray-300'
                      : selections.get(currentQuestion.id) === currentQuestion.option_A.target_rule_key
                      ? 'text-blue-500'
                      : isCurrentBoth
                      ? 'text-gray-700'
                      : 'text-gray-600'
                  }`}>
                    {currentQuestion.option_A.text}
                  </span>
                </motion.button>

                {/* VS 구분선 - 디자인 변경 */}
                <div className="flex items-center justify-center py-1">
                  <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center">
                    <span className="text-gray-400 text-[12px] font-semibold">VS</span>
                  </div>
                </div>

                {/* Option B */}
                <motion.button
                  whileTap={isCurrentSkipped ? undefined : { scale: 0.98 }}
                  onClick={() => handleSelect(currentQuestion.id, currentQuestion.option_B.target_rule_key)}
                  className={`w-full min-h-[50px] py-[14px] px-4 rounded-xl border text-left flex items-center justify-start ${
                    isCurrentSkipped
                      ? 'border-gray-50 bg-gray-50 cursor-not-allowed opacity-50'
                      : selections.get(currentQuestion.id) === currentQuestion.option_B.target_rule_key
                      ? 'border-blue-100 bg-blue-50'
                      : isCurrentBoth
                      ? 'border-gray-200 bg-gray-200'
                      : 'border-gray-100 bg-white hover:border-gray-200'
                  }`}
                >
                  <span className={`text-[16px] font-medium leading-tight break-keep ${
                    isCurrentSkipped
                      ? 'text-gray-300'
                      : selections.get(currentQuestion.id) === currentQuestion.option_B.target_rule_key
                      ? 'text-blue-500'
                      : isCurrentBoth
                      ? 'text-gray-700'
                      : 'text-gray-600'
                  }`}>
                    {currentQuestion.option_B.text}
                  </span>
                </motion.button>
              </div>

              {/* 하단 버튼 영역 - 디자인 변경 (상관없어요 Skip) */}
              <div className="pt-4">
                <button
                  onClick={() => handleSelectBoth(currentQuestion.id)}
                  className={`w-full h-[50px] px-4 rounded-xl border transition-all flex items-center justify-center gap-1.5 ${
                    isCurrentBoth
                      ? 'border-blue-100 bg-blue-50'
                      : 'border-gray-100 bg-white hover:border-gray-200'
                  }`}
                >
                  <span className={`text-[16px] font-medium ${
                    isCurrentBoth ? 'text-blue-500' : 'text-gray-600'
                  }`}>
                    상관없어요
                  </span>
                  <span className={`text-[14px] font-medium ${
                    isCurrentBoth ? 'text-blue-300' : 'text-gray-300'
                  }`}>
                    Skip
                  </span>
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
            {questions.map((q, idx) => (
              <button
                key={q.id}
                onClick={() => goToIndex(idx)}
                className={`h-1.5 rounded-full transition-all ${
                  idx === currentIndex
                    ? 'w-6 bg-[#111827]'
                    : isAnswered(q.id)
                    ? 'w-1.5 bg-gray-400'
                    : 'w-1.5 bg-gray-200'
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
                : 'text-gray-500 hover:text-purple-600 hover:bg-purple-50'
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
            onClose={() => {
              setIsAIHelperOpen(false);
              setIsAIHelperAutoSubmit(false);
              setAiHelperAutoSubmitText(undefined);
            }}
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
            autoSubmitContext={isAIHelperAutoSubmit}
            autoSubmitText={aiHelperAutoSubmitText}
          />
        )}
      </motion.div>
    );
  }
);
