'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Coins, Prohibit, Scales, Check, CaretLeft, CaretRight } from '@phosphor-icons/react/dist/ssr';

// ============================================================================
// Types
// ============================================================================

interface BalanceQuestion {
  id: string;
  optionA: { label: string; description?: string };
  optionB: { label: string; description?: string };
  insight: string;
}

interface NegativeOption {
  id: string;
  label: string;
  description?: string;
}

interface BudgetPreset {
  type: 'entry' | 'mid' | 'premium';
  label: string;
  range: { min: number; max: number };
  description: string;
}

// ============================================================================
// InlineBalanceCarousel - 밸런스 게임 캐러셀 (1~2개 질문)
// ============================================================================

export function InlineBalanceCarousel({
  questions,
  onComplete
}: {
  questions: BalanceQuestion[];
  onComplete: (selections: Map<string, 'A' | 'B'>) => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selections, setSelections] = useState<Map<string, 'A' | 'B'>>(new Map());

  const currentQuestion = questions[currentIndex];
  const isLastQuestion = currentIndex === questions.length - 1;
  const allAnswered = selections.size === questions.length;

  const handleSelect = (choice: 'A' | 'B') => {
    const newSelections = new Map(selections);
    newSelections.set(currentQuestion.id, choice);
    setSelections(newSelections);

    // 자동으로 다음 질문으로 이동 (마지막이 아니면)
    if (!isLastQuestion) {
      setTimeout(() => setCurrentIndex(prev => prev + 1), 300);
    }
  };

  const handleComplete = () => {
    onComplete(selections);
  };

  if (!currentQuestion) return null;

  return (
    <div className="p-5 bg-blue-50/50 border border-blue-100 rounded-3xl mt-3 animate-in fade-in slide-in-from-bottom-2">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-blue-700">
          <Scales size={20} weight="fill" />
          <span className="text-sm font-bold">어떤 가치를 더 우선하시나요?</span>
        </div>
        {questions.length > 1 && (
          <div className="flex items-center gap-1">
            {questions.map((_, idx) => (
              <div
                key={idx}
                className={`w-2 h-2 rounded-full transition-all ${
                  idx === currentIndex ? 'bg-blue-600 w-4' :
                  selections.has(questions[idx].id) ? 'bg-blue-400' : 'bg-blue-200'
                }`}
              />
            ))}
          </div>
        )}
      </div>

      {/* 질문 */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentQuestion.id}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className="space-y-3"
        >
          {/* Option A */}
          <button
            onClick={() => handleSelect('A')}
            className={`w-full p-4 rounded-2xl text-left transition-all border-2 ${
              selections.get(currentQuestion.id) === 'A'
                ? 'bg-blue-600 border-blue-600 text-white shadow-lg'
                : 'bg-white border-blue-200 hover:border-blue-400 hover:bg-blue-50'
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <span className={`text-sm font-bold ${
                  selections.get(currentQuestion.id) === 'A' ? 'text-white' : 'text-gray-800'
                }`}>
                  {currentQuestion.optionA.label}
                </span>
                {currentQuestion.optionA.description && (
                  <p className={`text-xs mt-1 ${
                    selections.get(currentQuestion.id) === 'A' ? 'text-blue-100' : 'text-gray-500'
                  }`}>
                    {currentQuestion.optionA.description}
                  </p>
                )}
              </div>
              <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                selections.get(currentQuestion.id) === 'A'
                  ? 'border-white bg-white'
                  : 'border-blue-200'
              }`}>
                {selections.get(currentQuestion.id) === 'A' && (
                  <Check size={14} weight="bold" className="text-blue-600" />
                )}
              </div>
            </div>
          </button>

          {/* VS 구분선 */}
          <div className="flex items-center gap-3 px-4">
            <div className="h-px flex-1 bg-blue-200" />
            <span className="text-[10px] font-bold text-blue-400 bg-blue-100 px-2 py-0.5 rounded-full">VS</span>
            <div className="h-px flex-1 bg-blue-200" />
          </div>

          {/* Option B */}
          <button
            onClick={() => handleSelect('B')}
            className={`w-full p-4 rounded-2xl text-left transition-all border-2 ${
              selections.get(currentQuestion.id) === 'B'
                ? 'bg-blue-600 border-blue-600 text-white shadow-lg'
                : 'bg-white border-blue-200 hover:border-blue-400 hover:bg-blue-50'
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <span className={`text-sm font-bold ${
                  selections.get(currentQuestion.id) === 'B' ? 'text-white' : 'text-gray-800'
                }`}>
                  {currentQuestion.optionB.label}
                </span>
                {currentQuestion.optionB.description && (
                  <p className={`text-xs mt-1 ${
                    selections.get(currentQuestion.id) === 'B' ? 'text-blue-100' : 'text-gray-500'
                  }`}>
                    {currentQuestion.optionB.description}
                  </p>
                )}
              </div>
              <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                selections.get(currentQuestion.id) === 'B'
                  ? 'border-white bg-white'
                  : 'border-blue-200'
              }`}>
                {selections.get(currentQuestion.id) === 'B' && (
                  <Check size={14} weight="bold" className="text-blue-600" />
                )}
              </div>
            </div>
          </button>

          {/* 인사이트 */}
          {currentQuestion.insight && (
            <p className="text-xs text-blue-600 text-center mt-2 px-4 py-2 bg-blue-100/50 rounded-xl">
              💡 {currentQuestion.insight}
            </p>
          )}
        </motion.div>
      </AnimatePresence>

      {/* 네비게이션 / 완료 버튼 */}
      <div className="flex items-center justify-between mt-4 pt-4 border-t border-blue-100">
        {questions.length > 1 && currentIndex > 0 ? (
          <button
            onClick={() => setCurrentIndex(prev => prev - 1)}
            className="flex items-center gap-1 text-sm text-blue-600 font-medium hover:text-blue-700"
          >
            <CaretLeft size={16} weight="bold" />
            이전
          </button>
        ) : (
          <div />
        )}

        {isLastQuestion && allAnswered ? (
          <button
            onClick={handleComplete}
            className="px-6 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all"
          >
            선택 완료
          </button>
        ) : questions.length > 1 && !isLastQuestion && selections.has(currentQuestion.id) ? (
          <button
            onClick={() => setCurrentIndex(prev => prev + 1)}
            className="flex items-center gap-1 text-sm text-blue-600 font-medium hover:text-blue-700"
          >
            다음
            <CaretRight size={16} weight="bold" />
          </button>
        ) : (
          <div />
        )}
      </div>
    </div>
  );
}

// ============================================================================
// InlineNegativeFilter - 피하고 싶은 단점 선택
// ============================================================================

export function InlineNegativeFilter({
  options,
  onSelect,
  onSkip
}: {
  options: NegativeOption[];
  onSelect: (selected: string[]) => void;
  onSkip: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    const newSelected = new Set(selected);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelected(newSelected);
  };

  return (
    <div className="p-5 bg-rose-50/50 border border-rose-100 rounded-3xl mt-3 animate-in fade-in slide-in-from-bottom-2">
      <div className="flex items-center gap-2 mb-4 text-rose-700">
        <Prohibit size={20} weight="fill" />
        <span className="text-sm font-bold">절대 피하고 싶은 단점이 있나요?</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {options.map((opt) => (
          <button
            key={opt.id}
            onClick={() => toggle(opt.id)}
            className={`p-3 rounded-xl text-left transition-all border-2 ${
              selected.has(opt.id)
                ? 'bg-rose-600 border-rose-600 text-white shadow-md'
                : 'bg-white border-rose-200 hover:border-rose-400'
            }`}
          >
            <div className="flex items-start gap-2">
              <div className={`w-5 h-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center mt-0.5 ${
                selected.has(opt.id) ? 'border-white bg-white' : 'border-rose-300'
              }`}>
                {selected.has(opt.id) && (
                  <Check size={12} weight="bold" className="text-rose-600" />
                )}
              </div>
              <div>
                <span className={`text-sm font-bold block ${
                  selected.has(opt.id) ? 'text-white' : 'text-gray-800'
                }`}>
                  {opt.label}
                </span>
                {opt.description && (
                  <span className={`text-[11px] ${
                    selected.has(opt.id) ? 'text-rose-100' : 'text-gray-500'
                  }`}>
                    {opt.description}
                  </span>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>

      <div className="flex gap-2 mt-4">
        <button
          onClick={onSkip}
          className="flex-1 py-3 bg-white border border-rose-200 rounded-xl text-sm font-bold text-rose-600 hover:bg-rose-50 transition-all"
        >
          없음
        </button>
        <button
          onClick={() => onSelect(Array.from(selected))}
          disabled={selected.size === 0}
          className="flex-[2] py-3 bg-rose-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-rose-200 hover:bg-rose-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          선택 완료 {selected.size > 0 && `(${selected.size}개)`}
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// InlineBudgetSelector - 예산 선택 (프리셋 + 슬라이더)
// ============================================================================

export function InlineBudgetSelector({
  presets,
  onSelect,
  onSkip
}: {
  presets: BudgetPreset[];
  onSelect: (min: number, max: number) => void;
  onSkip: () => void;
}) {
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [customMax, setCustomMax] = useState(200000);
  const [showCustom, setShowCustom] = useState(false);

  const handlePresetClick = (preset: BudgetPreset) => {
    setSelectedPreset(preset.type);
    setShowCustom(false);
  };

  const handleComplete = () => {
    if (selectedPreset) {
      const preset = presets.find(p => p.type === selectedPreset);
      if (preset) {
        onSelect(preset.range.min, preset.range.max);
      }
    } else if (showCustom) {
      onSelect(0, customMax);
    }
  };

  return (
    <div className="p-5 bg-purple-50/50 border border-purple-100 rounded-3xl mt-3 animate-in fade-in slide-in-from-bottom-2">
      <div className="flex items-center gap-2 mb-4 text-purple-700">
        <Coins size={20} weight="fill" />
        <span className="text-sm font-bold">예산은 어느 정도 생각하고 계세요?</span>
      </div>

      {/* 프리셋 버튼 */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {presets.map((preset) => (
          <button
            key={preset.type}
            onClick={() => handlePresetClick(preset)}
            className={`p-3 rounded-xl text-center transition-all border-2 ${
              selectedPreset === preset.type
                ? 'bg-purple-600 border-purple-600 text-white shadow-md'
                : 'bg-white border-purple-200 hover:border-purple-400'
            }`}
          >
            <span className={`text-sm font-bold block ${
              selectedPreset === preset.type ? 'text-white' : 'text-gray-800'
            }`}>
              {preset.label}
            </span>
            <span className={`text-[11px] block mt-0.5 ${
              selectedPreset === preset.type ? 'text-purple-100' : 'text-gray-500'
            }`}>
              {(preset.range.min / 10000).toFixed(0)}~{(preset.range.max / 10000).toFixed(0)}만원
            </span>
            <span className={`text-[10px] block mt-1 ${
              selectedPreset === preset.type ? 'text-purple-200' : 'text-gray-400'
            }`}>
              {preset.description}
            </span>
          </button>
        ))}
      </div>

      {/* 직접 입력 토글 */}
      <button
        onClick={() => {
          setShowCustom(!showCustom);
          setSelectedPreset(null);
        }}
        className={`w-full py-2 text-sm font-medium rounded-lg transition-all ${
          showCustom ? 'text-purple-700 bg-purple-100' : 'text-gray-500 hover:text-purple-600'
        }`}
      >
        {showCustom ? '프리셋으로 선택' : '직접 입력하기'}
      </button>

      {/* 커스텀 슬라이더 */}
      <AnimatePresence>
        {showCustom && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-4 space-y-3"
          >
            <input
              type="range"
              min="50000"
              max="500000"
              step="10000"
              value={customMax}
              onChange={(e) => setCustomMax(parseInt(e.target.value))}
              className="w-full h-2 bg-purple-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
            />
            <div className="flex justify-between text-xs font-medium text-gray-500">
              <span>5만원</span>
              <span className="text-lg font-bold text-purple-700">
                ~{(customMax / 10000).toFixed(0)}만원
              </span>
              <span>50만원+</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 버튼 */}
      <div className="flex gap-2 mt-4">
        <button
          onClick={onSkip}
          className="flex-1 py-3 bg-white border border-purple-200 rounded-xl text-sm font-bold text-purple-600 hover:bg-purple-50 transition-all"
        >
          상관없어요
        </button>
        <button
          onClick={handleComplete}
          disabled={!selectedPreset && !showCustom}
          className="flex-[2] py-3 bg-purple-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-purple-200 hover:bg-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          선택 완료
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Legacy exports (호환성)
// ============================================================================

export function InlineBalanceGame({
  optionA,
  optionB,
  onSelect
}: {
  optionA: string;
  optionB: string;
  onSelect: (choice: string) => void;
}) {
  return (
    <InlineBalanceCarousel
      questions={[{
        id: 'single',
        optionA: { label: optionA },
        optionB: { label: optionB },
        insight: ''
      }]}
      onComplete={(selections) => {
        const choice = selections.get('single');
        onSelect(choice === 'A' ? optionA : optionB);
      }}
    />
  );
}
