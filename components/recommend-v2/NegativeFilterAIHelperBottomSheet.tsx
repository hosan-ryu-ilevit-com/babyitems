'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { logKnowledgeAgentAIHelperAction } from '@/lib/logging/clientLogger';

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
  autoSubmitText?: string;
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
  autoSubmitText,
}: NegativeFilterAIHelperBottomSheetProps) {
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
        console.log('🤖 Auto submit triggered by prop (Negative/Init)');
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
          questionText: '피할 단점이 있나요?',
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

      // API에서 3개 가져오기 (고정 예시 제거)
      const apiExamples = (data.examples || []).slice(0, 3);
      setExamples(apiExamples);
    } catch {
      // 어떤 선택이나 입력이라도 있는지 확인
      const hasContext =
        (userSelections?.naturalLanguageInputs && userSelections.naturalLanguageInputs.length > 0) ||
        (userSelections?.hardFilters && userSelections.hardFilters.length > 0) ||
        (userSelections?.balanceGames && userSelections.balanceGames.length > 0);

      // Fallback: 사용자 상황 기반 예시
      const fallbackExamples = [
        '가성비를 중요하게 생각해요',
        '직장 생활하느라 시간이 부족해요',
        '공간이 좁아서 걱정이에요',
      ];
      setExamples(fallbackExamples);
    } finally {
      setIsLoadingExamples(false);
    }
  };

  const handleSubmit = async () => {
    if (!userInput.trim() || isLoading) return;

    setIsLoading(true);
    setError(null);

    // 상세 로깅 추가
    logKnowledgeAgentAIHelperAction(
      category,
      categoryName,
      'negative_filter',
      '피할 단점이 있나요?',
      'direct_input',
      userInput.trim()
    );

    try {
      const res = await fetch('/api/ai-selection-helper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionType: 'negative_filter',
          questionId: 'negative_filter',
          questionText: '피할 단점이 있나요?',
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

    // 상세 로깅 추가
    logKnowledgeAgentAIHelperAction(
      category,
      categoryName,
      'negative_filter',
      '피할 단점이 있나요?',
      'example_applied',
      userInput
    );

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

      // 상세 로깅 추가
      logKnowledgeAgentAIHelperAction(
        category,
        categoryName,
        'negative_filter',
        '피할 단점이 있나요?',
        'example_clicked',
        "지금까지 입력한 상황에 맞춰 추천해주세요"
      );

      // 자동 제출 트리거 설정 (useEffect가 감지하여 실행)
      setShouldAutoSubmit(true);
      return;
    }

    // 상세 로깅 추가
    logKnowledgeAgentAIHelperAction(
      category,
      categoryName,
      'negative_filter',
      '피할 단점이 있나요?',
      'example_clicked',
      example
    );

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
            className="fixed inset-0 bg-black/60 z-[60]"
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
                  <path d="M12 3L14.5 9L21 11.5L14.5 14L12 20L9.5 14L3 11.5L9.5 9L12 3Z" fill="url(#ai_gradient_sheet)" />
                  <defs>
                    <linearGradient id="ai_gradient_sheet" x1="21" y1="12" x2="3" y2="12" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#77A0FF" />
                      <stop offset="0.7" stopColor="#907FFF" />
                      <stop offset="1" stopColor="#6947FF" />
                    </linearGradient>
                  </defs>
                </svg>
                <h2 className="text-[18px] font-bold text-[#6366F1]">AI 도움받기</h2>
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
                  /* 입력 영역 - 결과가 없을 때만 표시 */
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
                      피하는 것이 좋은 옵션을 추천해드려요
                    </h3>

                    {/* 예시 버튼들 */}
                    <div className="flex flex-wrap gap-2 mb-6">
                      {isLoadingExamples ? (
                        <>
                          {[1, 2, 3].map(i => (
                            <div
                              key={i}
                              className="h-9 rounded-full bg-gray-100 animate-pulse"
                              style={{ width: `${80 + i * 20}px` }}
                            />
                          ))}
                        </>
                      ) : (
                        examples.map((example, idx) => {
                          const isContextSummary = example === CONTEXT_SUMMARY_EXAMPLE || example === "지금까지 입력한 상황에 맞춰 추천해주세요";
                          return (
                            <motion.button
                              key={idx}
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.3, delay: idx * 0.05 }}
                              onClick={() => handleExampleClick(example)}
                              disabled={isLoading || !!aiResponse}
                              className={`px-4 py-2 text-[16px] rounded-full transition-all disabled:cursor-not-allowed ${
                                isContextSummary
                                  ? 'ai-gradient-border text-[#6366F1]'
                                  : 'bg-white text-gray-500 border border-gray-100'
                              }`}
                            >
                              {isContextSummary ? '지금까지 입력한 내 상황에 맞춰 추천해주세요' : example}
                            </motion.button>
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
                        placeholder="질문과 관련된 상황을 알려주세요"
                        className="w-full p-4 bg-gray-50 border-none rounded-2xl text-[16px] text-gray-600 leading-relaxed resize-none focus:outline-none focus:ring-0 placeholder:text-gray-400 h-[94px]"
                        disabled={isQuickMode || isLoading || !!aiResponse}
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
                    <h3 className="text-[20px] font-bold text-gray-900 leading-snug">
                      피해야 할 단점 추천
                    </h3>

                    {/* 추천 결과 아이템 */}
                    <div className="space-y-2">
                      {getRecommendationLabels().map((label, idx) => (
                        <motion.div
                          key={idx}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.1 }}
                          className="p-4 rounded-2xl bg-rose-50 border border-rose-100 text-rose-600 font-medium text-[16px] text-left break-keep"
                        >
                          {label}
                        </motion.div>
                      ))}
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

              {/* 스켈레톤 로딩 - AnimatePresence 외부에 두어 입력창과 동시에 보일 수 있게 함 */}
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
                      <span className="text-[#6366F1] font-bold text-sm">분석 중...</span>
                    </div>
                    <div className="h-4 bg-gray-200 rounded-full w-3/4 animate-pulse" />
                    <div className="h-4 bg-gray-200 rounded-full w-full animate-pulse" />
                    <div className="h-4 bg-gray-200 rounded-full w-5/6 animate-pulse" />
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
                      setIsQuickMode(false);
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



