'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import type { HardFilterData } from '@/types/recommend-v2';

interface HardFilterQuestionProps {
  data: HardFilterData;
  onSelect: (questionId: string, value: string) => void;
}

/**
 * 하드 필터 질문 컴포넌트 (개선 버전)
 * - 선택 시 체크 효과
 * - 직접 입력 옵션 지원
 * - tags 플로우 디자인 참조
 */
export function HardFilterQuestion({
  data,
  onSelect,
}: HardFilterQuestionProps) {
  const { question, currentIndex, totalCount, selectedValue } = data;
  const [customInput, setCustomInput] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);

  const handleCustomSubmit = () => {
    if (customInput.trim()) {
      onSelect(question.id, `custom:${customInput.trim()}`);
    }
  };

  return (
    <motion.div
      key={question.id}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.3 }}
      className="space-y-3"
    >
      {/* 질문 헤더 */}
      <div className="flex items-center justify-between">
        <span className="px-2.5 py-1 bg-blue-100 text-blue-600 rounded-full text-xs font-bold">
          Q{currentIndex + 1}
        </span>
        <span className="text-xs text-gray-400">
          {currentIndex + 1} / {totalCount}
        </span>
      </div>

      {/* 질문 텍스트 */}
      <h3 className="text-base font-bold text-gray-900 leading-snug">
        {question.question}
      </h3>

      {/* 선택지 */}
      <div className="space-y-2">
        {question.options.map((option, index) => {
          const isSelected = selectedValue === option.value;

          return (
            <motion.button
              key={option.value}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.03 }}
              onClick={() => onSelect(question.id, option.value)}
              className={`w-full p-3.5 rounded-xl border-2 text-left transition-all ${
                isSelected
                  ? 'border-blue-400 bg-blue-50'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center gap-3">
                {/* 체크박스 스타일 */}
                <div
                  className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center shrink-0 transition-all ${
                    isSelected
                      ? 'border-blue-500 bg-blue-500'
                      : 'border-gray-300 bg-white'
                  }`}
                >
                  {isSelected && (
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
                  )}
                </div>

                {/* 옵션 텍스트 */}
                <span
                  className={`text-sm font-medium ${
                    isSelected ? 'text-blue-700' : 'text-gray-700'
                  }`}
                >
                  {option.label}
                </span>

                {/* 선택됨 표시 */}
                {isSelected && (
                  <motion.span
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="ml-auto text-xs text-blue-500 font-medium"
                  >
                    선택됨
                  </motion.span>
                )}
              </div>
            </motion.button>
          );
        })}

        {/* 직접 입력 섹션 */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: question.options.length * 0.03 }}
          className="pt-2"
        >
          {!showCustomInput ? (
            <button
              onClick={() => setShowCustomInput(true)}
              className="w-full p-3 rounded-xl border-2 border-dashed border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-600 transition-all text-sm flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
              직접 입력하기
            </button>
          ) : (
            <div className="p-3 rounded-xl border-2 border-blue-200 bg-blue-50">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  placeholder="원하는 조건을 입력해주세요"
                  className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCustomSubmit();
                  }}
                />
                <button
                  onClick={handleCustomSubmit}
                  disabled={!customInput.trim()}
                  className="px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                  확인
                </button>
              </div>
              <button
                onClick={() => {
                  setShowCustomInput(false);
                  setCustomInput('');
                }}
                className="mt-2 text-xs text-gray-500 hover:text-gray-700"
              >
                취소
              </button>
            </div>
          )}
        </motion.div>
      </div>
    </motion.div>
  );
}
