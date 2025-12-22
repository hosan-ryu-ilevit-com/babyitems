'use client';

import { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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

  // 단계별 메시지 (타임라인과 일치)
  const getStageMessage = () => {
    if (progress < 12) return '📦 상품 데이터 준비 중...';
    if (progress < 20) return '📚 카테고리 전문 지식 로드 중...';
    if (progress < 35) return '📝 실사용 리뷰 수집 중...';
    if (progress < 55) return '🤖 AI 종합 분석 중...';
    if (progress < 95) return '🏆 Top 3 최종 선정 중...';
    return '✨ 최종 결과 준비 중...';
  };

  // 단계 번호 계산 (메시지 변경 시 애니메이션용)
  const getStageIndex = () => {
    if (progress < 3) return 0;
    if (progress < 8) return 1;
    if (progress < 12) return 2;
    if (progress < 15) return 3;
    if (progress < 55) return 4;
    if (progress < 95) return 5;
    return 6;
  };

  const currentMessage = getStageMessage();

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

        {/* 프로그레스 + thinking 메시지 - 가운데 정렬 */}
        <div className="flex flex-col items-center">
          {/* 프로그레스 % */}
          <span className="text-xl font-semibold text-gray-700 tabular-nums">
            {Math.floor(progress)}%
          </span>

          {/* 단계별 메시지 - 가운데 정렬, 단계 변경 시 애니메이션 */}
          <div className="mt-2 h-6 overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.span
                key={getStageIndex()}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
                className="text-sm font-semibold text-gray-500 block text-center"
              >
                {currentMessage}
              </motion.span>
            </AnimatePresence>
          </div>
        </div>

        {/* 타임라인 스트리밍 표시 - 모든 세부사항 글자 단위 스트리밍 */}
        {timelineSteps.length > 0 && (
          <TimelineStreamingView steps={timelineSteps} />
        )}
      </motion.div>
    </div>
  );
}
