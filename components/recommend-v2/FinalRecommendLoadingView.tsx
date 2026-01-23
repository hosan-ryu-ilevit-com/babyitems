'use client';

/**
 * Final Recommend Loading View
 *
 * 최종 추천 생성 중 로딩 화면 (접힌 토글 + 프로그레스바 + 타이머)
 * - 기본 상태: 현재 진행 중인 단계 아이콘 + 제목 + 타이머 + 프로그레스바
 * - 펼친 상태: 3단계 Accordion (아이콘 + 라벨 + 시간)
 */

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import type { TimelineStep } from '@/types/recommend-v2';

// ============================================================================
// Types
// ============================================================================

interface FinalRecommendLoadingViewProps {
  steps: TimelineStep[];
  progress: number;           // 0-100
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
 * Shimmer 효과 컴포넌트 (background-clip 방식)
 */
function ShimmerText({ children }: { children: React.ReactNode }) {
  return (
    <motion.span
      className="inline-block"
      style={{
        background: 'linear-gradient(90deg, rgba(156, 163, 175, 0.5) 0%, rgba(156, 163, 175, 1) 25%, rgba(255, 255, 255, 0.4) 50%, rgba(156, 163, 175, 1) 75%, rgba(156, 163, 175, 0.5) 100%)',
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
        duration: 2.3,
        repeat: Infinity,
        ease: 'linear',
        delay: 0.5,
      }}
    >
      {children}
    </motion.span>
  );
}

/**
 * 단계 카드 (항상 표시)
 */
function StepCard({ step, index, totalSteps }: { step: TimelineStep; index: number; totalSteps: number }) {
  const getIcon = () => {
    if (step.status === 'completed') {
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
  const isLoading = step.status === 'in_progress';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
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
        {/* 부가 설명 with shimmer effect during loading */}
        {subDescription && (
          <div className="text-[12px] text-gray-400 leading-relaxed">
            {isLoading ? (
              <ShimmerText>{subDescription}</ShimmerText>
            ) : (
              subDescription
            )}
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
}: FinalRecommendLoadingViewProps) {
  // 현재 활성화된 단계 찾기
  const currentStep = steps.find(s => s.status === 'in_progress') || steps[steps.length - 1];

  return (
    <div className="w-full">
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
          {currentStep?.title || 'AI 추천 생성 중'}...
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
    </div>
  );
}
