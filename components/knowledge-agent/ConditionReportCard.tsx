'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CaretDown,
  CaretUp,
  Sparkle,
} from '@phosphor-icons/react/dist/ssr';
import type { ConditionReport } from '@/lib/knowledge-agent/types';

interface ConditionReportCardProps {
  report: ConditionReport;
  categoryName: string;
  onContinue?: () => void;
}

export function ConditionReportCard({
  report,
  categoryName,
  onContinue,
}: ConditionReportCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl border border-gray-100 overflow-hidden"
    >
      <div className="p-5 space-y-5">
        {/* 헤더 - 조건 분석 */}
        <div>
          <h3 className="text-lg font-bold text-gray-900 mb-2">조건 분석</h3>
          <p className="text-gray-700 leading-relaxed">
            {report.userProfile.situation}
          </p>
        </div>

        {/* 핵심 니즈 태그 */}
        <div className="flex flex-wrap gap-2">
          {report.userProfile.keyNeeds.map((need, idx) => (
            <span
              key={idx}
              className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-sm font-medium"
            >
              {need}
            </span>
          ))}
        </div>

        {/* 추천 스펙 (토글 밖 - 항상 표시) */}
        <div className="space-y-3">
          {report.analysis.recommendedSpecs.map((spec, idx) => (
            <div key={idx} className="space-y-1">
              <span className="inline-block px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs font-medium">
                {spec.specName}
              </span>
              <p className="text-sm text-gray-700 leading-relaxed">
                <span className="font-bold text-gray-900">{spec.value}</span>을 추천드려요. → {spec.reason}
              </p>
            </div>
          ))}
        </div>

        {/* 펼치기/접기 - 고려사항 & 참고하세요 */}
        {(report.analysis.importantFactors.length > 0 || report.analysis.cautions.length > 0) && (
          <div className="border border-gray-100 rounded-xl overflow-hidden">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-800">
                  ✅ {categoryName} 구매 팁
                </span>
              </div>
              {isExpanded ? (
                <CaretUp size={18} weight="bold" className="text-gray-500" />
              ) : (
                <CaretDown size={18} weight="bold" className="text-gray-500" />
              )}
            </button>

            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="p-4 space-y-4 bg-white border-t border-gray-100">
                    {/* 고려사항 */}
                    {report.analysis.importantFactors.length > 0 && (
                      <div className="text-sm leading-relaxed bg-red-50 rounded-lg p-3">
                        <p className="font-bold text-red-700 text-xl mb-1">고려사항</p>
                        {report.analysis.importantFactors.map((factor, idx) => (
                          <p key={idx} className="text-red-800">• {factor}</p>
                        ))}
                      </div>
                    )}

                    {/* 주의사항 */}
                    {report.analysis.cautions.length > 0 && (
                      <div className="text-sm text-gray-600 leading-relaxed bg-amber-50 rounded-lg p-3">
                        <p className="font-bold text-amber-700 text-xl mb-1">참고하세요</p>
                        {report.analysis.cautions.map((caution, idx) => (
                          <p key={idx} className="text-amber-800">• {caution}</p>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* AI 요약 */}
        <div className="bg-violet-50 rounded-xl p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <Sparkle size={16} weight="fill" className="text-violet-500" />
            <span className="text-sm font-semibold text-violet-600">AI 요약</span>
          </div>
          <p className="text-sm text-gray-700 leading-relaxed">
            입력하신 조건을 바탕으로 <span className="font-semibold text-gray-900">{categoryName}</span> 추천 준비가 완료되었어요.
            {report.userProfile.keyNeeds.length > 0 && (
              <> <span className="font-semibold text-gray-900">{report.userProfile.keyNeeds[0]}</span>
              {report.userProfile.keyNeeds.length > 1 && (
                <>, <span className="font-semibold text-gray-900">{report.userProfile.keyNeeds[1]}</span></>
              )}을 중심으로 최적의 제품을 찾아드릴게요.</>
            )}
          </p>
        </div>
      </div>

      {/* 확인 버튼 */}
      {onContinue && (
        <div className="px-5 pb-5">
          <button
            onClick={onContinue}
            className="w-full py-4 bg-gray-900 text-white font-bold rounded-xl hover:bg-gray-800 transition-colors"
          >
            확인하고 계속하기
          </button>
        </div>
      )}
    </motion.div>
  );
}

/**
 * 로딩 상태 컴포넌트
 */
export function ConditionReportLoading() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl border border-gray-100 overflow-hidden"
    >
      <div className="p-5">
        <div className="animate-pulse space-y-4">
          {/* 헤더 스켈레톤 */}
          <div>
            <div className="h-5 w-24 bg-gray-200 rounded mb-3" />
            <div className="h-4 w-full bg-gray-100 rounded mb-2" />
            <div className="h-4 w-3/4 bg-gray-100 rounded" />
          </div>

          {/* 태그 스켈레톤 */}
          <div className="flex gap-2">
            <div className="h-8 w-20 bg-blue-100 rounded-lg" />
            <div className="h-8 w-24 bg-blue-100 rounded-lg" />
            <div className="h-8 w-16 bg-blue-100 rounded-lg" />
          </div>

          {/* 펼치기 버튼 스켈레톤 */}
          <div className="h-12 bg-gray-50 rounded-xl" />

          {/* AI 요약 스켈레톤 */}
          <div className="h-20 bg-violet-50 rounded-xl" />
        </div>
      </div>
    </motion.div>
  );
}

export default ConditionReportCard;
