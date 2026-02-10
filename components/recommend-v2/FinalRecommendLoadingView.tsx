'use client';

/**
 * Final Recommend Loading View
 *
 * 최종 추천 생성 중 로딩 화면 (접힌 토글 + 프로그레스바 + 타이머)
 * - 기본 상태: 현재 진행 중인 단계 아이콘 + 제목 + 타이머 + 프로그레스바
 * - 펼친 상태: 3단계 Accordion (아이콘 + 라벨 + 시간)
 */

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import type { TimelineStep } from '@/types/recommend-v2';

// ============================================================================
// Types
// ============================================================================

interface FinalRecommendLoadingViewProps {
  steps: TimelineStep[];
  progress: number;           // 0-100
  showBrandPreferencePrompt?: boolean;
  brandOptions?: string[];
  preferBrands?: string[];
  excludeBrands?: string[];
  onBrandToggle?: (brand: string, type: 'prefer' | 'exclude') => void;
  onBrandConfirm?: () => void;
  onBrandSkip?: () => void;
}

// ============================================================================
// Sub Components
// ============================================================================

/**
 * 실시간 타이머 (0.1초 단위)
 */
function RealTimeTimer({ startTime }: { startTime: number }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Date.now() - startTime);
    }, 100); // 100ms마다 업데이트
    return () => clearInterval(interval);
  }, [startTime]);

  return (
    <span className="text-[13px] text-gray-400 font-medium tabular-nums">
      {(elapsed / 1000).toFixed(1)}s
    </span>
  );
}

/**
 * 전체 진행 타이머 (상단 메시지용)
 */
function GlobalTimer({ startTime }: { startTime: number }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Date.now() - startTime);
    }, 100);
    return () => clearInterval(interval);
  }, [startTime]);

  return (
    <span className="text-[13px] text-gray-400 font-medium tabular-nums">
      {(elapsed / 1000).toFixed(1)}s
    </span>
  );
}


/**
 * 단계 카드 (항상 표시)
 */
function StepCard({ step, index, totalSteps }: { step: TimelineStep; index: number; totalSteps: number }) {
  const isCompleted = step.status === 'completed';

  const getIcon = () => {
    if (isCompleted) {
      return (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          className="relative z-10 bg-white"
        >
          <Image src="/icons/check.png" alt="" width={20} height={20} />
        </motion.div>
      );
    }

    if (step.status === 'in_progress') {
      return (
        <div className="relative z-10 w-4 h-4 rounded-full border-[1.5px] border-blue-500 border-t-transparent animate-spin bg-white" />
      );
    }

    return (
      <div className="relative z-10 w-4 h-4 rounded-full border-[1.5px] border-gray-300 bg-white" />
    );
  };

  // 진행 중일 때 실시간 타이머, 완료되면 소요 시간 표시
  const shouldShowTimer = step.status === 'in_progress' && step.startTime;
  const duration = step.endTime && step.startTime
    ? ((step.endTime - step.startTime) / 1000).toFixed(1) + 's'
    : null;

  // 부가 설명 추출 (details 배열의 첫 번째 항목)
  const subDescription = step.details && step.details.length > 0 ? step.details[0] : '';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: isCompleted ? 0.5 : 1, y: 0 }}
      transition={{
        duration: 0.4,
        delay: index * 0.1,
        ease: [0.4, 0, 0.2, 1]
      }}
      className="relative py-3 flex items-start gap-3"
    >
      {/* 세로 구분선 - 각 단계별로 별도 렌더링 */}
      {index < totalSteps - 1 && (
        <div className="absolute left-[10px] top-8 bottom-0 w-px overflow-hidden">
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: '100%', opacity: 1 }}
            transition={{
              duration: 0.3,
              delay: index * 0.1 + 0.2,
              ease: "easeOut"
            }}
            className="w-full bg-gray-200"
          />
        </div>
      )}

      {/* 아이콘 */}
      <div className="shrink-0 w-5 h-5 flex items-center justify-center">
        {getIcon()}
      </div>

      {/* 제목 + 시간 + 부가설명 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[14px] font-semibold text-gray-600">
            {step.title}
          </span>
          {/* 실시간 타이머 or 소요 시간 */}
          {shouldShowTimer && step.startTime ? (
            <RealTimeTimer startTime={step.startTime} />
          ) : duration ? (
            <span className="text-[13px] text-gray-300 font-medium tabular-nums">
              {duration}
            </span>
          ) : null}
        </div>
        {/* 부가 설명 */}
        {subDescription && (
          <div className="text-[13px] text-gray-400 leading-relaxed">
            {subDescription}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function FinalRecommendLoadingView({
  steps,
  progress,
  showBrandPreferencePrompt = false,
  brandOptions = [],
  preferBrands = [],
  excludeBrands = [],
  onBrandToggle,
  onBrandConfirm,
  onBrandSkip,
}: FinalRecommendLoadingViewProps) {
  // 현재 활성화된 단계 찾기
  const currentStep = steps.find(s => s.status === 'in_progress') || steps[steps.length - 1];

  // 헤더 제목에서 [n/4] 패턴 제거
  const headerTitle = (currentStep?.title || 'AI 추천 생성 중').replace(/\[\d+\/\d+\]\s*/, '');

  // 전체 시작 시간 (첫 번째 단계의 startTime)
  const globalStartTime = steps[0]?.startTime;

  return (
    <div className="w-full">
      {/* AI 메시지 스타일 안내 문구 */}
      <div className="flex flex-col mb-4">
        <p className="text-[20px] text-gray-800 font-semibold leading-[140%]">
          맞춤 추천을 위해<br />
          AI가 열심히 분석 중이에요
        </p>
        <p className="text-[14px] text-gray-400 font-medium leading-[140%] mt-2 flex items-center gap-1.5">
          <span>30초 내외로 완료될 예정이니 조금만 기다려주세요.</span>
          {globalStartTime && (
            <GlobalTimer startTime={globalStartTime} />
          )}
        </p>
      </div>

      {/* 헤더 (현재 진행 중인 단계) */}
      <div className="w-full py-4 px-1 flex items-center gap-3">
        {/* AI 아이콘 with wiggle animation */}
        <motion.img
          src="/icons/ic-ai.svg"
          alt="AI"
          className="shrink-0 w-5 h-5"
          animate={{
            rotate: [0, -15, 15, -15, 0],
            y: [0, -2.5, 0],
          }}
          transition={{
            duration: 0.8,
            repeat: Infinity,
            repeatDelay: 2,
            ease: "easeInOut"
          }}
        />

        {/* 현재 단계 제목 with shimmer effect */}
        <motion.span
          className="text-[16px] font-medium flex-1 text-left"
          style={{
            background: 'linear-gradient(90deg, rgba(96, 165, 250, 0.7) 0%, rgba(147, 51, 234, 1) 25%, rgba(255, 255, 255, 0.9) 50%, rgba(147, 51, 234, 1) 75%, rgba(96, 165, 250, 0.7) 100%)',
            backgroundSize: '200% 100%',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            color: 'transparent',
          }}
          animate={{
            backgroundPosition: ['200% 0%', '0% 0%'],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: 'linear',
          }}
        >
          {headerTitle}...
        </motion.span>
      </div>

      {/* 프로그레스 바 */}
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mt-2 mb-4">
        <motion.div
          className="h-full bg-gradient-to-r from-blue-400 to-purple-500"
          initial={{ width: '0%' }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        />
      </div>

      {/* 단계 리스트 (항상 표시) */}
      <div className="px-1 space-y-0 border-t border-gray-100 pt-2">
        {steps.map((step, idx) => (
          <StepCard
            key={step.id}
            step={step}
            index={idx}
            totalSteps={steps.length}
          />
        ))}
      </div>

      {showBrandPreferencePrompt && brandOptions.length > 0 && (
        <div className="mt-4 p-4 rounded-2xl border border-blue-100 bg-blue-50/50">
          <p className="text-[14px] font-semibold text-gray-800 mb-3">
            추천 정확도를 높이기 위해 브랜드 선호를 알려주세요
          </p>
          <div className="space-y-2">
            {brandOptions.map((brand) => {
              const isPreferred = preferBrands.includes(brand);
              const isExcluded = excludeBrands.includes(brand);
              return (
                <div key={brand} className="flex items-center justify-between gap-2">
                  <span className="text-[14px] text-gray-700">{brand}</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onBrandToggle?.(brand, 'prefer')}
                      className={`px-2.5 py-1 rounded-lg text-[12px] font-semibold transition-colors ${
                        isPreferred ? 'bg-blue-500 text-white' : 'bg-white text-blue-600 border border-blue-200'
                      }`}
                    >
                      우선 추천
                    </button>
                    <button
                      type="button"
                      onClick={() => onBrandToggle?.(brand, 'exclude')}
                      className={`px-2.5 py-1 rounded-lg text-[12px] font-semibold transition-colors ${
                        isExcluded ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 border border-gray-200'
                      }`}
                    >
                      제외
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onBrandSkip}
              className="px-3 py-1.5 rounded-lg text-[12px] font-semibold text-gray-500 bg-white border border-gray-200"
            >
              건너뛰기
            </button>
            <button
              type="button"
              onClick={onBrandConfirm}
              className="px-3 py-1.5 rounded-lg text-[12px] font-semibold text-white bg-gray-900"
            >
              반영하기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
