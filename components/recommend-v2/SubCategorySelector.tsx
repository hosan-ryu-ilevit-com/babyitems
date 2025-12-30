'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { AIHelperButton } from './AIHelperButton';
import { AIHelperBottomSheet } from './AIHelperBottomSheet';
import type { UserSelections } from '@/types/recommend-v2';

interface SubCategory {
  code: string;
  name: string;
  description?: string;
  icon?: string;
}

interface SubCategorySelectorProps {
  categoryName: string;
  subCategories: SubCategory[];
  selectedCodes: string[];
  onToggle: (code: string) => void;
  // LLM 생성 동적 팁
  dynamicTip?: string;
  // AI 도움 기능
  showAIHelper?: boolean;
  category?: string;
  // 사용자 선택 데이터 (자연어 입력 등)
  userSelections?: UserSelections;
}

/**
 * 세부 카테고리 선택 컴포넌트
 * - 유모차, 카시트, 기저귀 등 하위 카테고리가 있는 경우 사용
 */
export function SubCategorySelector({
  categoryName,
  subCategories,
  selectedCodes,
  onToggle,
  dynamicTip,
  showAIHelper = false,
  category = '',
  userSelections,
}: SubCategorySelectorProps) {
  const [isAIHelperOpen, setIsAIHelperOpen] = useState(false);
  const [aiHelperAutoSubmitText, setAiHelperAutoSubmitText] = useState<string | undefined>(undefined);
  const [aiHelperAutoSubmitContext, setAiHelperAutoSubmitContext] = useState(false);

  // 자연어 입력이 있는지 확인 (initialContext 또는 naturalLanguageInputs)
  const hasContext = !!(
    userSelections?.initialContext ||
    (userSelections?.naturalLanguageInputs && userSelections.naturalLanguageInputs.length > 0)
  );

  // AI 추천 결과 처리 (다중 선택 지원)
  const handleAISelectOptions = (selectedOptions: string[]) => {
    // 선택된 옵션들을 토글
    selectedOptions.forEach(option => {
      if (!selectedCodes.includes(option)) {
        onToggle(option);
      }
    });
  };

  const handlePopularRecommend = () => {
    setAiHelperAutoSubmitText('가장 많은 사람들이 구매하는게 뭔가요?');
    setAiHelperAutoSubmitContext(false);
    setIsAIHelperOpen(true);
  };

  const handleContextRecommend = () => {
    setAiHelperAutoSubmitText(undefined);
    setAiHelperAutoSubmitContext(true);
    setIsAIHelperOpen(true);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 0 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-4"
    >
      <div className="w-full h-[1px] bg-gray-100 mb-5" />

      {/* 헤더 - 디자인 변경 */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-[16px] text-gray-400 font-semibold">
          조건 고르기
        </span>
      </div>

      {/* 질문 텍스트 */}
      <h3 className="text-[18px] font-semibold text-gray-900 leading-snug break-keep">
        어떤 {categoryName}를 찾으세요? <span className="text-blue-500 font-bold">*</span>
      </h3>

      {/* 도움말 팁 */}
      {dynamicTip && (
        <p className="text-sm text-gray-500 -mt-2">
          {dynamicTip}
        </p>
      )}

      {/* AI 도움받기 버튼 - dynamicTip이 있을 때만 표시 */}
      {showAIHelper && dynamicTip && (
        <AIHelperButton
          onClick={() => {
            setAiHelperAutoSubmitText(undefined);
            setAiHelperAutoSubmitContext(false);
            setIsAIHelperOpen(true);
          }}
          label="뭘 골라야 할지 모르겠어요"
          questionType="hard_filter"
          questionId="subcategory_selector"
          questionText={`어떤 ${categoryName}를 찾으세요?`}
          category={category}
          categoryName={categoryName}
          hasContext={hasContext}
          onContextRecommend={handleContextRecommend}
          onPopularRecommend={handlePopularRecommend}
        />
      )}

      {/* 선택지 그리드 (다중 선택 가능) */}
      <div className="grid grid-cols-2 gap-3">
        {subCategories.map((sub, index) => {
          const isSelected = selectedCodes.includes(sub.code);

          return (
            <motion.button
              key={sub.code}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.05 }}
              onClick={() => onToggle(sub.code)}
              whileTap={{ scale: 0.98 }}
              className={`px-4 min-h-[50px] py-[14px] rounded-xl border flex items-center justify-center ${
                isSelected
                  ? 'border-blue-100 bg-blue-50'
                  : 'border-gray-100 bg-white hover:border-gray-200'
              }`}
            >
              <span
                className={`text-[16px] font-medium break-keep ${
                  isSelected ? 'text-blue-500' : 'text-gray-600'
                }`}
              >
                {sub.name}
              </span>
            </motion.button>
          );
        })}
      </div>

      {/* AI 도움 바텀시트 - dynamicTip이 있을 때만 렌더 */}
      {showAIHelper && dynamicTip && (
        <AIHelperBottomSheet
          isOpen={isAIHelperOpen}
          onClose={() => {
            setIsAIHelperOpen(false);
            setAiHelperAutoSubmitText(undefined);
            setAiHelperAutoSubmitContext(false);
          }}
          questionType="hard_filter"
          questionId={`subcategory_${category}`}
          questionText={`어떤 ${categoryName}를 찾으세요?`}
          options={subCategories.map(sc => ({ value: sc.code, label: sc.name }))}
          category={category}
          categoryName={categoryName}
          tipText={dynamicTip}
          onSelectOptions={handleAISelectOptions}
          userSelections={userSelections}
          autoSubmitText={aiHelperAutoSubmitText}
          autoSubmitContext={aiHelperAutoSubmitContext}
        />
      )}
    </motion.div>
  );
}
