import React from 'react';

interface StepIndicatorProps {
  currentStep?: number;
  className?: string;
}

export function StepIndicator({ currentStep = 1, className }: StepIndicatorProps) {
  const steps = [
    { id: 1, label: '조건 고르기' },
    { id: 2, label: '밸런스 게임' },
    { id: 3, label: '예산 설정' },
  ];

  return (
    <div className={`sticky left-0 right-0 z-40 flex justify-center pointer-events-none ${className ?? 'top-0'}`}>
      <div className="w-full max-w-[480px] h-[49px] flex flex-col items-center bg-white pt-[12px] pb-[10px] pointer-events-auto">
        <div className="flex w-full justify-between items-center mb-[6px]">
          {steps.map((step) => {
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
          {steps.map((step) => {
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
