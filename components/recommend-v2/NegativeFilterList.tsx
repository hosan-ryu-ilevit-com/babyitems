'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import type { NegativeFilterData } from '@/types/recommend-v2';

interface CustomNegativeOption {
  id: string;
  label: string;
  target_rule_key: string;
  isCustom: true;
}

interface NegativeFilterListProps {
  data: NegativeFilterData;
  onToggle: (ruleKey: string) => void;
  onSkip?: () => void;
  onCustomAdd?: (customText: string) => void;
}

/**
 * 단점 필터 컴포넌트 (tags cons-selector 디자인 참조)
 * - 선택 순서 표시
 * - 체크 애니메이션
 * - 스킵 가능
 */
export function NegativeFilterList({ data, onToggle, onSkip, onCustomAdd }: NegativeFilterListProps) {
  const { options, selectedKeys } = data;
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customInput, setCustomInput] = useState('');
  const [customOptions, setCustomOptions] = useState<CustomNegativeOption[]>([]);

  // 선택된 순서 계산
  const getSelectedIndex = (ruleKey: string) => {
    return selectedKeys.indexOf(ruleKey);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-3"
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <span className="px-2.5 py-1 bg-rose-100 text-rose-600 rounded-full text-xs font-bold">
          단점 필터
        </span>
        
      </div>

      {/* 설명 */}
      <h3 className="text-base font-bold text-gray-900 leading-6">
        이것만큼은 절대 안 된다! 
        <br />
        <span className="text-gray-500 font-normal text-sm mt-2">
          꼭 피하고 싶은 단점이 있나요?
        </span>
      </h3>

      {/* 옵션 목록 */}
      <div className="space-y-2">
        {/* 기본 옵션 */}
        {options.map((option, index) => {
          const isSelected = selectedKeys.includes(option.target_rule_key);
          const selectedIndex = getSelectedIndex(option.target_rule_key);

          return (
            <motion.button
              key={option.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.03 }}
              onClick={() => onToggle(option.target_rule_key)}
              className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
                isSelected
                  ? 'border-rose-400 bg-rose-50'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center gap-3">
                {/* 선택 순서 표시 */}
                <div
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center text-[10px] font-bold shrink-0 transition-all ${
                    isSelected
                      ? 'border-rose-500 bg-rose-500 text-white'
                      : 'border-gray-300 bg-white text-gray-400'
                  }`}
                >
                  {isSelected ? (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                    >
                      {selectedIndex + 1}
                    </motion.span>
                  ) : null}
                </div>

                {/* 옵션 텍스트 */}
                <span
                  className={`text-sm font-medium leading-snug flex-1 ${
                    isSelected ? 'text-rose-700' : 'text-gray-700'
                  }`}
                >
                  {option.label}
                </span>
              </div>
            </motion.button>
          );
        })}

        {/* 커스텀 옵션 (사용자가 직접 입력한 것) */}
        {customOptions.map((option) => {
          const isSelected = selectedKeys.includes(option.target_rule_key);
          const selectedIndex = getSelectedIndex(option.target_rule_key);

          return (
            <motion.button
              key={option.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={() => onToggle(option.target_rule_key)}
              className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
                isSelected
                  ? 'border-rose-400 bg-rose-50'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center gap-3">
                {/* 선택 순서 표시 */}
                <div
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center text-[10px] font-bold shrink-0 transition-all ${
                    isSelected
                      ? 'border-rose-500 bg-rose-500 text-white'
                      : 'border-gray-300 bg-white text-gray-400'
                  }`}
                >
                  {isSelected ? (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                    >
                      {selectedIndex + 1}
                    </motion.span>
                  ) : null}
                </div>

                {/* 옵션 텍스트 + 직접입력 표시 */}
                <span
                  className={`text-sm font-medium leading-snug flex-1 ${
                    isSelected ? 'text-rose-700' : 'text-gray-700'
                  }`}
                >
                  {option.label}
                </span>
                <span className="text-xs text-gray-400 px-2 py-0.5 bg-gray-200 rounded-full">
                  직접입력
                </span>
              </div>
            </motion.button>
          );
        })}

        {/* 직접 입력 섹션 */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: options.length * 0.03 }}
          className="pt-1"
        >
          {!showCustomInput ? (
            <button
              onClick={() => setShowCustomInput(true)}
              className="w-full p-4 rounded-xl border-2 border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50 hover:text-gray-600 transition-all text-sm flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
              직접 입력하기
            </button>
          ) : (
            <div className="p-3 rounded-xl border-2 border-rose-200 bg-rose-50">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  placeholder="피하고 싶은 단점을 입력해주세요"
                  className="flex-1 min-w-0 px-3 py-2 text-base rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-rose-400 focus:border-transparent"
                  autoFocus
                />
                <button
                  onClick={() => {
                    if (customInput.trim()) {
                      // 커스텀 단점 옵션 생성
                      const customRuleKey = `custom_negative_${Date.now()}`;
                      const newCustomOption: CustomNegativeOption = {
                        id: customRuleKey,
                        label: customInput.trim(),
                        target_rule_key: customRuleKey,
                        isCustom: true,
                      };

                      // 커스텀 옵션 목록에 추가
                      setCustomOptions(prev => [...prev, newCustomOption]);

                      // 선택된 상태로 추가
                      onToggle(customRuleKey);

                      // 부모에게 커스텀 추가 알림 (필요시)
                      onCustomAdd?.(customInput.trim());

                      // 입력 초기화
                      setCustomInput('');
                      setShowCustomInput(false);
                    }
                  }}
                  disabled={!customInput.trim()}
                  className="shrink-0 px-4 py-2 bg-rose-500 text-white text-sm font-medium rounded-lg hover:bg-rose-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
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

      {/* 스킵 버튼 */}
      {onSkip && (
        <div className="text-center pt-2">
          <button
            onClick={onSkip}
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors py-2 px-4 rounded-lg hover:bg-gray-100"
          >
            다 괜찮아요, 넘어가기
          </button>
        </div>
      )}
    </motion.div>
  );
}
