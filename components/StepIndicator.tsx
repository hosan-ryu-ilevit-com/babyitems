import React from 'react';

interface StepIndicatorProps {
  currentStep?: number;
  className?: string;
}

export function StepIndicator({ currentStep = 1, className }: StepIndicatorProps) {
  const steps = [1, 2, 3, 4];
  return (
    <div className={`sticky left-0 right-0 z-40 flex justify-center pointer-events-none ${className ?? 'top-14'}`}>
      <div className="mt-2 flex items-center bg-white/70 border border-gray-200 rounded-[42px] px-4 py-[6px] backdrop-blur-[12px] pointer-events-auto">
        {steps.map((step, idx) => (
          <React.Fragment key={step}>
            <div className={`w-[28px] h-[28px] rounded-full flex items-center justify-center text-[12px] font-bold border transition-all ${
              step <= currentStep 
                ? 'bg-gray-800 border-gray-200 text-white' 
                : 'bg-transparent border-gray-200 text-gray-300'
            }`}>
              {step}
            </div>
            {idx < steps.length - 1 && (
              <div className="w-6 h-[1px] mx-1 bg-gray-200" />
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
