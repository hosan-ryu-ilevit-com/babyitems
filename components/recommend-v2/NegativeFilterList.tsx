'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import type { NegativeFilterData } from '@/types/recommend-v2';
import { AIHelperButton } from './AIHelperButton';
import { NegativeFilterAIHelperBottomSheet } from './NegativeFilterAIHelperBottomSheet';
import DirectInputField from './DirectInputField';

interface UserSelections {
  hardFilters?: Array<{ questionText: string; selectedLabels: string[] }>;
  balanceGames?: Array<{ title: string; selectedOption: string }>;
  naturalLanguageInputs?: Array<{ stage: string; input: string }>;
  initialContext?: string;
}

interface NegativeFilterListProps {
  data: NegativeFilterData;
  onToggle: (ruleKey: string) => void;
  onSkip?: () => void;
  // 로깅 콜백: 개별 토글 시 호출 (label 포함)
  onToggleWithLabel?: (ruleKey: string, label: string, isSelected: boolean, totalSelected: number) => void;
  // AI 도움받기 관련
  showAIHelper?: boolean;
  category?: string;
  categoryName?: string;
  userSelections?: UserSelections;
  // 직접 입력 기능
  directInputValue?: string;
  onDirectInputChange?: (value: string) => void;
  isDirectInputRegistered?: boolean;
  onDirectInputRegister?: (value: string) => void;
}

/**
 * 단점 필터 컴포넌트 (tags cons-selector 디자인 참조)
 * - 선택 순서 표시
 * - 체크 애니메이션
 * - 스킵 가능
 * - AI 도움받기 버튼 추가
 */
export function NegativeFilterList({
  data,
  onToggle,
  onSkip,
  onToggleWithLabel,
  showAIHelper = false,
  category = '',
  categoryName = '',
  userSelections,
  directInputValue = '',
  onDirectInputChange,
  isDirectInputRegistered = false,
  onDirectInputRegister,
}: NegativeFilterListProps) {
  const { options, selectedKeys } = data;
  const [isAIHelperOpen, setIsAIHelperOpen] = useState(false);
  const [isAIHelperAutoSubmit, setIsAIHelperAutoSubmit] = useState(false);
  const [aiHelperAutoSubmitText, setAiHelperAutoSubmitText] = useState<string | undefined>(undefined);

  // 컨텍스트 정보가 있는지 확인 (initialContext 포함)
  const hasContext = !!(
    userSelections?.initialContext ||
    (userSelections?.naturalLanguageInputs && userSelections.naturalLanguageInputs.length > 0) ||
    (userSelections?.hardFilters && userSelections.hardFilters.length > 0) ||
    (userSelections?.balanceGames && userSelections.balanceGames.length > 0)
  );

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

  return (
    <motion.div
      initial={{ opacity: 0, y: 0 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-3"
    >
      <div className="w-full h-[1px] bg-gray-100 mb-5" />

      {/* 질문 헤더 - 디자인 변경 */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-[16px] text-gray-400 font-semibold">
          단점 선택
        </span>
      </div>

      {/* 설명 */}
      <h3 className="text-[18px] font-semibold text-gray-900 leading-snug">
        꼭 피하고 싶은 단점을 선택하세요 <span className="text-gray-500 text-[14px] font-normal ml-1">(건너뛰기 가능)</span>
      </h3>

      {/* AI 도움받기 버튼 */}
      {showAIHelper && (
        <AIHelperButton
          onClick={() => {
            setAiHelperAutoSubmitText(undefined);
            setIsAIHelperAutoSubmit(false);
            setIsAIHelperOpen(true);
          }}
          label="뭘 골라야 할지 모르겠어요"
          questionType="negative"
          questionId="negative_filter"
          questionText="꼭 피하고 싶은 단점을 선택하세요 (건너뛰기 가능)"
          category={category}
          categoryName={categoryName}
          hasContext={hasContext}
          onContextRecommend={handleContextRecommend}
          onPopularRecommend={handlePopularRecommend}
        />
      )}

      {/* 옵션 목록 */}
      <div className="space-y-2">
        {/* 기본 옵션 */}
        {options.map((option, index) => {
          const isSelected = selectedKeys.includes(option.target_rule_key);

          return (
            <motion.button
              key={option.id}
              initial={{ opacity: 0, y: 0 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.03 }}
              onClick={() => {
                const willBeSelected = !selectedKeys.includes(option.target_rule_key);
                const newTotalSelected = willBeSelected ? selectedKeys.length + 1 : selectedKeys.length - 1;
                onToggle(option.target_rule_key);
                onToggleWithLabel?.(option.target_rule_key, option.label, willBeSelected, newTotalSelected);
              }}
              whileTap={{ scale: 0.98 }}
              className={`w-full min-h-[50px] py-[14px] px-4 rounded-xl border text-left flex items-center justify-between gap-3 ${
                isSelected
                  ? 'border-red-100 bg-red-50'
                  : 'border-gray-100 bg-white hover:border-gray-200'
              }`}
            >
              {/* 옵션 텍스트 */}
              <span
                className={`text-[16px] font-medium leading-snug flex-1 ${
                  isSelected ? 'text-red-500' : 'text-gray-600'
                }`}
              >
                {option.label}
              </span>
            </motion.button>
          );
        })}

        {/* 직접 입력 필드 */}
        {onDirectInputChange && (
          <DirectInputField
            value={directInputValue}
            onChange={onDirectInputChange}
            placeholder="원하는 답변을 입력하세요..."
            filterType="negative_filter"
            isRegistered={isDirectInputRegistered}
            onRegister={onDirectInputRegister}
          />
        )}
      </div>

      {/* 스킵 버튼 */}
      {onSkip && (
        <div className="text-center pt-2">
          <button
            onClick={onSkip}
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors py-2 px-4 rounded-lg hover:bg-gray-100"
          >
            다 괜찮아요, 넘어가기
          </button>
        </div>
      )}

      {/* AI 도움받기 바텀시트 */}
      {showAIHelper && (
        <NegativeFilterAIHelperBottomSheet
          isOpen={isAIHelperOpen}
          onClose={() => {
            setIsAIHelperOpen(false);
            setIsAIHelperAutoSubmit(false);
            setAiHelperAutoSubmitText(undefined);
          }}
          options={options}
          category={category}
          categoryName={categoryName}
          userSelections={userSelections}
          autoSubmitContext={isAIHelperAutoSubmit}
          autoSubmitText={aiHelperAutoSubmitText}
          onSelectOptions={(selectedRuleKeys) => {
            // 먼저 현재 선택된 것들을 모두 해제
            selectedKeys.forEach(key => {
              if (!selectedRuleKeys.includes(key)) {
                onToggle(key);
              }
            });
            // AI가 추천한 것들을 선택 (아직 선택되지 않은 것만)
            selectedRuleKeys.forEach(ruleKey => {
              if (!selectedKeys.includes(ruleKey)) {
                onToggle(ruleKey);
                // 로깅 콜백 호출
                const option = options.find(o => o.target_rule_key === ruleKey);
                if (option && onToggleWithLabel) {
                  onToggleWithLabel(ruleKey, option.label, true, selectedRuleKeys.length);
                }
              }
            });
          }}
        />
      )}
    </motion.div>
  );
}
