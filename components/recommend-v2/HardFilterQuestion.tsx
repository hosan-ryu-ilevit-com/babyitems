'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { HardFilterData, ProductItem, UserSelections } from '@/types/recommend-v2';
import { AIHelperButton } from './AIHelperButton';
import { AIHelperBottomSheet } from './AIHelperBottomSheet';
import DirectInputField from './DirectInputField';

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
  showAIHelper = false,
  category = '',
  categoryName = '',
  thumbnailProducts = [],
  products = [],
  userSelections,
  onNaturalLanguageInput,
  preselectedTags = [],
  preselectedExplanation = '',
  isLoadingPreselection = false,
  userContext,
}: {
  question: HardFilterData['question'];
  selectedValues: string[];
  onSelect: (values: string[]) => void;
  currentIndex: number;
  totalCount: number;
  showAIHelper?: boolean;
  category?: string;
  categoryName?: string;
  thumbnailProducts?: Array<{ id: string; title: string; thumbnail?: string }>;
  products?: ProductItem[];
  userSelections?: UserSelections;
  onNaturalLanguageInput?: (stage: string, input: string) => void;
  preselectedTags?: string[];
  preselectedExplanation?: string;
  isLoadingPreselection?: boolean;
  userContext?: string | null;
}) {
  const [expandedTag, setExpandedTag] = useState<string | null>(null);
  const [isAIHelperOpen, setIsAIHelperOpen] = useState(false);
  const [isAIHelperAutoSubmit, setIsAIHelperAutoSubmit] = useState(false);
  const [aiHelperAutoSubmitText, setAiHelperAutoSubmitText] = useState<string | undefined>(undefined);

  // 컨텍스트 정보가 있는지 확인
  const hasContext = !!userContext || 
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

  // 랜덤 offset (0~50, 컴포넌트 마운트 시 한 번만 생성)
  const [randomOffset] = useState(() => Math.floor(Math.random() * 51));
  // preselectedTags의 이전 값 추적 (변경 감지용)
  const prevPreselectedTagsRef = useRef<string[]>([]);
  // 적용된 태그 추적 (어떤 태그가 적용되었는지)
  const appliedTagsRef = useRef<string[]>([]);

  // 미리 선택 적용
  useEffect(() => {
    // preselectedTags가 변경되었는지 확인
    const tagsChanged = JSON.stringify(preselectedTags) !== JSON.stringify(prevPreselectedTagsRef.current);

    if (!tagsChanged) return; // 변경 없으면 스킵

    prevPreselectedTagsRef.current = preselectedTags || [];

    if (!preselectedTags || preselectedTags.length === 0) {
      appliedTagsRef.current = [];
      return;
    }

    console.log('🔄 preselectedTags changed, applying new selection');

    // 옵션 값과 태그 키 매핑 (체감속성_ 제외한 부분으로 비교)
    const matchingValues: string[] = [];
    for (const option of question.options) {
      const optionValue = option.value;
      // 태그 키가 체감속성_xxx_yyy 형식일 때, option.value도 체감속성_xxx_yyy 형식인지 확인
      if (preselectedTags.includes(optionValue)) {
        matchingValues.push(optionValue);
      }
    }

    if (matchingValues.length > 0) {
      appliedTagsRef.current = matchingValues;
      onSelect(matchingValues);
      console.log('🎯 Applied preselected experience tags:', matchingValues);
    }
  }, [preselectedTags, question.options, onSelect]);

  // UI 표시 여부 계산 (선택된 값이 있고 preselected 태그가 있으면 표시)
  const showPreselectionExplanation = userContext && preselectedTags.length > 0 && selectedValues.length > 0 && preselectedExplanation;

  // 전체 리뷰 개수 계산 (products의 reviewCount 합계 + 랜덤 offset)
  const totalReviewCount = useMemo(() => {
    const baseCount = products.reduce((sum, p) => {
      const reviewCount = p.reviewCount || 0;
      return sum + reviewCount;
    }, 0);
    return baseCount + randomOffset;
  }, [products, randomOffset]);

  const handleTagClick = (optionValue: string) => {
    const newValues = selectedValues.includes(optionValue)
      ? selectedValues.filter(v => v !== optionValue)
      : [...selectedValues, optionValue];
    onSelect(newValues);
  };

  // 총 리뷰 언급 수 계산 (태그별 percentage 계산용)
  const totalMentions = question.options.reduce((sum, opt) => sum + (opt.mentionCount || 0), 0);

  return (
    <motion.div
      key={question.id}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-4"
    >
     

      {/* 메인 질문 - 순차적 페이드인 */}
      <motion.div
        initial={{ opacity: 0, y: 0 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.5 }}
        className="space-y-3"
      >
        <div className="space-y-2">
          <h3 className="text-base font-semibold text-gray-900 leading-snug">
            중요하게 생각하시는 <br></br> {categoryName || category} 구매조건을 골라주세요
          </h3>
            {/* 썸네일 + N개 리뷰 분석 완료 태그 */}
        <div className="flex items-center gap-3">
          {/* 썸네일 그룹 (최대 5개) */}
          <div className="flex -space-x-2">
            {thumbnailProducts.slice(0, 5).map((product, i) => (
              <div
                key={product.id}
                className="w-8 h-8 rounded-full border-2 border-white overflow-hidden relative bg-gray-100 shadow-sm"
                style={{ zIndex: 5 - i }}
                title={product.title}
              >
                {product.thumbnail ? (
                  <img
                    src={product.thumbnail}
                    alt={product.title}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      // 이미지 로드 실패 시 placeholder
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-gray-100 to-gray-200" />
                )}
              </div>
            ))}
          </div>
          <span className="px-2.5 py-1 bg-gray-100 text-gray-500 text-xs font-semibold rounded-full">
            리뷰 {totalReviewCount.toLocaleString()}개 분석
          </span>
        </div>
         
        </div>

        {/* 뭘 골라야할지 모르겠어요 버튼 - AIHelperButton 사용 */}
        {/* 컨텍스트 입력으로 체감속성 미리 선택된 경우 또는 로딩 중 숨김 */}
        {showAIHelper && preselectedTags.length === 0 && !isLoadingPreselection && (
          <AIHelperButton
            onClick={() => setIsAIHelperOpen(true)}
            questionType="hard_filter"
            questionId={question.id}
            questionText="어떤 구매조건이 가장 중요하신가요?"
            category={category}
            categoryName={categoryName}
            step={currentIndex}
            hasContext={hasContext}
            onContextRecommend={handleContextRecommend}
            onPopularRecommend={handlePopularRecommend}
          />
        )}

       
      </motion.div>

      {/* 필터 옵션들 - 순차적 페이드인 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.8 }}
        className="flex flex-wrap gap-2"
      >
        {question.options.map((option, index) => {
          const isSelected = selectedValues.includes(option.value);
          // mentionCount를 percentage로 변환
          const percentage = option.mentionCount && totalMentions > 0
            ? Math.round((option.mentionCount / totalMentions) * 100)
            : 0;

          return (
            <motion.div
              key={option.value}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.8 + index * 0.03 }}
            >
              <button
                onClick={() => handleTagClick(option.value)}
                onMouseEnter={() => setExpandedTag(option.value)}
                onMouseLeave={() => setExpandedTag(null)}
                className={`
                  px-4 py-2.5 rounded-full text-sm font-medium border-2
                  transition-all duration-200
                  ${isSelected
                    ? 'bg-purple-50 text-purple-700 border-purple-500'
                    : 'bg-white text-gray-700 border-gray-100 hover:border-purple-300 hover:bg-purple-50'
                  }
                `}
              >
                <span className="flex items-center gap-2">
                  {/* 레이블 */}
                  <span>{option.displayLabel || option.label}</span>

                  {/* 언급 비율 배지 (%) */}
                  {percentage > 0 && (
                    <span className={`
                      px-1.5 py-0.5 rounded-full text-[10px] font-bold
                      ${isSelected
                        ? 'bg-green-200 text-green-700'
                        : 'bg-green-100 text-green-600'
                      }
                    `}>
                      {percentage}%
                    </span>
                  )}
                </span>
              </button>
            </motion.div>
          );
        })}
      </motion.div>

       {/* 미리 선택 설명 (AI 생성) - 로딩 스켈레톤 또는 실제 콘텐츠 */}
        {userContext && (isLoadingPreselection || showPreselectionExplanation) && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-purple-50 rounded-xl p-4 space-y-3"
          >
            {/* 사용자 입력 표시 */}
            <div className="flex items-start gap-2">
              <p className="text-sm text-gray-400 leading-relaxed">{userContext}</p>
            </div>

            {/* AI 설명 - 로딩 또는 실제 콘텐츠 */}
            <div className="flex items-start gap-2">
              <div className="flex-1 text-sm">
                {isLoadingPreselection ? (
                  /* 스켈레톤 로딩 */
                  <div className="space-y-2">
                    <div className="h-4 bg-purple-200/50 rounded animate-pulse w-full" />
                    <div className="h-4 bg-purple-200/50 rounded animate-pulse w-3/4" />
                  </div>
                ) : (
                  <div className="text-purple-800 leading-relaxed">
                    {/* **bold** 마크다운을 실제 볼드로 변환 */}
                    {preselectedExplanation.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
                      if (part.startsWith('**') && part.endsWith('**')) {
                        return <strong key={i} className="text-purple-600">{part.slice(2, -2)}</strong>;
                      }
                      return part;
                    })}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

     

      {/* AI 도움 바텀시트 */}
      {showAIHelper && (
        <AIHelperBottomSheet
          isOpen={isAIHelperOpen}
          onClose={() => {
            setIsAIHelperOpen(false);
            setIsAIHelperAutoSubmit(false);
            setAiHelperAutoSubmitText(undefined);
          }}
          questionType="hard_filter"
          questionId={question.id}
          questionText={question.question}
          options={question.options.map(o => ({ value: o.value, label: o.displayLabel || o.label }))}
          category={category}
          categoryName={categoryName}
          tipText={question.tip || '리뷰 분석을 통해 추출한 핵심 선택 기준입니다'}
          onSelectOptions={(selectedOptions) => {
            onSelect(selectedOptions);
          }}
          userSelections={userSelections}
          onNaturalLanguageInput={onNaturalLanguageInput}
          autoSubmitContext={isAIHelperAutoSubmit}
          autoSubmitText={aiHelperAutoSubmitText}
        />
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
  // 썸네일에 표시할 제품들 (최대 5개, review_priorities용)
  thumbnailProducts?: Array<{ id: string; title: string; thumbnail?: string }>;
  // 이전 선택 정보 (AI Helper용)
  userSelections?: UserSelections;
  onNaturalLanguageInput?: (stage: string, input: string) => void;
  // 미리 선택된 체감속성 태그 (Step -1 컨텍스트 입력 기반)
  preselectedTags?: string[];
  preselectedExplanation?: string;
  isLoadingPreselection?: boolean;
  userContext?: string | null;
  // 직접 입력 기능
  directInputValue?: string;
  onDirectInputChange?: (value: string) => void;
  isDirectInputRegistered?: boolean;
  onDirectInputRegister?: (value: string) => void;
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
  thumbnailProducts = [],
  userSelections,
  onNaturalLanguageInput,
  preselectedTags = [],
  preselectedExplanation = '',
  isLoadingPreselection = false,
  userContext,
  directInputValue = '',
  onDirectInputChange,
  isDirectInputRegistered = false,
  onDirectInputRegister,
}: HardFilterQuestionProps) {
  const { question, currentIndex, totalCount, selectedValues: initialValues } = data;

  // dynamicTip이 있으면 우선 사용, 없으면 question.tip 사용
  const tipText = dynamicTip || data.dynamicTip || question.tip;

  // 로컬 선택 상태 (부모에서 전달받은 값으로 초기화)
  const [localSelectedValues, setLocalSelectedValues] = useState<string[]>(initialValues || []);

  // AI 도움 바텀시트 상태
  const [isAIHelperOpen, setIsAIHelperOpen] = useState(false);
  const [isAIHelperAutoSubmit, setIsAIHelperAutoSubmit] = useState(false);
  const [aiHelperAutoSubmitText, setAiHelperAutoSubmitText] = useState<string | undefined>(undefined);

  // 컨텍스트 정보가 있는지 확인
  const hasContext = !!userContext || 
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
        showAIHelper={showAIHelper}
        category={category}
        categoryName={categoryName}
        thumbnailProducts={thumbnailProducts}
        products={products}
        userSelections={userSelections}
        onNaturalLanguageInput={onNaturalLanguageInput}
        preselectedTags={preselectedTags}
        preselectedExplanation={preselectedExplanation}
        isLoadingPreselection={isLoadingPreselection}
        userContext={userContext}
      />
    );
  }

  return (
    <motion.div
      key={question.id}
      initial={{ opacity: 0, y: 0 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.3 }}
      className="space-y-3"
    >
      {/* 질문 헤더 */}
      <div className="flex items-center justify-between">
        <span className="px-2.5 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-bold">
          Q{currentIndex + 1}
        </span>
        <span className="text-xs text-gray-400 font-medium">
          {currentIndex + 1} / {totalCount}
        </span>
      </div>

      {/* 질문 텍스트 */}
      <h3 className="text-[19px] font-bold text-gray-900 leading-snug">
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
        <AIHelperButton
          onClick={() => setIsAIHelperOpen(true)}
          questionType="hard_filter"
          questionId={question.id}
          questionText={question.question}
          category={category}
          categoryName={categoryName}
          step={currentIndex}
          hasContext={hasContext}
          onContextRecommend={handleContextRecommend}
          onPopularRecommend={handlePopularRecommend}
        />
      )}

      {/* 선택지 - 6개 초과 시 2열 그리드 */}
      <div className={question.options.length > 6 ? 'grid grid-cols-2 gap-2.5' : 'space-y-2.5'}>
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
              initial={{ opacity: 0, y: 0 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.02 }}
              onClick={() => handleOptionClick(option.value)}
              disabled={isDisabled}
              className={`${isFullWidth ? 'col-span-2' : ''} w-full p-4 rounded-xl border text-left transition-all relative overflow-hidden ${
                isDisabled
                  ? 'border-gray-100 bg-gray-50 cursor-not-allowed opacity-50'
                  : isSelected
                  ? 'border-purple-500 bg-purple-50 shadow-sm'
                  : 'border-gray-200 bg-white hover:border-purple-200 hover:bg-purple-50/30 hover:shadow-md'
              }`}
            >
              <div className="flex items-center gap-3">
                {/* 체크박스 스타일 */}
                <div
                  className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-all ${
                    isDisabled
                      ? 'border-gray-200 bg-gray-100'
                      : isSelected
                      ? 'border-purple-500 bg-purple-500'
                      : 'border-gray-300 bg-white group-hover:border-purple-300'
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
                  className={`text-[15px] font-medium flex-1 truncate ${
                    isDisabled
                      ? 'text-gray-400'
                      : isSelected
                      ? 'text-purple-900'
                      : 'text-gray-700'
                  }`}
                >
                  {option.label}
                </span>

                {/* 많이 선택 뱃지 - 2열일 때는 간소화 */}
                {isPopular && !isSkipOption && popularOption && (
                  <span className={`bg-purple-100 text-purple-600 font-bold rounded-full shrink-0 ${
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

      {/* 직접 입력 필드 */}
      {onDirectInputChange && (
        <DirectInputField
          value={directInputValue}
          onChange={onDirectInputChange}
          placeholder="원하는 조건을 직접 입력해주세요"
          filterType="hard_filter"
          isRegistered={isDirectInputRegistered}
          onRegister={onDirectInputRegister}
        />
      )}

      {/* AI 도움 바텀시트 - tipText가 있을 때만 렌더 */}
      {showAIHelper && tipText && (
        <AIHelperBottomSheet
          isOpen={isAIHelperOpen}
          onClose={() => {
            setIsAIHelperOpen(false);
            setIsAIHelperAutoSubmit(false);
            setAiHelperAutoSubmitText(undefined);
          }}
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
          userSelections={userSelections}
          onNaturalLanguageInput={onNaturalLanguageInput}
          autoSubmitContext={isAIHelperAutoSubmit}
          autoSubmitText={aiHelperAutoSubmitText}
        />
      )}
    </motion.div>
  );
}
