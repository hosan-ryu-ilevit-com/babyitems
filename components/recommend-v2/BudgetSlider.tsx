'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import type { ProductItem } from '@/types/recommend-v2';
import { BudgetAIHelperBottomSheet } from './BudgetAIHelperBottomSheet';
import { AIHelperButton } from './AIHelperButton';

interface UserSelections {
  hardFilters?: Array<{ questionText: string; selectedLabels: string[] }>;
  balanceGames?: Array<{ title: string; selectedOption: string }>;
}

interface BudgetSliderProps {
  min: number;
  max: number;
  step: number;
  initialMin?: number;
  initialMax?: number;
  onChange: (values: { min: number; max: number }) => void;
  // 히스토그램용: 상품 목록
  products?: ProductItem[];
  // 로깅 콜백
  onDirectInput?: (min: number, max: number, productsInRange: number) => void;
  // AI 도움 관련
  showAIHelper?: boolean;
  category?: string;
  categoryName?: string;
  userSelections?: UserSelections;
  disabled?: boolean;
}

// 히스토그램 막대 개수
const HISTOGRAM_BARS = 30;

// 상품의 유효 가격 반환 (lowestPrice 우선, 없으면 price)
function getEffectivePrice(product: ProductItem): number | null {
  return product.lowestPrice ?? product.price;
}

/**
 * 에어비앤비 스타일 예산 슬라이더
 * - 가격 분포 히스토그램
 * - 양쪽 핸들 드래그
 * - 최저/최고 직접 입력 가능
 * - 프리셋 버튼
 */
export function BudgetSlider({
  min,
  max,
  step,
  initialMin,
  initialMax,
  onChange,
  products = [],
  onDirectInput,
  showAIHelper = false,
  category = '',
  categoryName = '',
  userSelections,
  disabled = false,
}: BudgetSliderProps) {
  // 디폴트를 '적정가' 범위로 설정 (전체 범위의 1/4 ~ 2/4 구간)
  const defaultMin = initialMin ?? Math.round(min + (max - min) / 4);
  const defaultMax = initialMax ?? Math.round(min + (max - min) / 2);

  const [minValue, setMinValue] = useState(defaultMin);
  const [maxValue, setMaxValue] = useState(defaultMax);
  const [isDraggingMin, setIsDraggingMin] = useState(false);
  const [isDraggingMax, setIsDraggingMax] = useState(false);
  const [isEditingMin, setIsEditingMin] = useState(false);
  const [isEditingMax, setIsEditingMax] = useState(false);
  const [minInputValue, setMinInputValue] = useState('');
  const [maxInputValue, setMaxInputValue] = useState('');
  const [isAIHelperOpen, setIsAIHelperOpen] = useState(false);
  const [isAIHelperAutoSubmit, setIsAIHelperAutoSubmit] = useState(false);
  const [aiHelperAutoSubmitText, setAiHelperAutoSubmitText] = useState<string | undefined>(undefined);
  const trackRef = useRef<HTMLDivElement>(null);
  const minInputRef = useRef<HTMLInputElement>(null);
  const maxInputRef = useRef<HTMLInputElement>(null);

  // 히스토그램 데이터 계산
  const histogramData = useMemo(() => {
    if (products.length === 0) {
      // 제품이 없으면 기본 분포 생성 (시각적 효과용)
      return Array(HISTOGRAM_BARS).fill(0).map((_, i) => {
        // 중앙이 높은 분포
        const center = HISTOGRAM_BARS / 2;
        const distance = Math.abs(i - center);
        return Math.max(0.1, 1 - (distance / center) * 0.8);
      });
    }

    const priceRange = max - min;
    const barWidth = priceRange / HISTOGRAM_BARS;
    const counts = Array(HISTOGRAM_BARS).fill(0);

    products.forEach(product => {
      const effectivePrice = getEffectivePrice(product);
      if (effectivePrice && effectivePrice >= min && effectivePrice <= max) {
        const barIndex = Math.min(
          Math.floor((effectivePrice - min) / barWidth),
          HISTOGRAM_BARS - 1
        );
        counts[barIndex]++;
      }
    });

    // 정규화 (0~1)
    const maxCount = Math.max(...counts, 1);
    return counts.map(c => c / maxCount);
  }, [products, min, max]);

  // 퍼센트 계산
  const getPercent = useCallback(
    (value: number) => ((value - min) / (max - min)) * 100,
    [min, max]
  );

  // 값을 step 단위로 맞추기
  const snapToStep = useCallback(
    (value: number) => {
      const snapped = Math.round(value / step) * step;
      return Math.max(min, Math.min(max, snapped));
    },
    [min, max, step]
  );

  // 포지션에서 값 계산
  const getValueFromPosition = useCallback(
    (clientX: number) => {
      if (!trackRef.current) return min;
      const rect = trackRef.current.getBoundingClientRect();
      const percent = (clientX - rect.left) / rect.width;
      const value = min + percent * (max - min);
      return snapToStep(value);
    },
    [min, max, snapToStep]
  );

  // 드래그 핸들러
  const handleMove = useCallback(
    (clientX: number) => {
      const value = getValueFromPosition(clientX);

      if (isDraggingMin) {
        const newMin = Math.min(value, maxValue - step);
        setMinValue(newMin);
        onChange({ min: newMin, max: maxValue });
      } else if (isDraggingMax) {
        const newMax = Math.max(value, minValue + step);
        setMaxValue(newMax);
        onChange({ min: minValue, max: newMax });
      }
    },
    [isDraggingMin, isDraggingMax, minValue, maxValue, step, getValueFromPosition, onChange]
  );

  // 마우스/터치 이벤트
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => handleMove(e.clientX);
    const handleTouchMove = (e: TouchEvent) => handleMove(e.touches[0].clientX);
    const handleEnd = () => {
      setIsDraggingMin(false);
      setIsDraggingMax(false);
    };

    if (isDraggingMin || isDraggingMax) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('touchmove', handleTouchMove);
      document.addEventListener('mouseup', handleEnd);
      document.addEventListener('touchend', handleEnd);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('mouseup', handleEnd);
      document.removeEventListener('touchend', handleEnd);
    };
  }, [isDraggingMin, isDraggingMax, handleMove]);

  // 트랙 클릭 시 가까운 핸들 이동
  const handleTrackClick = (e: React.MouseEvent) => {
    const value = getValueFromPosition(e.clientX);
    const distToMin = Math.abs(value - minValue);
    const distToMax = Math.abs(value - maxValue);

    if (distToMin < distToMax) {
      const newMin = Math.min(value, maxValue - step);
      setMinValue(newMin);
      onChange({ min: newMin, max: maxValue });
    } else {
      const newMax = Math.max(value, minValue + step);
      setMaxValue(newMax);
      onChange({ min: minValue, max: newMax });
    }
  };

  // 최저가 입력 시작
  const handleMinClick = () => {
    setIsEditingMin(true);
    setMinInputValue(minValue.toString());
    setTimeout(() => minInputRef.current?.focus(), 0);
  };

  // 최고가 입력 시작
  const handleMaxClick = () => {
    setIsEditingMax(true);
    setMaxInputValue(maxValue.toString());
    setTimeout(() => maxInputRef.current?.focus(), 0);
  };

  // 최저가 입력 완료
  const handleMinInputBlur = () => {
    setIsEditingMin(false);
    const parsed = parseInt(minInputValue.replace(/[^0-9]/g, ''), 10);
    if (!isNaN(parsed)) {
      const newMin = snapToStep(Math.max(min, Math.min(parsed, maxValue - step)));
      setMinValue(newMin);
      onChange({ min: newMin, max: maxValue });
      // 로깅 콜백 호출
      const productsCount = products.filter(p => {
        const ep = getEffectivePrice(p);
        return ep && ep >= newMin && ep <= maxValue;
      }).length;
      onDirectInput?.(newMin, maxValue, productsCount);
    }
  };

  // 최고가 입력 완료
  const handleMaxInputBlur = () => {
    setIsEditingMax(false);
    const parsed = parseInt(maxInputValue.replace(/[^0-9]/g, ''), 10);
    if (!isNaN(parsed)) {
      const newMax = snapToStep(Math.min(max, Math.max(parsed, minValue + step)));
      setMaxValue(newMax);
      onChange({ min: minValue, max: newMax });
      // 로깅 콜백 호출
      const productsCount = products.filter(p => {
        const ep = getEffectivePrice(p);
        return ep && ep >= minValue && ep <= newMax;
      }).length;
      onDirectInput?.(minValue, newMax, productsCount);
    }
  };

  // 숫자만 입력 허용 + 즉시 bar 반영
  const handleMinInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^0-9]/g, '');
    setMinInputValue(value);

    // 즉시 bar에 반영
    const parsed = parseInt(value, 10);
    if (!isNaN(parsed) && parsed >= min) {
      const newMin = snapToStep(Math.min(parsed, maxValue - step));
      setMinValue(newMin);
      onChange({ min: newMin, max: maxValue });
    }
  };

  const handleMaxInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^0-9]/g, '');
    setMaxInputValue(value);

    // 즉시 bar에 반영
    const parsed = parseInt(value, 10);
    if (!isNaN(parsed) && parsed >= minValue + step) {
      const newMax = snapToStep(Math.min(max, parsed));
      setMaxValue(newMax);
      onChange({ min: minValue, max: newMax });
    }
  };

  // Enter 키 처리
  const handleKeyDown = (e: React.KeyboardEvent, type: 'min' | 'max') => {
    if (e.key === 'Enter') {
      if (type === 'min') {
        handleMinInputBlur();
      } else {
        handleMaxInputBlur();
      }
    }
  };

  const minPercent = getPercent(minValue);
  const maxPercent = getPercent(maxValue);

  // 현재 범위 내 상품 개수
  const productsInRange = useMemo(() => {
    return products.filter(p => {
      const ep = getEffectivePrice(p);
      return ep && ep >= minValue && ep <= maxValue;
    }).length;
  }, [products, minValue, maxValue]);

  // AI 도움을 위한 가격대별 상품 분포 정보
  const priceRangeInfo = useMemo(() => {
    if (products.length === 0) return [];

    const ranges: { range: string; min: number; max: number; count: number }[] = [];
    const priceRange = max - min;
    const numRanges = 5; // 5개 구간으로 나눔
    const rangeSize = priceRange / numRanges;

    for (let i = 0; i < numRanges; i++) {
      const rangeMin = min + i * rangeSize;
      const rangeMax = i === numRanges - 1 ? max : min + (i + 1) * rangeSize;
      const count = products.filter(p => {
        const ep = getEffectivePrice(p);
        return ep && ep >= rangeMin && ep <= rangeMax;
      }).length;

      const formatPrice = (v: number) => {
        if (v >= 10000) return `${Math.round(v / 10000)}만원`;
        return `${v.toLocaleString()}원`;
      };

      ranges.push({
        range: `${formatPrice(rangeMin)} ~ ${formatPrice(rangeMax)}`,
        min: rangeMin,
        max: rangeMax,
        count,
      });
    }

    return ranges;
  }, [products, min, max]);

  // AI 추천 예산 적용
  const handleAIBudgetSelect = (aiMin: number, aiMax: number) => {
    setMinValue(aiMin);
    setMaxValue(aiMax);
    onChange({ min: aiMin, max: aiMax });
  };


  return (
    <motion.div
      initial={{ opacity: 0, y: 0 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      <div className="w-full h-[1px] bg-gray-100 mb-5" />

      {/* 헤더 */}
      <div className="flex items-center justify-between mb-1 px-4">
        <span className="text-[16px] text-gray-400 font-semibold">
          예산 설정
        </span>
      </div>

      <h3 className="text-[18px] font-semibold text-gray-900 mb-4 px-4">
        예산을 선택하세요 <span className="text-blue-500 font-bold">*</span>
      </h3>

      {/* AI 도움 버튼 */}
      {showAIHelper && (
        <div className="mb-6 px-4">
          <AIHelperButton
            onClick={() => {
              setAiHelperAutoSubmitText(undefined);
              setIsAIHelperAutoSubmit(false);
              setIsAIHelperOpen(true);
            }}
            label="어떤 예산이 좋은지 모르겠어요"
            questionType="budget"
            questionId="budget_slider"
            questionText="생각해 둔 예산이 있나요?"
            category={category}
            categoryName={categoryName}
            disabled={disabled}
          />
        </div>
      )}

      {/* 최저/최고 입력 영역 */}
      <div className={`flex items-center justify-between gap-4 px-4 mb-8 ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
        {/* 최저 */}
        <div className="flex-1">
          <div className="text-[14px] text-gray-400 font-medium mb-2">최저</div>
          <div
            onClick={() => !disabled && handleMinClick()}
            className="w-full px-5 py-4 text-[18px] font-semibold text-gray-800 bg-gray-50 rounded-2xl transition-colors text-left flex items-center justify-between cursor-pointer"
          >
            {isEditingMin ? (
              <input
                ref={minInputRef}
                type="text"
                inputMode="numeric"
                value={minInputValue}
                onChange={handleMinInputChange}
                onBlur={handleMinInputBlur}
                onKeyDown={(e) => handleKeyDown(e, 'min')}
                className="w-full bg-transparent outline-none p-0"
                autoFocus
                disabled={disabled}
              />
            ) : (
              <span>{minValue.toLocaleString()}원</span>
            )}
          </div>
        </div>

        {/* 최고 */}
        <div className="flex-1">
          <div className="text-[14px] text-gray-400 font-medium mb-2">최고</div>
          <div
            onClick={() => !disabled && handleMaxClick()}
            className="w-full px-5 py-4 text-[18px] font-semibold text-gray-800 bg-gray-50 rounded-2xl transition-colors text-left flex items-center justify-between cursor-pointer"
          >
            {isEditingMax ? (
              <input
                ref={maxInputRef}
                type="text"
                inputMode="numeric"
                value={maxInputValue}
                onChange={handleMaxInputChange}
                onBlur={handleMaxInputBlur}
                onKeyDown={(e) => handleKeyDown(e, 'max')}
                className="w-full bg-transparent outline-none p-0"
                autoFocus
                disabled={disabled}
              />
            ) : (
              <span>{maxValue.toLocaleString()}원{maxValue >= max ? '+' : ''}</span>
            )}
          </div>
        </div>
      </div>

      {/* 히스토그램 + 슬라이더 */}
      <div className={`relative pt-4 px-2 ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
        {/* 히스토그램 */}
        <div className="flex items-end h-24 gap-[2px] px-4 justify-center">
          {histogramData.map((height, index) => {
            const barPercent = (index / HISTOGRAM_BARS) * 100;
            const isInRange = barPercent >= minPercent && barPercent <= maxPercent;

            return (
              <div
                key={index}
                className={`flex-1 min-w-[2px] max-w-[15px] rounded-t-[2px] transition-colors duration-200 ${
                  isInRange ? 'bg-[#3B82F6]' : 'bg-gray-200'
                }`}
                style={{ height: `${Math.max(height * 100, 4)}%` }}
              />
            );
          })}
        </div>

        {/* 슬라이더 트랙 */}
        <div className="px-4 mt-[-2px] relative z-10">
          <div
            ref={trackRef}
            className="relative h-[2px] bg-gray-200"
            onClick={handleTrackClick}
          >
            {/* 선택된 범위 */}
            <div
              className="absolute h-full bg-[#3B82F6]"
              style={{
                left: `${minPercent}%`,
                width: `${maxPercent - minPercent}%`,
              }}
            />

            {/* Min 핸들 */}
            <div
              className={`absolute w-8 h-8 -mt-[15px] -ml-4 bg-white border border-gray-200 rounded-full shadow-md cursor-grab active:cursor-grabbing transition-all flex items-center justify-center gap-[2px] ${
                isDraggingMin ? 'scale-110 shadow-lg' : ''
              }`}
              style={{ left: `${minPercent}%` }}
              onMouseDown={(e) => {
                e.stopPropagation();
                setIsDraggingMin(true);
              }}
              onTouchStart={(e) => {
                e.stopPropagation();
                setIsDraggingMin(true);
              }}
            >
              <div className="w-[1.5px] h-3 bg-gray-300 rounded-full" />
              <div className="w-[1.5px] h-3 bg-gray-300 rounded-full" />
              <div className="w-[1.5px] h-3 bg-gray-300 rounded-full" />
            </div>

            {/* Max 핸들 */}
            <div
              className={`absolute w-8 h-8 -mt-[15px] -ml-4 bg-white border border-gray-200 rounded-full shadow-md cursor-grab active:cursor-grabbing transition-all flex items-center justify-center gap-[2px] ${
                isDraggingMax ? 'scale-110 shadow-lg' : ''
              }`}
              style={{ left: `${maxPercent}%` }}
              onMouseDown={(e) => {
                e.stopPropagation();
                setIsDraggingMax(true);
              }}
              onTouchStart={(e) => {
                e.stopPropagation();
                setIsDraggingMax(true);
              }}
            >
              <div className="w-[1.5px] h-3 bg-gray-300 rounded-full" />
              <div className="w-[1.5px] h-3 bg-gray-300 rounded-full" />
              <div className="w-[1.5px] h-3 bg-gray-300 rounded-full" />
            </div>
          </div>
        </div>
      </div>

      {/* 상품 개수 정보 (선택사항) */}
      {products.length > 0 && (
        <div className="text-center pt-2">
          <span className="text-[13px] text-gray-400">
            선택 범위 내 <span className="font-semibold text-blue-500">{productsInRange}개</span> 상품이 있어요
          </span>
        </div>
      )}

      {/* AI 예산 도움 바텀시트 */}
      {showAIHelper && (
        <BudgetAIHelperBottomSheet
          isOpen={isAIHelperOpen}
          onClose={() => {
            setIsAIHelperOpen(false);
            setIsAIHelperAutoSubmit(false);
            setAiHelperAutoSubmitText(undefined);
          }}
          category={category}
          categoryName={categoryName}
          priceRangeInfo={priceRangeInfo}
          totalProducts={products.length}
          currentMin={minValue}
          currentMax={maxValue}
          sliderMin={min}
          sliderMax={max}
          onSelectBudget={handleAIBudgetSelect}
          userSelections={userSelections}
          autoSubmitContext={isAIHelperAutoSubmit}
          autoSubmitText={aiHelperAutoSubmitText}
        />
      )}
    </motion.div>
  );
}
