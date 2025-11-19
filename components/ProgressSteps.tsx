'use client';

import { motion } from 'framer-motion';
import { Check } from '@phosphor-icons/react/dist/ssr';

interface ProgressStepsProps {
  currentStep: number; // 1, 2, 3, or 4
  totalSteps?: number;
}

const STEP_LABELS = [
  '원하는 장점',
  '피할 단점',
  '예산 설정',
  '추천 받기'
];

export default function ProgressSteps({
  currentStep,
  totalSteps = 4
}: ProgressStepsProps) {
  return (
    <div className="w-full px-4 py-4">
      <div className="flex items-center justify-between relative">
        {/* Progress Bar Background */}
        <div className="absolute top-4 left-0 right-0 h-0.5 bg-gray-200 -z-10" />

        {/* Progress Bar Fill */}
        <motion.div
          className="absolute top-4 left-0 h-0.5 bg-cyan-500 -z-10"
          initial={{ width: '0%' }}
          animate={{
            width: `${((currentStep - 1) / (totalSteps - 1)) * 100}%`
          }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        />

        {/* Step Indicators */}
        {STEP_LABELS.map((label, index) => {
          const stepNumber = index + 1;
          const isActive = stepNumber === currentStep;
          const isCompleted = stepNumber < currentStep;

          return (
            <div
              key={stepNumber}
              className="flex flex-col items-center gap-2 relative z-10"
              style={{ flex: 1 }}
            >
              {/* Circle */}
              <motion.div
                initial={false}
                animate={{
                  scale: isActive ? 1.1 : 1,
                  backgroundColor: isCompleted || isActive ? '#06b6d4' : '#e5e7eb'
                }}
                transition={{ duration: 0.2 }}
                className={`
                  w-8 h-8 rounded-full flex items-center justify-center
                  ${isCompleted || isActive ? 'text-white' : 'text-gray-400'}
                  font-bold text-sm
                  shadow-sm
                `}
              >
                {isCompleted ? (
                  <Check size={16} weight="bold" />
                ) : (
                  stepNumber
                )}
              </motion.div>

              {/* Label */}
              <span
                className={`
                  text-xs whitespace-nowrap
                  ${isActive ? 'text-cyan-600 font-bold' : 'text-gray-500'}
                `}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
