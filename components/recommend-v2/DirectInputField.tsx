'use client';

import { useState, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { logDirectInputButtonClick } from '@/lib/logging/clientLogger';

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
  // 로깅용 정보
  category?: string;
  categoryName?: string;
  questionId?: string;
  step?: number;
}

export default function DirectInputField({
  placeholder = '원하는 답변을 입력하세요...',
  value,
  onChange,
  disabled = false,
  maxLength = 200,
  filterType = 'hard_filter',
  isRegistered = false,
  onRegister,
  category = '',
  categoryName = '',
  questionId,
  step,
}: DirectInputFieldProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 등록 핸들러
  const handleRegister = useCallback(() => {
    if (value.trim().length >= 2 && onRegister) {
      onRegister(value.trim());
      setIsEditing(false);
    }
  }, [value, onRegister]);

  // 편집 모드 진입
  const handleEdit = useCallback(() => {
    setIsEditing(true);
    // 로깅: 직접 추가 버튼 클릭
    if (category && categoryName) {
      logDirectInputButtonClick(category, categoryName, filterType, questionId, step);
    }
    // 다음 렌더 사이클에서 input에 포커스
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  }, [category, categoryName, filterType, questionId, step]);

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
  const isNegative = filterType === 'negative_filter';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
    >
      {showRegisteredState ? (
        /* 등록된 상태 - 다른 옵션들과 통일된 디자인 */
        <motion.button
          initial={{ scale: 0.98 }}
          animate={{ scale: 1 }}
          onClick={handleEdit}
          className={`w-full p-3.5 rounded-[12px] border text-left transition-all ${
            isNegative 
              ? 'border-red-100 bg-red-50' 
              : 'border-blue-100 bg-blue-50'
          }`}
        >
          <div className="flex items-center gap-3">
            <span className={`text-[16px] font-medium leading-[1.4] flex-1 ${
              isNegative ? 'text-red-500' : 'text-blue-500'
            }`}>
              {value}
            </span>
            <span className={`text-xs ${
              isNegative ? 'text-red-500/60' : 'text-blue-500/60'
            }`}>터치하여 수정</span>
          </div>
        </motion.button>
      ) : isEditing ? (
        /* 입력 모드 - 디자인 이미지 기반 변경 */
        <div className="relative flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={handleChange}
            onFocus={() => setIsFocused(true)}
            onBlur={() => {
              setIsFocused(false);
              if (value.trim().length < 2) {
                setIsEditing(false);
              }
            }}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder={placeholder}
            className={`
              flex-1 px-4 py-2.5 rounded-xl
              border 
              ${isFocused 
                ? (isNegative ? 'border-red-400 bg-white' : 'border-blue-400 bg-white')
                : 'border-gray-200 bg-[#F8F9FB]'
              }
              text-[14px] text-gray-700
              placeholder:text-gray-400
              transition-all duration-200
              focus:outline-none
              disabled:bg-gray-50 disabled:cursor-not-allowed
            `}
            style={{ fontSize: '14px' }}
          />
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={handleRegister}
            disabled={value.trim().length < 2}
            className={`
              px-5 py-2.5 rounded-xl font-bold text-[14px] whitespace-nowrap
              transition-all duration-200
              ${value.trim().length >= 2
                ? 'bg-[#111827] text-white'
                : 'bg-[#C1C4CC] text-white cursor-not-allowed'
              }
            `}
          >
            추가
          </motion.button>
        </div>
      ) : (
        /* 초기 상태 - 직접 추가 버튼 (점선 테두리) */
        <button
          onClick={handleEdit}
          className="w-full h-[46px] rounded-xl border-2 border-dashed border-gray-200 bg-white flex items-center justify-center gap-2 text-gray-400 hover:border-gray-300 hover:bg-gray-50 transition-all active:scale-[0.98]"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          <span className="text-[14px] font-medium">직접 추가</span>
        </button>
      )}

      {/* 2자 미만 경고 */}
      {isEditing && value.length > 0 && value.length < 2 && (
        <p className="mt-1 text-xs text-amber-500">2자 이상 입력해주세요</p>
      )}
    </motion.div>
  );
}
