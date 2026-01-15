'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  logKAQuestionAnswered, 
  logKAQuestionSkipped,
  logKnowledgeAgentBalanceSelection,
  logKnowledgeAgentBalanceCompleted,
  logKnowledgeAgentBalanceSkipped,
  logKnowledgeAgentNegativeToggle,
  logKnowledgeAgentNegativeCompleted,
  logKnowledgeAgentBudgetChanged,
  logKnowledgeAgentBudgetPresetClicked,
  logKnowledgeAgentBudgetConfirm,
  logKnowledgeAgentBudgetSkip
} from '@/lib/logging/clientLogger';
import { 
  CaretLeft, 
  CaretRight, 
  Check, 
  Warning, 
  Coin 
} from '@phosphor-icons/react/dist/ssr';
import { 
  FcSurvey, 
  FcCancel, 
  FcMoneyTransfer, 
  FcCheckmark
} from "react-icons/fc";

// ============================================================================
// Types
// ============================================================================

interface BalanceQuestion {
  id: string;
  type: string;
  title: string;
  option_A: { text: string; target_rule_key: string };
  option_B: { text: string; target_rule_key: string };
}

interface NegativeOption {
  id: string;
  label: string;
  target_rule_key: string;
  exclude_mode: string;
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
  onComplete,
  categoryKey,
  categoryName
}: {
  questions: BalanceQuestion[];
  onComplete: (selections: Map<string, 'A' | 'B'>) => void;
  categoryKey: string;
  categoryName?: string;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selections, setSelections] = useState<Map<string, 'A' | 'B'>>(new Map());

  const currentQuestion = questions[currentIndex];
  const isLastQuestion = currentIndex === questions.length - 1;
  const allAnswered = selections.size === questions.length;

  const handleSelect = (choice: 'A' | 'B') => {
    const choiceText = choice === 'A' ? currentQuestion.option_A.text : currentQuestion.option_B.text;
    logKAQuestionAnswered(categoryKey, currentQuestion.title, choiceText);
    
    // 상세 로깅 추가
    logKnowledgeAgentBalanceSelection(
      categoryKey,
      categoryName || '',
      currentQuestion.id,
      currentIndex,
      questions.length,
      choice,
      currentQuestion.option_A.text,
      currentQuestion.option_B.text,
      choice === 'A' ? currentQuestion.option_A.target_rule_key : currentQuestion.option_B.target_rule_key
    );

    const newSelections = new Map(selections);
    newSelections.set(currentQuestion.id, choice);
    setSelections(newSelections);

    // 자동으로 다음 질문으로 이동 (마지막이 아니면)
    if (!isLastQuestion) {
      setTimeout(() => setCurrentIndex(prev => prev + 1), 300);
    }
  };

  const handleComplete = () => {
    // 상세 로깅 추가
    logKnowledgeAgentBalanceCompleted(
      categoryKey,
      categoryName || '',
      Array.from(selections.entries()).map(([qId, choice]) => ({
        questionId: qId,
        choice
      }))
    );
    onComplete(selections);
  };

  if (!currentQuestion) return null;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-6 bg-white border border-gray-100 rounded-[28px] mt-3 shadow-[0_8px_30px_rgb(0,0,0,0.02)]"
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
            <FcSurvey size={20} />
          </div>
          <div>
            <span className="text-[15px] font-bold text-gray-900">{currentQuestion.title}</span>
            <p className="text-[11px] text-gray-400 font-medium">취향에 더 가까운 쪽을 골라주세요</p>
          </div>
        </div>
        {questions.length > 1 && (
          <div className="flex items-center gap-1.5 bg-gray-50 px-2.5 py-1 rounded-full">
            <span className="text-[11px] font-bold text-blue-600">{currentIndex + 1}</span>
            <span className="text-[11px] font-bold text-gray-300">/</span>
            <span className="text-[11px] font-bold text-gray-400">{questions.length}</span>
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
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="space-y-3"
        >
          {/* Option A */}
          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => handleSelect('A')}
            className={`w-full p-3.5 rounded-2xl text-left transition-all border-2 relative overflow-hidden ${
              selections.get(currentQuestion.id) === 'A'
                ? 'bg-blue-50 border-blue-100'
                : 'bg-white border-gray-100 hover:border-blue-200 hover:bg-blue-50/30'
            }`}
          >
            <div className="flex items-center justify-between relative z-10">
              <div className="flex-1">
                <span className={`text-[16px] font-bold leading-relaxed ${
                  selections.get(currentQuestion.id) === 'A' ? 'text-blue-500' : 'text-gray-800'
                }`}>
                  {currentQuestion.option_A.text}
                </span>
              </div>
            </div>
          </motion.button>

          {/* VS 구분선 */}
          <div className="flex items-center gap-4 px-4 py-1">
            <div className="h-[1px] flex-1 bg-gray-100" />
            <span className="text-[10px] font-black text-gray-300 tracking-widest">VS</span>
            <div className="h-[1px] flex-1 bg-gray-100" />
          </div>

          {/* Option B */}
          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => handleSelect('B')}
            className={`w-full p-3.5 rounded-2xl text-left transition-all border-2 relative overflow-hidden ${
              selections.get(currentQuestion.id) === 'B'
                ? 'bg-blue-50 border-blue-100'
                : 'bg-white border-gray-100 hover:border-blue-200 hover:bg-blue-50/30'
            }`}
          >
            <div className="flex items-center justify-between relative z-10">
              <div className="flex-1">
                <span className={`text-[16px] font-bold leading-relaxed ${
                  selections.get(currentQuestion.id) === 'B' ? 'text-blue-500' : 'text-gray-800'
                }`}>
                  {currentQuestion.option_B.text}
                </span>
              </div>
            </div>
          </motion.button>

        </motion.div>
      </AnimatePresence>

      {/* 네비게이션 / 완료 버튼 */}
      <div className="flex items-center justify-between mt-6 pt-5 border-t border-gray-50">
        {questions.length > 1 && currentIndex > 0 ? (
          <button
            onClick={() => setCurrentIndex(prev => prev - 1)}
            className="flex items-center gap-1.5 text-[13px] text-gray-400 font-bold hover:text-gray-600 transition-colors"
          >
            <CaretLeft size={16} weight="bold" />
            이전
          </button>
        ) : (
          <div />
        )}

        {isLastQuestion && allAnswered ? (
          <motion.button
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleComplete}
            className="px-8 py-3 bg-gray-900 text-white rounded-2xl text-[14px] font-bold shadow-xl shadow-gray-200 hover:bg-black transition-all"
          >
            선택 완료
          </motion.button>
        ) : questions.length > 1 && !isLastQuestion && selections.has(currentQuestion.id) ? (
          <button
            onClick={() => setCurrentIndex(prev => prev + 1)}
            className="flex items-center gap-1.5 text-[13px] text-blue-600 font-bold hover:text-blue-700 transition-colors"
          >
            다음
            <CaretRight size={16} weight="bold" />
          </button>
        ) : (
          <div />
        )}
      </div>
    </motion.div>
  );
}

// ============================================================================
// InlineNegativeFilter - 피하고 싶은 단점 선택
// ============================================================================

export function InlineNegativeFilter({
  options,
  onSelect,
  onSkip,
  categoryKey,
  categoryName
}: {
  options: NegativeOption[];
  onSelect: (selected: string[]) => void;
  onSkip: () => void;
  categoryKey: string;
  categoryName?: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    const opt = options.find(o => o.id === id);
    const newSelected = new Set(selected);
    const isAdding = !newSelected.has(id);
    
    if (isAdding) {
      newSelected.add(id);
    } else {
      newSelected.delete(id);
    }
    
    if (opt) {
      logKnowledgeAgentNegativeToggle(
        categoryKey,
        categoryName || '',
        opt.target_rule_key,
        opt.label,
        isAdding,
        newSelected.size
      );
    }
    
    setSelected(newSelected);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-6 bg-white border border-gray-100 rounded-[28px] mt-3 shadow-[0_8px_30px_rgb(0,0,0,0.02)]"
    >
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 bg-rose-50 rounded-xl flex items-center justify-center">
          <FcCancel size={20} />
        </div>
        <div>
          <span className="text-[15px] font-bold text-gray-900">제외하고 싶은 단점</span>
          <p className="text-[11px] text-gray-400 font-medium">이 단점이 있는 상품은 추천에서 제외합니다</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {options.map((opt) => (
          <motion.button
            key={opt.id}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => toggle(opt.id)}
            className={`p-3.5 rounded-2xl text-left transition-all border-2 relative ${
              selected.has(opt.id)
                ? 'bg-rose-50 border-rose-200 text-rose-700'
                : 'bg-white border-gray-100 hover:border-rose-100'
            }`}
          >
            <div className="flex flex-col gap-2">
              <div className={`w-5 h-5 rounded-lg border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                selected.has(opt.id) ? 'border-rose-500 bg-rose-500' : 'border-gray-200 bg-white'
              }`}>
                {selected.has(opt.id) && (
                  <FcCheckmark size={12} />
                )}
              </div>
              <div>
                <span className={`text-[16px] font-bold block leading-tight ${
                  selected.has(opt.id) ? 'text-rose-900' : 'text-gray-800'
                }`}>
                  {opt.label}
                </span>
              </div>
            </div>
          </motion.button>
        ))}
      </div>

      <div className="flex gap-2.5 mt-6 pt-5 border-t border-gray-50">
        <button
          onClick={() => {
            logKAQuestionSkipped(categoryKey, '피하고 싶은 단점');
            // 상세 로깅 추가
            logKnowledgeAgentNegativeCompleted(categoryKey, categoryName || '', []);
            onSkip();
          }}
          className="flex-1 py-3.5 bg-gray-50 rounded-2xl text-[14px] font-bold text-gray-500 hover:bg-gray-100 transition-all"
        >
          건너뛰기
        </button>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => {
            const selectedOptions = options.filter(o => selected.has(o.id));
            const selectedLabels = selectedOptions.map(o => o.label).join(', ');
            logKAQuestionAnswered(categoryKey, '피하고 싶은 단점', selectedLabels);
            
            // 상세 로깅 추가
            logKnowledgeAgentNegativeCompleted(
              categoryKey,
              categoryName || '',
              selectedOptions.map(o => o.target_rule_key)
            );
            
            onSelect(Array.from(selected));
          }}
          disabled={selected.size === 0}
          className="flex-[2] py-3.5 bg-rose-600 text-white rounded-2xl text-[14px] font-bold shadow-lg shadow-rose-100 hover:bg-rose-700 transition-all disabled:opacity-30 disabled:grayscale disabled:cursor-not-allowed"
        >
          {selected.size > 0 ? `${selected.size}개 필터링 적용` : '단점 선택'}
        </motion.button>
      </div>
    </motion.div>
  );
}

// ============================================================================
// InlineBudgetSelector - 예산 선택 (프리셋 + 슬라이더)
// ============================================================================

export function InlineBudgetSelector({
  presets,
  onSelect,
  onSkip,
  categoryKey,
  categoryName
}: {
  presets: BudgetPreset[];
  onSelect: (min: number, max: number) => void;
  onSkip: () => void;
  categoryKey: string;
  categoryName?: string;
}) {
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [customMax, setCustomMax] = useState(200000);
  const [showCustom, setShowCustom] = useState(false);

  const handlePresetClick = (preset: BudgetPreset) => {
    setSelectedPreset(preset.type);
    setShowCustom(false);
    
    // 상세 로깅 추가
    logKnowledgeAgentBudgetPresetClicked(
      categoryKey,
      categoryName || '',
      preset.type,
      preset.range.min,
      preset.range.max
    );
  };

  const handleComplete = () => {
    if (selectedPreset) {
      const preset = presets.find(p => p.type === selectedPreset);
      if (preset) {
        logKAQuestionAnswered(categoryKey, '희망 예산', preset.label);
        
        // 상세 로깅 추가
        logKnowledgeAgentBudgetConfirm(
          categoryKey,
          categoryName || '',
          preset.range.min,
          preset.range.max,
          'preset'
        );
        
        onSelect(preset.range.min, preset.range.max);
      }
    } else if (showCustom) {
      logKAQuestionAnswered(categoryKey, '희망 예산', `${(customMax / 10000).toFixed(0)}만원 이하`);
      
      // 상세 로깅 추가
      logKnowledgeAgentBudgetConfirm(
        categoryKey,
        categoryName || '',
        0,
        customMax,
        'custom'
      );
      
      onSelect(0, customMax);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-6 bg-white border border-gray-100 rounded-[28px] mt-3 shadow-[0_8px_30px_rgb(0,0,0,0.02)]"
    >
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 bg-purple-50 rounded-xl flex items-center justify-center">
          <FcMoneyTransfer size={20} />
        </div>
        <div>
          <span className="text-[15px] font-bold text-gray-900">희망 예산 설정</span>
          <p className="text-[11px] text-gray-400 font-medium">생각하시는 가격대를 알려주세요</p>
        </div>
      </div>

      {/* 프리셋 버튼 */}
      <div className="grid grid-cols-3 gap-2.5 mb-5">
        {presets.map((preset) => (
          <motion.button
            key={preset.type}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => handlePresetClick(preset)}
            className={`p-3.5 rounded-2xl text-center transition-all border-2 flex flex-col items-center gap-1 ${
              selectedPreset === preset.type
                ? 'bg-purple-50 border-purple-200'
                : 'bg-white border-gray-100 hover:border-purple-100'
            }`}
          >
            <span className={`text-[13px] font-bold block ${
              selectedPreset === preset.type ? 'text-purple-700' : 'text-gray-800'
            }`}>
              {preset.label}
            </span>
            <span className={`text-[10px] block font-bold ${
              selectedPreset === preset.type ? 'text-purple-500' : 'text-gray-400'
            }`}>
              {(preset.range.min / 10000).toFixed(0)}~{(preset.range.max / 10000).toFixed(0)}만
            </span>
          </motion.button>
        ))}
      </div>

      {/* 직접 입력 토글 */}
      <button
        onClick={() => {
          setShowCustom(!showCustom);
          setSelectedPreset(null);
        }}
        className={`w-full py-2.5 text-[12px] font-bold rounded-xl transition-all ${
          showCustom ? 'text-purple-700 bg-purple-50' : 'text-gray-400 hover:text-purple-600'
        }`}
      >
        {showCustom ? '프리셋 다시보기' : '직접 예산 입력하기'}
      </button>

      {/* 커스텀 슬라이더 */}
      <AnimatePresence>
        {showCustom && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-5 space-y-4 px-1"
          >
            <div className="relative h-2 w-full bg-gray-100 rounded-full overflow-hidden">
               <motion.div 
                className="absolute left-0 top-0 h-full bg-purple-500"
                style={{ width: `${((customMax - 50000) / (500000 - 50000)) * 100}%` }}
               />
               <input
                type="range"
                min="50000"
                max="500000"
                step="10000"
                value={customMax}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  setCustomMax(val);
                  logKnowledgeAgentBudgetChanged(categoryKey, categoryName || '', 0, val);
                }}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              />
            </div>
            <div className="flex justify-between items-center px-1">
              <span className="text-[11px] font-bold text-gray-300 uppercase">Budget Range</span>
              <div className="flex items-baseline gap-1">
                <span className="text-[18px] font-black text-purple-700">
                  {(customMax / 10000).toFixed(0)}
                </span>
                <span className="text-[13px] font-bold text-purple-700">만원 이하</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 버튼 */}
      <div className="flex gap-2.5 mt-6 pt-5 border-t border-gray-50">
        <button
          onClick={() => {
            logKAQuestionSkipped(categoryKey, '희망 예산');
            // 상세 로깅 추가
            logKnowledgeAgentBudgetSkip(categoryKey, categoryName || '');
            onSkip();
          }}
          className="flex-1 py-3.5 bg-gray-50 rounded-2xl text-[14px] font-bold text-gray-500 hover:bg-gray-100 transition-all"
        >
          상관없음
        </button>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleComplete}
          disabled={!selectedPreset && !showCustom}
          className="flex-[2] py-3.5 bg-purple-600 text-white rounded-2xl text-[14px] font-bold shadow-lg shadow-purple-100 hover:bg-purple-700 transition-all disabled:opacity-30 disabled:grayscale disabled:cursor-not-allowed"
        >
          설정 완료
        </motion.button>
      </div>
    </motion.div>
  );
}
