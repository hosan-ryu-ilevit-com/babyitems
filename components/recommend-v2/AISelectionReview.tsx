'use client';

import { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { HardFilterQuestion, BalanceQuestion, NegativeFilterOption } from '@/types/recommend-v2';

interface ThumbnailProduct {
  id: string;
  title: string;
  thumbnail?: string;
}

interface AISelectionReviewProps {
  // AI 선택 결과
  hardFilterSelections: Record<string, string[]>;
  balanceGameSelections: Record<string, 'A' | 'B' | 'both'>;
  negativeFilterSelections: string[];

  // 선택 이유 (AI 생성)
  selectionReasons: {
    hardFilters: Record<string, string>;
    balanceGames: Record<string, string>;
    negativeFilters: string;
  };

  // 원본 질문/옵션 데이터 (수정 UI용)
  hardFilterQuestions: HardFilterQuestion[];
  balanceQuestions: BalanceQuestion[];
  negativeOptions: NegativeFilterOption[];

  // 콜백
  onConfirm: (finalSelections: {
    hardFilterSelections: Record<string, string[]>;
    balanceGameSelections: Record<string, 'A' | 'B' | 'both'>;
    negativeFilterSelections: string[];
  }) => void;
  onEditMode?: () => void; // 기존 플로우로 수정하기
  onBack?: () => void; // 이전 단계로 돌아가기

  // 기타 정보
  categoryName: string;
  overallReasoning: string;
  confidence: 'high' | 'medium' | 'low';

  // 썸네일 & 리뷰 정보
  thumbnailProducts?: ThumbnailProduct[];
  totalReviewCount?: number;
}

type SectionType = 'hardFilter' | 'balanceGame' | 'negativeFilter';

interface EditingState {
  type: SectionType;
  id: string;
}

/**
 * AI 선택 결과 확인/수정 화면
 * B 버전: AI가 선택한 모든 필터 결과를 카드로 보여주고 수정 가능
 */
export function AISelectionReview({
  hardFilterSelections: initialHardFilters,
  balanceGameSelections: initialBalanceGames,
  negativeFilterSelections: initialNegativeFilters,
  selectionReasons,
  hardFilterQuestions,
  balanceQuestions,
  negativeOptions,
  onConfirm,
  onEditMode,
  onBack,
  categoryName,
  overallReasoning,
  confidence,
  thumbnailProducts = [],
  totalReviewCount = 0,
}: AISelectionReviewProps) {
  // 수정 가능한 상태
  const [hardFilterSelections, setHardFilterSelections] = useState(initialHardFilters);
  const [balanceGameSelections, setBalanceGameSelections] = useState(initialBalanceGames);
  const [negativeFilterSelections, setNegativeFilterSelections] = useState(initialNegativeFilters);

  // UI 상태
  const [expandedSection, setExpandedSection] = useState<SectionType | null>(null);
  const [editing, setEditing] = useState<EditingState | null>(null);

  // Confidence 배지 색상
  const confidenceColors = {
    high: 'bg-green-50 text-green-700 border-green-200',
    medium: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    low: 'bg-orange-50 text-orange-700 border-orange-200',
  };

  const confidenceLabels = {
    high: '높은 확신',
    medium: '보통 확신',
    low: '낮은 확신',
  };

  // **텍스트**를 형광펜 처리하는 렌더러
  const renderHighlightedText = useCallback((text: string) => {
    // **text** 패턴을 찾아서 분리
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        const highlighted = part.slice(2, -2);
        return (
          <mark
            key={index}
            className="text-gray-900 font-semibold"
            style={{
              background: 'linear-gradient(to top, rgba(255, 245, 120, 0.35) 75%, transparent 80%)',
            }}
          >
            {highlighted}
          </mark>
        );
      }
      return <span key={index}>{part}</span>;
    });
  }, []);

  // 하드필터 선택값을 레이블로 변환
  const getHardFilterLabels = useCallback((questionId: string) => {
    const question = hardFilterQuestions.find(q => q.id === questionId);
    if (!question) return [];
    const selectedValues = hardFilterSelections[questionId] || [];
    return selectedValues.map(value => {
      const option = question.options.find(o => o.value === value);
      return option?.label || value;
    });
  }, [hardFilterQuestions, hardFilterSelections]);

  // 밸런스게임 선택을 텍스트로 변환
  const getBalanceLabel = useCallback((questionId: string) => {
    const question = balanceQuestions.find(q => q.id === questionId);
    if (!question) return '';
    const selection = balanceGameSelections[questionId];
    if (selection === 'A') return question.option_A.text;
    if (selection === 'B') return question.option_B.text;
    if (selection === 'both') return '둘 다 중요해요';
    return '';
  }, [balanceQuestions, balanceGameSelections]);

  // 단점필터 선택을 레이블로 변환
  const getNegativeLabels = useMemo(() => {
    return negativeFilterSelections.map(key => {
      const option = negativeOptions.find(o => o.target_rule_key === key);
      return option?.label || key;
    });
  }, [negativeFilterSelections, negativeOptions]);

  // 섹션 토글
  const toggleSection = (section: SectionType) => {
    setExpandedSection(prev => prev === section ? null : section);
    setEditing(null);
  };

  // 하드필터 수정
  const handleHardFilterEdit = (questionId: string, newValues: string[]) => {
    setHardFilterSelections(prev => ({
      ...prev,
      [questionId]: newValues,
    }));
    setEditing(null);
  };

  // 밸런스게임 수정
  const handleBalanceEdit = (questionId: string, newSelection: 'A' | 'B' | 'both') => {
    setBalanceGameSelections(prev => ({
      ...prev,
      [questionId]: newSelection,
    }));
    setEditing(null);
  };

  // 단점필터 수정
  const handleNegativeToggle = (ruleKey: string) => {
    setNegativeFilterSelections(prev =>
      prev.includes(ruleKey)
        ? prev.filter(k => k !== ruleKey)
        : [...prev, ruleKey]
    );
  };

  // 확정
  const handleConfirm = () => {
    onConfirm({
      hardFilterSelections,
      balanceGameSelections,
      negativeFilterSelections,
    });
  };

  // 수정된 항목 수 계산
  const modifiedCount = useMemo(() => {
    let count = 0;

    // 하드필터 비교
    for (const qId of Object.keys(hardFilterSelections)) {
      const initial = initialHardFilters[qId] || [];
      const current = hardFilterSelections[qId] || [];
      if (JSON.stringify(initial.sort()) !== JSON.stringify(current.sort())) {
        count++;
      }
    }

    // 밸런스게임 비교
    for (const qId of Object.keys(balanceGameSelections)) {
      if (initialBalanceGames[qId] !== balanceGameSelections[qId]) {
        count++;
      }
    }

    // 단점필터 비교
    if (JSON.stringify(initialNegativeFilters.sort()) !== JSON.stringify(negativeFilterSelections.sort())) {
      count++;
    }

    return count;
  }, [hardFilterSelections, balanceGameSelections, negativeFilterSelections, initialHardFilters, initialBalanceGames, initialNegativeFilters]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col min-h-full pb-32"
    >
      {/* 썸네일 + 리뷰 배지 */}
      {thumbnailProducts.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0 }}
          className="flex items-center gap-3 pt-2 pb-3"
        >
          {/* 썸네일 그룹 (최대 5개) */}
          <div className="flex -space-x-2">
            {thumbnailProducts.slice(0, 5).map((product, i) => (
              <div
                key={product.id}
                className="w-8 h-8 rounded-full border-2 border-white overflow-hidden relative bg-gray-100 shadow-sm"
                style={{ zIndex: 5 - i }}
                title={product.title}
              >
                {product.thumbnail ? (
                  <img
                    src={product.thumbnail}
                    alt={product.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-gray-100 to-gray-200" />
                )}
              </div>
            ))}
          </div>
          {/* 리뷰 개수 배지 */}
          {totalReviewCount > 0 && (
            <span className="px-2.5 py-1 bg-gray-100 text-gray-500 text-xs font-semibold rounded-full">
              리뷰 {totalReviewCount.toLocaleString()}개 분석
            </span>
          )}
        </motion.div>
      )}

      {/* 헤더: 확신도 + 설명 */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.15 }}
        className="pb-4"
      >
        <div className="flex items-center gap-2 mb-2">
          <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${confidenceColors[confidence]}`}>
            {confidenceLabels[confidence]}
          </span>
        </div>
        <p className="text-base text-gray-700 font-medium leading-6">
          {renderHighlightedText(overallReasoning)}
        </p>
      </motion.div>

      {/* 섹션 카드들 */}
      <div className="space-y-3">
        {/* 1. 하드필터 섹션 */}
        {hardFilterQuestions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.3 }}
          >
          <SectionCard
            title="기본 조건"
            icon="🎯"
            isExpanded={expandedSection === 'hardFilter'}
            onToggle={() => toggleSection('hardFilter')}
            summary={`${hardFilterQuestions.length}개 조건 설정됨`}
          >
            <div className="space-y-4">
              {hardFilterQuestions.map(question => {
                const labels = getHardFilterLabels(question.id);
                const isEditing = editing?.type === 'hardFilter' && editing.id === question.id;
                const reason = selectionReasons.hardFilters[question.id];

                return (
                  <div key={question.id} className="border-b border-gray-100 pb-4 last:border-0 last:pb-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-800 mb-1">
                          {question.question}
                        </p>
                        {!isEditing && (
                          <>
                            <div className="flex flex-wrap gap-1.5 mb-1">
                              {labels.map((label, i) => (
                                <span
                                  key={i}
                                  className="px-2.5 py-1 bg-[#5F0080]/10 text-[#5F0080] text-sm rounded-full"
                                >
                                  {label}
                                </span>
                              ))}
                            </div>
                            {reason && (
                              <p className="text-xs text-gray-500 mt-1">{reason}</p>
                            )}
                          </>
                        )}
                      </div>
                      {!isEditing && (
                        <button
                          onClick={() => setEditing({ type: 'hardFilter', id: question.id })}
                          className="text-xs text-gray-400 hover:text-[#5F0080] transition-colors shrink-0"
                        >
                          수정
                        </button>
                      )}
                    </div>

                    {/* 수정 UI */}
                    <AnimatePresence>
                      {isEditing && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="mt-3 overflow-hidden"
                        >
                          <div className="flex flex-wrap gap-2">
                            {question.options.map(option => {
                              const isSelected = (hardFilterSelections[question.id] || []).includes(option.value);
                              return (
                                <button
                                  key={option.value}
                                  onClick={() => {
                                    const current = hardFilterSelections[question.id] || [];
                                    if (question.type === 'single') {
                                      handleHardFilterEdit(question.id, [option.value]);
                                    } else {
                                      const newValues = isSelected
                                        ? current.filter(v => v !== option.value)
                                        : [...current, option.value];
                                      handleHardFilterEdit(question.id, newValues.length > 0 ? newValues : [option.value]);
                                    }
                                  }}
                                  className={`px-3.5 py-2 text-sm rounded-full border-2 transition-all ${
                                    isSelected
                                      ? 'bg-purple-50 text-purple-700 border-purple-500'
                                      : 'bg-white text-gray-700 border-gray-100 hover:border-purple-300 hover:bg-purple-50'
                                  }`}
                                >
                                  {option.label}
                                </button>
                              );
                            })}
                          </div>
                          <button
                            onClick={() => setEditing(null)}
                            className="mt-2 text-xs text-gray-400"
                          >
                            완료
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </SectionCard>
          </motion.div>
        )}

        {/* 2. 밸런스게임 섹션 */}
        {balanceQuestions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.4 }}
          >
          <SectionCard
            title="선호도"
            icon="⚖️"
            isExpanded={expandedSection === 'balanceGame'}
            onToggle={() => toggleSection('balanceGame')}
            summary={`${balanceQuestions.length}개 선호도 분석됨`}
          >
            <div className="space-y-4">
              {balanceQuestions.map(question => {
                const selectedLabel = getBalanceLabel(question.id);
                const isEditing = editing?.type === 'balanceGame' && editing.id === question.id;
                const reason = selectionReasons.balanceGames[question.id];
                const currentSelection = balanceGameSelections[question.id];

                return (
                  <div key={question.id} className="border-b border-gray-100 pb-4 last:border-0 last:pb-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-800 mb-1">
                          {question.title}
                        </p>
                        {!isEditing && (
                          <>
                            <span className="inline-block px-2.5 py-1 bg-[#5F0080]/10 text-[#5F0080] text-sm rounded-full">
                              {selectedLabel}
                            </span>
                            {reason && (
                              <p className="text-xs text-gray-500 mt-1">{reason}</p>
                            )}
                          </>
                        )}
                      </div>
                      {!isEditing && (
                        <button
                          onClick={() => setEditing({ type: 'balanceGame', id: question.id })}
                          className="text-xs text-gray-400 hover:text-[#5F0080] transition-colors shrink-0"
                        >
                          수정
                        </button>
                      )}
                    </div>

                    {/* 수정 UI */}
                    <AnimatePresence>
                      {isEditing && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="mt-3 overflow-hidden"
                        >
                          <div className="space-y-2">
                            {(['A', 'B', 'both'] as const).map(option => {
                              const label = option === 'A'
                                ? question.option_A.text
                                : option === 'B'
                                  ? question.option_B.text
                                  : '둘 다 중요해요';
                              const isSelected = currentSelection === option;
                              return (
                                <button
                                  key={option}
                                  onClick={() => handleBalanceEdit(question.id, option)}
                                  className={`w-full px-4 py-2.5 text-sm text-left rounded-xl border-2 transition-all ${
                                    isSelected
                                      ? 'bg-purple-50 text-purple-700 border-purple-500'
                                      : 'bg-white text-gray-700 border-gray-100 hover:border-purple-300 hover:bg-purple-50'
                                  }`}
                                >
                                  {option !== 'both' && <span className="font-medium mr-2">{option}.</span>}
                                  {label}
                                </button>
                              );
                            })}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </SectionCard>
          </motion.div>
        )}

        {/* 3. 단점필터 섹션 */}
        {negativeOptions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.5 }}
          >
          <SectionCard
            title="피할 단점"
            icon="🚫"
            isExpanded={expandedSection === 'negativeFilter'}
            onToggle={() => toggleSection('negativeFilter')}
            summary={negativeFilterSelections.length > 0 ? `${negativeFilterSelections.length}개 선택됨` : '선택 없음'}
          >
            <div>
              {getNegativeLabels.length > 0 ? (
                <>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {getNegativeLabels.map((label, i) => (
                      <span
                        key={i}
                        className="px-2.5 py-1 bg-red-50 text-red-600 text-sm rounded-full"
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mb-3">
                    {selectionReasons.negativeFilters}
                  </p>
                </>
              ) : (
                <p className="text-sm text-gray-500 mb-3">
                  {selectionReasons.negativeFilters || '특별히 피해야 할 단점이 없어요.'}
                </p>
              )}

              {/* 수정 UI - 항상 표시 */}
              <div className="pt-3 border-t border-gray-100">
                <p className="text-xs text-gray-400 mb-2">탭하여 추가/제거</p>
                <div className="flex flex-wrap gap-2">
                  {negativeOptions.map(option => {
                    const isSelected = negativeFilterSelections.includes(option.target_rule_key);
                    return (
                      <button
                        key={option.target_rule_key}
                        onClick={() => handleNegativeToggle(option.target_rule_key)}
                        className={`px-3.5 py-2 text-sm rounded-full border-2 transition-all ${
                          isSelected
                            ? 'bg-red-50 text-red-600 border-red-300'
                            : 'bg-white text-gray-600 border-gray-100 hover:border-red-200 hover:bg-red-50'
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </SectionCard>
          </motion.div>
        )}
      </div>

      {/* 고정 하단 CTA */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-4 safe-area-pb">
        <div className="max-w-lg mx-auto space-y-3">
          {modifiedCount > 0 && (
            <p className="text-center text-xs text-gray-500">
              {modifiedCount}개 항목을 수정했어요
            </p>
          )}
          <div className="flex gap-3">
            {onBack && (
              <button
                onClick={onBack}
                className="px-6 py-4 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-colors"
              >
                다시 입력
              </button>
            )}
            <button
              onClick={handleConfirm}
              className="flex-1 py-4 bg-[#5F0080] text-white font-semibold rounded-xl hover:bg-[#4a0066] transition-colors"
            >
              이대로 추천받기
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/**
 * 섹션 카드 컴포넌트 (아코디언)
 */
function SectionCard({
  title,
  icon,
  isExpanded,
  onToggle,
  summary,
  children,
}: {
  title: string;
  icon: string;
  isExpanded: boolean;
  onToggle: () => void;
  summary: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-gray-50 rounded-2xl overflow-hidden">
      {/* 헤더 (클릭 가능) */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-lg">{icon}</span>
          <div>
            <h3 className="font-semibold text-gray-900 text-sm">{title}</h3>
            <p className="text-xs text-gray-500">{summary}</p>
          </div>
        </div>
        <motion.svg
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="w-4 h-4 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </motion.svg>
      </button>

      {/* 내용 (아코디언) */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-2 bg-white mx-2 mb-2 rounded-xl">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
