'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ProposalViewProps {
  categoryName: string;
  userContext: string;
  reasoning: string;
  hardFilterSelections: Record<string, string[]>;
  hardFilterLabels: Record<string, string>;
  balanceGameSelections: Record<string, string>;
  balanceLabels: Record<string, string>;
  negativeFilterSelections: string[];
  negativeLabels: Record<string, string>;
  onConfirm: () => void;
  onEdit: () => void;
}

export function ProposalView({
  categoryName,
  userContext,
  reasoning,
  hardFilterSelections,
  hardFilterLabels,
  balanceGameSelections,
  balanceLabels,
  negativeFilterSelections,
  negativeLabels,
  onConfirm,
  onEdit,
}: ProposalViewProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // 1. 하드 필터 요약
  const hardFilterSummary = Object.entries(hardFilterSelections).flatMap(([key, values]) => 
    values.map(v => hardFilterLabels[v] || v)
  );

  // 2. 밸런스 게임 요약
  const balanceSummary = Object.entries(balanceGameSelections).map(([key, value]) => {
    // value is "A", "B", or "both"
    // key is questionId
    // balanceLabels maps "target_rule_key" -> text. 
    // Wait, the API returns "A" or "B". We need to map that to the label.
    // The prop passed in `balanceLabels` should ideally map the questionId + value to the text.
    // Or we rely on the caller to pass labels that already resolved "A" -> "Label".
    // For now assume balanceLabels keys are constructed like `${questionId}_${value}` or simply the text is passed.
    // Actually, in page.tsx, we have balanceLabels mapping rule_key -> label.
    // The API returns "A" or "B". We need the question definition to know what "A" means.
    // To simplify, let's assume the caller processes this or we just show "A", "B" (bad).
    // Let's rely on the caller to pass *resolved* labels or objects.
    // To keep it simple, I'll update the component to accept `balanceSummary` strings directly?
    // No, let's try to look up.
    
    // For now, let's just display the label if found in balanceLabels using the key provided.
    // If the caller passes the *rule key* as the value, we can look it up.
    // But the API returns "A"/"B".
    // I will modify `page.tsx` to resolve "A"/"B" to the actual text before passing to this view.
    // So `balanceGameSelections` passed here should be { QuestionTitle: SelectedOptionLabel } ideally.
    // Or just a list of strings.
    return balanceLabels[key] || value; // Temporary fallback
  });

  // 3. 부정 필터 요약
  const negativeSummary = negativeFilterSelections.map(key => negativeLabels[key] || key);

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="flex-1 overflow-y-auto pb-24">
        <div className="px-5 py-6 space-y-6">
          
          {/* 헤더 섹션 */}
          <div className="space-y-2">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="inline-flex items-center px-3 py-1 rounded-full bg-purple-100 text-purple-700 text-xs font-bold"
            >
              AI 맞춤 분석 완료 ✨
            </motion.div>
            <motion.h2 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-2xl font-bold text-gray-900 leading-tight"
            >
              {categoryName},<br />
              이렇게 찾아드릴까요?
            </motion.h2>
          </div>

          {/* Reasoning Card */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white p-5 rounded-2xl shadow-sm border border-purple-100"
          >
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
                <span className="text-lg">🤖</span>
              </div>
              <div className="space-y-2">
                <p className="text-gray-800 text-sm leading-relaxed font-medium">
                  {reasoning}
                </p>
                <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded-xl">
                  "{userContext}"
                </div>
              </div>
            </div>
          </motion.div>

          {/* Details Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between px-1">
              <h3 className="font-bold text-gray-900">선택된 조건들</h3>
              {/* <button className="text-xs text-gray-500 underline">자세히 보기</button> */}
            </div>

            {/* Hard Filters */}
            {hardFilterSummary.length > 0 && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 }}
                className="bg-white p-4 rounded-xl border border-gray-100 space-y-3"
              >
                <div className="flex items-center gap-2 text-gray-900 font-semibold text-sm">
                  <span className="w-1 h-4 bg-blue-500 rounded-full"></span>
                  꼭 필요한 조건
                </div>
                <div className="flex flex-wrap gap-2">
                  {hardFilterSummary.map((label, idx) => (
                    <span key={idx} className="px-3 py-1.5 bg-blue-50 text-blue-700 text-sm font-medium rounded-lg">
                      {label}
                    </span>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Balance Game */}
            {balanceSummary.length > 0 && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 }}
                className="bg-white p-4 rounded-xl border border-gray-100 space-y-3"
              >
                <div className="flex items-center gap-2 text-gray-900 font-semibold text-sm">
                  <span className="w-1 h-4 bg-green-500 rounded-full"></span>
                  선호하는 스타일
                </div>
                <div className="flex flex-wrap gap-2">
                  {balanceSummary.map((label, idx) => (
                    <span key={idx} className="px-3 py-1.5 bg-green-50 text-green-700 text-sm font-medium rounded-lg">
                      {label}
                    </span>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Negative Filters */}
            {negativeSummary.length > 0 && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 }}
                className="bg-white p-4 rounded-xl border border-gray-100 space-y-3"
              >
                <div className="flex items-center gap-2 text-gray-900 font-semibold text-sm">
                  <span className="w-1 h-4 bg-red-500 rounded-full"></span>
                  제외할 단점
                </div>
                <div className="flex flex-wrap gap-2">
                  {negativeSummary.map((label, idx) => (
                    <span key={idx} className="px-3 py-1.5 bg-red-50 text-red-700 text-sm font-medium rounded-lg">
                      {label}
                    </span>
                  ))}
                </div>
              </motion.div>
            )}
            
            {negativeSummary.length === 0 && hardFilterSummary.length === 0 && balanceSummary.length === 0 && (
               <div className="text-center py-8 text-gray-400 text-sm">
                  특별히 선택된 조건이 없어요. <br/>
                  모든 제품 중에서 추천해드릴게요!
               </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Action Buttons */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-4 pb-[env(safe-area-inset-bottom)] z-50 max-w-[480px] mx-auto">
        <div className="flex gap-3">
          <button
            onClick={onEdit}
            className="flex-1 py-4 rounded-2xl font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
          >
            직접 수정할래요
          </button>
          <button
            onClick={onConfirm}
            className="flex-[2] py-4 rounded-2xl font-bold text-white bg-purple-600 hover:bg-purple-700 shadow-lg shadow-purple-200 transition-all flex items-center justify-center gap-2"
          >
            <span>이대로 추천받기</span>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

