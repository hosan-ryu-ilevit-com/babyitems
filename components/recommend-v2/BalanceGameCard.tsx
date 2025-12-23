'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import type { BalanceGameData, UserSelections } from '@/types/recommend-v2';
import { AIHelperButton } from './AIHelperButton';
import { AIHelperBottomSheet } from './AIHelperBottomSheet';

interface BalanceGameCardProps {
  data: BalanceGameData;
  onSelectA: () => void;
  onSelectB: () => void;
  onSkip: () => void;
  onSelectBoth?: () => void;  // "둘 다 중요해요" 선택 (priority 타입용)
  // AI 도움 기능
  showAIHelper?: boolean;
  category?: string;
  categoryName?: string;
  userSelections?: UserSelections;
}

/**
 * 밸런스 게임 A vs B 카드 컴포넌트
 * - tradeoff 타입: 상반 관계, 반드시 하나 선택 (스킵 가능)
 * - priority 타입: 우선순위 파악, "둘 다 중요해요" 선택 가능
 */
export function BalanceGameCard({
  data,
  onSelectA,
  onSelectB,
  onSkip,
  onSelectBoth,
  showAIHelper = false,
  category = '',
  categoryName = '',
  userSelections,
}: BalanceGameCardProps) {
  const { question, currentIndex, totalCount } = data;

  // AI 도움 바텀시트 상태
  const [isAIHelperOpen, setIsAIHelperOpen] = useState(false);
  const [isAIHelperAutoSubmit, setIsAIHelperAutoSubmit] = useState(false);
  const [aiHelperAutoSubmitText, setAiHelperAutoSubmitText] = useState<string | undefined>(undefined);

  // 컨텍스트 정보가 있는지 확인
  const hasContext = 
    (userSelections?.naturalLanguageInputs && userSelections.naturalLanguageInputs.length > 0) ||
    (userSelections?.hardFilters && userSelections.hardFilters.length > 0) ||
    (userSelections?.balanceGames && userSelections.balanceGames.length > 0);

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

  // AI 추천 결과 처리
  const handleAISelectOptions = (selectedOptions: string[]) => {
    const selected = selectedOptions[0];
    if (selected === 'A') {
      onSelectA();
    } else if (selected === 'B') {
      onSelectB();
    } else if (selected === 'both' && onSelectBoth) {
      onSelectBoth();
    }
  };

  return (
    <motion.div
      key={question.id}
      initial={{ opacity: 0, y: 0 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.3 }}
      className="space-y-4"
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <span className="px-2.5 py-1 bg-purple-50 text-purple-600 rounded-full text-xs font-bold">
          Q{currentIndex + 1}. 취향 선택
        </span>
        <span className="text-xs text-gray-400">
          {currentIndex + 1} / {totalCount}
        </span>
      </div>

      {/* 질문 제목 */}
      <h3 className="text-base font-bold text-gray-900 text-center leading-snug">
        {question.title}
      </h3>

      {/* AI 도움받기 버튼 */}
      {showAIHelper && (
        <AIHelperButton
          onClick={() => {
            setAiHelperAutoSubmitText(undefined);
            setIsAIHelperAutoSubmit(false);
            setIsAIHelperOpen(true);
          }}
          questionType="balance_game"
          questionId={question.id}
          questionText={question.title}
          category={category}
          categoryName={categoryName}
          step={currentIndex}
          hasContext={hasContext}
          onContextRecommend={handleContextRecommend}
          onPopularRecommend={handlePopularRecommend}
        />
      )}

      {/* A vs B 선택 */}
      <div className="space-y-3">
        {/* Option A */}
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={onSelectA}
          className="w-full p-4 rounded-2xl bg-gradient-to-r from-blue-50 to-blue-100 border-2 border-blue-200 text-left hover:border-blue-400 hover:from-blue-100 hover:to-blue-150 transition-all"
        >
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-full bg-blue-500 text-white font-bold text-sm flex items-center justify-center flex-shrink-0">
              A
            </span>
            <span className="text-sm font-medium text-gray-800 leading-snug">
              {question.option_A.text}
            </span>
          </div>
        </motion.button>

        {/* VS 구분선 */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-gray-400 text-xs font-bold">VS</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        {/* Option B */}
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={onSelectB}
          className="w-full p-4 rounded-2xl bg-gradient-to-r from-purple-50 to-purple-100 border-2 border-purple-200 text-left hover:border-purple-400 hover:from-purple-100 hover:to-purple-150 transition-all"
        >
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-full bg-purple-500 text-white font-bold text-sm flex items-center justify-center flex-shrink-0">
              B
            </span>
            <span className="text-sm font-medium text-gray-800 leading-snug">
              {question.option_B.text}
            </span>
          </div>
        </motion.button>
      </div>

      {/* 하단 버튼 영역 - 모든 질문에 동일하게 표시 */}
      <div className="text-center pt-1">
        {onSelectBoth && (
          <button
            onClick={onSelectBoth}
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            둘 다 중요해요
          </button>
        )}
      </div>

      {/* AI 도움 바텀시트 */}
      {showAIHelper && (
        <AIHelperBottomSheet
          isOpen={isAIHelperOpen}
          onClose={() => {
            setIsAIHelperOpen(false);
            setIsAIHelperAutoSubmit(false);
            setAiHelperAutoSubmitText(undefined);
          }}
          questionType="balance_game"
          questionId={question.id}
          questionText={question.title}
          options={{
            A: { text: question.option_A.text, target_rule_key: question.option_A.target_rule_key },
            B: { text: question.option_B.text, target_rule_key: question.option_B.target_rule_key },
          }}
          category={category}
          categoryName={categoryName}
          onSelectOptions={handleAISelectOptions}
          userSelections={userSelections}
          autoSubmitContext={isAIHelperAutoSubmit}
          autoSubmitText={aiHelperAutoSubmitText}
        />
      )}
    </motion.div>
  );
}
