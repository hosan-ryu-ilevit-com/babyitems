'use client';

import { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { TimelineStreamingView } from './TimelineStreamingView';
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
        calculatingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 150);
    }
  }, []);

  return (
    <div className="w-full">
      <motion.div
        ref={calculatingRef}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full py-8 flex flex-col items-center"
      >
        {/* 로딩 비디오 - 정사각형, 작게 */}
        <div className="w-[100px] h-[100px] rounded-2xl overflow-hidden bg-white mb-6">
          <video
            autoPlay
            loop
            muted
            playsInline
            className="w-full h-full object-cover"
          >
            <source src="/animations/recommendloading.MP4" type="video/mp4" />
          </video>
        </div>

        {/* 프로그레스 % */}
        <div className="flex flex-col items-center">
          <span className="text-xl font-semibold text-gray-700 tabular-nums mb-2">
            {Math.floor(progress)}%
          </span>
        </div>

        {/* 타임라인 스트리밍 표시 - 모든 세부사항 글자 단위 스트리밍 */}
        {timelineSteps.length > 0 && (
          <TimelineStreamingView steps={timelineSteps} />
        )}
      </motion.div>
    </div>
  );
}
