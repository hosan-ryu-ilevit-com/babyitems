'use client';

import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';

interface DirectInputFieldProps {
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  maxLength?: number;
  filterType?: 'hard_filter' | 'negative_filter';
}

export default function DirectInputField({
  placeholder = '원하는 조건을 직접 입력해주세요',
  value,
  onChange,
  disabled = false,
  maxLength = 200,
  filterType = 'hard_filter',
}: DirectInputFieldProps) {
  const [isFocused, setIsFocused] = useState(false);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      if (newValue.length <= maxLength) {
        onChange(newValue);
      }
    },
    [onChange, maxLength]
  );

  const isNegative = filterType === 'negative_filter';
  const borderColor = isFocused
    ? isNegative
      ? 'border-rose-400'
      : 'border-violet-400'
    : 'border-gray-200';
  const focusRingColor = isNegative ? 'ring-rose-100' : 'ring-violet-100';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="mt-4 pt-4 border-t border-gray-100"
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs text-gray-400">
          {isNegative ? '피하고 싶은 조건이 더 있나요?' : '원하는 조건이 더 있나요?'}
        </span>
      </div>
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={handleChange}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          disabled={disabled}
          placeholder={placeholder}
          className={`
            w-full px-4 py-3 rounded-xl
            border-2 ${borderColor}
            bg-white
            text-sm text-gray-700
            placeholder:text-gray-300
            transition-all duration-200
            focus:outline-none focus:ring-4 ${focusRingColor}
            disabled:bg-gray-50 disabled:cursor-not-allowed
          `}
        />
        {value.length > 0 && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-300">
            {value.length}/{maxLength}
          </span>
        )}
      </div>
      {value.length > 0 && value.length < 2 && (
        <p className="mt-1 text-xs text-amber-500">2자 이상 입력해주세요</p>
      )}
    </motion.div>
  );
}
