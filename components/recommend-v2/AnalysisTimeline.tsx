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

  return (
    <div className="w-full max-w-md mx-auto mb-6">
      {/* 토글 버튼 */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-xl transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm">🔍</span>
          <span className="text-sm font-medium text-gray-500">
            AI 분석 과정 보기
          </span>
        </div>
        <motion.div
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <svg
            className="w-5 h-5 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
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
            <div className="mt-3 px-4 py-4 bg-white rounded-xl border border-gray-200">
              {/* 타임라인 단계들 */}
              <div className="space-y-4">
                {timeline.steps.map((step, index) => {
                  // 제목에서 이모티콘 추출
                  const emojiMatch = step.title.match(/^[^\w\s가-힣]+/);
                  const emoji = emojiMatch ? emojiMatch[0].trim() : '✓';
                  const titleWithoutEmoji = step.title.replace(/^[^\w\s가-힣]+\s*/, '');

                  return (
                    <div
                      key={step.id}
                      className="relative"
                    >
                      {/* 연결선 (마지막 항목 제외) */}
                      {index < timeline.steps.length - 1 && (
                        <div className="absolute left-4 top-8 bottom-0 w-px bg-gray-200" />
                      )}

                      {/* 단계 내용 */}
                      <div className="relative flex gap-3">
                        {/* 단계 이모티콘 */}
                        <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-2xl z-10">
                          {emoji}
                        </div>

                        {/* 상세 내용 */}
                        <div className="flex-1 pb-2">
                          {/* 제목 - 이모티콘 제거 */}
                          <h4 className="text-sm font-semibold text-gray-900 mb-2">
                            {titleWithoutEmoji}
                          </h4>

                        {/* 세부 내용 */}
                        {step.details.length > 0 && (
                          <ul className="space-y-1.5 mb-2">
                            {step.details.map((detail, detailIndex) => (
                              <li
                                key={detailIndex}
                                className="text-xs text-gray-600 flex items-start gap-1.5"
                              >
                                <span className="text-gray-400 mt-0.5">•</span>
                                <span>{detail}</span>
                              </li>
                            ))}
                          </ul>
                        )}

                        {/* 하위 세부 내용 */}
                        {step.subDetails && step.subDetails.length > 0 && (
                          <div className="mt-2 space-y-2">
                            {step.subDetails.map((subDetail, subIndex) => (
                              <div
                                key={subIndex}
                                className="pl-3 border-l-2 border-blue-100"
                              >
                                <div className="text-xs font-medium text-gray-700 mb-1">
                                  {subDetail.label}
                                </div>
                                <ul className="space-y-1">
                                  {subDetail.items.map((item, itemIndex) => (
                                    <li
                                      key={itemIndex}
                                      className="text-xs text-gray-600 flex items-start gap-1.5"
                                    >
                                      <span className="text-blue-300 mt-0.5">
                                        ·
                                      </span>
                                      <span>{item}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
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
