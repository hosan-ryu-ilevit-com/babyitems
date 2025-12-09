'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

interface ScanAnimationProps {
  categoryName: string;
  onComplete: () => void;
  duration?: number; // ms
}

/**
 * 스캔 애니메이션 컴포넌트 (개선 버전)
 * - 더 세련된 원형 프로그레스 애니메이션
 * - 분석 단계 시각화
 */
export function ScanAnimation({
  categoryName,
  onComplete,
  duration = 2500,
}: ScanAnimationProps) {
  const [progress, setProgress] = useState(0);
  const onCompleteRef = useRef(onComplete);
  const hasCompletedRef = useRef(false);

  // 최신 onComplete 콜백 참조 유지
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    const interval = 30; // 30ms마다 업데이트 (더 부드러움)
    const step = (100 * interval) / duration;

    const timer = setInterval(() => {
      setProgress(prev => {
        const next = prev + step;
        if (next >= 100) {
          clearInterval(timer);
          if (!hasCompletedRef.current) {
            hasCompletedRef.current = true;
            setTimeout(() => onCompleteRef.current(), 400);
          }
          return 100;
        }
        return next;
      });
    }, interval);

    return () => clearInterval(timer);
  }, [duration]);

  // 단계별 메시지
  const getStageMessage = () => {
    if (progress < 30) return '리뷰 수집 중...';
    if (progress < 60) return '스펙 분석 중...';
    if (progress < 85) return '가격 비교 중...';
    return '최적화 완료!';
  };

  const stages = [
    { label: '리뷰', threshold: 30 },
    { label: '스펙', threshold: 60 },
    { label: '가격', threshold: 85 },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col items-center justify-center py-12 px-6"
    >
      {/* 메인 애니메이션 영역 */}
      <div className="relative w-36 h-36 mb-8">
        {/* 배경 원 */}
        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-blue-50 to-purple-50" />

        {/* 프로그레스 링 */}
        <svg className="absolute inset-0 w-full h-full -rotate-90">
          {/* 배경 트랙 */}
          <circle
            cx="72"
            cy="72"
            r="60"
            fill="none"
            stroke="#E5E7EB"
            strokeWidth="8"
          />
          {/* 프로그레스 */}
          <motion.circle
            cx="72"
            cy="72"
            r="60"
            fill="none"
            stroke="url(#gradient)"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 60}`}
            strokeDashoffset={`${2 * Math.PI * 60 * (1 - progress / 100)}`}
            className="drop-shadow-sm"
          />
          {/* 그라디언트 정의 */}
          <defs>
            <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#3B82F6" />
              <stop offset="100%" stopColor="#8B5CF6" />
            </linearGradient>
          </defs>
        </svg>

        {/* 중앙 컨텐츠 */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {/* 퍼센트 */}
          <motion.span
            key={Math.round(progress)}
            initial={{ scale: 0.8, opacity: 0.5 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent"
          >
            {Math.round(progress)}%
          </motion.span>
        </div>

        {/* 회전하는 점 */}
        <motion.div
          className="absolute w-3 h-3 bg-blue-500 rounded-full shadow-lg"
          style={{
            top: '50%',
            left: '50%',
            marginTop: '-6px',
            marginLeft: '-6px',
            transformOrigin: '0 0',
          }}
          animate={{
            rotate: progress * 3.6,
            x: Math.cos((progress * 3.6 - 90) * Math.PI / 180) * 60,
            y: Math.sin((progress * 3.6 - 90) * Math.PI / 180) * 60,
          }}
          transition={{ type: 'tween', ease: 'linear' }}
        />
      </div>

      {/* 분석 중 메시지 */}
      <div className="text-center space-y-3 mb-6">
        <motion.p
          key={getStageMessage()}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-sm font-medium text-gray-600"
        >
          {getStageMessage()}
        </motion.p>
        <p className="text-xs text-gray-400 leading-relaxed max-w-[260px]">
          최근 3개월간 맘카페, 블로그 등의
          <br />
          <strong className="text-gray-600">{categoryName}</strong> 실제 사용기를 분석 중
        </p>
      </div>

      {/* 분석 단계 표시 */}
      <div className="flex items-center gap-3">
        {stages.map((stage, index) => {
          const isActive = progress >= stage.threshold;
          const isCurrentStage =
            progress >= stage.threshold &&
            (index === stages.length - 1 || progress < stages[index + 1].threshold);

          return (
            <motion.div
              key={stage.label}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                isActive
                  ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-md'
                  : 'bg-gray-100 text-gray-400'
              }`}
              animate={isCurrentStage ? { scale: [1, 1.05, 1] } : {}}
              transition={{ repeat: Infinity, duration: 1 }}
            >
              {isActive ? (
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              ) : (
                <div className="w-3 h-3 rounded-full border border-gray-300" />
              )}
              {stage.label}
            </motion.div>
          );
        })}
      </div>

      {/* 펄스 효과 (배경) */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.1, 0] }}
        transition={{ repeat: Infinity, duration: 2 }}
      >
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 rounded-full bg-blue-400 blur-3xl" />
      </motion.div>
    </motion.div>
  );
}
