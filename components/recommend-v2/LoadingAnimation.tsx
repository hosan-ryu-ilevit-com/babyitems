'use client';

import { useRef, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { FinalRecommendLoadingView } from './FinalRecommendLoadingView';
import { LoadingDots } from './LoadingDots';
import type { TimelineStep } from '@/types/recommend-v2';

interface LoadingAnimationProps {
  progress: number;
  timelineSteps: TimelineStep[];
}

/**
 * 추천 로딩 애니메이션 컴포넌트
 * - 접힌 토글 (기본)
 * - 프로그레스 바 (0-100%)
 * - 실시간 타이머
 * - 펼치기: 3단계 Accordion
 */
export function LoadingAnimation({ progress, timelineSteps }: LoadingAnimationProps) {
  const calculatingRef = useRef<HTMLDivElement>(null);

  // 자동 스크롤 (calculatingRef가 화면에 보이도록)
  useEffect(() => {
    if (calculatingRef.current) {
      setTimeout(() => {
        // StepIndicator 높이(약 48px) + 여백 고려하여 scroll-margin-top 설정하듯 scrollTo 사용
        const el = calculatingRef.current;
        if (!el) return;

        const container = el.closest('.overflow-y-auto');
        if (container) {
          const offset = 52;
          const targetScroll = (el as HTMLElement).offsetTop - offset;
          container.scrollTo({
            top: Math.max(0, targetScroll),
            behavior: 'smooth'
          });
        } else {
          // fallback
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 150);
    }
  }, []);

  return (
    <div className="w-full">
      <motion.div
        ref={calculatingRef}
        initial={{ opacity: 0, y: 0 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full py-2 flex flex-col items-start"
      >
        {/* 항상 펼쳐진 상태의 로딩 UI */}
        {timelineSteps.length > 0 && (
          <FinalRecommendLoadingView
            steps={timelineSteps}
            progress={progress}
          />
        )}
      </motion.div>
    </div>
  );
}
