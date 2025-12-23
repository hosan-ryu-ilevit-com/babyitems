'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface NegativeFilterOption {
  id: string;
  label: string;
  target_rule_key: string;
}

interface UserSelections {
  naturalLanguageInputs?: Array<{ stage: string; input: string }>;
  hardFilters?: Array<{ questionText: string; selectedLabels: string[] }>;
  balanceGames?: Array<{ title: string; selectedOption: string }>;
}

interface NegativeFilterAIHelperBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  options: NegativeFilterOption[];
  category: string;
  categoryName: string;
  onSelectOptions: (selectedRuleKeys: string[]) => void;
  userSelections?: UserSelections;
  autoSubmitContext?: boolean;
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

export function NegativeFilterAIHelperBottomSheet({
  isOpen,
  onClose,
  options,
  category,
  categoryName,
  onSelectOptions,
  userSelections,
  autoSubmitContext = false,
}: NegativeFilterAIHelperBottomSheetProps) {
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingExamples, setIsLoadingExamples] = useState(false);
  const [aiResponse, setAiResponse] = useState<AIResponse | null>(null);
  const [examples, setExamples] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [shouldAutoSubmit, setShouldAutoSubmit] = useState(false); // 자동 제출 트리거
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 바텀시트 열릴 때 예시 쿼리 생성
  useEffect(() => {
    if (isOpen) {
      if (autoSubmitContext) {
        console.log('🤖 Auto submit triggered by prop (Negative/Init)');
        setUserInput("지금까지 입력한 상황에 맞춰 추천해주세요");
        setAiResponse(null);
        setError(null);
        setShouldAutoSubmit(true);
      } else {
        setUserInput('');
        setAiResponse(null);
        setError(null);
        setShouldAutoSubmit(false); // 자동 제출 플래그 초기화
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
      console.log('🚀 [NegativeFilterAIHelper] Auto-submitting with userInput:', userInput);
      setShouldAutoSubmit(false); // 트리거 리셋
      handleSubmit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldAutoSubmit, userInput, isLoading]);

  const FIXED_FIRST_EXAMPLE = '가장 많은 사람들이 피하는 단점이 뭔가요?';
  const CONTEXT_SUMMARY_EXAMPLE = '🔮_CONTEXT_SUMMARY'; // 특별한 식별자

  const generateExamples = async () => {
    setIsLoadingExamples(true);
    try {
      const res = await fetch('/api/ai-selection-helper/generate-examples', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionType: 'negative_filter',
          questionText: '피하고 싶은 단점이 있나요?',
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
      console.log('🔍 [NegativeFilterAIHelper] generateExamples:', {
        hasContext,
        naturalLanguageInputs: userSelections?.naturalLanguageInputs?.length || 0,
        hardFilters: userSelections?.hardFilters?.length || 0,
        balanceGames: userSelections?.balanceGames?.length || 0,
      });

      // 첫 번째는 고정, 나머지 2개는 API에서 (상황 기반 예시)
      const apiExamples = (data.examples || []).slice(0, 2);
      const baseExamples = [FIXED_FIRST_EXAMPLE, ...apiExamples];
      // 컨텍스트가 있으면 맨 앞에 특별 예시 추가
      setExamples(hasContext ? [CONTEXT_SUMMARY_EXAMPLE, ...baseExamples] : baseExamples);
    } catch {
      // 어떤 선택이나 입력이라도 있는지 확인
      const hasContext =
        (userSelections?.naturalLanguageInputs && userSelections.naturalLanguageInputs.length > 0) ||
        (userSelections?.hardFilters && userSelections.hardFilters.length > 0) ||
        (userSelections?.balanceGames && userSelections.balanceGames.length > 0);

      // Fallback: 사용자 상황 기반 예시 (상품 단점이 아님)
      const baseExamples = [
        FIXED_FIRST_EXAMPLE,
        '맞벌이라 시간이 부족해요',
        '집이 좁은 편이에요',
      ];
      setExamples(hasContext ? [CONTEXT_SUMMARY_EXAMPLE, ...baseExamples] : baseExamples);
    } finally {
      setIsLoadingExamples(false);
    }
  };

  const handleSubmit = async () => {
    if (!userInput.trim() || isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/ai-selection-helper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionType: 'negative_filter',
          questionId: 'negative_filter',
          questionText: '피하고 싶은 단점이 있나요?',
          options,
          userContext: userInput.trim(),
          category,
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
    onSelectOptions(aiResponse.recommendation.selectedOptions);
    onClose();
  };

  const handleExampleClick = (example: string) => {
    // 특별 예시인 경우 바로 추천받기 실행
    if (example === CONTEXT_SUMMARY_EXAMPLE) {
      console.log('🔍 [NegativeFilterAIHelper] Context summary clicked, triggering auto-submit:', {
        userSelections: userSelections,
      });

      // "지금까지 입력한 상황에 맞춰 추천해주세요" 텍스트 설정
      setUserInput("지금까지 입력한 상황에 맞춰 추천해주세요");

      // 자동 제출 트리거 설정 (useEffect가 감지하여 실행)
      setShouldAutoSubmit(true);
      return;
    }

    setUserInput(example);
    // 모바일에서 키보드가 불필요하게 올라오지 않도록 focus 안 함
  };

  const getRecommendationLabels = (): string[] => {
    if (!aiResponse) return [];

    if (aiResponse.recommendation.selectedOptions.length === 0) {
      return ['피해야 할 단점이 없어요'];
    }

    return aiResponse.recommendation.selectedOptions
      .map(ruleKey => options.find(o => o.target_rule_key === ruleKey)?.label || ruleKey);
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
              {/* 입력 영역 - 결과 나오면 비활성화 */}
              <div className={`transition-all duration-300 ${aiResponse ? 'opacity-40 pointer-events-none' : ''}`}>
                {/* 질문 표시 */}
                <h3 className="text-base font-bold text-gray-900 leading-snug mb-1">
                  피해야 할 단점이 있을까요?
                </h3>

                {/* 안내 메시지 */}
                <p className="text-sm text-gray-600 mb-4">
                  어떤 상황인지 알려주시면 피해야 할 단점을 추천해드릴게요!
                </p>

                {/* 예시 버튼들 */}
                <div className="flex flex-wrap gap-2 mb-4">
                  {isLoadingExamples ? (
                    <>
                      {[1, 2, 3].map(i => (
                        <div
                          key={i}
                          className="h-8 rounded-full bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 bg-[length:200%_100%] animate-[shimmer_1s_ease-in-out_infinite]"
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
                          onClick={() => handleExampleClick(example)}
                          disabled={isLoading || !!aiResponse}
                          className={`px-3 py-1.5 text-sm rounded-full transition-colors disabled:cursor-not-allowed flex items-center gap-1.5 ${
                            isContextSummary
                              ? 'bg-purple-100 text-purple-700 hover:bg-purple-150 font-semibold'
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
                    })
                  )}
                </div>

                {/* 입력 영역 */}
                <div className="mb-4">
                  <textarea
                    ref={inputRef}
                    value={userInput}
                    onChange={e => setUserInput(e.target.value)}
                    placeholder="육아 상황이나 고민을 알려주세요"
                    className="w-full p-3 border border-gray-200 rounded-xl text-base resize-none focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent disabled:bg-gray-50"
                    rows={3}
                    disabled={isLoading || !!aiResponse}
                  />
                </div>

                {/* 제출 버튼 */}
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
                        <span className="text-purple-500 font-bold text-sm">
                          {aiResponse.recommendation.selectedOptions.length === 0 ? '분석 결과' : '피해야 할 단점'}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getConfidenceColor(aiResponse.recommendation.confidence)}`}>
                          {getConfidenceLabel(aiResponse.recommendation.confidence)}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2 my-3">
                        {getRecommendationLabels().map((label, idx) => (
                          <span
                            key={idx}
                            className={`px-3 py-1.5 text-sm font-medium rounded-lg border ${
                              aiResponse.recommendation.selectedOptions.length === 0
                                ? 'text-green-700 bg-green-50 border-green-400'
                                : 'text-rose-700 bg-rose-50 border-rose-400'
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
                        {aiResponse.recommendation.selectedOptions.length === 0 
                          ? '넘어갈게요' 
                          : '이걸로 선택할게요'}
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



