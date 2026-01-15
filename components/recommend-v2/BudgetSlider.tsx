'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import type { ProductItem } from '@/types/recommend-v2';
import { CATEGORY_BUDGET_PRESETS } from '@/types/recommend-v2';
import { BudgetAIHelperBottomSheet } from './BudgetAIHelperBottomSheet';
import { AIHelperButton } from './AIHelperButton';

// 예산 프리셋 타입
export type BudgetPresetType = 'all' | 'budget' | 'standard' | 'premium';

export interface BudgetPreset {
  type: BudgetPresetType;
  label: string;
  min: number;
  max: number;
  count: number; // 해당 범위 내 제품 수
}

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
  // 프리셋 클릭 콜백
  onPresetClick?: (preset: BudgetPresetType, min: number, max: number, productsInRange: number) => void;
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
  onPresetClick,
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

  // Mount 시 상위 컴포넌트에 현재(기본값) 상태 전달
  useEffect(() => {
    onChange({ min: defaultMin, max: defaultMax });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    if (priceRange <= 0) {
      return Array(HISTOGRAM_BARS).fill(0.5);
    }
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
    (value: number) => {
      const range = max - min;
      if (range <= 0) return 0;
      return ((value - min) / range) * 100;
    },
    [min, max]
  );

  // 값을 step 단위로 맞추기
  const snapToStep = useCallback(
    (value: number) => {
      if (step <= 0) return value;
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
      const range = max - min;
      if (range <= 0 || rect.width <= 0) return min;
      const percent = (clientX - rect.left) / rect.width;
      const value = min + percent * range;
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
    if (products.length === 0 || max <= min) return [];

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

  // 예산 프리셋 계산 (도메인 지식 + 실제 제품 분포 혼합)
  const budgetPresets = useMemo((): BudgetPreset[] => {
    if (products.length === 0) {
      // 제품이 없으면 기본 프리셋만 반환
      return [
        { type: 'all', label: '전체', min, max, count: 0 },
        { type: 'budget', label: '가성비', min, max: Math.round(min + (max - min) * 0.25), count: 0 },
        { type: 'standard', label: '평균', min: Math.round(min + (max - min) * 0.25), max: Math.round(min + (max - min) * 0.75), count: 0 },
        { type: 'premium', label: '프리미엄', min: Math.round(min + (max - min) * 0.75), max, count: 0 },
      ];
    }

    // 제품 가격 추출 및 정렬
    const prices = products
      .map(p => getEffectivePrice(p))
      .filter((p): p is number => p !== null && p > 0)
      .sort((a, b) => a - b);

    if (prices.length === 0) {
      return [{ type: 'all', label: '전체', min, max, count: 0 }];
    }

    const actualMin = prices[0];
    const actualMax = prices[prices.length - 1];

    // 도메인 지식 기준점 가져오기
    const thresholds = CATEGORY_BUDGET_PRESETS[category];

    let budgetMax: number;
    let standardMax: number;

    if (thresholds) {
      // 도메인 지식이 있으면 실제 가격 범위에 맞게 조정
      budgetMax = Math.min(thresholds.budgetMax, actualMax);
      standardMax = Math.min(thresholds.standardMax, actualMax);

      // 가성비 상한이 실제 최저가보다 낮으면 조정
      if (budgetMax < actualMin) {
        budgetMax = Math.round(actualMin + (actualMax - actualMin) * 0.3);
      }
      // 평균 상한이 가성비 상한보다 낮으면 조정
      if (standardMax <= budgetMax) {
        standardMax = Math.round(budgetMax + (actualMax - budgetMax) * 0.6);
      }
    } else {
      // 도메인 지식이 없으면 분위수 사용
      const p30Index = Math.floor(prices.length * 0.3);
      const p70Index = Math.floor(prices.length * 0.7);
      budgetMax = prices[p30Index] || actualMax;
      standardMax = prices[p70Index] || actualMax;
    }

    // 각 프리셋 범위 내 제품 수 계산
    const countInRange = (minP: number, maxP: number) =>
      prices.filter(p => p >= minP && p <= maxP).length;

    const presets: BudgetPreset[] = [
      {
        type: 'all',
        label: '전체',
        min: actualMin,
        max: actualMax,
        count: prices.length
      },
      {
        type: 'budget',
        label: '가성비',
        min: actualMin,
        max: budgetMax,
        count: countInRange(actualMin, budgetMax)
      },
      {
        type: 'standard',
        label: '평균',
        min: budgetMax,
        max: standardMax,
        count: countInRange(budgetMax, standardMax)
      },
      {
        type: 'premium',
        label: '프리미엄',
        min: standardMax,
        max: actualMax,
        count: countInRange(standardMax, actualMax)
      },
    ];

    // 제품이 0개인 프리셋은 제외 (전체는 항상 포함)
    return presets.filter(p => p.type === 'all' || p.count > 0);
  }, [products, category, min, max]);

  // 선택된 프리셋 상태
  const [selectedPreset, setSelectedPreset] = useState<BudgetPresetType | null>(null);

  // 프리셋 클릭 핸들러
  const handlePresetClick = (preset: BudgetPreset) => {
    setSelectedPreset(preset.type);
    setMinValue(preset.min);
    setMaxValue(preset.max);
    onChange({ min: preset.min, max: preset.max });
    onPresetClick?.(preset.type, preset.min, preset.max, preset.count);
  };

  // 슬라이더 수동 조작 시 프리셋 선택 해제
  useEffect(() => {
    // 현재 값이 어떤 프리셋과도 정확히 일치하지 않으면 선택 해제
    const matchingPreset = budgetPresets.find(
      p => p.min === minValue && p.max === maxValue
    );
    if (!matchingPreset) {
      setSelectedPreset(null);
    }
  }, [minValue, maxValue, budgetPresets]);

  // AI 추천 예산 적용
  const handleAIBudgetSelect = (aiMin: number, aiMax: number) => {
    setSelectedPreset(null); // AI 선택 시 프리셋 해제
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
      <div className="flex items-center justify-between mb-1">
        <span className="text-[14px] text-gray-400 font-semibold">
          예산 설정
        </span>
      </div>

      <h3 className="text-[18px] font-semibold text-gray-900 mb-4">
        가격 범위를 정해주세요! <br></br>그 안에서 추천드려요.
      </h3>

      {/* 예산 프리셋 버튼 */}
      {budgetPresets.length > 1 && (
        <div className={`flex gap-2 mb-4 ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
          {budgetPresets.map((preset) => {
            const isSelected = selectedPreset === preset.type;
            return (
              <button
                key={preset.type}
                onClick={() => handlePresetClick(preset)}
                disabled={disabled}
                className={`flex-1 py-2.5 px-3 rounded-xl text-[14px] font-medium transition-all border ${
                  isSelected
                    ? 'bg-blue-50 border-blue-100'
                    : 'bg-white border-gray-100 hover:border-gray-200'
                }`}
              >
                <div className={isSelected ? 'text-blue-500 font-semibold' : 'text-gray-600'}>{preset.label}</div>
                <div className={`text-[11px] mt-0.5 ${isSelected ? 'text-blue-400' : 'text-gray-400'}`}>
                  {preset.count}개
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* AI 도움 버튼 */}
      {showAIHelper && (
        <div className="mb-6">
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

      {/* 히스토그램 + 슬라이더 */}
      <div className={`relative pt-4 ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
        {/* 히스토그램 */}
        <div className="flex items-end h-24 gap-[2px] justify-center">
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
        <div className="mt-[-2px] relative z-10">
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

      {/* 최저/최고 입력 영역 */}
      <div className={`flex items-center justify-between gap-4 py-4 ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
        {/* 최저 */}
        <div className="flex-1">
          <div className="text-[14px] text-gray-400 font-medium mb-2">최저</div>
          <div
            onClick={() => !disabled && handleMinClick()}
            className="w-full p-3.5 text-[18px] font-semibold text-gray-800 bg-gray-50 rounded-2xl transition-colors text-left flex items-center justify-between cursor-pointer"
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
            className="w-full p-3.5 text-[18px] font-semibold text-gray-800 bg-gray-50 rounded-2xl transition-colors text-left flex items-center justify-between cursor-pointer"
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
