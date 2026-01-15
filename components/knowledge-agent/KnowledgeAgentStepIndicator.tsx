import React from 'react';

interface KnowledgeAgentStepIndicatorProps {
  currentStep?: number;
  className?: string;
}

const STEPS = [
  { id: 1, label: '카테고리 설정' },
  { id: 2, label: '맞춤 질문' },
  { id: 3, label: '선호도 파악' },
  { id: 4, label: '추천 완료' },
];

export function KnowledgeAgentStepIndicator({
  currentStep = 1,
  className,
}: KnowledgeAgentStepIndicatorProps) {
  return (
    <div className={`sticky left-0 right-0 z-50 flex justify-center pointer-events-none ${className ?? 'top-0'}`}>
      <div className="w-full max-w-[480px] h-[49px] flex flex-col items-center bg-white/95 backdrop-blur-sm pt-[12px] pb-[10px] pointer-events-auto px-4 border-b border-gray-100/50">
        <div className="flex w-full justify-between items-center mb-[6px]">
          {STEPS.map((step) => {
            const isCompleted = step.id < currentStep;
            const isCurrent = step.id === currentStep;

            let textColorClass = 'text-gray-300 font-medium';
            if (isCompleted) textColorClass = 'text-gray-400 font-medium';
            if (isCurrent) textColorClass = 'text-gray-600 font-semibold';

            return (
              <div
                key={step.id}
                className={`text-[13px] transition-colors text-center flex-1 ${textColorClass}`}
              >
                {step.label}
              </div>
            );
          })}
        </div>
        <div className="flex w-full gap-[6px] px-1">
          {STEPS.map((step) => {
            const isCompleted = step.id < currentStep;
            const isCurrent = step.id === currentStep;

            let barColorClass = 'bg-gray-100';
            if (isCompleted) barColorClass = 'bg-gray-400';
            if (isCurrent) barColorClass = 'bg-gray-600';

            return (
              <div
                key={step.id}
                className={`h-[2px] flex-1 rounded-full transition-all duration-300 ${barColorClass}`}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
