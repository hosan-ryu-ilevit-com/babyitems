'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import type { TimelineStep } from '@/types/recommend-v2';

interface TimelineStreamingViewProps {
  steps: TimelineStep[];
}

/**
 * 로딩 화면에서 타임라인 전체 내용을 글자 단위로 스트리밍하는 컴포넌트
 * 각 단계는 이전 단계의 스트리밍이 완료된 후에만 표시됩니다.
 */
export function TimelineStreamingView({ steps }: TimelineStreamingViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // 스트리밍이 완료된 step index들을 추적
  const [completedStepIndices, setCompletedStepIndices] = useState<Set<number>>(new Set());
  // 현재 스트리밍 중인 step index
  const [currentStreamingIndex, setCurrentStreamingIndex] = useState(0);

  // step 스트리밍 완료 핸들러
  const handleStepComplete = useCallback((stepIndex: number) => {
    setCompletedStepIndices(prev => new Set([...prev, stepIndex]));
    // 다음 step이 있으면 스트리밍 시작
    setCurrentStreamingIndex(prev => {
      if (stepIndex + 1 < steps.length && stepIndex + 1 > prev) {
        return stepIndex + 1;
      }
      return prev;
    });
  }, [steps.length]);

  // 새 step이 추가되었을 때, 이전 step이 완료되었으면 바로 시작
  const effectiveStreamingIndex = (() => {
    const lastIndex = steps.length - 1;
    if (lastIndex > 0 && completedStepIndices.has(lastIndex - 1) && currentStreamingIndex < lastIndex) {
      return lastIndex;
    }
    return currentStreamingIndex;
  })();

  // 자동 스크롤: 내부 콘텐츠 변화(스트리밍 등) 감지하여 하단 유지
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new MutationObserver(() => {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: 'smooth'
      });
    });

    observer.observe(container, {
      childList: true,
      subtree: true,
      characterData: true
    });

    return () => observer.disconnect();
  }, []);

  if (steps.length === 0) return null;

  // 현재 보여줄 step: 스트리밍 중이거나 완료된 것만
  const visibleStepCount = effectiveStreamingIndex + 1;
  const currentStep = steps[Math.min(effectiveStreamingIndex, steps.length - 1)];

  return (
    <div className="w-full flex flex-col gap-8">
      {/* 상단: 현재 진행 중인 메인 작업 (AI 그라데이션) */}
      <div className="flex items-start gap-2.5 px-1">
        <div className="w-4 h-4 flex items-center justify-center shrink-0 mt-0.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/ic-ai.svg" alt="" width={16} height={16} />
        </div>

        <div className="flex flex-col gap-1">
          <motion.h2
            key={currentStep.id}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.5 }}
            className="text-[16px] font-medium ai-gradient-text leading-snug tracking-tight"
          >
            {currentStep.title}......
          </motion.h2>
          <Timer className="text-gray-400/80 font-mono text-[13px]" />
        </div>
      </div>

      {/* 하단: 상세 타임라인 리스트 */}
      <div className="relative">
        <div
          ref={containerRef}
          className="max-h-[320px] overflow-y-auto px-1 space-y-8 scrollbar-hide pb-4"
          style={{
            maskImage: 'linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%)',
          }}
        >
          {steps.slice(0, visibleStepCount).map((step, idx) => {
            const isCurrentlyStreaming = idx === effectiveStreamingIndex;
            const isCompleted = completedStepIndices.has(idx);

            return (
              <motion.div
                key={step.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="relative flex gap-4"
              >
                {/* 왼쪽 라인 및 아이콘 */}
                <div className="flex flex-col items-center shrink-0">
                  <div className="w-6 h-6 flex items-center justify-center z-10">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-gray-400">
                      <circle cx="11" cy="11" r="8" />
                      <path d="m21 21-4.3-4.3" />
                    </svg>
                  </div>
                  <div className="w-[1px] flex-1 bg-gray-200 my-1" />
                </div>

                {/* 콘텐츠 */}
                <div className="flex-1 space-y-2">
                  <StepContent
                    step={step}
                    isStreaming={isCurrentlyStreaming}
                    isCompleted={isCompleted}
                    onComplete={() => handleStepComplete(idx)}
                  />
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * 개별 Step 콘텐츠 (순차 스트리밍)
 */
function StepContent({
  step,
  isStreaming,
  isCompleted,
  onComplete
}: {
  step: TimelineStep;
  isStreaming: boolean;
  isCompleted: boolean;
  onComplete: () => void;
}) {
  const [titleComplete, setTitleComplete] = useState(false);
  const [detailsCompleteCount, setDetailsCompleteCount] = useState(0);
  const hasReportedComplete = useRef(false);

  // 완료 체크: title + 모든 details 완료 시 (한 번만 호출)
  useEffect(() => {
    if (titleComplete && detailsCompleteCount >= step.details.length && !hasReportedComplete.current) {
      hasReportedComplete.current = true;
      onComplete();
    }
  }, [titleComplete, detailsCompleteCount, step.details.length, onComplete]);

  // 이미 완료된 step은 전체 텍스트 즉시 표시
  if (isCompleted && !isStreaming) {
    return (
      <>
        <h3 className="text-[16px] font-semibold text-gray-600 leading-snug">
          {step.title}
        </h3>
        <div className="space-y-1">
          {step.details.map((detail, dIdx) => (
            <span key={`${step.id}-d-${dIdx}`} className="text-[14px] font-medium text-gray-400 leading-relaxed block">
              {detail}
            </span>
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <h3 className="text-[16px] font-semibold text-gray-600 leading-snug">
        <StreamedText
          text={step.title}
          className=""
          speed={15}
          onComplete={() => setTitleComplete(true)}
          shouldStream={isStreaming}
        />
      </h3>

      <div className="space-y-1">
        {step.details.map((detail, dIdx) => (
          <StreamedText
            key={`${step.id}-d-${dIdx}`}
            text={detail}
            className="text-[14px] font-medium text-gray-400 leading-relaxed block"
            speed={12}
            // title 완료 후, 이전 detail들이 완료되면 시작
            shouldStream={isStreaming && titleComplete && dIdx <= detailsCompleteCount}
            onComplete={() => setDetailsCompleteCount(prev => prev + 1)}
          />
        ))}
      </div>
    </>
  );
}

/**
 * 개별 텍스트를 글자 단위로 스트리밍하는 컴포넌트
 */
function StreamedText({
  text,
  className,
  speed = 20,
  shouldStream = true,
  onComplete
}: {
  text: string;
  className: string;
  speed?: number;
  shouldStream?: boolean;
  onComplete?: () => void;
}) {
  const [displayedText, setDisplayedText] = useState('');
  const hasCompletedRef = useRef(false);

  useEffect(() => {
    // 스트리밍 비활성화 시 대기
    if (!shouldStream) {
      return;
    }

    let currentIndex = displayedText.length; // 기존 진행 상태 유지
    const streamInterval = setInterval(() => {
      if (currentIndex < text.length) {
        setDisplayedText(text.slice(0, currentIndex + 1));
        currentIndex++;
      } else {
        clearInterval(streamInterval);
        // 완료 콜백 (한 번만 호출)
        if (onComplete && !hasCompletedRef.current) {
          hasCompletedRef.current = true;
          onComplete();
        }
      }
    }, speed);

    return () => clearInterval(streamInterval);
  }, [text, speed, shouldStream, onComplete, displayedText.length]);

  // 스트리밍 비활성화 상태면 아무것도 표시하지 않음
  if (!shouldStream && displayedText.length === 0) {
    return null;
  }

  return <span className={className}>{displayedText}</span>;
}

/**
 * 소수점 둘째자리까지 표시되는 타이머 컴포넌트
 */
function Timer({ className }: { className?: string }) {
  const [time, setTime] = useState(0);

  useEffect(() => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      setTime((Date.now() - startTime) / 1000);
    }, 40); // 25fps 정도로 업데이트

    return () => clearInterval(interval);
  }, []);

  return <span className={className}>{time.toFixed(2)}s</span>;
}

