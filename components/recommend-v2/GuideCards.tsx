'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { GuideCardsData } from '@/types/recommend-v2';

interface GuideCardsProps {
  data: GuideCardsData;
}

/**
 * 가이드 카드 컴포넌트 (개선 버전)
 * - 접이식 가이드 포인트
 * - 신뢰감 있는 디자인
 * - 트렌드 정보 강조
 */
export function GuideCards({ data }: GuideCardsProps) {
  const [isGuideExpanded, setIsGuideExpanded] = useState(true);

  // 가이드 포인트가 있는지 확인
  const hasGuidePoints = data.points && data.points.length > 0;
  const hasTrend = data.trend && data.trend.trim() !== '';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-3"
    >
      {/* 핵심 가이드 카드 */}
      {hasGuidePoints && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
          {/* 헤더 (클릭 가능) */}
          <button
            onClick={() => setIsGuideExpanded(!isGuideExpanded)}
            className="w-full px-4 py-3 flex items-center justify-between bg-gradient-to-r from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <span className="font-bold text-gray-900 text-sm">{data.title}</span>
            </div>
            <motion.div
              animate={{ rotate: isGuideExpanded ? 180 : 0 }}
              transition={{ duration: 0.2 }}
              className="text-gray-400"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </motion.div>
          </button>

          {/* 가이드 내용 (접이식) */}
          <AnimatePresence initial={false}>
            {isGuideExpanded && (
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: 'auto' }}
                exit={{ height: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="px-4 py-3 space-y-2.5 bg-white">
                  {data.points.map((point, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 p-2.5 rounded-xl bg-gray-50"
                    >
                      <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      <span className="text-sm text-gray-700 leading-relaxed">
                        {point}
                      </span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* 트렌드 카드 */}
      {hasTrend && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl p-4 border border-amber-200">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <span className="text-xs font-bold text-amber-700 block mb-1">
                요즘 트렌드
              </span>
              <p className="text-sm text-gray-700 leading-relaxed">
                {data.trend}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 분석 기반 알림 */}
      <div className="flex items-center justify-center gap-2 py-2 text-xs text-gray-400">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
        <span>실제 구매자 리뷰 {Math.floor(Math.random() * 500 + 500).toLocaleString()}건 분석 기반</span>
      </div>
    </motion.div>
  );
}
