'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { HardFilterData, ProductItem, HardFilterOption } from '@/types/recommend-v2';
import { AIHelperButton } from './AIHelperButton';
import { AIHelperBottomSheet } from './AIHelperBottomSheet';

// "전부 좋아요" 옵션 값 (이 값을 가진 옵션이 선택되면 다른 옵션 비활성화)
const SKIP_VALUES = ['skip', 'any', '상관없어요', '전부 좋아요', 'none', 'all'];

/**
 * 리뷰 기반 우선순위 태그 컴포넌트 (review_priorities 타입)
 */
function ReviewPriorityTags({
  question,
  selectedValues,
  onSelect,
  currentIndex,
  totalCount,
}: {
  question: HardFilterData['question'];
  selectedValues: string[];
  onSelect: (values: string[]) => void;
  currentIndex: number;
  totalCount: number;
}) {
  const [expandedTag, setExpandedTag] = useState<string | null>(null);

  const handleTagClick = (optionValue: string) => {
    const newValues = selectedValues.includes(optionValue)
      ? selectedValues.filter(v => v !== optionValue)
      : [...selectedValues, optionValue];
    onSelect(newValues);
  };

  // 감정에 따른 아이콘
  const getSentimentIcon = (sentiment?: HardFilterOption['sentiment']) => {
    switch (sentiment) {
      case 'positive':
        return '👍';
      case 'negative':
        return '⚠️';
      default:
        return '💡';
    }
  };

  // 총 리뷰 언급 수 계산
  const totalMentions = question.options.reduce((sum, opt) => sum + (opt.mentionCount || 0), 0);

  return (
    <motion.div
      key={question.id}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.3 }}
      className="space-y-4"
    >
      {/* 특별한 헤더 - 리뷰 기반임을 강조 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 bg-violet-100 text-violet-600 rounded-full text-xs font-bold flex items-center gap-1">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
            </svg>
            실제 리뷰
          </span>
          <span className="text-xs text-gray-400">
            {totalMentions}건의 리뷰 분석
          </span>
        </div>
        <span className="text-xs text-gray-400">
          {currentIndex + 1} / {totalCount}
        </span>
      </div>

      {/* 메인 질문 */}
      <div className="space-y-1">
        <h3 className="text-lg font-bold text-gray-900 leading-snug">
          {question.question}
        </h3>
        {question.tip && (
          <p className="text-sm text-violet-600 font-medium">
            ✨ {question.tip}
          </p>
        )}
      </div>

      {/* 태그 형식 옵션들 */}
      <div className="flex flex-wrap gap-2">
        {question.options.map((option, index) => {
          const isSelected = selectedValues.includes(option.value);
          const isExpanded = expandedTag === option.value;

          return (
            <motion.div
              key={option.value}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.05 }}
              className="relative"
            >
              <button
                onClick={() => handleTagClick(option.value)}
                onMouseEnter={() => setExpandedTag(option.value)}
                onMouseLeave={() => setExpandedTag(null)}
                className={`
                  px-4 py-2.5 rounded-full text-sm font-medium
                  transition-all duration-200 transform
                  ${isSelected
                    ? 'bg-violet-500 text-white shadow-lg shadow-violet-200 scale-105'
                    : 'bg-gray-100 text-gray-700 hover:bg-violet-100 hover:text-violet-700'
                  }
                `}
              >
                <span className="flex items-center gap-2">
                  {/* 레이블 */}
                  <span>{option.displayLabel || option.label}</span>

                  {/* 언급 횟수 배지 */}
                  {option.mentionCount && (
                    <span className={`
                      px-1.5 py-0.5 rounded-full text-[10px] font-bold
                      ${isSelected
                        ? 'bg-white/20 text-white'
                        : 'bg-violet-200 text-violet-700'
                      }
                    `}>
                      {option.mentionCount}건
                    </span>
                  )}
                </span>
              </button>

              {/* 호버 시 샘플 리뷰 툴팁 */}
              <AnimatePresence>
                {isExpanded && option.sampleReview && (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 5 }}
                    className="absolute z-10 top-full mt-2 left-0 right-0 min-w-[200px] max-w-[280px]"
                  >
                    <div className="bg-gray-800 text-white text-xs p-3 rounded-lg shadow-xl">
                      <div className="flex items-start gap-2">
                        <span className="text-base shrink-0">{getSentimentIcon(option.sentiment)}</span>
                        <p className="leading-relaxed">&ldquo;{option.sampleReview}&rdquo;</p>
                      </div>
                      {/* 화살표 */}
                      <div className="absolute -top-1.5 left-6 w-3 h-3 bg-gray-800 transform rotate-45" />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>

      {/* 선택된 항목에 대한 대표 리뷰 표시 */}
      <AnimatePresence>
        {selectedValues.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-4 space-y-2"
          >
            <p className="text-xs text-gray-500 font-medium">
              선택한 항목의 실제 후기:
            </p>
            <div className="space-y-2">
              {selectedValues.map(value => {
                const option = question.options.find(o => o.value === value);
                if (!option?.sampleReview) return null;
                return (
                  <motion.div
                    key={value}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-start gap-2 p-3 bg-violet-50 rounded-lg border border-violet-100"
                  >
                    <span className="text-base shrink-0">{getSentimentIcon(option.sentiment)}</span>
                    <div>
                      <p className="text-xs font-semibold text-violet-700 mb-1">
                        {option.displayLabel || option.label}
                      </p>
                      <p className="text-xs text-gray-600 leading-relaxed">
                        &ldquo;{option.sampleReview}&rdquo;
                      </p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 선택 힌트 */}
      {selectedValues.length === 0 && (
        <p className="text-xs text-gray-400 text-center">
          중요하게 생각하는 항목을 터치해주세요 (복수 선택 가능)
        </p>
      )}
    </motion.div>
  );
}

// 인기 옵션 정보
interface PopularOption {
  questionId: string;
  value: string;
  percentage: number; // 선택 비율 (%)
  isPopular: boolean;
}

interface HardFilterQuestionProps {
  data: HardFilterData;
  onSelect: (questionId: string, values: string[]) => void;
  // 디버깅용: 옵션별 제품 개수 표시
  products?: ProductItem[];
  showProductCounts?: boolean;
  // 인기 옵션 (상위 3개)
  popularOptions?: PopularOption[];
  // LLM 생성 동적 팁 (question.tip보다 우선)
  dynamicTip?: string;
  // AI 도움 기능
  showAIHelper?: boolean;
  category?: string;
  categoryName?: string;
}

/**
 * 단일 옵션에 대해 해당 조건을 만족하는 제품 개수 계산
 */
function countProductsForOption(
  products: ProductItem[],
  option: { value: string; filter?: Record<string, unknown>; category_code?: string }
): number {
  // "전부 좋아요" 옵션은 전체 개수 반환
  if (SKIP_VALUES.includes(option.value.toLowerCase()) || option.value.includes('상관없') || option.value.includes('전부 좋아요')) {
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

          // anyOf: aliases 중 하나라도 매칭 (정규화된 값 필터링용)
          if ('anyOf' in condObj && Array.isArray(condObj.anyOf)) {
            const aliases = condObj.anyOf as string[];
            const strValue = String(value);
            if (!aliases.includes(strValue)) {
              return false;
            }
          }

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
 * - "전부 좋아요" 선택 시 다른 옵션 비활성화
 * - 플로팅 버튼으로 이전/다음 진행 (내부 버튼 제거됨)
 */
export function HardFilterQuestion({
  data,
  onSelect,
  products,
  showProductCounts = false,
  popularOptions = [],
  dynamicTip,
  showAIHelper = false,
  category = '',
  categoryName = '',
}: HardFilterQuestionProps) {
  const { question, currentIndex, totalCount, selectedValues: initialValues } = data;

  // dynamicTip이 있으면 우선 사용, 없으면 question.tip 사용
  const tipText = dynamicTip || data.dynamicTip || question.tip;

  // 로컬 선택 상태 (부모에서 전달받은 값으로 초기화)
  const [localSelectedValues, setLocalSelectedValues] = useState<string[]>(initialValues || []);

  // AI 도움 바텀시트 상태
  const [isAIHelperOpen, setIsAIHelperOpen] = useState(false);

  // 부모에서 전달받은 값이 변경되면 동기화
  useEffect(() => {
    if (initialValues) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLocalSelectedValues(initialValues);
    }
  }, [initialValues]);

  // "전부 좋아요" 옵션이 선택되었는지 확인
  const isSkipSelected = localSelectedValues.some(v =>
    SKIP_VALUES.includes(v.toLowerCase()) || v.includes('상관없') || v.includes('전부 좋아요')
  );

  // 옵션 클릭 핸들러
  const handleOptionClick = (optionValue: string) => {
    const isSkipOption = SKIP_VALUES.includes(optionValue.toLowerCase()) || optionValue.includes('상관없') || optionValue.includes('전부 좋아요');

    let newValues: string[];

    if (isSkipOption) {
      // "전부 좋아요" 클릭: 토글 (선택 시 다른 모든 선택 해제)
      if (localSelectedValues.includes(optionValue)) {
        newValues = []; // 이미 선택되어 있으면 해제
      } else {
        newValues = [optionValue]; // 선택하면 이것만 선택
      }
    } else {
      // 일반 옵션 클릭
      if (isSkipSelected) {
        // "전부 좋아요"가 선택된 상태면 무시 (비활성화)
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

  // review_priorities 타입은 별도의 태그 스타일 UI로 렌더링
  if (question.type === 'review_priorities') {
    return (
      <ReviewPriorityTags
        question={question}
        selectedValues={localSelectedValues}
        onSelect={(values) => {
          setLocalSelectedValues(values);
          onSelect(question.id, values);
        }}
        currentIndex={currentIndex}
        totalCount={totalCount}
      />
    );
  }

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

      {/* 도움말 팁 (dynamicTip 우선) */}
      {tipText && (
        <p className="text-sm text-gray-500 -mt-2">
          {tipText}
        </p>
      )}

      {/* AI 도움받기 버튼 - tipText가 있을 때만 표시 */}
      {showAIHelper && tipText && (
        <AIHelperButton onClick={() => setIsAIHelperOpen(true)} />
      )}

      {/* 선택지 - 6개 초과 시 2열 그리드 */}
      <div className={question.options.length > 6 ? 'grid grid-cols-2 gap-2' : 'space-y-2'}>
        {question.options.map((option, index) => {
          const isSelected = localSelectedValues.includes(option.value);
          const isSkipOption = SKIP_VALUES.includes(option.value.toLowerCase()) || option.value.includes('상관없') || option.value.includes('전부 좋아요');
          const isDisabled = isSkipSelected && !isSkipOption;

          // 인기 옵션인지 확인 (해당 질문의 상위 3개)
          const popularOption = popularOptions.find(
            po => po.questionId === question.id && po.value === option.value && po.isPopular
          );
          const isPopular = !!popularOption;

          // 옵션별 제품 개수 계산
          const productCount = showProductCounts && products
            ? countProductsForOption(products, option)
            : null;

          // 0개인 옵션은 숨김 (단, skip 옵션이거나 수동 정의 질문은 항상 표시)
          // 수동 정의 질문: id가 "hf_"로 시작하지 않는 경우 (동적 생성은 hf_로 시작)
          const isManualQuestion = !question.id.startsWith('hf_');
          if (productCount === 0 && !isSkipOption && !isManualQuestion) {
            return null;
          }

          // 2열 그리드일 때 "전부 좋아요" 옵션은 전체 너비 차지
          const isFullWidth = question.options.length > 6 && isSkipOption;

          return (
            <motion.button
              key={option.value}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.02 }}
              onClick={() => handleOptionClick(option.value)}
              disabled={isDisabled}
              className={`${isFullWidth ? 'col-span-2' : ''} w-full p-3 rounded-xl border-2 text-left transition-all ${
                isDisabled
                  ? 'border-gray-100 bg-gray-50 cursor-not-allowed opacity-50'
                  : isSelected
                  ? 'border-blue-400 bg-blue-50'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center gap-2">
                {/* 체크박스 스타일 */}
                <div
                  className={`w-4 h-4 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${
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
                      className="w-2.5 h-2.5 text-white"
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
                  className={`text-sm font-medium flex-1 truncate ${
                    isDisabled
                      ? 'text-gray-400'
                      : isSelected
                      ? 'text-blue-700'
                      : 'text-gray-700'
                  }`}
                >
                  {option.label}
                </span>

                {/* 많이 선택 뱃지 - 2열일 때는 간소화 */}
                {isPopular && !isSkipOption && popularOption && (
                  <span className={`bg-green-100 text-green-600 font-semibold rounded-full shrink-0 ${
                    question.options.length > 6
                      ? 'px-1.5 py-0.5 text-[9px]'
                      : 'px-2 py-0.5 text-[10px]'
                  }`}>
                    {question.options.length > 6
                      ? `${popularOption.percentage}%`
                      : `${popularOption.percentage}% 선택`
                    }
                  </span>
                )}
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* AI 도움 바텀시트 - tipText가 있을 때만 렌더 */}
      {showAIHelper && tipText && (
        <AIHelperBottomSheet
          isOpen={isAIHelperOpen}
          onClose={() => setIsAIHelperOpen(false)}
          questionType="hard_filter"
          questionId={question.id}
          questionText={question.question}
          options={question.options.map(o => ({ value: o.value, label: o.label }))}
          category={category}
          categoryName={categoryName}
          tipText={tipText}
          onSelectOptions={(selectedOptions) => {
            setLocalSelectedValues(selectedOptions);
            onSelect(question.id, selectedOptions);
          }}
        />
      )}
    </motion.div>
  );
}
