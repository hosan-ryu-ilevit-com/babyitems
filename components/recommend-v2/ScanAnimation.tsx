'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

interface ScanAnimationProps {
  categoryName: string;
  onComplete: () => void;
}

/**
 * 스캔 애니메이션 컴포넌트
 * - GuideCards와 일관된 디자인 언어 사용
 * - 심플하고 깔끔한 스타일
 */
export function ScanAnimation({
  categoryName,
  onComplete,
}: ScanAnimationProps) {
  const [progress, setProgress] = useState(0);
  const onCompleteRef = useRef(onComplete);
  const hasCompletedRef = useRef(false);

  // 랜덤 duration (1900~2300ms)
  const actualDurationRef = useRef(
    Math.floor(Math.random() * (2300 - 1900 + 1)) + 1900
  );

  // 최신 onComplete 콜백 참조 유지
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    const actualDuration = actualDurationRef.current;
    const interval = 30; // 30ms마다 업데이트
    const baseStep = (100 * interval) / actualDuration;

    const timer = setInterval(() => {
      setProgress(prev => {
        // 랜덤 step: baseStep의 0.5~1.5배 사이 변동
        const randomMultiplier = 0.5 + Math.random();
        const randomStep = baseStep * randomMultiplier;

        const next = prev + randomStep;
        if (next >= 100) {
          clearInterval(timer);
          if (!hasCompletedRef.current) {
            hasCompletedRef.current = true;
            setTimeout(() => onCompleteRef.current(), 300);
          }
          return 100;
        }
        return next;
      });
    }, interval);

    return () => clearInterval(timer);
  }, []);

  // 단계별 메시지
  const getStageMessage = () => {
    if (progress < 30) return '리뷰 수집 중...';
    if (progress < 60) return '스펙 분석 중...';
    if (progress < 85) return '가격 비교 중...';
    return '분석 완료!';
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
      transition={{ duration: 0.2 }}
      className="flex flex-col items-center justify-center py-12 px-6"
    >
      {/* 메인 카드 영역 */}
      <div className="w-full max-w-sm bg-white rounded-2xl border border-blue-100 p-6 mb-6">
        {/* 프로그레스 바 */}
        <div className="mb-6">
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-[#5F0080] rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ ease: 'linear' }}
            />
          </div>
          <div className="flex justify-between mt-2">
            <span className="text-xs text-gray-400">분석 중</span>
            <span className="text-xs font-medium text-gray-700">{Math.round(progress)}%</span>
          </div>
        </div>

        {/* 분석 단계 체크리스트 */}
        <div className="space-y-3">
          {stages.map((stage) => {
            const isActive = progress >= stage.threshold;
            return (
              <div key={stage.label} className="flex items-center gap-3">
                <span className={`font-bold ${isActive ? 'text-green-500' : 'text-gray-200'}`}>
                  {isActive ? '✓' : '○'}
                </span>
                <span className={`text-[15px] ${isActive ? 'text-gray-800' : 'text-gray-400'}`}>
                  {stage.label} 분석
                </span>
                {isActive && (
                  <span className="ml-auto px-2.5 py-1 rounded-full bg-green-50 text-green-600 text-xs font-medium">
                    완료
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 분석 중 메시지 */}
      <div className="text-center space-y-2">
        <motion.p
          key={getStageMessage()}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
          className="text-base font-medium text-gray-900"
        >
          {getStageMessage()}
        </motion.p>
        <p className="text-sm text-gray-500 leading-relaxed">
          <strong className="text-gray-700">{categoryName}</strong> 실사용 리뷰를 분석하고 있어요
        </p>
      </div>
    </motion.div>
  );
}
