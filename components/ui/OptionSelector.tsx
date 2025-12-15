'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ProductVariant } from '@/types/recommend-v2';

interface OptionSelectorProps {
  variants: ProductVariant[];
  selectedPcode: string;
  onSelect: (variant: ProductVariant) => void;
  disabled?: boolean;
  // 다나와 최저가 데이터 (pcode -> lowest_price)
  danawaLowestPrices?: Record<string, number>;
}

/**
 * 제품 옵션 선택 드롭다운
 * PDP(제품 상세 모달)에서 같은 제품의 다른 옵션(용량/개수 등)을 선택할 수 있게 함
 */
export default function OptionSelector({
  variants,
  selectedPcode,
  onSelect,
  disabled = false,
  danawaLowestPrices = {},
}: OptionSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 현재 선택된 옵션
  const selectedVariant = variants.find(v => v.pcode === selectedPcode) || variants[0];

  // 외부 클릭 시 닫기
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // 옵션이 1개면 표시하지 않음
  if (variants.length <= 1) {
    return null;
  }

  const handleSelect = (variant: ProductVariant) => {
    console.log('[OptionSelector] handleSelect:', variant.pcode, 'current:', selectedPcode);
    if (variant.pcode !== selectedPcode) {
      console.log('[OptionSelector] Calling onSelect with:', variant);
      onSelect(variant);
    }
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative w-full">
      {/* 라벨 */}
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        옵션 선택
      </label>

      {/* 드롭다운 트리거 */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`
          w-full px-4 py-3 text-left bg-white border rounded-lg
          flex items-center justify-between
          transition-colors
          ${disabled ? 'bg-gray-50 cursor-not-allowed' : 'hover:border-gray-400 cursor-pointer'}
          ${isOpen ? 'border-blue-500 ring-1 ring-blue-500' : 'border-gray-200'}
        `}
      >
        <div className="flex-1 min-w-0">
          <div className="text-sm text-gray-900 truncate">
            {selectedVariant?.optionLabel || '옵션 선택'}
          </div>
          {(() => {
            const danawaPrice = selectedVariant ? danawaLowestPrices[selectedVariant.pcode] : undefined;
            const displayPrice = danawaPrice || selectedVariant?.price;
            return displayPrice ? (
              <div className="text-sm font-semibold text-gray-900 mt-0.5">
                {displayPrice.toLocaleString()}원
              </div>
            ) : null;
          })()}
        </div>

        {/* 화살표 아이콘 */}
        <svg
          className={`w-5 h-5 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* 드롭다운 메뉴 */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden"
          >
            <div className="max-h-60 overflow-y-auto">
              {variants.map((variant) => {
                const isSelected = variant.pcode === selectedPcode;

                return (
                  <button
                    key={variant.pcode}
                    type="button"
                    onClick={() => handleSelect(variant)}
                    className={`
                      w-full px-4 py-3 text-left flex items-center gap-3
                      transition-colors
                      ${isSelected
                        ? 'bg-blue-50'
                        : 'hover:bg-gray-50'
                      }
                    `}
                  >
                    {/* 체크 아이콘 (왼쪽) */}
                    <div className="w-5 h-5 flex items-center justify-center shrink-0">
                      {isSelected ? (
                        <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      ) : (
                        <div className="w-4 h-4 rounded-full border-2 border-gray-300" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className={`text-sm truncate ${isSelected ? 'text-blue-700 font-medium' : 'text-gray-900'}`}>
                        {variant.optionLabel}
                      </div>
                      {variant.title !== variant.optionLabel && (
                        <div className="text-xs text-gray-500 truncate mt-0.5">
                          {variant.title}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center ml-3">
                      {(() => {
                        const danawaPrice = danawaLowestPrices[variant.pcode];
                        const displayPrice = danawaPrice || variant.price;
                        return displayPrice ? (
                          <span className={`text-sm font-medium ${isSelected ? 'text-blue-700' : 'text-gray-900'}`}>
                            {displayPrice.toLocaleString()}원
                          </span>
                        ) : null;
                      })()}
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
