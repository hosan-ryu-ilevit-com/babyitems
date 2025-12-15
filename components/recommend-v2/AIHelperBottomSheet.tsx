'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

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
  questionType: 'hard_filter' | 'balance_game';
  questionId: string;
  questionText: string;
  options: HardFilterOption[] | { A: BalanceGameOption; B: BalanceGameOption };
  category: string;
  categoryName: string;
  tipText?: string;
  onSelectOptions: (selectedOptions: string[]) => void;
}

interface AIResponse {
  recommendation: {
    selectedOptions: string[];
    confidence: 'high' | 'medium' | 'low';
  };
  reasoning: string;
  alternatives?: string | null;
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
}: AIHelperBottomSheetProps) {
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingExamples, setIsLoadingExamples] = useState(false);
  const [aiResponse, setAiResponse] = useState<AIResponse | null>(null);
  const [examples, setExamples] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 바텀시트 열릴 때 예시 쿼리 생성
  useEffect(() => {
    if (isOpen) {
      setUserInput('');
      setAiResponse(null);
      setError(null);
      generateExamples();
    }
  }, [isOpen, questionId]);

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
        }),
      });
      const data = await res.json();
      setExamples(data.examples || []);
    } catch {
      setExamples([
        '쌍둥이라 자주 사용해요',
        '맞벌이라 시간이 부족해요',
        '아이가 예민한 편이에요',
      ]);
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
          questionType,
          questionId,
          questionText,
          options,
          userContext: userInput.trim(),
          category,
          tipText,
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

    // 밸런스게임에서 "both" 선택 시 특별 처리
    if (questionType === 'balance_game') {
      onSelectOptions(aiResponse.recommendation.selectedOptions);
    } else {
      onSelectOptions(aiResponse.recommendation.selectedOptions);
    }
    onClose();
  };

  const handleExampleClick = (example: string) => {
    setUserInput(example);
    inputRef.current?.focus();
  };

  const getRecommendationLabel = () => {
    if (!aiResponse) return '';

    if (questionType === 'balance_game') {
      const selected = aiResponse.recommendation.selectedOptions[0];
      if (selected === 'both') return '둘 다 중요해요';
      if (selected === 'A') {
        return `A: ${(options as { A: BalanceGameOption; B: BalanceGameOption }).A.text}`;
      }
      return `B: ${(options as { A: BalanceGameOption; B: BalanceGameOption }).B.text}`;
    }

    // hard_filter
    const optionList = options as HardFilterOption[];
    return aiResponse.recommendation.selectedOptions
      .map(v => optionList.find(o => o.value === v)?.label || v)
      .join(', ');
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
                <div className="mb-4 p-3 bg-gray-50 rounded-xl">
                  <p className="text-xs text-gray-500 mb-1">현재 질문</p>
                  <p className="text-sm font-medium text-gray-800">{questionText}</p>
                </div>

                {/* 안내 메시지 */}
                <p className="text-sm text-gray-600 mb-4">
                  어떤 상황인지 알려주시면 추천해드릴게요!
                </p>

                {/* 예시 버튼들 */}
                <div className="flex flex-wrap gap-2 mb-4">
                  {isLoadingExamples ? (
                    <div className="flex gap-2">
                      {[1, 2, 3].map(i => (
                        <div
                          key={i}
                          className="h-8 w-24 bg-gray-100 rounded-full animate-pulse"
                        />
                      ))}
                    </div>
                  ) : (
                    examples.map((example, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleExampleClick(example)}
                        disabled={isLoading || !!aiResponse}
                        className="px-3 py-1.5 text-sm bg-gray-100 text-gray-600 rounded-full hover:bg-gray-200 transition-colors disabled:cursor-not-allowed"
                      >
                        {example}
                      </button>
                    ))
                  )}
                </div>

                {/* 입력 영역 */}
                <div className="mb-4">
                  <textarea
                    ref={inputRef}
                    value={userInput}
                    onChange={e => setUserInput(e.target.value)}
                    placeholder="위 질문과 관련된 육아 상황을 알려주세요"
                    className="w-full p-3 border border-gray-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent disabled:bg-gray-50"
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
                    <div className="p-4 bg-blue-50 rounded-xl">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-blue-500 font-bold text-sm">추천</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getConfidenceColor(aiResponse.recommendation.confidence)}`}>
                          {getConfidenceLabel(aiResponse.recommendation.confidence)}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-gray-800 mb-2">
                        {getRecommendationLabel()}
                      </p>
                      <p className="text-sm text-gray-600 leading-relaxed">
                        {aiResponse.reasoning}
                      </p>
                      {aiResponse.alternatives && (
                        <p className="text-xs text-gray-500 mt-2 pt-2 border-t border-blue-100">
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
                        className="flex-1 py-3 rounded-xl font-medium text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
                      >
                        다시 물어볼래요
                      </button>
                      <button
                        onClick={handleSelectRecommendation}
                        className="flex-1 py-3 rounded-xl font-semibold text-sm text-white bg-blue-500 hover:bg-blue-600 active:scale-[0.98] transition-all"
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
