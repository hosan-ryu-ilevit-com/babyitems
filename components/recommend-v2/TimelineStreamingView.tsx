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
  const [scrollTrigger, setScrollTrigger] = useState(0);

  // 자동 스크롤: steps가 업데이트되거나 일정 간격마다 스크롤
  useEffect(() => {
    const scrollToBottom = () => {
      if (containerRef.current) {
        containerRef.current.scrollTo({
          top: containerRef.current.scrollHeight,
          behavior: 'smooth'
        });
      }
    };

    scrollToBottom();

    // 스트리밍 중 지속적으로 스크롤 (100ms마다)
    const scrollInterval = setInterval(() => {
      scrollToBottom();
    }, 100);

    return () => clearInterval(scrollInterval);
  }, [steps, scrollTrigger]);

  // 스트리밍 중 스크롤 트리거 (200ms마다 업데이트)
  useEffect(() => {
    const trigger = setInterval(() => {
      setScrollTrigger(prev => prev + 1);
    }, 200);

    return () => clearInterval(trigger);
  }, []);

  if (steps.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-8 w-full max-w-md mx-auto"
    >
      {/* 타임라인 컨테이너 - 투명 배경, 상하단 fade 효과 */}
      <div className="relative">
        {/* 스크롤 컨테이너 - mask로 상하단 fade */}
        <div
          ref={containerRef}
          className="h-[150px] overflow-y-auto px-2 py-4"
          style={{
            msOverflowStyle: 'none',  // IE, Edge
            scrollbarWidth: 'none',   // Firefox
            maskImage: 'linear-gradient(to bottom, transparent 0%, black 35%, black 65%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 35%, black 65%, transparent 100%)',
          }}
        >
          <style jsx>{`
            div::-webkit-scrollbar {
              display: none;  /* Chrome, Safari, Opera */
            }
          `}</style>
          <div className="space-y-4">
            {(() => {
            let globalCumulativeDelay = 0; // 전체 스텝에 걸친 누적 delay

            return steps.map((step) => {
              // 이 스텝의 시작 시점
              const stepBaseDelay = globalCumulativeDelay;

              // Title delay
              let localDelay = 0;
              const titleDelay = stepBaseDelay + localDelay;
              localDelay += step.title.length * 20 + 100;

              // Details delays
              const detailDelays = step.details.map(detail => {
                const delay = stepBaseDelay + localDelay;
                localDelay += detail.length * 20 + 50;
                return delay;
              });

              // SubDetails delays
              const subDetailDelays: Array<{ labelDelay: number; itemDelays: number[] }> = [];
              if (step.subDetails) {
                step.subDetails.forEach(subDetail => {
                  const labelDelay = stepBaseDelay + localDelay;
                  localDelay += subDetail.label.length * 20 + 50;

                  const itemDelays = subDetail.items.map(item => {
                    const delay = stepBaseDelay + localDelay;
                    localDelay += item.length * 20 + 50;
                    return delay;
                  });

                  subDetailDelays.push({ labelDelay, itemDelays });
                });
              }

              // 글로벌 누적 업데이트
              globalCumulativeDelay += localDelay + 300;

            return (
              <div key={step.id} className="space-y-1.5">
                {/* 제목 */}
                <StreamedText
                  text={step.title}
                  delay={titleDelay}
                  className="text-sm font-semibold text-gray-800 block"
                />

                {/* Details (리스트) */}
                <div className="space-y-0.5">
                  {step.details.map((detail, idx) => (
                    <StreamedText
                      key={idx}
                      text={`  • ${detail}`}
                      delay={detailDelays[idx]}
                      className="text-xs text-gray-600 leading-relaxed block"
                    />
                  ))}
                </div>

                {/* SubDetails */}
                {step.subDetails && step.subDetails.length > 0 && (
                  <div className="space-y-1">
                    {step.subDetails.map((subDetail, subIdx) => (
                      <div key={subIdx} className="space-y-0.5">
                        <StreamedText
                          text={`  ${subDetail.label}`}
                          delay={subDetailDelays[subIdx].labelDelay}
                          className="text-xs font-medium text-gray-700 block"
                        />
                        {subDetail.items.map((item, itemIdx) => (
                          <StreamedText
                            key={itemIdx}
                            text={`    · ${item}`}
                            delay={subDetailDelays[subIdx].itemDelays[itemIdx]}
                            className="text-xs text-gray-600 leading-relaxed block"
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              );
            });
            })()}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/**
 * 개별 텍스트를 글자 단위로 스트리밍하는 컴포넌트
 */
function StreamedText({ text, delay, className }: { text: string; delay: number; className: string }) {
  const [displayedText, setDisplayedText] = useState('');

  useEffect(() => {
    // 초기 딜레이 후 스트리밍 시작
    const startTimer = setTimeout(() => {
      let currentIndex = 0;

      const streamInterval = setInterval(() => {
        if (currentIndex < text.length) {
          setDisplayedText(text.slice(0, currentIndex + 1));
          currentIndex++;
        } else {
          clearInterval(streamInterval);
        }
      }, 20); // 20ms마다 1글자씩

      return () => clearInterval(streamInterval);
    }, delay);

    return () => clearTimeout(startTimer);
  }, [text, delay]);

  return <span className={className}>{displayedText}</span>;
}

