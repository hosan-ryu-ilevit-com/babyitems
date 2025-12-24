'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  logExampleQuestionClicked,
  logExampleQuestionApplied,
  logNaturalLanguageInput,
} from '@/lib/logging/clientLogger';
import type { UserSelections } from '@/types/recommend-v2';

interface HardFilterOption {
  value: string;
  label: string;
}

interface BalanceGameOption {
  text: string;
  target_rule_key: string;
}

interface AIHelperBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  questionType: 'hard_filter' | 'balance_game' | 'category_selection';
  questionId: string;
  questionText: string;
  options: HardFilterOption[] | { A: BalanceGameOption; B: BalanceGameOption };
  category: string;
  categoryName: string;
  tipText?: string;
  onSelectOptions: (selectedOptions: string[]) => void;
  userSelections?: UserSelections;
  onNaturalLanguageInput?: (stage: string, input: string) => void;
  autoSubmitContext?: boolean; // 하위 호환성을 위해 유지
  autoSubmitText?: string; // 새로 추가된 prop
}

interface AIResponse {
  recommendation: {
    selectedOptions: string[];
    confidence: 'high' | 'medium' | 'low';
  };
  reasoning: string;
  alternatives?: string | null;
}

// **bold** 마크다운을 실제 볼드로 변환
function renderWithBold(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

export function AIHelperBottomSheet({
  isOpen,
  onClose,
  questionType,
  questionId,
  questionText,
  options,
  category,
  categoryName,
  tipText,
  onSelectOptions,
  userSelections,
  onNaturalLanguageInput,
  autoSubmitContext = false,
  autoSubmitText,
}: AIHelperBottomSheetProps) {
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingExamples, setIsLoadingExamples] = useState(false);
  const [aiResponse, setAiResponse] = useState<AIResponse | null>(null);
  const [examples, setExamples] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [shouldAutoSubmit, setShouldAutoSubmit] = useState(false); // 자동 제출 트리거
  const [isQuickMode, setIsQuickMode] = useState(false); // 번개 버튼으로 진입 시 입력 UI 숨김
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const FIXED_FIRST_EXAMPLE = '가장 많은 사람들이 구매하는게 뭔가요?';
  const CONTEXT_SUMMARY_EXAMPLE = '🔮_CONTEXT_SUMMARY'; // 특별한 식별자

  const generateExamples = async () => {
    setIsLoadingExamples(true);
    try {
      const res = await fetch('/api/ai-selection-helper/generate-examples', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionType,
          questionText,
          category,
          categoryName,
          userSelections,
        }),
      });
      const data = await res.json();

      // 어떤 선택이나 입력이라도 있는지 확인
      const hasContext =
        (userSelections?.naturalLanguageInputs && userSelections.naturalLanguageInputs.length > 0) ||
        (userSelections?.hardFilters && userSelections.hardFilters.length > 0) ||
        (userSelections?.balanceGames && userSelections.balanceGames.length > 0);

      // 디버깅 로그
      console.log('🔍 [AIHelperBottomSheet] generateExamples:', {
        hasContext,
        naturalLanguageInputs: userSelections?.naturalLanguageInputs?.length || 0,
        hardFilters: userSelections?.hardFilters?.length || 0,
        balanceGames: userSelections?.balanceGames?.length || 0,
      });

      // 카테고리 선택: 고정 1개 + API 8개 = 총 9개
      if (questionType === 'category_selection') {
        const apiExamples = (data.examples || []).slice(0, 8);
        const baseExamples = [FIXED_FIRST_EXAMPLE, ...apiExamples];
        // 컨텍스트가 있으면 맨 앞에 특별 예시 추가
        setExamples(hasContext ? [CONTEXT_SUMMARY_EXAMPLE, ...baseExamples] : baseExamples);
      } else {
        // 다른 타입: API에서 3개 가져오기 (고정 예시 제거)
        const apiExamples = (data.examples || []).slice(0, 3);
        setExamples(apiExamples);
      }
    } catch {
      // 어떤 선택이나 입력이라도 있는지 확인
      const hasContext =
        (userSelections?.naturalLanguageInputs && userSelections.naturalLanguageInputs.length > 0) ||
        (userSelections?.hardFilters && userSelections.hardFilters.length > 0) ||
        (userSelections?.balanceGames && userSelections.balanceGames.length > 0);

      if (questionType === 'category_selection') {
        const baseExamples = [
          FIXED_FIRST_EXAMPLE,
          '신생아 출산 준비 중이에요',
          '쌍둥이라 수유가 힘들어요',
          '6개월 아기를 키우고 다음주에 이사를 가려고 해요',
          '맞벌이라 시간이 부족해요',
          '곧 직장 복귀하는데 준비가 필요해요',
          '아이가 예민한 편이에요',
          '외출할 때마다 불편해요',
          '둘째 출산 예정이라 준비 중이에요',
        ];
        setExamples(hasContext ? [CONTEXT_SUMMARY_EXAMPLE, ...baseExamples] : baseExamples);
      } else {
        const fallbackExamples = [
          '쌍둥이라 자주 사용해요',
          '맞벌이라 시간이 부족해요',
          '집이 좁은 편이에요',
        ];
        setExamples(fallbackExamples);
      }
    } finally {
      setIsLoadingExamples(false);
    }
  };

  // 바텀시트 열릴 때 예시 쿼리 생성
  useEffect(() => {
    if (isOpen) {
      if (autoSubmitText) {
        console.log('🤖 Auto submit triggered by prop (Text):', autoSubmitText);
        setUserInput(autoSubmitText);
        setAiResponse(null);
        setError(null);
        setShouldAutoSubmit(true);
        setIsQuickMode(true); // 번개 버튼 모드
      } else if (autoSubmitContext) {
        console.log('🤖 Auto submit triggered by prop (Context)');
        setUserInput("지금까지 입력한 상황에 맞춰 추천해주세요");
        setAiResponse(null);
        setError(null);
        setShouldAutoSubmit(true);
        setIsQuickMode(true); // 번개 버튼 모드
      } else {
        setUserInput('');
        setAiResponse(null);
        setError(null);
        setShouldAutoSubmit(false); // 자동 제출 플래그 초기화
        setIsQuickMode(false); // 일반 모드
        generateExamples();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // AI 응답 또는 로딩 시작하면 스크롤
  useEffect(() => {
    if ((aiResponse || isLoading) && scrollRef.current) {
      setTimeout(() => {
        scrollRef.current?.scrollTo({
          top: scrollRef.current.scrollHeight,
          behavior: 'smooth',
        });
      }, 100);
    }
  }, [aiResponse, isLoading]);

  // 자동 제출 트리거
  useEffect(() => {
    if (shouldAutoSubmit && userInput.trim() && !isLoading) {
      console.log('🚀 [AIHelperBottomSheet] Auto-submitting with userInput:', userInput);
      setShouldAutoSubmit(false); // 트리거 리셋
      handleSubmit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldAutoSubmit, userInput, isLoading]);

  const handleSubmit = async () => {
    if (!userInput.trim() || isLoading) return;

    setIsLoading(true);
    setError(null);

    // 자연어 입력 저장
    const stage = questionType === 'hard_filter' ? 'hard_filters' :
                  questionType === 'balance_game' ? 'balance_game' :
                  'category_selection';
    onNaturalLanguageInput?.(stage, userInput.trim());

    // 자연어 입력 로깅
    logNaturalLanguageInput(
      'recommend-v2',
      0, // No step in this component
      userInput.trim(),
      undefined, // No parsed result at this point
      category,
      categoryName
    );

    try {
      const res = await fetch('/api/ai-selection-helper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionType,
          questionId,
          questionText,
          options,
          userContext: userInput.trim(),
          category,
          tipText,
          userSelections,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || '추천을 생성하는 데 실패했습니다.');
      }

      const data: AIResponse = await res.json();
      setAiResponse(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectRecommendation = () => {
    if (!aiResponse) return;

    // 로깅
    const selectedLabels = getRecommendationLabels();
    logExampleQuestionApplied(
      questionType,
      questionId,
      userInput,
      aiResponse.recommendation.selectedOptions,
      selectedLabels,
      category,
      categoryName
    );

    // 밸런스게임에서 "both" 선택 시 특별 처리
    if (questionType === 'balance_game') {
      onSelectOptions(aiResponse.recommendation.selectedOptions);
    } else {
      onSelectOptions(aiResponse.recommendation.selectedOptions);
    }
    onClose();
  };

  const handleExampleClick = async (example: string, index: number) => {
    // 특별 예시인 경우 바로 추천받기 실행
    if (example === CONTEXT_SUMMARY_EXAMPLE) {
      console.log('🔍 [AIHelperBottomSheet] Context summary clicked, triggering auto-submit:', {
        userSelections: userSelections,
      });

      // "지금까지 입력한 상황에 맞춰 추천해주세요" 텍스트 설정
      setUserInput("지금까지 입력한 상황에 맞춰 추천해주세요");

      // 자동 제출 트리거 설정 (useEffect가 감지하여 실행)
      setShouldAutoSubmit(true);
      return;
    }

    // 로깅
    logExampleQuestionClicked(
      questionType,
      questionId,
      example,
      index,
      category,
      categoryName
    );

    setUserInput(example);
    // 모바일에서 키보드가 불필요하게 올라오지 않도록 focus 안 함
  };

  const getRecommendationLabels = (): string[] => {
    if (!aiResponse) return [];

    if (questionType === 'balance_game') {
      const selected = aiResponse.recommendation.selectedOptions[0];
      if (selected === 'both') return ['둘 다 중요해요'];
      if (selected === 'A') {
        return [`A: ${(options as { A: BalanceGameOption; B: BalanceGameOption }).A.text}`];
      }
      return [`B: ${(options as { A: BalanceGameOption; B: BalanceGameOption }).B.text}`];
    }

    // hard_filter 또는 category_selection
    const optionList = options as HardFilterOption[];
    return aiResponse.recommendation.selectedOptions
      .map(v => optionList.find(o => o.value === v)?.label || v);
  };

  const getConfidenceColor = (confidence: string) => {
    switch (confidence) {
      case 'high':
        return 'bg-green-100 text-green-700';
      case 'medium':
        return 'bg-yellow-100 text-yellow-700';
      default:
        return 'bg-gray-100 text-gray-600';
    }
  };

  const getConfidenceLabel = (confidence: string) => {
    switch (confidence) {
      case 'high':
        return '확신해요';
      case 'medium':
        return '추천해요';
      default:
        return '참고해주세요';
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 z-[60]"
          />

          {/* Bottom Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl z-[70] flex flex-col overflow-hidden"
            style={{ maxWidth: '480px', margin: '0 auto', height: '70vh' }}
          >
            {/* Header */}
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="#8B5CF6">
                  <path d="M12 2L15.5 12L12 22L8.5 12Z M2 12L12 8.5L22 12L12 15.5Z" />
                </svg>
                <h2 className="text-base font-bold text-gray-900">AI 도움받기</h2>
              </div>
              <button
                onClick={onClose}
                className="p-1 rounded-full hover:bg-gray-100 transition-colors"
              >
                <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Scrollable Content */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4">
              {/* 입력 영역 - 퀵 모드에서는 질문/예시/버튼만 숨김 */}
              <div className={`transition-all duration-300 ${aiResponse ? 'opacity-40 pointer-events-none' : ''}`}>
                {/* 질문, 안내, 예시 - 퀵 모드에서는 숨김 */}
                {!isQuickMode && (
                <>
                {/* 질문 표시 */}
                <h3 className="text-base font-bold text-gray-900 leading-snug mb-1">
                  {questionText}
                </h3>

                {/* 안내 메시지 */}
                <p className="text-sm text-gray-600 mb-4">
                  어떤 상황인지 알려주시면 추천해드릴게요!
                </p>

                {/* 예시 버튼들 */}
                {questionType === 'category_selection' ? (
                  // 카테고리 선택: 가로 스크롤 그리드 (3개씩)
                  <div className="mb-4 -mx-5">
                    <div className="overflow-x-auto px-5 scrollbar-hide">
                      {isLoadingExamples ? (
                        <div className="grid grid-rows-3 grid-flow-col gap-2" style={{ minWidth: 'max-content' }}>
                          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => (
                            <div
                              key={i}
                              className="h-8 rounded-full bg-linear-to-r from-gray-200 via-gray-100 to-gray-200 bg-size-[200%_100%] animate-[shimmer_1s_ease-in-out_infinite]"
                              style={{
                                width: '180px',
                                animationDelay: `${i * 0.1}s`
                              }}
                            />
                          ))}
                          <style jsx>{`
                            @keyframes shimmer {
                              0% { background-position: 200% 0; }
                              100% { background-position: -200% 0; }
                            }
                          `}</style>
                        </div>
                      ) : (
                        <div className="grid grid-rows-3 grid-flow-col gap-2" style={{ minWidth: 'max-content' }}>
                          {examples.map((example, idx) => {
                            const isContextSummary = example === CONTEXT_SUMMARY_EXAMPLE;
                            return (
                              <motion.button
                                key={idx}
                                initial={{ opacity: 0, x: 10, scale: 0.95 }}
                                animate={{ opacity: 1, x: 0, scale: 1 }}
                                transition={{
                                  duration: 0.3,
                                  delay: idx * 0.05,
                                  ease: [0.25, 0.1, 0.25, 1]
                                }}
                                onClick={() => handleExampleClick(example, idx)}
                                disabled={isLoading || !!aiResponse}
                                className={`px-3 py-1.5 text-sm rounded-full transition-colors disabled:cursor-not-allowed whitespace-nowrap flex items-center gap-1.5 ${
                                  isContextSummary
                                    ? 'bg-gray-100 text-gray-600 hover:bg-gray-200 font-semibold'
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}
                              >
                                {isContextSummary ? (
                                  <span>지금까지 입력한 내 상황에 맞춰 추천해주세요</span>
                                ) : (
                                  example
                                )}
                              </motion.button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  // 다른 타입: 기존 flex-wrap 레이아웃
                  <div className="flex flex-wrap gap-2 mb-4">
                    {isLoadingExamples ? (
                      <>
                        {[1, 2, 3].map(i => (
                          <div
                            key={i}
                            className="h-8 rounded-full bg-linear-to-r from-gray-200 via-gray-100 to-gray-200 bg-size-[200%_100%] animate-[shimmer_1s_ease-in-out_infinite]"
                            style={{
                              width: `${70 + i * 15}px`,
                              animationDelay: `${i * 0.15}s`
                            }}
                          />
                        ))}
                        <style jsx>{`
                          @keyframes shimmer {
                            0% { background-position: 200% 0; }
                            100% { background-position: -200% 0; }
                          }
                        `}</style>
                      </>
                    ) : (
                      examples.map((example, idx) => {
                        const isContextSummary = example === CONTEXT_SUMMARY_EXAMPLE;
                        return (
                          <motion.button
                            key={idx}
                            initial={{ opacity: 0, y: 8, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            transition={{
                              duration: 0.3,
                              delay: idx * 0.1,
                              ease: [0.25, 0.1, 0.25, 1]
                            }}
                            onClick={() => handleExampleClick(example, idx)}
                            disabled={isLoading || !!aiResponse}
                            className={`text-sm rounded-full transition-all disabled:cursor-not-allowed flex items-center gap-1.5 ${
                              isContextSummary || example === FIXED_FIRST_EXAMPLE
                                ? 'w-full p-3 rounded-xl border mb-1 justify-between' // Card Style for special options
                                : 'px-3 py-1.5 bg-gray-100 text-gray-600 hover:bg-gray-200 rounded-full' // Default Chip Style
                            } ${
                              isContextSummary
                                ? 'bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100'
                                : example === FIXED_FIRST_EXAMPLE
                                ? 'bg-orange-50 border-orange-200 text-orange-800 hover:bg-orange-100'
                                : ''
                            }`}
                          >
                            {isContextSummary ? (
                              <>
                                <div className="flex items-center gap-2">
                                  <span className="text-lg leading-none">✨</span>
                                  <span className="font-bold">지금까지 입력한 내 상황에 맞춰 추천해주세요</span>
                                </div>
                                <svg className="w-4 h-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                              </>
                            ) : example === FIXED_FIRST_EXAMPLE ? (
                              <>
                                <div className="flex items-center gap-2">
                                  <span className="text-lg leading-none">🔥</span>
                                  <span className="font-bold">{example}</span>
                                </div>
                                <svg className="w-4 h-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                              </>
                            ) : (
                              example
                            )}
                          </motion.button>
                        );
                      })
                    )}
                  </div>
                )}
                </>
                )}

                {/* 입력 영역 - 항상 표시 (퀵 모드에서도 입력 내용 확인용) */}
                <div className="mb-4">
                  <textarea
                    ref={inputRef}
                    value={userInput}
                    onChange={e => setUserInput(e.target.value)}
                    placeholder={
                      questionType === 'category_selection'
                        ? '육아 상황을 알려주세요'
                        : '위 질문과 관련된 육아 상황을 알려주세요'
                    }
                    className="w-full p-3 border border-gray-200 rounded-xl text-base resize-none focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent disabled:bg-gray-50"
                    rows={3}
                    disabled={isQuickMode || isLoading || !!aiResponse}
                  />
                </div>

                {/* 제출 버튼 - 퀵 모드에서는 숨김 */}
                {!isQuickMode && (
                <button
                  onClick={handleSubmit}
                  disabled={!userInput.trim() || isLoading || !!aiResponse}
                  className={`w-full py-3 rounded-xl font-semibold text-sm transition-all mb-4 ${
                    !userInput.trim() || isLoading || aiResponse
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : 'bg-purple-500 text-white hover:bg-purple-600 active:scale-[0.98]'
                  }`}
                >
                  추천받기
                </button>
                )}
              </div>

              {/* 스켈레톤 로딩 */}
              <AnimatePresence>
                {isLoading && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-3 mb-4"
                  >
                    <div className="p-4 bg-purple-50 rounded-xl border border-purple-100 overflow-hidden">
                      {/* AI 분석중 헤더 */}
                      <div className="flex items-center gap-2 mb-3">
                        <div className="flex items-center gap-1.5">
                          <svg className="w-4 h-4 animate-pulse" viewBox="0 0 24 24" fill="#8B5CF6">
                            <path d="M12 2L15.5 12L12 22L8.5 12Z M2 12L12 8.5L22 12L12 15.5Z" />
                          </svg>
                          <span className="text-purple-600 font-bold text-sm">상황을 분석하고 있어요. 잠시만 기다려주세요!</span>
                        </div>
                      </div>

                      {/* 스켈레톤 라인들 - 쉬머 효과 */}
                      <div className="space-y-2">
                        <div className="h-4 rounded-lg w-3/4 bg-gradient-to-r from-purple-100 via-purple-50 to-purple-100 bg-[length:200%_100%] animate-[shimmer_1.5s_infinite]" />
                        <div className="h-4 rounded-lg w-full bg-gradient-to-r from-purple-100 via-purple-50 to-purple-100 bg-[length:200%_100%] animate-[shimmer_1.5s_infinite]" style={{ animationDelay: '0.1s' }} />
                        <div className="h-4 rounded-lg w-5/6 bg-gradient-to-r from-purple-100 via-purple-50 to-purple-100 bg-[length:200%_100%] animate-[shimmer_1.5s_infinite]" style={{ animationDelay: '0.2s' }} />
                      </div>
                    </div>

                    {/* 쉬머 애니메이션 정의 */}
                    <style jsx>{`
                      @keyframes shimmer {
                        0% { background-position: 200% 0; }
                        100% { background-position: -200% 0; }
                      }
                    `}</style>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* 에러 메시지 */}
              {error && (
                <div className="mb-4 p-3 bg-red-50 rounded-xl">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              {/* AI 응답 */}
              <AnimatePresence>
                {aiResponse && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-3"
                  >
                    {/* 추천 결과 */}
                    <div className="p-4 bg-purple-50 rounded-xl">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-purple-500 font-bold text-sm">추천</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getConfidenceColor(aiResponse.recommendation.confidence)}`}>
                          {getConfidenceLabel(aiResponse.recommendation.confidence)}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2 my-3">
                        {getRecommendationLabels().map((label, idx) => (
                          <span
                            key={idx}
                            className={`px-3 py-1.5 text-sm font-medium rounded-lg border ${
                              questionType === 'balance_game'
                                ? 'text-purple-700 bg-white border-purple-400'
                                : 'text-purple-700 bg-white border-purple-400'
                            }`}
                          >
                            {label}
                          </span>
                        ))}
                      </div>
                      <p className="text-sm text-gray-600 leading-snug">
                        {renderWithBold(aiResponse.reasoning)}
                      </p>
                      {aiResponse.alternatives && (
                        <p className="text-xs text-gray-500 mt-2 pt-2 border-t border-purple-100">
                          <span className="font-semibold">TIP:</span> {aiResponse.alternatives}
                        </p>
                      )}
                    </div>

                    {/* 액션 버튼들 */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setAiResponse(null);
                          setUserInput('');
                          setIsQuickMode(false); // 전체 UI 다시 표시
                          generateExamples(); // 예시 다시 로드
                          // 위로 스크롤 후 인풋 포커스
                          scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                          setTimeout(() => {
                            inputRef.current?.focus();
                          }, 150);
                        }}
                        className="flex-1 py-3.5 rounded-xl font-medium text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
                      >
                        다시 물어볼래요
                      </button>
                      <button
                        onClick={handleSelectRecommendation}
                        className="flex-1 py-3.5 rounded-xl font-semibold text-sm text-white bg-purple-500 hover:bg-purple-600 active:scale-[0.98] transition-all"
                      >
                        이걸로 선택할게요
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
