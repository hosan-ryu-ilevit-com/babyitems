'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { PaperPlaneRight, SpinnerGap } from '@phosphor-icons/react';

interface NaturalLanguageInputProps {
  placeholder?: string;
  onSubmit: (text: string) => Promise<void>;
  disabled?: boolean;
}

/**
 * 자연어 수정 입력 컴포넌트
 * - 중간 점검에서 조건 수정 요청
 * - Gemini API로 파싱
 */
export function NaturalLanguageInput({
  placeholder = '예: 쌍둥이라서 두 개 필요해요, 외출이 많아요...',
  onSubmit,
  disabled = false,
}: NaturalLanguageInputProps) {
  const [text, setText] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async () => {
    if (!text.trim() || isLoading || disabled) return;

    setIsLoading(true);
    try {
      await onSubmit(text.trim());
      setText('');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-4"
    >
      <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-xl border border-gray-200">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled || isLoading}
          className="flex-1 px-3 py-2 bg-transparent text-sm text-gray-800 placeholder-gray-400 outline-none"
        />
        <button
          onClick={handleSubmit}
          disabled={!text.trim() || isLoading || disabled}
          className={`p-2 rounded-lg transition-all ${
            text.trim() && !isLoading && !disabled
              ? 'bg-blue-500 text-white hover:bg-blue-600'
              : 'bg-gray-200 text-gray-400'
          }`}
        >
          {isLoading ? (
            <SpinnerGap size={20} className="animate-spin" />
          ) : (
            <PaperPlaneRight size={20} weight="fill" />
          )}
        </button>
      </div>
      <p className="text-xs text-gray-400 mt-1.5">
        혹시 조건을 수정하고 싶으시면 말씀해주세요.
      </p>
    </motion.div>
  );
}
