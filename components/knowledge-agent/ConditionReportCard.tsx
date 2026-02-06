'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  const [isSpecOpen, setIsSpecOpen] = useState(true);
  const [isTipOpen, setIsTipOpen] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* 헤더 */}
      <div>
        <p className="text-[16px] font-semibold text-gray-400 text-center">중간 보고서</p>
        <h3 className="text-[24px] font-bold  text-center mb-4">추천 조건 요약</h3>
        <p className="text-[16px] font-bold text-gray-500 leading-6 mt-2">
          {report.userProfile.situation}
        </p>
      </div>

      {/* 핵심 니즈 */}
      <div className="bg-gray-50 rounded-[16px] p-4">
        <p className="text-[20px] font-bold text-gray-500">핵심 니즈</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {report.userProfile.keyNeeds.map((need, idx) => (
            <span
              key={idx}
              className="px-3 py-2 bg-white text-gray-800 rounded-[12px] text-[14px] font-semibold flex items-center gap-1.5"
            >
              <svg className="w-3 h-3 text-green-500 shrink-0" viewBox="0 0 16 16" fill="currentColor">
                <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>
              </svg>
              {need}
            </span>
          ))}
        </div>
      </div>

      {/* 추천 스펙 */}
      <div className="bg-gray-50 rounded-[16px] p-4">
        <button
          type="button"
          onClick={() => setIsSpecOpen(prev => !prev)}
          className="w-full flex items-center justify-between text-left"
        >
          <p className="text-[20px] font-bold text-gray-500">추천하는 주요 조건</p>
         
        </button>
    
        <AnimatePresence>
          {isSpecOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="mt-4 space-y-5">
                {report.analysis.recommendedSpecs.map((spec, idx) => (
                  <div key={idx} className="bg-white rounded-[12px] p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <p className="text-[16px] font-bold ai-gradient-text">{spec.specName}</p>
                    </div>
                    <div className="grid grid-cols-[44px_1fr] gap-3 text-[14px] font-medium text-gray-700 leading-relaxed">
                    
                      <div className="text-gray-500">기준</div>
                      <div className="text-gray-900 font-bold">{spec.value}</div>
                      <div className="text-gray-500">근거</div>
                      <div>{spec.reason}</div>
                    
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 구매 팁 */}
      {(report.analysis.importantFactors.length > 0 || report.analysis.cautions.length > 0) && (
        <div className="bg-gray-50 rounded-[16px] p-4">
          <button
            type="button"
            onClick={() => setIsTipOpen(prev => !prev)}
            className="w-full flex items-center justify-between text-left"
          >
            <p className="text-[16px] font-semibold text-gray-900">🎯 {categoryName} 구매 팁</p>
            <span className="text-[14px] font-semibold text-gray-500">
              {isTipOpen ? '접기' : '펼치기'}
            </span>
          </button>
          <AnimatePresence>
            {isTipOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="mt-4 space-y-4">
                  {report.analysis.importantFactors.length > 0 && (
                    <div>
                      <p className="text-[18px] font-bold text-gray-600">고려사항</p>
                      <div className="mt-2 space-y-1">
                        {report.analysis.importantFactors.map((factor, idx) => (
                          <p key={idx} className="text-[14px] font-medium text-gray-600 leading-relaxed">
                            • {factor}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}

                  {report.analysis.cautions.length > 0 && (
                    <div>
                      <p className="text-[18px] font-bold text-gray-600">참고사항</p>
                      <div className="mt-2 space-y-1">
                        {report.analysis.cautions.map((caution, idx) => (
                          <p key={idx} className="text-[14px] font-medium text-gray-600 leading-relaxed">
                            • {caution}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* 신뢰 메시지 */}
      <div>
        <p className="text-[16px] font-medium text-gray-700 leading-6">
          위 내용을 기준으로 <span className="font-bold text-blue-600">{categoryName}</span> 추천을 진행할게요.
          {report.userProfile.keyNeeds.length > 0 && (
            <> 핵심 니즈인 <span className="font-bold text-blue-600">{report.userProfile.keyNeeds[0]}</span> 중심으로
            추천 정확도를 높여보도록 하겠습니다! 👍</>
          )}
        </p>
      </div>
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
      className="space-y-6"
    >
      <div className="animate-pulse space-y-4">
        <div className="h-4 w-20 bg-gray-200 rounded" />
        <div className="h-7 w-40 bg-gray-200 rounded" />
        <div className="h-4 w-full bg-gray-100 rounded" />
        <div className="h-4 w-4/5 bg-gray-100 rounded" />
      </div>
      <div className="animate-pulse space-y-3">
        <div className="h-4 w-24 bg-gray-200 rounded" />
        <div className="h-4 w-2/3 bg-gray-100 rounded" />
        <div className="h-4 w-1/2 bg-gray-100 rounded" />
      </div>
      <div className="animate-pulse space-y-3">
        <div className="h-4 w-24 bg-gray-200 rounded" />
        <div className="h-5 w-3/4 bg-gray-100 rounded" />
        <div className="h-4 w-full bg-gray-100 rounded" />
      </div>
      <div className="animate-pulse space-y-3">
        <div className="h-4 w-24 bg-gray-200 rounded" />
        <div className="h-4 w-3/5 bg-gray-100 rounded" />
        <div className="h-4 w-2/3 bg-gray-100 rounded" />
      </div>
      <div className="animate-pulse">
        <div className="h-4 w-full bg-gray-100 rounded" />
      </div>
    </motion.div>
  );
}

export default ConditionReportCard;
