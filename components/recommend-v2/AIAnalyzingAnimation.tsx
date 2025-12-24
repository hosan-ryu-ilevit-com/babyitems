'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

interface AIAnalyzingAnimationProps {
  categoryName: string;
  onComplete?: () => void;
}

/**
 * AI 분석 중 애니메이션 컴포넌트
 * B 버전: 자연어 입력 후 AI가 모든 필터를 분석하는 동안 표시
 */
export function AIAnalyzingAnimation({
  categoryName,
  onComplete,
}: AIAnalyzingAnimationProps) {
  const [progress, setProgress] = useState(0);
  const onCompleteRef = useRef(onComplete);
  const hasCompletedRef = useRef(false);

  // 랜덤 duration (2500~3500ms) - One-Shot API 호출 시간 고려
  const actualDurationRef = useRef(
    Math.floor(Math.random() * (3500 - 2500 + 1)) + 2500
  );

  // 최신 onComplete 콜백 참조 유지
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    const actualDuration = actualDurationRef.current;
    const interval = 30;
    const baseStep = (100 * interval) / actualDuration;

    const timer = setInterval(() => {
      setProgress(prev => {
        const randomMultiplier = 0.5 + Math.random();
        const randomStep = baseStep * randomMultiplier;

        const next = prev + randomStep;
        if (next >= 100) {
          clearInterval(timer);
          if (!hasCompletedRef.current && onCompleteRef.current) {
            hasCompletedRef.current = true;
            setTimeout(() => onCompleteRef.current?.(), 300);
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
    if (progress < 25) return '상황 분석 중...';
    if (progress < 50) return '최적 조건 선택 중...';
    if (progress < 75) return '선호도 파악 중...';
    if (progress < 95) return '추천 조건 정리 중...';
    return '분석 완료!';
  };

  const stages = [
    { label: '상황 분석', threshold: 25 },
    { label: '필터 선택', threshold: 50 },
    { label: '선호도 파악', threshold: 75 },
    { label: '조건 정리', threshold: 95 },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col items-center justify-center py-8 px-6"
    >
      {/* 메인 카드 영역 */}
      <div className="w-full max-w-sm bg-white rounded-2xl border border-purple-100 p-6 mb-6 shadow-sm">
        {/* 프로그레스 바 */}
        <div className="mb-6">
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-[#5F0080] to-[#8B00B8] rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ ease: 'linear' }}
            />
          </div>
          <div className="flex justify-between mt-2">
            <span className="text-xs text-gray-400">AI 분석 중</span>
            <span className="text-xs font-medium text-gray-700">{Math.round(progress)}%</span>
          </div>
        </div>

        {/* 분석 단계 체크리스트 */}
        <div className="space-y-3">
          {stages.map((stage) => {
            const isActive = progress >= stage.threshold;
            return (
              <div key={stage.label} className="flex items-center gap-3">
                <span className={`font-bold ${isActive ? 'text-[#5F0080]' : 'text-gray-200'}`}>
                  {isActive ? '✓' : '○'}
                </span>
                <span className={`text-[15px] ${isActive ? 'text-gray-800' : 'text-gray-400'}`}>
                  {stage.label}
                </span>
                {isActive && (
                  <span className="ml-auto px-2.5 py-1 rounded-full bg-purple-50 text-[#5F0080] text-xs font-medium">
                    완료
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 분석 중 메시지 */}
      <div className="text-center space-y-3">
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
          <strong className="text-gray-700">{categoryName}</strong>에 맞는 조건을 찾고 있어요
        </p>
      </div>

    </motion.div>
  );
}
