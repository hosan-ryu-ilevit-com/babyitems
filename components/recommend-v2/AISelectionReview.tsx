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

  // 예산 정보 (clarifying questions에서 설정된)
  budgetRange?: { min: number; max: number } | null;

  // 로딩 상태 (추천 계산 중일 때 하단 버튼 숨김)
  isLoading?: boolean;
}

type SectionType = 'hardFilter' | 'balanceGame' | 'negativeFilter' | 'budget';

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
  budgetRange,
  isLoading = false,
}: AISelectionReviewProps) {
  // 수정 가능한 상태
  const [hardFilterSelections, setHardFilterSelections] = useState(initialHardFilters);
  const [balanceGameSelections, setBalanceGameSelections] = useState(initialBalanceGames);
  const [negativeFilterSelections, setNegativeFilterSelections] = useState(initialNegativeFilters);

  // UI 상태
  const [expandedSection, setExpandedSection] = useState<SectionType | null>(null);

  // 가격 포맷 헬퍼
  const formatPrice = (price: number) => {
    if (price >= 10000) {
      return `${Math.round(price / 10000)}만원`;
    }
    return `${price.toLocaleString()}원`;
  };

  // 예산 요약 텍스트
  const budgetSummary = useMemo(() => {
    if (!budgetRange) return '설정 안 함';
    return `${formatPrice(budgetRange.min)} ~ ${formatPrice(budgetRange.max)}`;
  }, [budgetRange]);

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
      return option?.displayLabel || option?.label || value;
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
  const negativeLabels = useMemo(() => {
    return negativeFilterSelections.map(key => {
      const option = negativeOptions.find(o => o.target_rule_key === key);
      return option?.label || key;
    });
  }, [negativeFilterSelections, negativeOptions]);

  // 섹션별 선택 요약 텍스트 렌더러
  const renderSummary = useCallback((labels: string[], fallback: string = '설정 없음') => {
    if (labels.length === 0) return fallback;
    return labels.map((label, i) => (
      <span key={i} className="inline-flex items-center">
        {label}
        {i < labels.length - 1 && (
          <span className="mx-1.5 text-gray-400 font-black text-sm leading-none" style={{ transform: 'scale(1.4)' }}>·</span>
        )}
      </span>
    ));
  }, []);

  const hardFilterSummary = useMemo(() => {
    const allLabels: string[] = [];
    hardFilterQuestions.forEach(q => {
      const labels = getHardFilterLabels(q.id);
      allLabels.push(...labels);
    });
    return renderSummary(allLabels);
  }, [hardFilterQuestions, getHardFilterLabels, renderSummary]);

  const balanceSummary = useMemo(() => {
    const allLabels: string[] = [];
    balanceQuestions.forEach(q => {
      const selection = balanceGameSelections[q.id];
      if (selection === 'A') allLabels.push(q.option_A.text);
      else if (selection === 'B') allLabels.push(q.option_B.text);
      else if (selection === 'both') {
        allLabels.push(q.option_A.text);
        allLabels.push(q.option_B.text);
      }
    });
    return renderSummary(allLabels);
  }, [balanceQuestions, balanceGameSelections, renderSummary]);

  const negativeSummary = useMemo(() => {
    return renderSummary(negativeLabels, '없음');
  }, [negativeLabels, renderSummary]);

  // 섹션 토글
  const toggleSection = (section: SectionType) => {
    setExpandedSection(prev => prev === section ? null : section);
  };

  // 하드필터 수정
  const handleHardFilterEdit = (questionId: string, newValues: string[]) => {
    setHardFilterSelections(prev => ({
      ...prev,
      [questionId]: newValues,
    }));
  };

  // 밸런스게임 수정
  const handleBalanceEdit = (questionId: string, newSelection: 'A' | 'B' | 'both') => {
    setBalanceGameSelections(prev => ({
      ...prev,
      [questionId]: newSelection,
    }));
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
      className="flex flex-col pb-32"
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

      {/* 수정 안내 배너 */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
        className="mb-4"
      >
        <div className="flex items-center justify-center px-4 py-3 bg-purple-50/50 rounded-xl border border-purple-100/50">
          <p className="text-sm text-purple-700 font-medium leading-tight text-center">
            👇 아래 메뉴를 눌러 조건을 수정하실 수 있어요 
          </p>
        </div>
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
            icon="📋"
            isExpanded={expandedSection === 'hardFilter'}
            onToggle={() => toggleSection('hardFilter')}
            summary={hardFilterSummary}
          >
            <div className="space-y-6 pt-2">
              {hardFilterQuestions.map(question => {
                const reason = selectionReasons.hardFilters[question.id];
                
                // AI가 골라준 초기값과 현재 값이 다른지 확인
                const initial = initialHardFilters[question.id] || [];
                const current = hardFilterSelections[question.id] || [];
                const isModified = JSON.stringify(initial.sort()) !== JSON.stringify(current.sort());

                return (
                  <div key={question.id} className="border-b border-gray-100 pb-6 last:border-0 last:pb-0">
                    <div className="flex flex-col gap-3">
                      <p className="text-sm font-semibold text-gray-800">
                        {question.question}
                      </p>
                      
                      {/* 옵션 버튼들 (수정 모드 기본 노출) */}
                      <div className="flex flex-wrap gap-2">
                        {question.options.map(option => {
                          const isSelected = (hardFilterSelections[question.id] || []).includes(option.value);
                          return (
                            <button
                              key={option.value}
                              onClick={() => {
                                const currentVals = hardFilterSelections[question.id] || [];
                                if (question.type === 'single') {
                                  handleHardFilterEdit(question.id, [option.value]);
                                } else {
                                  const newValues = isSelected
                                    ? currentVals.filter(v => v !== option.value)
                                    : [...currentVals, option.value];
                                  handleHardFilterEdit(question.id, newValues.length > 0 ? newValues : [option.value]);
                                }
                              }}
                              className={`px-3.5 py-2 text-sm rounded-full border-2 transition-all ${
                                isSelected
                                  ? 'bg-purple-50 text-purple-700 border-purple-500'
                                  : 'bg-white text-gray-700 border-gray-100 hover:border-purple-300 hover:bg-purple-50'
                              }`}
                            >
                              {option.displayLabel || option.label}
                            </button>
                          );
                        })}
                      </div>

                      {/* AI 설명 (수정되지 않았을 때만 아래에 표시) */}
                      {!isModified && reason && (
                        <p className="text-xs text-gray-500 bg-gray-50 p-3 rounded-xl border border-gray-100 leading-relaxed">
                          <span className="font-bold text-purple-600 mr-1.5 text-[10px] uppercase tracking-wider">AI 분석</span>
                          {renderHighlightedText(reason)}
                        </p>
                      )}
                    </div>
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
            title="상세 선호"
            icon="✨"
            isExpanded={expandedSection === 'balanceGame'}
            onToggle={() => toggleSection('balanceGame')}
            summary={balanceSummary}
          >
            <div className="space-y-6 pt-2">
              {balanceQuestions.map(question => {
                const reason = selectionReasons.balanceGames[question.id];
                const currentSelection = balanceGameSelections[question.id];
                
                // AI가 골라준 초기값과 현재 값이 다른지 확인
                const initial = initialBalanceGames[question.id];
                const isModified = initial !== currentSelection;

                return (
                  <div key={question.id} className="border-b border-gray-100 pb-6 last:border-0 last:pb-0">
                    <div className="flex flex-col gap-3">
                      <p className="text-sm font-semibold text-gray-800">
                        {question.title}
                      </p>
                      
                      {/* 옵션 버튼들 (수정 모드 기본 노출) */}
                      <div className="flex flex-col gap-2">
                        {/* Option A */}
                        <button
                          type="button"
                          onClick={() => handleBalanceEdit(question.id, 'A')}
                          className={`w-full px-4 py-3 text-sm text-center rounded-full border-2 transition-all ${
                            currentSelection === 'A' || currentSelection === 'both'
                              ? 'bg-purple-50 text-purple-700 border-purple-500 shadow-sm'
                              : 'bg-white text-gray-700 border-gray-100 hover:border-purple-200'
                          }`}
                        >
                          {question.option_A.text}
                        </button>

                        {/* VS Divider */}
                        <div className="relative flex items-center justify-center py-1">
                          <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-gray-100"></div>
                          </div>
                          <span className="relative px-3 bg-white text-[10px] font-bold text-gray-300 uppercase tracking-widest italic">vs</span>
                        </div>

                        {/* Option B */}
                        <button
                          type="button"
                          onClick={() => handleBalanceEdit(question.id, 'B')}
                          className={`w-full px-4 py-3 text-sm text-center rounded-full border-2 transition-all ${
                            currentSelection === 'B' || currentSelection === 'both'
                              ? 'bg-purple-50 text-purple-700 border-purple-500 shadow-sm'
                              : 'bg-white text-gray-700 border-gray-100 hover:border-purple-200'
                          }`}
                        >
                          {question.option_B.text}
                        </button>

                        {/* Both Text */}
                        <div className="mt-1 text-center">
                          <button
                            type="button"
                            onClick={() => handleBalanceEdit(question.id, 'both')}
                            className={`text-xs font-medium py-2 px-4 rounded-full transition-colors ${
                              currentSelection === 'both' 
                                ? 'text-purple-700 bg-purple-50' 
                                : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                            }`}
                          >
                            둘 다 중요해요
                          </button>
                        </div>
                      </div>

                      {/* AI 설명 (수정되지 않았을 때만 아래에 표시) */}
                      {!isModified && reason && (
                        <p className="text-xs text-gray-500 bg-gray-50 p-3 rounded-xl border border-gray-100 leading-relaxed">
                          <span className="font-bold text-purple-600 mr-1.5 text-[10px] uppercase tracking-wider">AI 분석</span>
                          {renderHighlightedText(reason)}
                        </p>
                      )}
                    </div>
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
            summary={negativeSummary}
          >
            <div className="space-y-6 pt-2">
              <div className="flex flex-col gap-3">
                {/* 옵션 버튼들 */}
                <div className="flex flex-wrap gap-2">
                  {negativeOptions.map(option => {
                    const isSelected = negativeFilterSelections.includes(option.target_rule_key);
                    return (
                      <button
                        key={option.target_rule_key}
                        onClick={() => handleNegativeToggle(option.target_rule_key)}
                        className={`px-3.5 py-2 text-sm rounded-full border-2 transition-all ${
                          isSelected
                            ? 'bg-red-50 text-red-600 border-red-300 shadow-sm'
                            : 'bg-white text-gray-700 border-gray-100 hover:border-red-200'
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>

                {/* AI 설명 (수정되지 않았을 때만 아래에 표시) */}
                {JSON.stringify(initialNegativeFilters.sort()) === JSON.stringify(negativeFilterSelections.sort()) && selectionReasons.negativeFilters && (
                  <p className="text-xs text-gray-500 bg-gray-50 p-3 rounded-xl border border-gray-100 leading-relaxed mt-1">
                    <span className="font-bold text-red-600 mr-1.5 text-[10px] uppercase tracking-wider">AI 분석</span>
                    {renderHighlightedText(selectionReasons.negativeFilters)}
                  </p>
                )}
              </div>
            </div>
          </SectionCard>
          </motion.div>
        )}

        {/* 4. 예산 범위 섹션 */}
        {budgetRange && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.6 }}
          >
          <SectionCard
            title="예산 범위"
            icon="💰"
            isExpanded={expandedSection === 'budget'}
            onToggle={() => toggleSection('budget')}
            summary={budgetSummary}
          >
            <div className="pt-2">
              <div className="flex items-center justify-center gap-3 py-4">
                <div className="text-center">
                  <p className="text-xs text-gray-400 mb-1">최소</p>
                  <p className="text-lg font-bold text-gray-900">{formatPrice(budgetRange.min)}</p>
                </div>
                <div className="text-gray-300 text-2xl font-light">~</div>
                <div className="text-center">
                  <p className="text-xs text-gray-400 mb-1">최대</p>
                  <p className="text-lg font-bold text-purple-600">{formatPrice(budgetRange.max)}</p>
                </div>
              </div>
              <p className="text-xs text-gray-500 text-center mt-2">
                추가 질문에서 선택하신 예산 범위예요
              </p>
            </div>
          </SectionCard>
          </motion.div>
        )}
      </div>

      {/* 고정 하단 CTA - 로딩 중에는 완전히 숨김 */}
      {!isLoading && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-4 safe-area-pb z-40">
          <div className="max-w-lg mx-auto space-y-3">
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
      )}
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
  summary: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-gray-50 rounded-2xl overflow-hidden">
      {/* 헤더 (클릭 가능) */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-start justify-between p-4 text-left hover:bg-gray-100 transition-colors gap-4"
      >
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <span className="text-lg leading-none mt-0.5">{icon}</span>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 text-sm mb-0.5">{title}</h3>
            <p className="text-xs text-gray-500 leading-relaxed break-keep">
              {summary}
            </p>
          </div>
        </div>
        <div className="pt-1 shrink-0">
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
        </div>
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
