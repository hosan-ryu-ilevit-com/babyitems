'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

interface AIAnalyzingAnimationProps {
  categoryName: string;
  userContext: string;
  onComplete?: () => void;
}

/**
 * AI 분석 중 애니메이션 컴포넌트
 * B 버전: 자연어 입력 후 AI가 모든 필터를 분석하는 동안 표시
 */
export function AIAnalyzingAnimation({
  categoryName,
  userContext,
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

  // 사용자 입력 요약 (너무 길면 자르기)
  const contextSummary = userContext.length > 50
    ? userContext.substring(0, 50) + '...'
    : userContext;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col items-center justify-center py-12 px-6"
    >
      {/* AI 아이콘 + 펄스 애니메이션 */}
      <div className="relative mb-8">
        <motion.div
          animate={{
            scale: [1, 1.1, 1],
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          className="w-20 h-20 rounded-full bg-gradient-to-br from-[#5F0080] to-[#8B00B8] flex items-center justify-center shadow-lg"
        >
          <svg
            className="w-10 h-10 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
            />
          </svg>
        </motion.div>
        {/* 펄스 링 */}
        <motion.div
          animate={{
            scale: [1, 1.5],
            opacity: [0.5, 0],
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: 'easeOut',
          }}
          className="absolute inset-0 w-20 h-20 rounded-full border-2 border-[#5F0080]"
        />
      </div>

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

      {/* 사용자 입력 미리보기 */}
      <div className="mt-6 px-4 py-3 bg-gray-50 rounded-xl max-w-sm w-full">
        <p className="text-xs text-gray-400 mb-1">입력하신 내용</p>
        <p className="text-sm text-gray-700 leading-relaxed">"{contextSummary}"</p>
      </div>
    </motion.div>
  );
}
