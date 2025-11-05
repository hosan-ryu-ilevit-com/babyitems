'use client';

import { motion } from 'framer-motion';
import { PriorityLevel } from '@/types';

interface PriorityButtonProps {
  level: PriorityLevel;
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
}

const LEVEL_LABELS: Record<PriorityLevel, string> = {
  low: '중요 안 함',
  medium: '보통',
  high: '중요함',
};

export function PriorityButton({ level, selected, onClick, disabled = false }: PriorityButtonProps) {
  return (
    <motion.button
      whileTap={!disabled ? { scale: 0.95 } : {}}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`
        flex-1 h-12 rounded-xl font-medium text-sm transition-all
        ${
          selected
            ? 'bg-gray-900 text-white border-2 border-gray-900'
            : disabled
            ? 'bg-gray-100 text-gray-400 border-2 border-gray-200 cursor-not-allowed'
            : 'bg-white text-gray-700 border-2 border-gray-300 hover:border-gray-400'
        }
      `}
    >
      {LEVEL_LABELS[level]}
    </motion.button>
  );
}
