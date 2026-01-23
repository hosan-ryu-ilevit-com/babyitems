'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  logExampleQuestionClicked,
  logExampleQuestionApplied,
  logNaturalLanguageInput,
  logKnowledgeAgentAIHelperAction,
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
  questionType: 'hard_filter' | 'balance_game' | 'category_selection' | 'negative';
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
  categoryIcons?: Record<string, string>; // 카테고리 선택용 아이콘
  isBaby?: boolean; // 아기용품/가전제품 분기 처리
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
  categoryIcons,
  isBaby = true,
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
          isBaby,
        }),
      });
      const data = await res.json();

      // 어떤 선택이나 입력이라도 있는지 확인 (연령대 컨텍스트 포함)
      const hasContext =
        (userSelections?.naturalLanguageInputs && userSelections.naturalLanguageInputs.length > 0) ||
        (userSelections?.hardFilters && userSelections.hardFilters.length > 0) ||
        (userSelections?.balanceGames && userSelections.balanceGames.length > 0) ||
        !!userSelections?.ageContext;

      // 디버깅 로그
      console.log('🔍 [AIHelperBottomSheet] generateExamples:', {
        hasContext,
        naturalLanguageInputs: userSelections?.naturalLanguageInputs?.length || 0,
        hardFilters: userSelections?.hardFilters?.length || 0,
        balanceGames: userSelections?.balanceGames?.length || 0,
        ageContext: !!userSelections?.ageContext,
      });

      // 카테고리 선택: 고정 1개 + API 2개 = 총 3개
      if (questionType === 'category_selection') {
        const apiExamples = (data.examples || []).slice(0, 2);
        const baseExamples = [FIXED_FIRST_EXAMPLE, ...apiExamples];
        // 컨텍스트가 있으면 맨 앞에 특별 예시 추가
        setExamples(hasContext ? [CONTEXT_SUMMARY_EXAMPLE, ...baseExamples] : baseExamples);
      } else {
        // 다른 타입: API에서 3개 가져오기 (고정 예시 제거)
        const apiExamples = (data.examples || []).slice(0, 3);
        setExamples(apiExamples);
      }
    } catch {
      // 어떤 선택이나 입력이라도 있는지 확인 (연령대 컨텍스트 포함)
      const hasContext =
        (userSelections?.naturalLanguageInputs && userSelections.naturalLanguageInputs.length > 0) ||
        (userSelections?.hardFilters && userSelections.hardFilters.length > 0) ||
        (userSelections?.balanceGames && userSelections.balanceGames.length > 0) ||
        !!userSelections?.ageContext;

      if (questionType === 'category_selection') {
        const baseExamples = category === 'baby'
          ? [
              FIXED_FIRST_EXAMPLE,
              '첫째 출산 준비 중이에요',
              '맞벌이라 시간이 부족해요',
            ]
          : [
              FIXED_FIRST_EXAMPLE,
              '자취 시작해서 필요해요',
              '기존 제품이 너무 오래됐어요',
            ];
        setExamples(hasContext ? [CONTEXT_SUMMARY_EXAMPLE, ...baseExamples] : baseExamples);
      } else {
        const fallbackExamples = [
          '자주 사용할 것 같아요',
          '맞벌이라 시간이 부족해요',
          '공간이 좁은 편이에요',
        ];
        setExamples(fallbackExamples);
      }
    } finally {
      setIsLoadingExamples(false);
    }
  };

  // 이전 isOpen 상태 추적 (무한 루프 방지)
  const prevIsOpenRef = useRef(false);

  // 바텀시트 열릴 때 예시 쿼리 생성 (isOpen이 false→true로 변경될 때만)
  useEffect(() => {
    const wasOpen = prevIsOpenRef.current;
    prevIsOpenRef.current = isOpen;

    // isOpen이 false→true로 변경될 때만 실행
    if (isOpen && !wasOpen) {
      console.log('🔍 [AIHelperBottomSheet] Sheet opened - userSelections:', userSelections);
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
  }, [isOpen, userSelections, autoSubmitText, autoSubmitContext]);

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

    // 상세 로깅 추가
    logKnowledgeAgentAIHelperAction(
      category,
      categoryName,
      questionId,
      questionText,
      'direct_input',
      userInput.trim()
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

    // 상세 로깅 추가
    logKnowledgeAgentAIHelperAction(
      category,
      categoryName,
      questionId,
      questionText,
      'example_applied',
      userInput
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

    // 상세 로깅 추가
    logKnowledgeAgentAIHelperAction(
      category,
      categoryName,
      questionId,
      questionText,
      'example_clicked',
      example
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
            className="fixed inset-0 bg-black/60 z-[120]"
          />

          {/* Bottom Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl z-[121] flex flex-col overflow-hidden"
            style={{ maxWidth: '480px', margin: '0 auto', height: '85vh' }}
          >
            {/* Header */}
            <div className="px-5 py-5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-1.5">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 3L14.5 9L21 11.5L14.5 14L12 20L9.5 14L3 11.5L9.5 9L12 3Z" fill="url(#ai_gradient_sheet_main)" />
                  <defs>
                    <linearGradient id="ai_gradient_sheet_main" x1="21" y1="12" x2="3" y2="12" gradientUnits="userSpaceOnUse">
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
                      {questionType === 'category_selection' ? (
                        <>
                          어떤 상황인지 알려주시면,<br />
                          구매해야 할 {isBaby ? '아기용품' : '가전제품'}을 추천해드려요
                        </>
                      ) : (
                        <>
                          어떤 상황인지 알려주시면,<br />
                          구매조건을 추천해드려요
                        </>
                      )}
                    </h3>

                    {/* 예시 버튼들 */}
                    <div className="flex flex-wrap gap-2 mb-6 min-h-9">
                      <AnimatePresence mode="wait">
                        {isLoadingExamples ? (
                          <motion.div
                            key="skeleton"
                            initial={false}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            className="flex gap-2"
                          >
                            {[1, 2, 3].map(i => (
                              <div
                                key={i}
                                className="h-9 w-24 bg-gray-50 rounded-full animate-pulse"
                              />
                            ))}
                          </motion.div>
                        ) : (
                          <motion.div
                            key="buttons"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.2 }}
                            className="flex flex-wrap gap-2"
                          >
                            {examples.map((example, idx) => {
                              const isContextSummary = example === CONTEXT_SUMMARY_EXAMPLE || example === "지금까지 입력한 상황에 맞춰 추천해주세요";
                              return (
                                <button
                                  key={idx}
                                  onClick={() => handleExampleClick(example, idx)}
                                  disabled={isLoading || !!aiResponse}
                                  className={`px-4 py-2 text-[16px] rounded-full transition-all disabled:cursor-not-allowed ${
                                    isContextSummary
                                      ? 'ai-gradient-border text-[#6366F1] font-medium'
                                      : 'bg-white text-gray-500 border border-gray-100'
                                  }`}
                                >
                                  {isContextSummary ? '지금까지 입력한 내 상황에 맞춰 추천해주세요' : example}
                                </button>
                              );
                            })}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* 입력 영역 */}
                    <div className="mb-6">
                      <textarea
                        ref={inputRef}
                        value={userInput}
                        onChange={e => setUserInput(e.target.value)}
                        placeholder={questionType === 'category_selection' ? "고객님의 상황을 알려주세요" : "질문과 관련된 상황을 알려주세요"}
                        className="w-full p-4 bg-gray-50 border border-gray-100 focus:border-gray-500 rounded-2xl text-[16px] text-gray-600 leading-relaxed resize-none focus:outline-none focus:ring-0 placeholder:text-gray-400 h-[94px] transition-colors"
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
                      {questionType === 'negative' 
                        ? '피해야 할 단점 추천' 
                        : questionType === 'category_selection'
                          ? '추천 구매 카테고리'
                          : '추천 구매조건'}
                    </h3>

                    {/* 추천 결과 아이템 */}
                    <div className="space-y-2">
                      {questionType === 'category_selection' && categoryIcons ? (
                        // 카테고리 선택: 썸네일 카드
                        getRecommendationLabels().map((label, idx) => {
                          const iconUrl = categoryIcons[label];
                          return (
                            <motion.div
                              key={idx}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: idx * 0.1 }}
                              className="flex items-center gap-4 p-4 rounded-2xl bg-blue-50 border-2 border-blue-200"
                            >
                              <div className="w-16 h-16 rounded-xl bg-white border border-blue-100 flex items-center justify-center overflow-hidden shrink-0">
                                {iconUrl ? (
                                  <img 
                                    src={encodeURI(iconUrl)} 
                                    alt={label} 
                                    className="w-12 h-12 object-contain"
                                  />
                                ) : (
                                  <span className="text-2xl">📦</span>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-[18px] font-bold text-blue-700">{label}</p>
                                <p className="text-[13px] text-blue-500 font-medium mt-0.5">AI 추천 카테고리</p>
                              </div>
                            </motion.div>
                          );
                        })
                      ) : (
                        // 기존: 텍스트 카드
                        getRecommendationLabels().map((label, idx) => (
                          <motion.div
                            key={idx}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.1 }}
                            className={`p-4 rounded-2xl font-medium text-[16px] text-left break-keep border ${
                              questionType === 'negative'
                                ? 'bg-rose-50 border-rose-100 text-rose-600'
                                : 'bg-blue-50 border-blue-100 text-blue-600'
                            }`}
                          >
                            {label}
                          </motion.div>
                        ))
                      )}
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
