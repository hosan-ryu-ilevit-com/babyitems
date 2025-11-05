'use client';

import { PriorityLevel } from '@/types';

interface PriorityButtonProps {
  level: PriorityLevel;
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
}

const LEVEL_LABELS: Record<PriorityLevel, string> = {
  low: '중요하지 않음',
  medium: '보통',
  high: '중요함',
};

export function PriorityButton({ level, selected, onClick, disabled = false }: PriorityButtonProps) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`
        flex-1 h-10 font-medium text-xs rounded-lg transition-all
        ${disabled
          ? 'bg-gray-100 text-gray-400 cursor-not-allowed opacity-50'
          : selected
          ? 'bg-gray-900 text-white shadow-sm'
          : 'bg-white text-gray-700 hover:bg-gray-50'
        }
      `}
    >
      {LEVEL_LABELS[level]}
    </button>
  );
}
