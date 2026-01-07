'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, Funnel, CaretDown, Sparkle } from '@phosphor-icons/react/dist/ssr';
import { FcCheckmark, FcProcess, FcFilledFilter, FcSurvey } from 'react-icons/fc';

interface HardcutProduct {
  pcode: string;
  name: string;
  brand: string;
  price: number;
  thumbnail?: string | null;
  matchScore: number;
  matchedConditions: string[];
}

interface HardcutVisualizationProps {
  totalBefore: number;
  totalAfter: number;
  filteredProducts: HardcutProduct[];
  appliedRules: Array<{ rule: string; matchedCount: number }>;
  onContinue: () => void;
  onComplete?: () => void;
}

export function HardcutVisualization({
  totalBefore,
  totalAfter,
  filteredProducts,
  appliedRules,
  onContinue,
  onComplete,
}: HardcutVisualizationProps) {
  const [phase, setPhase] = useState<'counting' | 'filtering' | 'result'>('counting');
  const [displayCount, setDisplayCount] = useState(totalBefore);
  const [isExpanded, setIsExpanded] = useState(true);

  // 카운트다운 애니메이션
  useEffect(() => {
    const timer1 = setTimeout(() => {
      setPhase('filtering');
    }, 600);

    const timer2 = setTimeout(() => {
      // 숫자 감소 애니메이션
      const duration = 1200;
      const steps = 25;
      const decrement = (totalBefore - totalAfter) / steps;
      let current = totalBefore;
      let step = 0;

      const interval = setInterval(() => {
        step++;
        current = Math.max(totalAfter, Math.round(totalBefore - decrement * step));
        setDisplayCount(current);

        if (step >= steps) {
          clearInterval(interval);
          setDisplayCount(totalAfter);
          setTimeout(() => {
            setPhase('result');
            onComplete?.();
          }, 200);
        }
      }, duration / steps);

      return () => clearInterval(interval);
    }, 1000);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [totalBefore, totalAfter]);

  const getStatusIcon = () => {
    if (phase === 'result') {
      return (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="flex items-center justify-center w-5 h-5 rounded-full bg-green-50"
        >
          <FcCheckmark size={12} />
        </motion.div>
      );
    }
    return (
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
        className="flex items-center justify-center w-5 h-5"
      >
        <FcProcess size={16} />
      </motion.div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full space-y-3"
    >
      {/* 메인 카드 - AgenticLoadingPhase 스타일 */}
      <div className={`rounded-2xl overflow-hidden transition-all duration-300 ${
        phase === 'result'
          ? 'bg-white border border-gray-100/80 shadow-[0_2px_8px_rgba(0,0,0,0.02)]'
          : 'bg-white border border-blue-100'
      }`}>
        {/* 헤더 */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full px-4 py-3.5 flex items-center gap-3 text-left transition-colors"
        >
          <div className="shrink-0">
            {getStatusIcon()}
          </div>

          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className={`text-[14px] font-semibold truncate ${
              phase === 'result' ? 'text-gray-900' : 'text-blue-600'
            }`}>
              {phase === 'counting' && '상품 분석 중...'}
              {phase === 'filtering' && '조건에 맞는 상품 선별 중...'}
              {phase === 'result' && '맞춤 상품 선별 완료'}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className={`text-[12px] font-bold tabular-nums ${
              phase === 'result' ? 'text-green-600' : 'text-blue-500'
            }`}>
              {totalBefore}개 → {displayCount}개
            </span>
            <motion.span
              animate={{ rotate: isExpanded ? 180 : 0 }}
              className="text-gray-300"
            >
              <CaretDown size={14} weight="bold" />
            </motion.span>
          </div>
        </button>

        {/* 상세 내용 */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: "spring", duration: 0.4, bounce: 0 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-5 pt-0 space-y-5">
                <div className="h-px bg-gray-50 -mx-4 mb-3" />

                {/* 적용된 조건 태그 */}
                {appliedRules.length > 0 && (
                  <div className="space-y-2.5">
                    <p className="text-[11px] uppercase tracking-widest text-gray-400 font-bold">
                      적용된 선별 조건
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {appliedRules.slice(0, 6).map((rule, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: i * 0.05 }}
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-gray-50 border border-gray-100 rounded-lg"
                        >
                          <CheckCircle size={12} weight="fill" className="text-green-500" />
                          <span className="text-[11px] font-bold text-gray-600">{rule.rule}</span>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 선별된 상품 미리보기 */}
                {phase === 'result' && filteredProducts.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] uppercase tracking-widest text-gray-400 font-bold">
                        선별된 후보 ({filteredProducts.length}개)
                      </p>
                    </div>
                    
                    <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
                      {filteredProducts.slice(0, 15).map((product, i) => (
                        <motion.div
                          key={product.pcode}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: 0.1 + i * 0.03 }}
                          className="flex flex-col gap-1.5 w-[60px] shrink-0"
                        >
                          <div className="relative">
                            <div className="w-[60px] h-[60px] rounded-xl overflow-hidden bg-gray-50 border border-gray-100">
                              {product.thumbnail ? (
                                <img
                                  src={product.thumbnail}
                                  alt=""
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center bg-gray-50">
                                  <span className="text-[10px] text-gray-300 font-bold">{product.brand?.slice(0, 2)}</span>
                                </div>
                              )}
                            </div>
                          </div>
                          
                          {/* 브랜드 & 타이틀 */}
                          <div className="flex flex-col gap-0 px-0.5">
                            <span className="text-[9px] text-gray-400 font-bold truncate">
                              {product.brand || '기타'}
                            </span>
                            <span className="text-[10px] text-gray-700 font-semibold line-clamp-1 leading-tight">
                              {product.name}
                            </span>
                          </div>
                        </motion.div>
                      ))}
                      {filteredProducts.length > 15 && (
                        <div className="shrink-0 flex flex-col gap-1.5 w-[60px]">
                          <div className="w-[60px] h-[60px] rounded-xl bg-gray-50 border border-dashed border-gray-200 flex items-center justify-center">
                            <span className="text-[11px] font-black text-gray-300">
                              +{filteredProducts.length - 15}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
