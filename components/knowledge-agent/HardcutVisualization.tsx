'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, Funnel, CaretDown, Sparkle, PushPin } from '@phosphor-icons/react/dist/ssr';
import { FcCheckmark, FcProcess, FcFilledFilter, FcSurvey } from 'react-icons/fc';
import Image from 'next/image';

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
  }, [totalBefore, totalAfter, onComplete]);

  const getStatusIcon = () => {
    if (phase === 'result') {
      return (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="flex items-center justify-center w-6 h-6"
        >
          <Image src="/icons/check.png" alt="" width={24} height={24} />
        </motion.div>
      );
    }
    return (
      <div className="flex items-center justify-center w-5 h-5 rounded-full border-[1.5px] border-purple-500 border-t-transparent animate-spin" />
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full"
    >
      {/* 메인 카드 - AgenticLoadingPhase 스타일 */}
      <div className={`transition-all duration-300 bg-white border-b border-gray-200`}>
        {/* 헤더 */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full py-4 flex items-center gap-3 text-left transition-colors"
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="shrink-0 w-5 h-5 flex items-center justify-center">
              <Image src="/icons/ic-ai.svg" alt="" width={16} height={16} />
            </div>
            <span className="text-[16px] font-medium ai-gradient-text">
              조건에 맞는 제품 선별 중
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <motion.span
              animate={{ rotate: isExpanded ? 180 : 0 }}
              className="text-gray-500"
            >
              <CaretDown size={16} weight="bold" />
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
              className="overflow-hidden relative"
            >
              <div className="pb-4 space-y-6">
                {/* 적용된 조건 태그 */}
                {appliedRules.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="shrink-0 w-6 h-6 flex items-center justify-center">
                        <Image src="/icons/check.png" alt="" width={24} height={24} />
                      </div>
                      <p className="text-[16px] font-semibold text-gray-600">
                        적용된 선별 조건
                      </p>
                    </div>
                    <div className="relative pl-8">
                      {/* 세로 디바이더 라인 - 아이콘 아래에서 시작 */}
                      <div className="absolute left-[12px] top-0 bottom-0 w-px bg-gray-200" />
                      
                      <div className="flex flex-wrap gap-1.5 pb-1">
                        {appliedRules.map((rule, i) => (
                          <motion.div
                            key={i}
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: i * 0.05 }}
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-gray-100 rounded-lg"
                          >
                            <span className="text-[12px]">📍</span>
                            <span className="text-[12px] font-medium text-gray-600">{rule.rule}</span>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* 선별된 상품 미리보기 */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="space-y-3"
                >
                  <div className="flex items-center gap-2">
                    <div className="shrink-0 w-6 h-6 flex items-center justify-center">
                      <Image src="/icons/check.png" alt="" width={24} height={24} />
                    </div>
                    <p className="text-[16px] font-semibold text-gray-600">
                      후보 상품 {displayCount}개
                    </p>
                  </div>
                  
                  <div className="relative pl-8">
                    {/* 세로 디바이더 라인 - 아이콘 아래에서 시작 */}
                    <div className="absolute left-[12px] top-0 bottom-0 w-px bg-gray-200" />

                    <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
                    {(phase === 'counting' ? Array(6).fill(null) : filteredProducts).slice(0, 15).map((product, i) => (
                      <motion.div
                        key={product?.pcode || i}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.1 + i * 0.03 }}
                        className="flex flex-col gap-1.5 w-[66px] shrink-0"
                      >
                        <div className="relative">
                          <div className="w-[66px] h-[66px] rounded-xl overflow-hidden bg-gray-50 border border-gray-100">
                            {product?.thumbnail ? (
                              <img
                                src={product.thumbnail}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-gray-50">
                                {product ? (
                                  <span className="text-[10px] text-gray-300 font-bold">{product.brand?.slice(0, 2)}</span>
                                ) : (
                                  <div className="w-full h-full animate-pulse bg-gray-200" />
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        
                        {/* 타이틀 & 브랜드 */}
                        {product ? (
                          <div className="flex flex-col gap-0 px-0.5">
                            <span className="text-[10px] text-gray-600 font-medium line-clamp-1 leading-tight">
                              {product.name}
                            </span>
                            <span className="text-[10px] text-gray-400 font-medium truncate">
                              {product.brand || '기타'}
                            </span>
                          </div>
                        ) : (
                          <div className="space-y-1 px-0.5">
                            <div className="h-2.5 bg-gray-100 rounded w-full animate-pulse" />
                            <div className="h-2 bg-gray-100 rounded w-2/3 animate-pulse" />
                          </div>
                        )}
                      </motion.div>
                    ))}
                    {filteredProducts.length > 15 && (
                      <div className="shrink-0 flex flex-col gap-1.5 w-[66px]">
                        <div className="w-[66px] h-[66px] rounded-xl bg-gray-50 border border-dashed border-gray-200 flex items-center justify-center">
                          <span className="text-[12px] font-black text-gray-300">
                            +{filteredProducts.length - 15}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </motion.div>
  );
}
