'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type {
  ClarifyingQuestion,
  ClarifyingAnswer,
  CollectedInsight,
  EnrichedContext,
} from '@/types/recommend-v2';

interface ClarifyingQuestionsProps {
  categoryKey: string;
  categoryName: string;
  initialContext: string;
  onComplete: (enrichedContext: EnrichedContext) => void;
  onSkip: () => void;
}

export default function ClarifyingQuestions({
  categoryKey,
  categoryName,
  initialContext,
  onComplete,
  onSkip,
}: ClarifyingQuestionsProps) {
  // 상태 - 한번에 로드된 질문들
  const [questions, setQuestions] = useState<ClarifyingQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<ClarifyingAnswer[]>([]);
  const [collectedInsights, setCollectedInsights] = useState<CollectedInsight[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOtherSelected, setIsOtherSelected] = useState(false);
  const [customText, setCustomText] = useState('');
  const [slideDirection, setSlideDirection] = useState<'left' | 'right'>('left');
  const [isTransitioning, setIsTransitioning] = useState(false); // 선택 후 딜레이용

  // 타이머
  const [loadingTime, setLoadingTime] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const hasLoadedRef = useRef(false); // API 중복 호출 방지

  // 타이머 시작
  useEffect(() => {
    if (isLoading) {
      timerRef.current = setInterval(() => {
        setLoadingTime(prev => prev + 1);
      }, 10);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isLoading]);

  // 질문들 한번에 로드 (첫 렌더링 시 1회만)
  useEffect(() => {
    // 이미 로드했으면 스킵
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;

    const loadQuestions = async () => {
      setIsLoading(true);
      setError(null);
      setLoadingTime(0);

      try {
        const response = await fetch('/api/ai-selection-helper/clarifying-questions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            categoryKey,
            categoryName,
            initialContext,
          }),
        });

        const data = await response.json();

        if (!data.success) {
          throw new Error(data.error || '질문 로드 실패');
        }

        // 인사이트 저장
        if (data.data.collectedInsights) {
          setCollectedInsights(data.data.collectedInsights);
        }

        // 질문이 없으면 바로 완료
        if (!data.data.questions || data.data.questions.length === 0) {
          onComplete({
            initialContext,
            clarifyingAnswers: [],
            collectedInsights: data.data.collectedInsights || [],
            totalTurns: 0,
          });
          return;
        }

        setQuestions(data.data.questions);
      } catch (err) {
        console.error('Failed to load questions:', err);
        setError('질문을 불러오는데 실패했습니다.');
        setTimeout(() => onSkip(), 1500);
      } finally {
        setIsLoading(false);
      }
    };

    loadQuestions();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryKey, categoryName, initialContext]);

  // 현재 질문
  const currentQuestion = questions[currentIndex] || null;
  const totalQuestions = questions.length;

  // 현재 질문에 대한 기존 답변 찾기 (이전으로 돌아갔을 때 선택 상태 복원용)
  const currentAnswer = answers.find(a => a.questionId === currentQuestion?.id);
  const [tempSelectedOption, setTempSelectedOption] = useState<string | null>(null);
  const [tempCustomText, setTempCustomText] = useState<string | null>(null);

  // 질문이 바뀌면 기존 답변으로 상태 복원
  useEffect(() => {
    if (currentQuestion) {
      const existingAnswer = answers.find(a => a.questionId === currentQuestion.id);
      if (existingAnswer) {
        setTempSelectedOption(existingAnswer.selectedOption || null);
        setTempCustomText(existingAnswer.customText || null);
        setIsOtherSelected(!!existingAnswer.customText);
        setCustomText(existingAnswer.customText || '');
      } else {
        setTempSelectedOption(null);
        setTempCustomText(null);
        setIsOtherSelected(false);
        setCustomText('');
      }
    }
  }, [currentQuestion?.id, answers]);

  // 완료 처리
  const handleComplete = useCallback((finalAnswers: ClarifyingAnswer[]) => {
    onComplete({
      initialContext,
      clarifyingAnswers: finalAnswers,
      collectedInsights,
      totalTurns: finalAnswers.length,
    });
  }, [initialContext, collectedInsights, onComplete]);

  // 옵션 선택 시 자동으로 다음 질문으로 (딜레이 적용)
  const handleOptionSelect = (value: string, label: string) => {
    if (!currentQuestion || isTransitioning) return;

    // 선택 상태 즉시 표시
    setTempSelectedOption(value);
    setIsTransitioning(true);

    const answer: ClarifyingAnswer = {
      questionId: currentQuestion.id,
      questionText: currentQuestion.text,
      selectedOption: value,
      selectedLabel: label,
    };

    // 기존 답변 업데이트 또는 추가
    const newAnswers = answers.filter(a => a.questionId !== currentQuestion.id);
    newAnswers.push(answer);

    // 딜레이 후 다음으로 이동
    setTimeout(() => {
      setAnswers(newAnswers);
      setIsOtherSelected(false);
      setCustomText('');
      setIsTransitioning(false);

      // 다음 질문으로 또는 완료
      if (currentIndex + 1 >= totalQuestions) {
        handleComplete(newAnswers);
      } else {
        setSlideDirection('left');
        setCurrentIndex(currentIndex + 1);
      }
    }, 300);
  };

  // 기타 선택 확인 (딜레이 적용)
  const handleOtherConfirm = () => {
    if (!currentQuestion || !customText.trim() || isTransitioning) return;

    // 선택 상태 즉시 표시
    setTempCustomText(customText.trim());
    setIsTransitioning(true);

    const answer: ClarifyingAnswer = {
      questionId: currentQuestion.id,
      questionText: currentQuestion.text,
      selectedOption: null,
      customText: customText.trim(),
    };

    // 기존 답변 업데이트 또는 추가
    const newAnswers = answers.filter(a => a.questionId !== currentQuestion.id);
    newAnswers.push(answer);

    // 딜레이 후 다음으로 이동
    setTimeout(() => {
      setAnswers(newAnswers);
      setIsTransitioning(false);

      if (currentIndex + 1 >= totalQuestions) {
        handleComplete(newAnswers);
      } else {
        setSlideDirection('left');
        setCurrentIndex(currentIndex + 1);
        setIsOtherSelected(false);
        setCustomText('');
      }
    }, 300);
  };

  // 이전 질문으로 (답변은 유지)
  const handlePrevious = () => {
    if (currentIndex <= 0 || isTransitioning) return;

    setSlideDirection('right');
    setCurrentIndex(currentIndex - 1);
  };

  // 바로 분석하기 - 현재까지 답한 것 반영
  const handleSkipWithAnswers = () => {
    if (isTransitioning) return;

    // 현재까지 답한 answers를 그대로 전달
    onComplete({
      initialContext,
      clarifyingAnswers: answers,
      collectedInsights,
      totalTurns: answers.length,
    });
  };

  // 슬라이드 애니메이션 variants
  const slideVariants = {
    enter: (direction: 'left' | 'right') => ({
      x: direction === 'left' ? 50 : -50,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (direction: 'left' | 'right') => ({
      x: direction === 'left' ? -50 : 50,
      opacity: 0,
    }),
  };

  // 로딩 중 (첫 API 호출) - 쉬머링 텍스트
  if (isLoading) {
    return (
      <div className="space-y-4">
        {/* 이전 입력 말풍선 */}
        <div className="flex justify-end">
          <div className="max-w-[85%] px-4 py-3 bg-gray-100 rounded-2xl rounded-tr-md opacity-60">
            <p className="text-[15px] text-gray-800 leading-relaxed whitespace-pre-wrap">
              {initialContext}
            </p>
          </div>
        </div>

        {/* 쉬머링 텍스트 + 타이머 */}
        <div className="flex flex-col gap-1">
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="text-[15px] font-medium leading-relaxed"
            style={{
              background: 'linear-gradient(90deg, #4b5563 0%, #9ca3af 30%, #4b5563 50%, #9ca3af 70%, #4b5563 100%)',
              backgroundSize: '200% 100%',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              animation: 'shimmer-text 1.2s linear infinite',
            }}
          >
            입력 분석 중...
          </motion.p>
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-[11px] font-mono text-gray-400 tabular-nums ml-0.5"
          >
            {(loadingTime / 100).toFixed(2)}초
          </motion.span>
        </div>

        {/* shimmer animation */}
        <style jsx global>{`
          @keyframes shimmer-text {
            0%, 100% { background-position: 200% 0; }
            50% { background-position: 0% 0; }
          }
        `}</style>
      </div>
    );
  }

  // 에러
  if (error) {
    return (
      <div className="space-y-4">
        <div className="flex justify-end">
          <div className="max-w-[85%] px-4 py-3 bg-gray-100 rounded-2xl rounded-tr-md opacity-60">
            <p className="text-[15px] text-gray-800 leading-relaxed whitespace-pre-wrap">
              {initialContext}
            </p>
          </div>
        </div>
        <div className="bg-gray-50 rounded-2xl p-6 text-center">
          <p className="text-gray-600">{error}</p>
          <p className="text-sm text-gray-400 mt-2">바로 분석으로 진행합니다...</p>
        </div>
      </div>
    );
  }

  if (!currentQuestion) return null;

  return (
    <div className="space-y-4">
      {/* 이전 입력 말풍선 (투명도 처리) */}
      <div className="flex justify-end">
        <div className="max-w-[85%] px-4 py-3 bg-gray-100 rounded-2xl rounded-tr-md opacity-60">
          <p className="text-[15px] text-gray-800 leading-relaxed whitespace-pre-wrap">
            {initialContext}
          </p>
        </div>
      </div>

      {/* 질문 카드 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        className="bg-gray-50 rounded-2xl overflow-hidden"
      >
        {/* 헤더: 진행 표시 */}
        <div className="px-5 py-4">
          <span className="px-3 py-1.5 bg-purple-100 text-purple-700 text-xs font-semibold rounded-full">
            추가 질문 {currentIndex + 1}/{totalQuestions}
          </span>
        </div>

        {/* 질문 영역 - 슬라이드 애니메이션 */}
        <div className="px-5 pb-4 overflow-hidden">
          <AnimatePresence mode="wait" custom={slideDirection}>
            <motion.div
              key={currentQuestion.id}
              custom={slideDirection}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="space-y-3"
            >
              {/* 질문 텍스트 */}
              <div className="space-y-0.5">
                <h3 className="text-[15px] font-semibold text-gray-900 leading-snug">
                  {currentQuestion.text}
                </h3>
                {currentQuestion.subtext && (
                  <p className="text-xs text-gray-500">
                    {currentQuestion.subtext}
                  </p>
                )}
              </div>

              {/* 선택지들 */}
              <div className="space-y-2">
                {currentQuestion.options.map((option) => {
                  const isSelected = tempSelectedOption === option.value;
                  return (
                    <button
                      key={option.value}
                      onClick={() => handleOptionSelect(option.value, option.label)}
                      disabled={isTransitioning}
                      className={`w-full px-4 py-3 rounded-xl border-2 text-left transition-all duration-150
                        ${isSelected
                          ? 'border-purple-500 bg-purple-100'
                          : 'bg-white border-gray-200 hover:border-purple-400 hover:bg-purple-50'
                        } active:scale-[0.98] disabled:opacity-70`}
                    >
                      <div className="flex items-start gap-3">
                        {/* 체크박스 원 */}
                        <div className={`shrink-0 w-5 h-5 rounded-full border-2 mt-0.5 flex items-center justify-center transition-all
                          ${isSelected
                            ? 'border-purple-500 bg-purple-500'
                            : 'border-gray-300'
                          }`}
                        >
                          {isSelected && (
                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                        <div className="flex-1">
                          <div className={`font-medium text-sm leading-tight ${isSelected ? 'text-purple-700' : 'text-gray-900'}`}>
                            {option.label}
                          </div>
                          {option.description && (
                            <div className={`text-xs leading-tight mt-0.5 ${isSelected ? 'text-purple-600' : 'text-gray-500'}`}>
                              {option.description}
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}

                {/* 기타 옵션 - 솔리드 라인 */}
                {!isOtherSelected ? (
                  <button
                    onClick={() => {
                      setIsOtherSelected(true);
                      setTempSelectedOption(null);
                    }}
                    disabled={isTransitioning}
                    className={`w-full px-4 py-3 rounded-xl border-2 text-left transition-all duration-150
                      ${tempCustomText
                        ? 'border-purple-500 bg-purple-100'
                        : 'bg-white border-gray-200 hover:border-purple-400 hover:bg-purple-50'
                      } disabled:opacity-70`}
                  >
                    <div className="flex items-start gap-3">
                      {/* 체크박스 원 */}
                      <div className={`shrink-0 w-5 h-5 rounded-full border-2 mt-0.5 flex items-center justify-center transition-all
                        ${tempCustomText
                          ? 'border-purple-500 bg-purple-500'
                          : 'border-gray-300'
                        }`}
                      >
                        {tempCustomText && (
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1">
                        {tempCustomText ? (
                          <>
                            <div className="font-medium text-sm leading-tight text-purple-700">기타</div>
                            <div className="text-xs text-purple-600 leading-tight mt-0.5">{tempCustomText}</div>
                          </>
                        ) : (
                          <>
                            <div className="font-medium text-sm leading-tight text-gray-700">기타</div>
                            <div className="text-xs text-gray-400 leading-tight mt-0.5">직접 입력하기</div>
                          </>
                        )}
                      </div>
                    </div>
                  </button>
                ) : (
                  <div className="bg-white rounded-xl p-3 border-2 border-purple-500">
                    <textarea
                      value={customText}
                      onChange={(e) => setCustomText(e.target.value)}
                      placeholder="자유롭게 입력해주세요..."
                      className="w-full p-2 text-sm placeholder-gray-400 resize-none outline-none"
                      rows={2}
                      autoFocus
                    />
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => {
                          setIsOtherSelected(false);
                          setCustomText(tempCustomText || '');
                        }}
                        className="flex-1 py-2 px-3 rounded-lg border border-gray-200 text-gray-600
                          font-medium text-sm hover:bg-gray-50 transition-colors"
                      >
                        취소
                      </button>
                      <button
                        onClick={handleOtherConfirm}
                        disabled={!customText.trim() || isTransitioning}
                        className={`flex-1 py-2 px-3 rounded-lg font-medium text-sm transition-all ${
                          customText.trim() && !isTransitioning
                            ? 'bg-purple-600 text-white hover:bg-purple-700'
                            : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        }`}
                      >
                        확인
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* 하단 네비게이션 버튼들 */}
        <div className="px-5 py-3 border-t border-gray-200/50">
          <div className="flex items-center justify-between gap-3">
            {/* 이전 버튼 */}
            <button
              onClick={handlePrevious}
              disabled={currentIndex === 0 || isTransitioning}
              className={`flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-lg transition-colors
                ${currentIndex === 0
                  ? 'text-gray-300 cursor-not-allowed'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                } disabled:opacity-50`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              
            </button>

            {/* 바로 분석하기 */}
            <button
              onClick={handleSkipWithAnswers}
              disabled={isTransitioning}
              className="text-sm font-semibold text-gray-400 hover:text-purple-600 transition-colors disabled:opacity-50"
            >
              건너뛰기 (즉시 분석)
            </button>

            {/* 다음 버튼 */}
            <button
              onClick={() => {
                if (currentIndex + 1 < totalQuestions && !isTransitioning) {
                  setSlideDirection('left');
                  setCurrentIndex(currentIndex + 1);
                }
              }}
              disabled={currentIndex + 1 >= totalQuestions || isTransitioning}
              className={`flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-lg transition-colors
                ${currentIndex + 1 >= totalQuestions
                  ? 'text-gray-300 cursor-not-allowed'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                } disabled:opacity-50`}
            >
              
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
