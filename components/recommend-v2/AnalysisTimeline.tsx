'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { AnalysisTimeline } from '@/types/recommend-v2';

interface AnalysisTimelineProps {
  timeline: AnalysisTimeline;
}

/**
 * 분석 타임라인 컴포넌트
 * AI 추천 과정의 상세 단계를 토글 형식으로 표시
 */
export function AnalysisTimeline({ timeline }: AnalysisTimelineProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // 총 소요 시간 계산 (초 단위)
  const durationSeconds = timeline.endTime 
    ? Math.floor((timeline.endTime - timeline.startTime) / 1000)
    : 0;
  
  const durationText = durationSeconds >= 60 
    ? `${Math.floor(durationSeconds / 60)}분 ${durationSeconds % 60}초`
    : `${durationSeconds}초`;

  return (
    <div className="w-full max-w-md mx-auto mb-2">
      {/* 토글 버튼 */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-1 py-3 bg-transparent transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className="w-[22px] h-[22px] flex items-center justify-center shrink-0">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 3L14.5 9L21 11.5L14.5 14L12 20L9.5 14L3 11.5L9.5 9L12 3Z" fill="url(#ai_gradient_timeline)" />
              <defs>
                <linearGradient id="ai_gradient_timeline" x1="21" y1="12" x2="3" y2="12" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#77A0FF" />
                  <stop offset="0.7" stopColor="#907FFF" />
                  <stop offset="1" stopColor="#6947FF" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <span className="text-[16px] font-medium ai-gradient-text">
            {durationText}동안 쇼핑 · 제품 탐색 완료
          </span>
        </div>
        <motion.div
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <svg
            className="w-5 h-5 text-gray-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </motion.div>
      </button>

      {/* 타임라인 내용 */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="mt-1 mb-4 px-1 py-4">
              {/* 타임라인 단계들 */}
              <div className="space-y-6">
                {timeline.steps.map((step, index) => {
                  return (
                    <div
                      key={step.id}
                      className="relative"
                    >
                      {/* 연결선 (마지막 항목 제외) */}
                      {index < timeline.steps.length - 1 && (
                        <div className="absolute left-3 top-6 bottom-0 w-[1px] bg-gray-200" />
                      )}

                      {/* 단계 내용 */}
                      <div className="relative flex gap-4">
                        {/* 단계 돋보기 아이콘 */}
                        <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center z-10">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-gray-400">
                            <circle cx="11" cy="11" r="8" />
                            <path d="m21 21-4.3-4.3" />
                          </svg>
                        </div>

                        {/* 상세 내용 */}
                        <div className="flex-1">
                          <h4 className="text-[16px] font-semibold text-gray-600 mb-1">
                            {step.title}
                          </h4>

                          {/* 세부 내용 */}
                          {step.details.length > 0 && (
                            <div className="space-y-1">
                              {step.details.map((detail, detailIndex) => (
                                <p
                                  key={detailIndex}
                                  className="text-[14px] font-medium text-gray-400 leading-relaxed"
                                >
                                  {detail}
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
