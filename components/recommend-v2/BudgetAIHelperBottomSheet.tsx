'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface PriceRangeInfo {
  range: string;
  min: number;
  max: number;
  count: number;
}

interface UserSelections {
  naturalLanguageInputs?: Array<{ stage: string; input: string }>;
  hardFilters?: Array<{ questionText: string; selectedLabels: string[] }>;
  balanceGames?: Array<{ title: string; selectedOption: string }>;
  negativeSelections?: string[];
}

interface BudgetAIHelperBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  category: string;
  categoryName: string;
  priceRangeInfo: PriceRangeInfo[];
  totalProducts: number;
  currentMin: number;
  currentMax: number;
  sliderMin: number;
  sliderMax: number;
  onSelectBudget: (min: number, max: number) => void;
  userSelections?: UserSelections;
  autoSubmitContext?: boolean;
  autoSubmitText?: string;
}

interface AIResponse {
  recommendation: {
    min: number;
    max: number;
    productsInRange: number;
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

export function BudgetAIHelperBottomSheet({
  isOpen,
  onClose,
  category,
  categoryName,
  priceRangeInfo,
  totalProducts,
  currentMin,
  currentMax,
  sliderMin,
  sliderMax,
  onSelectBudget,
  userSelections,
  autoSubmitContext = false,
  autoSubmitText,
}: BudgetAIHelperBottomSheetProps) {
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingExamples, setIsLoadingExamples] = useState(false);
  const [aiResponse, setAiResponse] = useState<AIResponse | null>(null);
  const [examples, setExamples] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [shouldAutoSubmit, setShouldAutoSubmit] = useState(false); // 자동 제출 트리거
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const CONTEXT_SUMMARY_EXAMPLE = '🔮_CONTEXT_SUMMARY'; // 특별한 식별자

  // 바텀시트 열릴 때 예시 쿼리 생성
  useEffect(() => {
    if (isOpen) {
      if (autoSubmitText) {
        console.log('🤖 Auto submit triggered by prop (Text):', autoSubmitText);
        setUserInput(autoSubmitText);
        setAiResponse(null);
        setError(null);
        setShouldAutoSubmit(true);
      } else if (autoSubmitContext) {
        console.log('🤖 Auto submit triggered by prop (Budget/Init)');
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
      console.log('🚀 [BudgetAIHelper] Auto-submitting with userInput:', userInput);
      setShouldAutoSubmit(false); // 트리거 리셋
      handleSubmit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldAutoSubmit, userInput, isLoading]);

  const generateExamples = async () => {
    setIsLoadingExamples(true);
    try {
      const res = await fetch('/api/ai-selection-helper/budget/generate-examples', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
        (userSelections?.balanceGames && userSelections.balanceGames.length > 0) ||
        (userSelections?.negativeSelections && userSelections.negativeSelections.length > 0);

      // 디버깅 로그
      console.log('🔍 [BudgetAIHelper] generateExamples:', {
        hasContext,
        naturalLanguageInputs: userSelections?.naturalLanguageInputs?.length || 0,
        hardFilters: userSelections?.hardFilters?.length || 0,
        balanceGames: userSelections?.balanceGames?.length || 0,
        negativeSelections: userSelections?.negativeSelections?.length || 0,
      });

      const apiExamples = (data.examples || []).slice(0, 3);
      setExamples([CONTEXT_SUMMARY_EXAMPLE, ...apiExamples]);
    } catch {
      // 어떤 선택이나 입력이라도 있는지 확인
      const hasContext =
        (userSelections?.naturalLanguageInputs && userSelections.naturalLanguageInputs.length > 0) ||
        (userSelections?.hardFilters && userSelections.hardFilters.length > 0) ||
        (userSelections?.balanceGames && userSelections.balanceGames.length > 0) ||
        (userSelections?.negativeSelections && userSelections.negativeSelections.length > 0);

      const fallbackExamples = [
        '첫째 아이라 좋은 거 사주고 싶어요',
        '가성비 좋은 제품이면 충분해요',
        '오래 쓸 거라 투자할 생각이에요',
      ];
      setExamples([CONTEXT_SUMMARY_EXAMPLE, ...fallbackExamples]);
    } finally {
      setIsLoadingExamples(false);
    }
  };

  const handleSubmit = async () => {
    if (!userInput.trim() || isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/ai-selection-helper/budget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userContext: userInput.trim(),
          category,
          categoryName,
          priceRangeInfo,
          totalProducts,
          sliderMin,
          sliderMax,
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
    onSelectBudget(aiResponse.recommendation.min, aiResponse.recommendation.max);
    onClose();
  };

  const handleExampleClick = (example: string) => {
    // 특별 예시인 경우 바로 추천받기 실행
    if (example === CONTEXT_SUMMARY_EXAMPLE) {
      console.log('🔍 [BudgetAIHelper] Context summary clicked, triggering auto-submit:', {
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

  const formatPrice = (price: number) => {
    if (price >= 10000) {
      return `${Math.round(price / 10000)}만원`;
    }
    return `${price.toLocaleString()}원`;
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
            style={{ maxWidth: '480px', margin: '0 auto', height: '85vh' }}
          >
            {/* Header */}
            <div className="px-5 py-5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-1.5">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 3L14.5 9L21 11.5L14.5 14L12 20L9.5 14L3 11.5L9.5 9L12 3Z" fill="url(#ai_gradient_sheet_budget)" />
                  <defs>
                    <linearGradient id="ai_gradient_sheet_budget" x1="21" y1="12" x2="3" y2="12" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#77A0FF" />
                      <stop offset="0.7" stopColor="#907FFF" />
                      <stop offset="1" stopColor="#6947FF" />
                    </linearGradient>
                  </defs>
                </svg>
                <h2 className="text-[18px] font-bold text-[#6366F1]">AI 질문하기</h2>
              </div>
              <button
                onClick={onClose}
                className="p-1 rounded-full hover:bg-gray-100 transition-colors"
              >
                <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Scrollable Content */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 pb-10">
              <AnimatePresence mode="wait">
                {!aiResponse ? (
                  /* 입력 영역 */
                  <motion.div
                    key="input-area"
                    initial={{ opacity: 1 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.3 }}
                    className="block"
                  >
                    {/* 질문 표시 */}
                    <h3 className="text-[18px] font-bold text-gray-900 leading-[1.4] mb-6">
                      어떤 상황인지 알려주시면,<br />
                      예산을 추천해드려요
                    </h3>

                    {/* 예시 버튼들 */}
                    <div className="flex flex-wrap gap-2 mb-6">
                      {isLoadingExamples ? (
                        <div className="flex gap-2">
                          {[1, 2, 3].map(i => (
                            <div
                              key={i}
                              className="h-9 w-24 bg-gray-50 rounded-full animate-pulse"
                            />
                          ))}
                        </div>
                      ) : (
                        examples.map((example, idx) => {
                          const isContextSummary = example === CONTEXT_SUMMARY_EXAMPLE || example === "지금까지 입력한 상황에 맞춰 추천해주세요";
                          return (
                            <button
                              key={idx}
                              onClick={() => handleExampleClick(example)}
                              disabled={isLoading || !!aiResponse}
                              className={`px-4 py-2 text-[16px] rounded-full transition-all disabled:cursor-not-allowed ${
                                isContextSummary
                                  ? 'ai-gradient-border text-[#6366F1]'
                                  : 'bg-white text-gray-500 border border-gray-100'
                              }`}
                            >
                              {isContextSummary ? '지금까지 입력한 내 상황에 맞춰 추천해주세요' : example}
                            </button>
                          );
                        })
                      )}
                    </div>

                    {/* 입력 영역 */}
                    <div className="mb-6">
                      <textarea
                        ref={inputRef}
                        value={userInput}
                        onChange={e => setUserInput(e.target.value)}
                        placeholder="위 질문과 관련된 육아 상황을 알려주세요"
                        className="w-full p-4 bg-gray-50 border-none rounded-2xl text-[16px] text-gray-600 leading-relaxed resize-none focus:outline-none focus:ring-0 placeholder:text-gray-400 h-[94px]"
                        disabled={isLoading || !!aiResponse}
                      />
                    </div>
                  </motion.div>
                ) : (
                  /* AI 응답 영역 */
                  <motion.div
                    key="result-area"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.1 }}
                    className="space-y-6"
                  >
                    {/* 결과 헤더 */}
                    <div>
                      <h3 className="text-[20px] font-bold text-gray-900 leading-snug mb-3">
                        추천 예산
                      </h3>
                      <p className="text-[24px] font-bold text-[#0074F3] mb-1">
                        {formatPrice(aiResponse.recommendation.min)}~{formatPrice(aiResponse.recommendation.max)}
                      </p>
                      <p className="text-[14px] text-[#0074F3] font-medium opacity-70">
                        이 범위에 {aiResponse.recommendation.productsInRange}개 상품이 있어요
                      </p>
                    </div>

                    {/* 분석 근거 */}
                    <div className="text-[16px] font-medium text-gray-700 leading-[1.4] space-y-4">
                      {renderWithBold(aiResponse.reasoning)}
                    </div>

                    {/* 구분선 */}
                    <div className="h-[1px] bg-gray-100 w-full" />

                    {/* TIP 섹션 */}
                    {aiResponse.alternatives && (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5 text-[16px] font-bold text-gray-900">
                          <span>💡</span> TIP
                        </div>
                        <p className="text-[16px] font-medium text-gray-600 leading-[1.4]">
                          {aiResponse.alternatives}
                        </p>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* 스켈레톤 로딩 */}
              {isLoading && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-4 mt-4"
                >
                  <div className="p-5 bg-gray-50 rounded-2xl space-y-3">
                    <div className="flex items-center gap-2 mb-2">
                      <svg className="w-4 h-4 animate-spin text-[#6366F1]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <circle cx="12" cy="12" r="10" strokeOpacity="0.2" />
                        <path d="M12 2a10 10 0 0 1 10 10" />
                      </svg>
                      <span className="text-[#6366F1] font-bold text-sm">적절한 예산을 분석하고 있어요</span>
                    </div>
                    <div className="h-4 bg-gray-200 rounded-full w-3/4 animate-pulse" />
                    <div className="h-4 bg-gray-200 rounded-full w-full animate-pulse" />
                  </div>
                </motion.div>
              )}

              {/* 에러 메시지 */}
              {error && (
                <div className="p-4 bg-red-50 rounded-2xl my-4">
                  <p className="text-sm text-red-600 font-medium">{error}</p>
                </div>
              )}
            </div>

            {/* Fixed Bottom Footer */}
            <div className="px-5 py-4 border-t border-gray-100 bg-white shrink-0">
              {aiResponse ? (
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setAiResponse(null);
                      setUserInput('');
                      generateExamples();
                      scrollRef.current?.scrollTo({ top: 0 });
                      setTimeout(() => inputRef.current?.focus(), 100);
                    }}
                    className="flex-1 py-4 rounded-2xl font-bold text-[16px] text-gray-600 bg-gray-50 hover:bg-gray-100 transition-colors"
                  >
                    다시 질문하기
                  </button>
                  <button
                    onClick={handleSelectRecommendation}
                    className="flex-1 py-4 rounded-2xl font-bold text-[16px] text-white bg-[#111827] hover:bg-gray-800 transition-all active:scale-[0.98]"
                  >
                    이대로 선택하기
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={!userInput.trim() || isLoading}
                  className={`w-full py-4 rounded-2xl font-bold text-[17px] transition-all ${
                    !userInput.trim() || isLoading
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : 'bg-[#111827] text-white active:scale-[0.98]'
                  }`}
                >
                  추천받기
                </button>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
