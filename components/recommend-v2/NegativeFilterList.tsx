'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import type { NegativeFilterData } from '@/types/recommend-v2';
import { AIHelperButton } from './AIHelperButton';
import { NegativeFilterAIHelperBottomSheet } from './NegativeFilterAIHelperBottomSheet';

interface UserSelections {
  hardFilters?: Array<{ questionText: string; selectedLabels: string[] }>;
  balanceGames?: Array<{ title: string; selectedOption: string }>;
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
}: NegativeFilterListProps) {
  const { options, selectedKeys } = data;
  const [isAIHelperOpen, setIsAIHelperOpen] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-3"
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <span className="px-2.5 py-1 bg-rose-100 text-rose-600 rounded-full text-xs font-bold">
          단점 필터
        </span>
        
      </div>

      {/* 설명 */}
      <h3 className="text-base font-bold text-gray-900 leading-6">
        이것만큼은 절대 안 된다! 
        <br />
        <span className="text-gray-500 font-normal text-sm mt-2">
          피하고 싶은 단점이 있나요? 없으면 바로 넘어가기를 눌러주세요.
        </span>
      </h3>

      {/* AI 도움받기 버튼 */}
      {showAIHelper && (
        <AIHelperButton
          onClick={() => setIsAIHelperOpen(true)}
          questionType="negative"
          questionId="negative_filter"
          questionText="이것만큼은 절대 안 된다! 피하고 싶은 단점이 있나요?"
          category={category}
          categoryName={categoryName}
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
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.03 }}
              onClick={() => {
                const willBeSelected = !selectedKeys.includes(option.target_rule_key);
                const newTotalSelected = willBeSelected ? selectedKeys.length + 1 : selectedKeys.length - 1;
                onToggle(option.target_rule_key);
                onToggleWithLabel?.(option.target_rule_key, option.label, willBeSelected, newTotalSelected);
              }}
              className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
                isSelected
                  ? 'border-rose-400 bg-rose-50'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center gap-3">
                {/* 체크박스 */}
                <div
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                    isSelected
                      ? 'border-rose-500 bg-rose-500'
                      : 'border-gray-300 bg-white'
                  }`}
                >
                  {isSelected && (
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

                {/* 옵션 텍스트 */}
                <span
                  className={`text-sm font-medium leading-snug flex-1 ${
                    isSelected ? 'text-rose-700' : 'text-gray-700'
                  }`}
                >
                  {option.label}
                </span>
              </div>
            </motion.button>
          );
        })}

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
          onClose={() => setIsAIHelperOpen(false)}
          options={options}
          category={category}
          categoryName={categoryName}
          userSelections={userSelections}
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
