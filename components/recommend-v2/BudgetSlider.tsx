'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';

interface BudgetSliderProps {
  min: number;
  max: number;
  step: number;
  initialMin?: number;
  initialMax?: number;
  onChange: (values: { min: number; max: number }) => void;
  formatValue?: (value: number) => string;
}

/**
 * 예산 슬라이더 (디자인 통일 버전)
 * - 양쪽 핸들 드래그
 * - 터치/마우스 지원
 * - blue 계열 색상으로 통일
 */
export function BudgetSlider({
  min,
  max,
  step,
  initialMin,
  initialMax,
  onChange,
  formatValue = (v) => `${(v / 10000).toFixed(0)}만원`,
}: BudgetSliderProps) {
  const [minValue, setMinValue] = useState(initialMin ?? min);
  const [maxValue, setMaxValue] = useState(initialMax ?? max);
  const [isDraggingMin, setIsDraggingMin] = useState(false);
  const [isDraggingMax, setIsDraggingMax] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);

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

  const minPercent = getPercent(minValue);
  const maxPercent = getPercent(maxValue);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-3"
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <span className="px-2.5 py-1 bg-blue-100 text-blue-600 rounded-full text-xs font-bold">
          예산 선택
        </span>
      </div>

      <h3 className="text-base font-bold text-gray-900">
        생각해 둔 예산이 있나요?
      </h3>

      {/* 현재 범위 표시 */}
      <div className="flex items-center justify-center gap-2 py-3 bg-blue-50 rounded-xl">
        <span className="text-lg font-bold text-blue-600">
          {formatValue(minValue)}
        </span>
        <span className="text-gray-400">~</span>
        <span className="text-lg font-bold text-blue-600">
          {formatValue(maxValue)}
        </span>
      </div>

      {/* 슬라이더 */}
      <div className="px-2 py-4">
        <div
          ref={trackRef}
          className="relative h-2 bg-gray-200 rounded-full cursor-pointer"
          onClick={handleTrackClick}
        >
          {/* 선택된 범위 */}
          <div
            className="absolute h-full bg-blue-400 rounded-full"
            style={{
              left: `${minPercent}%`,
              width: `${maxPercent - minPercent}%`,
            }}
          />

          {/* Min 핸들 */}
          <div
            className={`absolute w-6 h-6 -mt-2 -ml-3 bg-white border-2 rounded-full shadow-md cursor-grab active:cursor-grabbing transition-transform ${
              isDraggingMin ? 'border-blue-500 scale-110' : 'border-blue-400'
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
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-0.5 h-2.5 bg-blue-400 rounded-full mx-px" />
              <div className="w-0.5 h-2.5 bg-blue-400 rounded-full mx-px" />
            </div>
          </div>

          {/* Max 핸들 */}
          <div
            className={`absolute w-6 h-6 -mt-2 -ml-3 bg-white border-2 rounded-full shadow-md cursor-grab active:cursor-grabbing transition-transform ${
              isDraggingMax ? 'border-blue-500 scale-110' : 'border-blue-400'
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
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-0.5 h-2.5 bg-blue-400 rounded-full mx-px" />
              <div className="w-0.5 h-2.5 bg-blue-400 rounded-full mx-px" />
            </div>
          </div>
        </div>

        {/* 레이블 */}
        <div className="flex justify-between mt-2">
          <span className="text-xs text-gray-400">{formatValue(min)}</span>
          <span className="text-xs text-gray-400">{formatValue(max)}</span>
        </div>
      </div>

      {/* 빠른 선택 버튼 */}
      <div className="flex flex-wrap gap-2 justify-center">
        {generateQuickOptions(min, max).map((option) => {
          const isSelected = minValue === option.min && maxValue === option.max;
          return (
            <button
              key={option.label}
              onClick={() => {
                setMinValue(option.min);
                setMaxValue(option.max);
                onChange({ min: option.min, max: option.max });
              }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border-2 transition-all ${
                isSelected
                  ? 'bg-blue-50 border-blue-400 text-blue-700'
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
