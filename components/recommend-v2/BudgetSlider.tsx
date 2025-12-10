'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import type { ProductItem } from '@/types/recommend-v2';

interface BudgetSliderProps {
  min: number;
  max: number;
  step: number;
  initialMin?: number;
  initialMax?: number;
  onChange: (values: { min: number; max: number }) => void;
  formatValue?: (value: number) => string;
  // 히스토그램용: 상품 목록
  products?: ProductItem[];
  // 로깅 콜백
  onPresetClick?: (preset: string, min: number, max: number, productsInRange: number) => void;
  onDirectInput?: (min: number, max: number, productsInRange: number) => void;
}

// 히스토그램 막대 개수
const HISTOGRAM_BARS = 30;

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
  formatValue = (v) => `${(v / 10000).toFixed(0)}만원`,
  products = [],
  onPresetClick,
  onDirectInput,
}: BudgetSliderProps) {
  const [minValue, setMinValue] = useState(initialMin ?? min);
  const [maxValue, setMaxValue] = useState(initialMax ?? max);
  const [isDraggingMin, setIsDraggingMin] = useState(false);
  const [isDraggingMax, setIsDraggingMax] = useState(false);
  const [isEditingMin, setIsEditingMin] = useState(false);
  const [isEditingMax, setIsEditingMax] = useState(false);
  const [minInputValue, setMinInputValue] = useState('');
  const [maxInputValue, setMaxInputValue] = useState('');
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
      if (product.price && product.price >= min && product.price <= max) {
        const barIndex = Math.min(
          Math.floor((product.price - min) / barWidth),
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
      const productsCount = products.filter(p => p.price && p.price >= newMin && p.price <= maxValue).length;
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
      const productsCount = products.filter(p => p.price && p.price >= minValue && p.price <= newMax).length;
      onDirectInput?.(minValue, newMax, productsCount);
    }
  };

  // 숫자만 입력 허용
  const handleMinInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^0-9]/g, '');
    setMinInputValue(value);
  };

  const handleMaxInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^0-9]/g, '');
    setMaxInputValue(value);
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
    return products.filter(p => p.price && p.price >= minValue && p.price <= maxValue).length;
  }, [products, minValue, maxValue]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <span className="px-2.5 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-bold">
          예산 범위
        </span>
        {products.length > 0 && (
          <span className="text-xs text-gray-500">
            선택 범위 내 <span className="font-semibold text-amber-600">{productsInRange}개</span> 상품
          </span>
        )}
      </div>

      <h3 className="text-base font-bold text-gray-900">
        생각해 둔 예산이 있나요?
      </h3>

      {/* 히스토그램 + 슬라이더 */}
      <div className="relative pt-2">
        {/* 히스토그램 */}
        <div className="flex items-end h-20 gap-[2px] px-3">
          {histogramData.map((height, index) => {
            const barPercent = (index / HISTOGRAM_BARS) * 100;
            const isInRange = barPercent >= minPercent && barPercent <= maxPercent;

            return (
              <div
                key={index}
                className={`flex-1 rounded-t-sm transition-colors duration-200 ${
                  isInRange ? 'bg-amber-400' : 'bg-gray-200'
                }`}
                style={{ height: `${Math.max(height * 100, 4)}%` }}
              />
            );
          })}
        </div>

        {/* 슬라이더 트랙 */}
        <div className="px-3 mt-1">
          <div
            ref={trackRef}
            className="relative h-1 bg-gray-200 rounded-full cursor-pointer"
            onClick={handleTrackClick}
          >
            {/* 선택된 범위 */}
            <div
              className="absolute h-full bg-amber-400 rounded-full"
              style={{
                left: `${minPercent}%`,
                width: `${maxPercent - minPercent}%`,
              }}
            />

            {/* Min 핸들 */}
            <div
              className={`absolute w-7 h-7 -mt-3 -ml-3.5 bg-white border-2 rounded-full shadow-lg cursor-grab active:cursor-grabbing transition-all ${
                isDraggingMin ? 'border-amber-500 scale-110 shadow-xl' : 'border-gray-300'
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
            />

            {/* Max 핸들 */}
            <div
              className={`absolute w-7 h-7 -mt-3 -ml-3.5 bg-white border-2 rounded-full shadow-lg cursor-grab active:cursor-grabbing transition-all ${
                isDraggingMax ? 'border-amber-500 scale-110 shadow-xl' : 'border-gray-300'
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
            />
          </div>
        </div>
      </div>

      {/* 최저/최고 입력 영역 */}
      <div className="flex items-center justify-between gap-4 px-1">
        {/* 최저 */}
        <div className="flex-1">
          <div className="text-xs text-gray-500 mb-1">최저</div>
          {isEditingMin ? (
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">₩</span>
              <input
                ref={minInputRef}
                type="text"
                inputMode="numeric"
                value={minInputValue}
                onChange={handleMinInputChange}
                onBlur={handleMinInputBlur}
                onKeyDown={(e) => handleKeyDown(e, 'min')}
                className="w-full pl-7 pr-3 py-2.5 text-base font-semibold border-2 border-amber-400 rounded-full outline-none bg-white"
              />
            </div>
          ) : (
            <button
              onClick={handleMinClick}
              className="w-full px-4 py-2.5 text-base font-semibold text-gray-800 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors text-left"
            >
              ₩{minValue.toLocaleString()}
            </button>
          )}
        </div>

        <div className="text-gray-300 font-light text-2xl mt-5">—</div>

        {/* 최고 */}
        <div className="flex-1">
          <div className="text-xs text-gray-500 mb-1">최고</div>
          {isEditingMax ? (
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">₩</span>
              <input
                ref={maxInputRef}
                type="text"
                inputMode="numeric"
                value={maxInputValue}
                onChange={handleMaxInputChange}
                onBlur={handleMaxInputBlur}
                onKeyDown={(e) => handleKeyDown(e, 'max')}
                className="w-full pl-7 pr-3 py-2.5 text-base font-semibold border-2 border-amber-400 rounded-full outline-none bg-white"
              />
              {maxValue >= max && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">+</span>
              )}
            </div>
          ) : (
            <button
              onClick={handleMaxClick}
              className="w-full px-4 py-2.5 text-base font-semibold text-gray-800 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors text-left"
            >
              ₩{maxValue.toLocaleString()}{maxValue >= max ? '+' : ''}
            </button>
          )}
        </div>
      </div>

      {/* 빠른 선택 버튼 */}
      <div className="flex flex-wrap gap-2 justify-center pt-2">
        {generateQuickOptions(min, max).map((option) => {
          const isSelected = minValue === option.min && maxValue === option.max;
          return (
            <button
              key={option.label}
              onClick={() => {
                setMinValue(option.min);
                setMaxValue(option.max);
                onChange({ min: option.min, max: option.max });
                // 로깅 콜백 호출
                const productsCount = products.filter(p => p.price && p.price >= option.min && p.price <= option.max).length;
                onPresetClick?.(option.label, option.min, option.max, productsCount);
              }}
              className={`px-4 py-2 rounded-full text-sm font-medium border-2 transition-all ${
                isSelected
                  ? 'bg-amber-50 border-amber-400 text-amber-700'
                  : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}

// 빠른 선택 옵션 생성
function generateQuickOptions(min: number, max: number) {
  const range = max - min;
  const quarter = range / 4;

  return [
    {
      label: '가성비',
      min: min,
      max: Math.round(min + quarter),
    },
    {
      label: '적정가',
      min: Math.round(min + quarter),
      max: Math.round(min + quarter * 2),
    },
    {
      label: '프리미엄',
      min: Math.round(min + quarter * 2),
      max: Math.round(min + quarter * 3),
    },
    {
      label: '전체',
      min: min,
      max: max,
    },
  ];
}
