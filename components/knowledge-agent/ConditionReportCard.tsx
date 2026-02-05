'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CaretDown,
  CaretUp,
  CheckCircle,
  Star,
  Warning,
  Sparkle,
  Target,
  ShieldCheck,
  XCircle,
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
      className="bg-white rounded-3xl border border-gray-100 shadow-lg overflow-hidden"
    >
      {/* 헤더 */}
      <div className="bg-gradient-to-r from-gray-900 to-gray-800 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
            <Target size={22} className="text-white" />
          </div>
          <div>
            <h3 className="text-white font-bold text-lg">조건 분석 완료</h3>
            <p className="text-white/70 text-sm">{categoryName} 맞춤 분석 결과</p>
          </div>
        </div>
      </div>

      {/* 요약 섹션 */}
      <div className="p-5 space-y-4">
        {/* 사용자 프로필 */}
        <div className="bg-blue-50 rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <Sparkle size={20} className="text-blue-500 mt-0.5 shrink-0" weight="fill" />
            <div>
              <p className="text-blue-900 font-medium leading-relaxed">
                {report.userProfile.situation}
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                {report.userProfile.keyNeeds.map((need, idx) => (
                  <span
                    key={idx}
                    className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold"
                  >
                    {need}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 조건 요약 */}
        <div className="grid grid-cols-3 gap-3">
          {/* 필수 조건 */}
          <div className="bg-green-50 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <CheckCircle size={14} className="text-green-600" weight="fill" />
              <span className="text-xs font-semibold text-green-700">필수</span>
            </div>
            <div className="space-y-1">
              {report.summary.mustHave.slice(0, 2).map((item, idx) => (
                <p key={idx} className="text-xs text-green-800 leading-tight line-clamp-1">
                  {item}
                </p>
              ))}
            </div>
          </div>

          {/* 선호 조건 */}
          <div className="bg-amber-50 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Star size={14} className="text-amber-600" weight="fill" />
              <span className="text-xs font-semibold text-amber-700">선호</span>
            </div>
            <div className="space-y-1">
              {report.summary.niceToHave.slice(0, 2).map((item, idx) => (
                <p key={idx} className="text-xs text-amber-800 leading-tight line-clamp-1">
                  {item}
                </p>
              ))}
            </div>
          </div>

          {/* 회피 조건 */}
          <div className="bg-red-50 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <XCircle size={14} className="text-red-500" weight="fill" />
              <span className="text-xs font-semibold text-red-600">회피</span>
            </div>
            <div className="space-y-1">
              {report.summary.avoid.slice(0, 2).map((item, idx) => (
                <p key={idx} className="text-xs text-red-700 leading-tight line-clamp-1">
                  {item}
                </p>
              ))}
            </div>
          </div>
        </div>

        {/* 펼치기/접기 버튼 */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-center gap-2 py-2 text-gray-500 hover:text-gray-700 transition-colors"
        >
          <span className="text-sm font-medium">
            {isExpanded ? '접기' : '상세 분석 보기'}
          </span>
          {isExpanded ? <CaretUp size={16} weight="bold" /> : <CaretDown size={16} weight="bold" />}
        </button>

        {/* 상세 분석 (확장 시) */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden"
            >
              <div className="space-y-4 pt-2">
                {/* 추천 스펙 */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <ShieldCheck size={18} className="text-gray-700" weight="fill" />
                    <h4 className="font-semibold text-gray-900">추천 스펙</h4>
                  </div>
                  <div className="space-y-2">
                    {report.analysis.recommendedSpecs.map((spec, idx) => (
                      <div
                        key={idx}
                        className="bg-gray-50 rounded-xl p-3 flex items-start gap-3"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-gray-900 text-sm">
                              {spec.specName}
                            </span>
                            <span className="text-xs text-gray-500">→</span>
                            <span className="text-sm text-blue-600 font-medium">
                              {spec.value}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 mt-1">{spec.reason}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 중요 고려사항 */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Warning size={18} className="text-amber-500" weight="fill" />
                    <h4 className="font-semibold text-gray-900">고려사항</h4>
                  </div>
                  <ul className="space-y-1.5">
                    {report.analysis.importantFactors.map((factor, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm text-gray-700">
                        <span className="text-amber-500 mt-1">•</span>
                        {factor}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* 주의사항 */}
                {report.analysis.cautions.length > 0 && (
                  <div className="bg-red-50 rounded-xl p-3">
                    <p className="text-xs font-semibold text-red-600 mb-1.5">주의사항</p>
                    <ul className="space-y-1">
                      {report.analysis.cautions.map((caution, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-xs text-red-700">
                          <span className="mt-0.5">⚠️</span>
                          {caution}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* 추천 방향 */}
                <div>
                  <h4 className="font-semibold text-gray-900 mb-3">추천 방향</h4>
                  <div className="space-y-2">
                    {report.directions.map((direction) => (
                      <div
                        key={direction.type}
                        className={`rounded-xl p-3 border ${
                          direction.type === 'premium'
                            ? 'border-purple-200 bg-purple-50'
                            : direction.type === 'value'
                            ? 'border-green-200 bg-green-50'
                            : 'border-blue-200 bg-blue-50'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                              direction.type === 'premium'
                                ? 'bg-purple-200 text-purple-700'
                                : direction.type === 'value'
                                ? 'bg-green-200 text-green-700'
                                : 'bg-blue-200 text-blue-700'
                            }`}
                          >
                            {direction.type === 'premium' && '프리미엄'}
                            {direction.type === 'value' && '가성비'}
                            {direction.type === 'balanced' && '밸런스'}
                          </span>
                        </div>
                        <p className="text-sm text-gray-700">{direction.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 확인 버튼 */}
      {onContinue && (
        <div className="px-5 pb-5">
          <button
            onClick={onContinue}
            className="w-full py-4 bg-gray-900 text-white font-bold rounded-2xl hover:bg-gray-800 transition-colors"
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
      className="bg-white rounded-3xl border border-gray-100 shadow-lg overflow-hidden"
    >
      <div className="bg-gradient-to-r from-gray-900 to-gray-800 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
          <div>
            <h3 className="text-white font-bold text-lg">조건 분석 중...</h3>
            <p className="text-white/70 text-sm">입력하신 조건을 분석하고 있어요</p>
          </div>
        </div>
      </div>
      <div className="p-5">
        <div className="animate-pulse space-y-4">
          <div className="h-24 bg-gray-100 rounded-2xl" />
          <div className="grid grid-cols-3 gap-3">
            <div className="h-20 bg-gray-100 rounded-xl" />
            <div className="h-20 bg-gray-100 rounded-xl" />
            <div className="h-20 bg-gray-100 rounded-xl" />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default ConditionReportCard;
