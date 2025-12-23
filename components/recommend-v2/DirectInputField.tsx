'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';

interface DirectInputFieldProps {
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  maxLength?: number;
  filterType?: 'hard_filter' | 'negative_filter';
  // 등록 상태 관리
  isRegistered?: boolean;
  onRegister?: (value: string) => void;
}

export default function DirectInputField({
  placeholder = '원하는 조건을 직접 입력해주세요',
  value,
  onChange,
  disabled = false,
  maxLength = 200,
  filterType = 'hard_filter',
  isRegistered = false,
  onRegister,
}: DirectInputFieldProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isNegative = filterType === 'negative_filter';

  // 등록 핸들러
  const handleRegister = useCallback(() => {
    if (value.trim().length >= 2 && onRegister) {
      onRegister(value.trim());
      setIsEditing(false);
      inputRef.current?.blur();
    }
  }, [value, onRegister]);

  // 편집 모드 진입
  const handleEdit = useCallback(() => {
    setIsEditing(true);
    // 다음 렌더 사이클에서 input에 포커스
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  }, []);

  // Enter 키로 등록
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && value.trim().length >= 2) {
      e.preventDefault();
      handleRegister();
    }
  }, [value, handleRegister]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      if (newValue.length <= maxLength) {
        onChange(newValue);
      }
    },
    [onChange, maxLength]
  );

  // 등록된 상태이고 편집 중이 아닐 때 → 체크된 옵션처럼 표시
  const showRegisteredState = isRegistered && !isEditing;

  // 색상 설정
  const accentColor = isNegative ? 'rose' : 'blue';
  const borderColorClass = showRegisteredState
    ? `border-${accentColor}-400`
    : isFocused
      ? `border-${accentColor}-400`
      : 'border-gray-200';
  const bgColorClass = showRegisteredState
    ? `bg-${accentColor}-50`
    : 'bg-white';

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

      {/* 등록된 상태 - 체크된 옵션처럼 표시 */}
      {showRegisteredState ? (
        <motion.button
          initial={{ scale: 0.98 }}
          animate={{ scale: 1 }}
          onClick={handleEdit}
          className={`
            w-full p-4 rounded-xl border-2 text-left transition-all
            ${isNegative 
              ? 'border-rose-400 bg-rose-50' 
              : 'border-blue-400 bg-blue-50'
            }
          `}
        >
          <div className="flex items-center gap-3">
            {/* 체크 아이콘 */}
            <div className={`
              w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0
              ${isNegative 
                ? 'border-rose-500 bg-rose-500' 
                : 'border-blue-500 bg-blue-500'
              }
            `}>
              <motion.svg
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="w-3 h-3 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </motion.svg>
            </div>

            {/* 등록된 텍스트 */}
            <span className={`
              text-sm font-medium leading-snug flex-1
              ${isNegative ? 'text-rose-700' : 'text-blue-700'}
            `}>
              {value}
            </span>

            {/* 수정 힌트 */}
            <span className="text-xs text-gray-400">
              터치하여 수정
            </span>
          </div>
        </motion.button>
      ) : (
        /* 입력 모드 */
        <div className="relative flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={handleChange}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder={placeholder}
            className={`
              flex-1 px-4 py-3 rounded-xl
              border-2 
              ${isFocused 
                ? isNegative ? 'border-rose-400' : 'border-blue-400'
                : 'border-gray-200'
              }
              bg-white
              text-base text-gray-700
              placeholder:text-gray-300
              transition-all duration-200
              focus:outline-none focus:ring-4 
              ${isNegative ? 'focus:ring-rose-100' : 'focus:ring-blue-100'}
              disabled:bg-gray-50 disabled:cursor-not-allowed
            `}
            style={{ fontSize: '16px' }} // 모바일 확대 방지
          />
          
          {/* 등록 버튼 */}
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={handleRegister}
            disabled={value.trim().length < 2}
            className={`
              px-4 py-3 rounded-xl font-medium text-sm whitespace-nowrap
              transition-all duration-200
              ${value.trim().length >= 2
                ? isNegative
                  ? 'bg-rose-500 text-white hover:bg-rose-600'
                  : 'bg-blue-500 text-white hover:bg-blue-600'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }
            `}
          >
            등록
          </motion.button>
        </div>
      )}

      {/* 2자 미만 경고 */}
      {!showRegisteredState && value.length > 0 && value.length < 2 && (
        <p className="mt-1 text-xs text-amber-500">2자 이상 입력해주세요</p>
      )}
    </motion.div>
  );
}
