'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { BalanceQuestion } from '@/types/recommend-v2';

interface BalanceGameCarouselProps {
  questions: BalanceQuestion[];
  onComplete: (selections: Set<string>) => void;
  onStateChange?: (state: { selectionsCount: number; allAnswered: boolean; currentSelections: Set<string> }) => void;
}

/**
 * 밸런스 게임 컴포넌트 (tags 플로우 디자인 통일)
 * - 카드 스타일 선택지
 * - 선택 시 체크 애니메이션
 * - 스킵 가능
 */
export function BalanceGameCarousel({
  questions,
  onComplete,
  onStateChange,
}: BalanceGameCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selections, setSelections] = useState<Map<string, string>>(new Map());
  const [skipped, setSkipped] = useState<Set<string>>(new Set());

  const currentQuestion = questions[currentIndex];
  const isLastQuestion = currentIndex === questions.length - 1;

  // 선택 처리
  const handleSelect = (questionId: string, ruleKey: string) => {
    const newSelections = new Map(selections);
    newSelections.set(questionId, ruleKey);
    setSelections(newSelections);

    // 다음 질문으로 자동 이동 (마지막이 아니면)
    if (!isLastQuestion) {
      setTimeout(() => {
        setCurrentIndex(prev => prev + 1);
      }, 400);
    }
  };

  // 스킵 처리
  const handleSkip = (questionId: string) => {
    const newSkipped = new Set(skipped);
    newSkipped.add(questionId);
    setSkipped(newSkipped);

    if (!isLastQuestion) {
      setTimeout(() => {
        setCurrentIndex(prev => prev + 1);
      }, 200);
    }
  };

  // 완료 처리
  const handleComplete = () => {
    const selectedRuleKeys = new Set(selections.values());
    onComplete(selectedRuleKeys);
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
    });
  }, [selections, allAnswered, onStateChange]);

  if (questions.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {/* 질문 슬라이드 */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentQuestion.id}
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -30 }}
          transition={{ duration: 0.25 }}
          className="space-y-4"
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

          {/* 선택지 - 세로 배치 */}
          <div className="space-y-3">
            {/* Option A */}
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={() => handleSelect(currentQuestion.id, currentQuestion.option_A.target_rule_key)}
              className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
                selections.get(currentQuestion.id) === currentQuestion.option_A.target_rule_key
                  ? 'border-emerald-300 bg-emerald-100'
                  : 'border-transparent bg-gray-100 hover:bg-gray-200'
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

            {/* Option B */}
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={() => handleSelect(currentQuestion.id, currentQuestion.option_B.target_rule_key)}
              className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
                selections.get(currentQuestion.id) === currentQuestion.option_B.target_rule_key
                  ? 'border-emerald-300 bg-emerald-100'
                  : 'border-transparent bg-gray-100 hover:bg-gray-200'
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
                  ? 'text-gray-600 font-medium'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {skipped.has(currentQuestion.id) ? '건너뜀' : '상관없어요'}
            </button>
          </div>
        </motion.div>
      </AnimatePresence>

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
