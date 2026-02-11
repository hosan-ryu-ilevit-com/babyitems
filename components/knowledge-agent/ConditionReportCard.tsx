'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ConditionReport } from '@/lib/knowledge-agent/types';

interface ProductPreview {
  pcode: string;
  name: string;
  brand: string | null;
  price: number | null;
  thumbnail: string | null;
}

interface ConditionReportCardProps {
  report: ConditionReport;
  categoryName: string;
  onContinue?: () => void;
  products?: ProductPreview[];
}

function renderHighlightedText(text: string, style: 'bold' | 'code' = 'bold') {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      const keyword = part.slice(2, -2);
      if (style === 'code') {
        return <span key={i} className="px-1.5 py-0.5 bg-blue-50 text-blue-600 font-semibold rounded-md text-[13px]">{keyword}</span>;
      }
      return <span key={i} className="font-bold text-blue-500">{keyword}</span>;
    }
    return part;
  });
}

export function ConditionReportCard({
  report,
  categoryName,
  onContinue: _onContinue,
  products: _products,
}: ConditionReportCardProps) {
  const [isSpecOpen, setIsSpecOpen] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {/* 헤더 */}
      <div>
        <p className="text-[16px] font-semibold text-gray-400 text-center">중간 보고서</p>
        <h3 className="text-[22px] font-bold  text-center mb-4">{categoryName} 추천 조건 요약</h3>
        <p className="text-[16px] font-medium text-gray-800 leading-5.5 mt-2">
          {renderHighlightedText(report.userProfile.situation, 'code')}
        </p>
      </div>

      {/* 핵심 니즈 */}
      <div className="bg-gray-50 rounded-[16px] p-4">
        <p className="text-[16px] font-bold text-gray-800">핵심 니즈</p>
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
          aria-expanded={isSpecOpen}
        >
          <p className="text-[16px] font-bold text-gray-800">추천하는 주요 조건</p>
          <svg
            className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${isSpecOpen ? 'rotate-180' : 'rotate-0'}`}
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden="true"
          >
            <path d="M5 8L10 13L15 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
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
                      <p className="text-[14px] font-semibold text-gray-400">{spec.specName}</p>
                    </div>
                    <div className="grid grid-cols-[44px_1fr] gap-3 text-[14px] font-medium text-gray-700 leading-relaxed">
                    
                      <div className="text-gray-500 font-semibold">조건</div>
                      <div className="text-black-800 font-bold">{spec.value}</div>
                      <div className="text-gray-500 font-semibold">근거</div>
                      <div>{renderHighlightedText(spec.reason, 'code')}</div>
                    
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 신뢰 메시지 */}
      <div>
        <p className="text-[16px] font-medium text-gray-700 leading-6">
          위 내용을 기준으로 <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 font-semibold rounded-md text-[15px]">{categoryName}</span> 추천을 진행할게요.
          {report.userProfile.keyNeeds.length > 0 && (
            <> 핵심 니즈인 <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 font-semibold rounded-md text-[15px]">{report.userProfile.keyNeeds[0]}</span> 중심으로
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
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="space-y-4"
    >
      {/* 헤더 */}
      <div className="space-y-3">
        <div className="h-4 w-20 bg-gray-200 rounded mx-auto animate-shimmer" />
        <div className="h-7 w-44 bg-gray-200 rounded mx-auto animate-shimmer" />
        <div className="h-4 w-full bg-gray-100 rounded animate-shimmer" />
        <div className="h-4 w-4/5 bg-gray-100 rounded mx-auto animate-shimmer" />
      </div>

      {/* 핵심 니즈 */}
      <div className="bg-gray-50 rounded-[16px] p-4 space-y-3">
        <div className="h-4 w-20 bg-gray-200 rounded animate-shimmer" />
        <div className="flex flex-wrap gap-2">
          <div className="h-8 w-24 bg-white rounded-[12px] animate-shimmer" />
          <div className="h-8 w-20 bg-white rounded-[12px] animate-shimmer" />
          <div className="h-8 w-28 bg-white rounded-[12px] animate-shimmer" />
        </div>
      </div>

      {/* 추천 스펙 */}
      <div className="bg-gray-50 rounded-[16px] p-4 space-y-4">
        <div className="h-4 w-32 bg-gray-200 rounded animate-shimmer" />
        <div className="bg-white rounded-[12px] p-4 space-y-3">
          <div className="h-4 w-24 bg-blue-100 rounded animate-shimmer" />
          <div className="grid grid-cols-[44px_1fr] gap-3">
            <div className="h-3 w-10 bg-gray-200 rounded animate-shimmer" />
            <div className="h-3 w-3/4 bg-gray-100 rounded animate-shimmer" />
            <div className="h-3 w-10 bg-gray-200 rounded animate-shimmer" />
            <div className="h-3 w-full bg-gray-100 rounded animate-shimmer" />
          </div>
        </div>
      </div>

      {/* 신뢰 메시지 */}
      <div className="space-y-2">
        <div className="h-4 w-full bg-gray-100 rounded animate-shimmer" />
        <div className="h-4 w-4/5 bg-gray-100 rounded animate-shimmer" />
      </div>
    </motion.div>
  );
}

export default ConditionReportCard;
