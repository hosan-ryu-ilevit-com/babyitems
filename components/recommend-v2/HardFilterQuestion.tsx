'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import type { HardFilterData, ProductItem } from '@/types/recommend-v2';

// "상관없어요" 옵션 값 (이 값을 가진 옵션이 선택되면 다른 옵션 비활성화)
const SKIP_VALUES = ['skip', 'any', '상관없어요', 'none', 'all'];

interface HardFilterQuestionProps {
  data: HardFilterData;
  onSelect: (questionId: string, values: string[]) => void;
  // 디버깅용: 옵션별 제품 개수 표시
  products?: ProductItem[];
  showProductCounts?: boolean;
}

/**
 * 단일 옵션에 대해 해당 조건을 만족하는 제품 개수 계산
 */
function countProductsForOption(
  products: ProductItem[],
  option: { value: string; filter?: Record<string, unknown>; category_code?: string }
): number {
  // "상관없어요" 옵션은 전체 개수 반환
  if (SKIP_VALUES.includes(option.value.toLowerCase()) || option.value.includes('상관없')) {
    return products.length;
  }

  return products.filter(product => {
    // category_code 필터
    if (option.category_code) {
      if (product.category_code !== option.category_code) {
        return false;
      }
    }

    // spec/filter_attrs 필터
    if (option.filter && Object.keys(option.filter).length > 0) {
      for (const [path, condition] of Object.entries(option.filter)) {
        let value: unknown;
        if (path.startsWith('filter_attrs.') && product.filter_attrs) {
          const attrKey = path.replace('filter_attrs.', '');
          value = product.filter_attrs[attrKey];
        } else {
          // nested path support
          const keys = path.split('.');
          let current: unknown = product;
          for (const key of keys) {
            if (current && typeof current === 'object' && key in (current as Record<string, unknown>)) {
              current = (current as Record<string, unknown>)[key];
            } else {
              current = undefined;
              break;
            }
          }
          value = current;
        }

        // condition 체크
        if (typeof condition === 'object' && condition !== null) {
          const condObj = condition as Record<string, unknown>;

          if ('contains' in condObj && typeof condObj.contains === 'string') {
            const searchValue = condObj.contains.toLowerCase();
            if (Array.isArray(value)) {
              if (!value.some(item => String(item).toLowerCase().includes(searchValue))) {
                return false;
              }
            } else if (typeof value === 'string') {
              if (!value.toLowerCase().includes(searchValue)) {
                return false;
              }
            } else {
              return false;
            }
          }

          // 숫자 비교
          const numValue = typeof value === 'number' ? value :
            typeof value === 'string' ? parseFloat(String(value).match(/[\d.]+/)?.[0] || 'NaN') : NaN;

          if ('lte' in condObj && typeof condObj.lte === 'number') {
            if (isNaN(numValue) || numValue > condObj.lte) return false;
          }
          if ('gte' in condObj && typeof condObj.gte === 'number') {
            if (isNaN(numValue) || numValue < condObj.gte) return false;
          }
        } else if (typeof condition === 'string') {
          if (path.startsWith('filter_attrs.')) {
            if (String(value) !== condition) return false;
          } else {
            if (String(value).toLowerCase() !== condition.toLowerCase()) return false;
          }
        }
      }
    }

    return true;
  }).length;
}

/**
 * 하드 필터 질문 컴포넌트 (다중 선택 지원)
 * - 복수 선택 가능
 * - "상관없어요" 선택 시 다른 옵션 비활성화
 * - 플로팅 버튼으로 이전/다음 진행 (내부 버튼 제거됨)
 */
export function HardFilterQuestion({
  data,
  onSelect,
  products,
  showProductCounts = false,
}: HardFilterQuestionProps) {
  const { question, currentIndex, totalCount, selectedValues: initialValues } = data;

  // 로컬 선택 상태 (부모에서 전달받은 값으로 초기화)
  const [localSelectedValues, setLocalSelectedValues] = useState<string[]>(initialValues || []);
  const [customInput, setCustomInput] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);

  // 부모에서 전달받은 값이 변경되면 동기화
  useEffect(() => {
    if (initialValues) {
      setLocalSelectedValues(initialValues);
    }
  }, [initialValues]);

  // "상관없어요" 옵션이 선택되었는지 확인
  const isSkipSelected = localSelectedValues.some(v =>
    SKIP_VALUES.includes(v.toLowerCase()) || v.includes('상관없')
  );

  // 옵션 클릭 핸들러
  const handleOptionClick = (optionValue: string) => {
    const isSkipOption = SKIP_VALUES.includes(optionValue.toLowerCase()) || optionValue.includes('상관없');

    let newValues: string[];

    if (isSkipOption) {
      // "상관없어요" 클릭: 토글 (선택 시 다른 모든 선택 해제)
      if (localSelectedValues.includes(optionValue)) {
        newValues = []; // 이미 선택되어 있으면 해제
      } else {
        newValues = [optionValue]; // 선택하면 이것만 선택
      }
    } else {
      // 일반 옵션 클릭
      if (isSkipSelected) {
        // "상관없어요"가 선택된 상태면 무시 (비활성화)
        return;
      }

      // 토글: 이미 선택되어 있으면 해제, 아니면 추가
      if (localSelectedValues.includes(optionValue)) {
        newValues = localSelectedValues.filter(v => v !== optionValue);
      } else {
        newValues = [...localSelectedValues, optionValue];
      }
    }

    setLocalSelectedValues(newValues);
    onSelect(question.id, newValues);
  };

  // 커스텀 입력 제출
  const handleCustomSubmit = () => {
    if (customInput.trim()) {
      const customValue = `custom:${customInput.trim()}`;
      const newValues = [...localSelectedValues.filter(v => !v.startsWith('custom:')), customValue];
      setLocalSelectedValues(newValues);
      onSelect(question.id, newValues);
      setShowCustomInput(false);
      setCustomInput('');
    }
  };

  return (
    <motion.div
      key={question.id}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.3 }}
      className="space-y-3"
    >
      {/* 질문 헤더 */}
      <div className="flex items-center justify-between">
        <span className="px-2.5 py-1 bg-blue-100 text-blue-600 rounded-full text-xs font-bold">
          Q{currentIndex + 1}
        </span>
        <span className="text-xs text-gray-400">
          {currentIndex + 1} / {totalCount}
        </span>
      </div>

      {/* 질문 텍스트 */}
      <h3 className="text-base font-bold text-gray-900 leading-snug">
        {question.question}
      </h3>

      {/* 다중 선택 안내 */}
      <p className="text-xs text-gray-500">
        복수 선택 가능해요
      </p>

      {/* 선택지 */}
      <div className="space-y-2">
        {question.options.map((option, index) => {
          const isSelected = localSelectedValues.includes(option.value);
          const isSkipOption = SKIP_VALUES.includes(option.value.toLowerCase()) || option.value.includes('상관없');
          const isDisabled = isSkipSelected && !isSkipOption;

          // 디버깅용: 옵션별 제품 개수 계산
          const productCount = showProductCounts && products
            ? countProductsForOption(products, option)
            : null;

          return (
            <motion.button
              key={option.value}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.03 }}
              onClick={() => handleOptionClick(option.value)}
              disabled={isDisabled}
              className={`w-full p-3.5 rounded-xl border-2 text-left transition-all ${
                isDisabled
                  ? 'border-gray-100 bg-gray-50 cursor-not-allowed opacity-50'
                  : isSelected
                  ? 'border-blue-400 bg-blue-50'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center gap-3">
                {/* 체크박스 스타일 */}
                <div
                  className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center shrink-0 transition-all ${
                    isDisabled
                      ? 'border-gray-200 bg-gray-100'
                      : isSelected
                      ? 'border-blue-500 bg-blue-500'
                      : 'border-gray-300 bg-white'
                  }`}
                >
                  {isSelected && !isDisabled && (
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
                  className={`text-sm font-medium flex-1 ${
                    isDisabled
                      ? 'text-gray-400'
                      : isSelected
                      ? 'text-blue-700'
                      : 'text-gray-700'
                  }`}
                >
                  {option.label}
                </span>

                {/* 디버깅용: 제품 개수 표시 */}
                {productCount !== null && (
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    productCount === 0
                      ? 'bg-red-100 text-red-600'
                      : productCount < 5
                      ? 'bg-yellow-100 text-yellow-700'
                      : 'bg-green-100 text-green-700'
                  }`}>
                    {productCount}개
                  </span>
                )}
              </div>
            </motion.button>
          );
        })}

        {/* 커스텀 입력 선택 표시 */}
        {localSelectedValues.filter(v => v.startsWith('custom:')).map((customValue) => {
          const displayText = customValue.replace('custom:', '');
          return (
            <motion.div
              key={customValue}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="w-full p-3.5 rounded-xl border-2 border-blue-400 bg-blue-50 text-left"
            >
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-lg border-2 border-blue-500 bg-blue-500 flex items-center justify-center shrink-0">
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <span className="text-sm font-medium text-blue-700 flex-1">
                  {displayText}
                </span>
                <button
                  onClick={() => {
                    const newValues = localSelectedValues.filter(v => v !== customValue);
                    setLocalSelectedValues(newValues);
                    onSelect(question.id, newValues);
                  }}
                  className="text-blue-400 hover:text-blue-600 p-1"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </motion.div>
          );
        })}

        {/* 직접 입력 섹션 */}
        {!isSkipSelected && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: question.options.length * 0.03 }}
            className="pt-2"
          >
            {!showCustomInput ? (
              <button
                onClick={() => setShowCustomInput(true)}
                className="w-full p-3 rounded-xl border-2 border-dashed border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-600 transition-all text-sm flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
                직접 입력하기
              </button>
            ) : (
              <div className="p-3 rounded-xl border-2 border-blue-200 bg-blue-50">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customInput}
                    onChange={(e) => setCustomInput(e.target.value)}
                    placeholder="원하는 조건을 입력해주세요"
                    className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCustomSubmit();
                    }}
                  />
                  <button
                    onClick={handleCustomSubmit}
                    disabled={!customInput.trim()}
                    className="px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                  >
                    확인
                  </button>
                </div>
                <button
                  onClick={() => {
                    setShowCustomInput(false);
                    setCustomInput('');
                  }}
                  className="mt-2 text-xs text-gray-500 hover:text-gray-700"
                >
                  취소
                </button>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
