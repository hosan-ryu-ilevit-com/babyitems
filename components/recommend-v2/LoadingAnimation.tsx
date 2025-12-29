'use client';

import { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { TimelineStreamingView } from './TimelineStreamingView';
import { LoadingDots } from './LoadingDots';
import type { TimelineStep } from '@/types/recommend-v2';

interface LoadingAnimationProps {
  progress: number;
  timelineSteps: TimelineStep[];
}

/**
 * 추천 로딩 애니메이션 컴포넌트
 * - 비디오 애니메이션
 * - 프로그레스 바 (0-100%)
 * - 단계별 메시지 (애니메이션)
 * - 타임라인 스트리밍 뷰
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
          const offset = 70;
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
        className="w-full py-12 flex flex-col items-start"
      >
        {/* 타임라인 스트리밍 표시 - 새로운 디자인 레이아웃 */}
        {timelineSteps.length > 0 && (
          <TimelineStreamingView steps={timelineSteps} />
        )}
      </motion.div>
    </div>
  );
}
