'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import type { TimelineStep } from '@/types/recommend-v2';

interface TimelineStreamingViewProps {
  steps: TimelineStep[];
}

/**
 * 로딩 화면에서 타임라인 전체 내용을 글자 단위로 스트리밍하는 컴포넌트
 */
export function TimelineStreamingView({ steps }: TimelineStreamingViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeStepId, setActiveStepId] = useState<string | null>(null);

  // 가장 최근에 추가된 스텝을 활성 스텝으로 설정
  useEffect(() => {
    if (steps.length > 0) {
      setActiveStepId(steps[steps.length - 1].id);
    }
  }, [steps]);

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

  const currentStep = steps[steps.length - 1];

  return (
    <div className="w-full flex flex-col gap-8">
      {/* 상단: 현재 진행 중인 메인 작업 (AI 그라데이션) */}
      <div className="flex items-start gap-2.5 px-1">
        <div className="w-[22px] h-[22px] flex items-center justify-center shrink-0 mt-0.5">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 3L14.5 9L21 11.5L14.5 14L12 20L9.5 14L3 11.5L9.5 9L12 3Z" fill="url(#ai_gradient_header)" />
            <defs>
              <linearGradient id="ai_gradient_header" x1="21" y1="12" x2="3" y2="12" gradientUnits="userSpaceOnUse">
                <stop stopColor="#77A0FF" />
                <stop offset="0.7" stopColor="#907FFF" />
                <stop offset="1" stopColor="#6947FF" />
              </linearGradient>
            </defs>
          </svg>
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
          {steps.map((step, idx) => {
            const isLast = idx === steps.length - 1;
            
            return (
              <div key={step.id} className="relative flex gap-4">
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
                  <h3 className="text-[16px] font-semibold text-gray-600 leading-snug">
                    <StreamedText
                      text={step.title}
                      className=""
                      speed={20}
                    />
                  </h3>
                  
                  <div className="space-y-1">
                    {step.details.map((detail, dIdx) => (
                      <StreamedText
                        key={`${step.id}-d-${dIdx}`}
                        text={detail}
                        className="text-[14px] font-medium text-gray-400 leading-relaxed block"
                        speed={25}
                      />
                    ))}
                    
                    {step.subDetails?.map((sub, sIdx) => (
                      <div key={`${step.id}-s-${sIdx}`} className="space-y-1.5 pt-1">
                        <span className="text-[13px] font-bold text-gray-500 block">
                          {sub.label}
                        </span>
                        <div className="flex flex-wrap gap-x-2 gap-y-1">
                          {sub.items.map((item, iIdx) => (
                            <StreamedText
                              key={`${step.id}-si-${sIdx}-${iIdx}`}
                              text={item + (iIdx < sub.items.length - 1 ? ',' : '')}
                              className="text-[13px] font-medium text-gray-400 block"
                              speed={10}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * 개별 텍스트를 글자 단위로 스트리밍하는 컴포넌트
 */
function StreamedText({ text, className, speed = 20 }: { text: string; className: string; speed?: number }) {
  const [displayedText, setDisplayedText] = useState('');

  useEffect(() => {
    let currentIndex = 0;
    const streamInterval = setInterval(() => {
      if (currentIndex < text.length) {
        setDisplayedText(text.slice(0, currentIndex + 1));
        currentIndex++;
      } else {
        clearInterval(streamInterval);
      }
    }, speed);

    return () => clearInterval(streamInterval);
  }, [text, speed]);

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

