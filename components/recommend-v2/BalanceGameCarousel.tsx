'use client';

import { useState, useEffect, useImperativeHandle, forwardRef } from 'react';
import { motion } from 'framer-motion';
import type { BalanceQuestion } from '@/types/recommend-v2';

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
  }) => void;
}

/**
 * 밸런스 게임 컴포넌트 (세로 스크롤 방식, 하드필터 디자인 통일)
 * - 선택지 사이 VS 표시
 * - 선택 시 다음 질문이 아래에 추가됨
 * - 이전 버튼으로 이전 질문으로 이동 가능
 */
export const BalanceGameCarousel = forwardRef<BalanceGameCarouselRef, BalanceGameCarouselProps>(
  function BalanceGameCarousel({ questions, onComplete, onStateChange }, ref) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [selections, setSelections] = useState<Map<string, string>>(new Map());
    const [skipped, setSkipped] = useState<Set<string>>(new Set());

    const currentQuestion = questions[currentIndex];
    const isLastQuestion = currentIndex >= questions.length - 1;

    // 외부에서 호출 가능한 메서드 노출
    useImperativeHandle(ref, () => ({
      goToPrevious: () => {
        if (currentIndex > 0) {
          setCurrentIndex(prev => prev - 1);
          return true;
        }
        return false;
      },
      goToNext: () => {
        if (currentIndex < questions.length - 1) {
          setCurrentIndex(prev => prev + 1);
          return true;
        }
        return false;
      },
    }), [currentIndex, questions.length]);

    // 선택 처리 (토글 방식)
    const handleSelect = (questionId: string, ruleKey: string) => {
      const newSelections = new Map(selections);

      // 이미 같은 값이 선택되어 있으면 선택 해제
      if (selections.get(questionId) === ruleKey) {
        newSelections.delete(questionId);
      } else {
        newSelections.set(questionId, ruleKey);
      }

      setSelections(newSelections);

      // 스킵 해제 (선택했으므로)
      const newSkipped = new Set(skipped);
      newSkipped.delete(questionId);
      setSkipped(newSkipped);
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
        setSkipped(newSkipped);

        // 다음 질문으로 자동 이동 (마지막이 아닌 경우)
        if (!isLastQuestion) {
          setCurrentIndex(prev => prev + 1);
        }
      }
    };

    // 답변 상태 확인
    const isAnswered = (questionId: string) => {
      return selections.has(questionId) || skipped.has(questionId);
    };

    const allAnswered = questions.every(q => isAnswered(q.id));

    // 상태 변경 시 부모에 알림
    useEffect(() => {
      const selectedRuleKeys = new Set(selections.values());
      onStateChange?.({
        selectionsCount: selections.size,
        allAnswered,
        currentSelections: selectedRuleKeys,
        currentIndex,
        canGoPrevious: currentIndex > 0,
        canGoNext: currentIndex < questions.length - 1,
        totalQuestions: questions.length,
      });
    }, [selections, allAnswered, currentIndex, questions.length, onStateChange]);

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

        {/* 질문 제목 */}
        <h3 className="text-base font-bold text-gray-900 leading-snug">
          {currentQuestion.title}
        </h3>

        {/* 선택지 - VS 포함 */}
        <div className="space-y-2">
          {/* Option A */}
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => handleSelect(currentQuestion.id, currentQuestion.option_A.target_rule_key)}
            className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
              selections.get(currentQuestion.id) === currentQuestion.option_A.target_rule_key
                ? 'border-emerald-400 bg-emerald-50'
                : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
            }`}
          >
            <div className="flex items-center gap-3">
              {/* 체크박스 스타일 */}
              <div
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                  selections.get(currentQuestion.id) === currentQuestion.option_A.target_rule_key
                    ? 'border-emerald-500 bg-emerald-500'
                    : 'border-gray-300 bg-white'
                }`}
              >
                {selections.get(currentQuestion.id) === currentQuestion.option_A.target_rule_key && (
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
                selections.get(currentQuestion.id) === currentQuestion.option_A.target_rule_key
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
            whileTap={{ scale: 0.98 }}
            onClick={() => handleSelect(currentQuestion.id, currentQuestion.option_B.target_rule_key)}
            className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
              selections.get(currentQuestion.id) === currentQuestion.option_B.target_rule_key
                ? 'border-emerald-400 bg-emerald-50'
                : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
            }`}
          >
            <div className="flex items-center gap-3">
              {/* 체크박스 스타일 */}
              <div
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                  selections.get(currentQuestion.id) === currentQuestion.option_B.target_rule_key
                    ? 'border-emerald-500 bg-emerald-500'
                    : 'border-gray-300 bg-white'
                }`}
              >
                {selections.get(currentQuestion.id) === currentQuestion.option_B.target_rule_key && (
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
                selections.get(currentQuestion.id) === currentQuestion.option_B.target_rule_key
                  ? 'text-emerald-700'
                  : 'text-gray-700'
              }`}>
                {currentQuestion.option_B.text}
              </span>
            </div>
          </motion.button>
        </div>

        {/* 스킵 버튼 */}
        <div className="text-center pt-1">
          <button
            onClick={() => handleSkip(currentQuestion.id)}
            className={`text-sm transition-colors py-2 px-4 rounded-lg hover:bg-gray-100 ${
              skipped.has(currentQuestion.id)
                ? 'text-gray-600 font-medium bg-gray-100'
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            {skipped.has(currentQuestion.id) ? '건너뜀' : '상관없어요'}
          </button>
        </div>

        {/* 진행률 인디케이터 (dots) */}
        <div className="flex justify-center gap-2 pt-2">
          {questions.map((q, idx) => (
            <button
              key={q.id}
              onClick={() => setCurrentIndex(idx)}
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
      </motion.div>
    );
  }
);
