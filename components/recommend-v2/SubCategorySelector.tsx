'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { AIHelperButton } from './AIHelperButton';
import { AIHelperBottomSheet } from './AIHelperBottomSheet';

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
}: SubCategorySelectorProps) {
  const [isAIHelperOpen, setIsAIHelperOpen] = useState(false);

  // AI 추천 결과 처리 (다중 선택 지원)
  const handleAISelectOptions = (selectedOptions: string[]) => {
    // 선택된 옵션들을 토글
    selectedOptions.forEach(option => {
      if (!selectedCodes.includes(option)) {
        onToggle(option);
      }
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-4"
    >
      {/* 헤더 */}
      <div className="flex items-center gap-2">
        <span className="px-2.5 py-1 bg-emerald-100 text-emerald-600 rounded-full text-xs font-bold">
          세부 종류
        </span>
      </div>

      {/* 질문 텍스트 */}
      <h3 className="text-base font-medium text-gray-900 leading-snug">
        어떤 {categoryName}를 찾으세요?
      </h3>

      {/* 도움말 팁 */}
      {dynamicTip && (
        <p className="text-sm text-gray-500 -mt-2">
          {dynamicTip}
        </p>
      )}

      {/* AI 도움받기 버튼 - dynamicTip이 있을 때만 표시 */}
      {showAIHelper && dynamicTip && (
        <AIHelperButton onClick={() => setIsAIHelperOpen(true)} />
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
              className={`px-4 py-3 rounded-xl border-2 transition-all ${
                isSelected
                  ? 'border-emerald-400 bg-emerald-50'
                  : 'border-gray-100 bg-white hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <span
                className={`text-sm font-semibold ${
                  isSelected ? 'text-emerald-700' : 'text-gray-800'
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
          onClose={() => setIsAIHelperOpen(false)}
          questionType="hard_filter"
          questionId={`subcategory_${category}`}
          questionText={`어떤 ${categoryName}를 찾으세요?`}
          options={subCategories.map(sc => ({ value: sc.code, label: sc.name }))}
          category={category}
          categoryName={categoryName}
          tipText={dynamicTip}
          onSelectOptions={handleAISelectOptions}
        />
      )}
    </motion.div>
  );
}
