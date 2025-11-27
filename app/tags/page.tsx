'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { CaretLeft } from '@phosphor-icons/react/dist/ssr';
import { Category, CATEGORY_NAMES } from '@/lib/data';

interface Tag {
  id: string;
  text: string;
}

type Step = 'loading' | 'pros' | 'cons' | 'budget' | 'done';

const BUDGET_OPTIONS = [
  { label: '5만원 이하', value: '0-50000', desc: '기본 기능' },
  { label: '5~10만원', value: '50000-100000', desc: '더 좋은 소재+편의 기능', popular: true },
  { label: '10~15만원', value: '100000-150000', desc: '프리미엄 기능' },
  { label: '15만원 이상', value: '150000+', desc: '최고급' },
];

// 타이핑 애니메이션 컴포넌트
function TypingText({ text, onComplete }: { text: string; onComplete?: () => void }) {
  const [displayedText, setDisplayedText] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (currentIndex < text.length) {
      const timeout = setTimeout(() => {
        setDisplayedText(text.slice(0, currentIndex + 1));
        setCurrentIndex(currentIndex + 1);
      }, 15);
      return () => clearTimeout(timeout);
    } else if (onComplete) {
      onComplete();
    }
  }, [currentIndex, text, onComplete]);

  return <span>{displayedText}</span>;
}

function TagsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const category = searchParams.get('category') as Category;
  const anchorId = searchParams.get('anchorId');

  const [step, setStep] = useState<Step>('loading');
  const [prosTags, setProsTags] = useState<Tag[]>([]);
  const [consTags, setConsTags] = useState<Tag[]>([]);
  const [selectedPros, setSelectedPros] = useState<string[]>([]);
  const [selectedCons, setSelectedCons] = useState<string[]>([]);
  const [budget, setBudget] = useState<string>('');
  const [productTitle, setProductTitle] = useState('');
  const [error, setError] = useState('');
  const [showTyping, setShowTyping] = useState(false);

  useEffect(() => {
    if (!category || !anchorId) {
      router.push('/categories');
      return;
    }

    generateTags();
  }, [category, anchorId]);

  const generateTags = async () => {
    try {
      setStep('loading');
      setError('');

      const response = await fetch('/api/generate-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, productId: anchorId, productTitle: '' }),
      });

      const data = await response.json();

      if (data.success) {
        setProsTags(data.pros);
        setConsTags(data.cons);
        setProductTitle(data.productTitle || '선택한 제품');
        setStep('pros');
        // 타이핑 애니메이션 시작
        setTimeout(() => setShowTyping(true), 300);
      } else {
        setError(data.error || '태그 생성 실패');
      }
    } catch (err) {
      setError('태그 생성 중 오류가 발생했습니다');
      console.error(err);
    }
  };

  const toggleProsTag = (tagId: string) => {
    if (selectedPros.includes(tagId)) {
      setSelectedPros(selectedPros.filter((id) => id !== tagId));
    } else if (selectedPros.length < 4) {
      setSelectedPros([...selectedPros, tagId]);
    }
  };

  const toggleConsTag = (tagId: string) => {
    if (selectedCons.includes(tagId)) {
      setSelectedCons(selectedCons.filter((id) => id !== tagId));
    } else if (selectedCons.length < 3) {
      setSelectedCons([...selectedCons, tagId]);
    }
  };

  const handleProsNext = () => {
    if (selectedPros.length === 0) {
      alert('최소 1개의 장점을 선택해주세요');
      return;
    }
    setStep('cons');
  };

  const handleConsNext = () => {
    setStep('budget');
  };

  const handleSkipCons = () => {
    setSelectedCons([]);
    setStep('budget');
  };

  const handleStepBack = () => {
    if (step === 'cons') {
      setStep('pros');
    } else if (step === 'budget') {
      setStep('cons');
    }
  };

  const handleBudgetSelect = (value: string) => {
    setBudget(value);
  };

  const handleConfirm = () => {
    if (!budget) {
      alert('예산을 선택해주세요');
      return;
    }

    // Store selections in sessionStorage
    sessionStorage.setItem(
      'tag_selections',
      JSON.stringify({
        category,
        anchorId,
        selectedPros,
        selectedCons,
        budget,
        productTitle,
      })
    );

    router.push(`/result?category=${category}&anchorId=${anchorId}`);
  };

  if (!category || !anchorId) {
    return null;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100">
      <div className="relative w-full max-w-[480px] min-h-screen overflow-hidden bg-white shadow-lg flex flex-col">
        {/* Header - Fixed */}
        <header className="sticky top-0 bg-white border-b border-gray-200 z-50">
          <div className="px-5 py-3">
            <div className="flex items-center justify-between mb-2">
              <button
                onClick={() => router.push('/')}
                className="text-gray-600 hover:text-gray-900 transition-colors"
              >
                <CaretLeft size={24} weight="bold" />
              </button>
              <div className="absolute left-1/2 -translate-x-1/2">
                <h1 className="text-lg font-bold text-gray-900">
                  {CATEGORY_NAMES[category]} 추천
                </h1>
              </div>
              <div className="w-6" /> {/* Spacer for alignment */}
            </div>
            {productTitle && (
              <p className="text-xs text-gray-500 text-center">{productTitle}</p>
            )}
          </div>
          {/* Progress Bar */}
          <div className="w-full h-1 bg-gray-200">
            <motion.div
              className="h-full bg-[#0084FE]"
              initial={{ width: '0%' }}
              animate={{
                width:
                  step === 'loading'
                    ? '0%'
                    : step === 'pros'
                    ? '33%'
                    : step === 'cons'
                    ? '66%'
                    : '100%',
              }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </header>

        {/* Main Content - Scrollable */}
        <main className="flex-1 px-4 py-6 overflow-y-auto">

        {/* Loading State */}
        {step === 'loading' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-12"
          >
            <div className="inline-block animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mb-4"></div>
            <p className="text-lg text-gray-700 mb-2">리뷰를 분석하고 있습니다...</p>
            <p className="text-sm text-gray-500">
              수백 개의 리뷰에서 핵심 특징을 추출하는 중입니다
            </p>
          </motion.div>
        )}

        {/* Error State */}
        {error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6"
          >
            <p className="text-red-800 text-sm">{error}</p>
            <button
              onClick={generateTags}
              className="mt-2 text-sm text-red-600 underline"
            >
              다시 시도
            </button>
          </motion.div>
        )}

        {/* Step 1: Pros Selection */}
        <AnimatePresence mode="wait">
          {step === 'pros' && (
            <motion.div
              key="pros"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="pb-20"
            >
              {/* Step Tag */}
              <div className="inline-block px-2.5 py-1 bg-gray-100 text-[#0084FE] rounded-lg text-xs font-bold mb-3">
                1/3
              </div>

              {/* Title with Typing Effect */}
              <h2 className="text-lg font-bold text-gray-900 mb-2">
                {showTyping ? (
                  <TypingText
                    text="가장 마음에 드는 장점을 선택하세요"
                    onComplete={() => {}}
                  />
                ) : (
                  "가장 마음에 드는 장점을 선택하세요"
                )}
              </h2>
              <p className="text-sm text-gray-600 mb-6">
                최대 4개 선택 가능 • 선택한 순서대로 우선순위가 적용됩니다
              </p>

              <div className="space-y-3 mb-6">
                {prosTags.map((tag, index) => {
                  const isSelected = selectedPros.includes(tag.id);
                  const selectedIndex = selectedPros.indexOf(tag.id);

                  return (
                    <motion.button
                      key={tag.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      onClick={() => toggleProsTag(tag.id)}
                      className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
                        isSelected
                          ? 'border-emerald-300 bg-emerald-100'
                          : 'border-transparent bg-gray-100 hover:bg-gray-200'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold shrink-0 ${
                            isSelected
                              ? 'border-emerald-500 bg-emerald-500 text-white'
                              : 'border-gray-300 text-gray-400'
                          }`}
                        >
                          {isSelected ? selectedIndex + 1 : ''}
                        </div>
                        <span className={`text-sm leading-snug font-medium ${
                          isSelected ? 'text-emerald-700' : 'text-gray-400'
                        }`}>{tag.text}</span>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* Step 2: Cons Selection */}
          {step === 'cons' && (
            <motion.div
              key="cons"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="pb-20"
            >
              {/* Step Tag */}
              <div className="inline-block px-2.5 py-1 bg-gray-100 text-[#0084FE] rounded-lg text-xs font-bold mb-3">
                2/3
              </div>

              <h2 className="text-lg font-bold text-gray-900 mb-2">
                꼭 개선되어야 하는 점이 있나요?
              </h2>
              <p className="text-sm text-gray-600 mb-6">
                최대 3개 선택 가능 • 선택하지 않아도 됩니다
              </p>

              <div className="space-y-3 mb-4">
                {consTags.map((tag, index) => {
                  const isSelected = selectedCons.includes(tag.id);
                  const selectedIndex = selectedCons.indexOf(tag.id);

                  return (
                    <motion.button
                      key={tag.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      onClick={() => toggleConsTag(tag.id)}
                      className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
                        isSelected
                          ? 'border-rose-300 bg-rose-100'
                          : 'border-transparent bg-gray-100 hover:bg-gray-200'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold shrink-0 ${
                            isSelected
                              ? 'border-rose-500 bg-rose-500 text-white'
                              : 'border-gray-300 text-gray-400'
                          }`}
                        >
                          {isSelected ? selectedIndex + 1 : ''}
                        </div>
                        <span className={`text-sm leading-snug font-medium ${
                          isSelected ? 'text-rose-700' : 'text-gray-400'
                        }`}>{tag.text}</span>
                      </div>
                    </motion.button>
                  );
                })}
              </div>

              {/* 넘어가기 버튼 */}
              <div className="text-center mb-6">
                <button
                  onClick={handleSkipCons}
                  className="text-gray-500 text-m font-semibold hover:text-gray-700 transition-colors py-2"
                >
                  넘어가기
                                  </button>
              </div>
            </motion.div>
          )}

          {/* Step 3: Budget Selection */}
          {step === 'budget' && (
            <motion.div
              key="budget"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="pb-20"
            >
              {/* Step Tag */}
              <div className="inline-block px-2.5 py-1 bg-gray-100 text-[#0084FE] rounded-lg text-xs font-bold mb-3">
                3/3
              </div>

              <h2 className="text-lg font-bold text-gray-900 mb-2">예산을 선택하세요</h2>
              <p className="text-sm text-gray-600 mb-6">예산 범위 내에서 최적의 제품을 찾아드립니다</p>

              <div className="grid grid-cols-2 gap-3 mb-6">
                {BUDGET_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => handleBudgetSelect(option.value)}
                    className={`p-4 rounded-xl text-left transition-all border-2 ${
                      budget === option.value
                        ? 'bg-blue-50 border-blue-300'
                        : 'bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-1">
                      <span className={`font-semibold text-sm ${budget === option.value ? 'text-[#0084FE]' : 'text-gray-900'}`}>
                        {option.label}
                      </span>
                      {option.popular && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md font-bold bg-teal-50 text-teal-600">
                          인기
                        </span>
                      )}
                    </div>
                    <div className={`text-xs ${budget === option.value ? 'text-blue-600' : 'text-gray-500'}`}>
                      {option.desc}
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        </main>

        {/* Bottom Floating Buttons */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-4 z-40" style={{ maxWidth: '480px', margin: '0 auto' }}>
          {/* Step 1: Pros */}
          {step === 'pros' && (
            <motion.button
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              whileHover={selectedPros.length > 0 ? { scale: 1.02 } : {}}
              whileTap={selectedPros.length > 0 ? { scale: 0.98 } : {}}
              onClick={handleProsNext}
              disabled={selectedPros.length === 0}
              className={`w-full h-14 rounded-2xl font-semibold text-base transition-all ${
                selectedPros.length > 0
                  ? 'bg-[#0084FE] text-white hover:opacity-90'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              다음 ({selectedPros.length}/4 선택)
            </motion.button>
          )}

          {/* Step 2: Cons - with 이전 button */}
          {step === 'cons' && (
            <div className="flex gap-3">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleStepBack}
                className="w-[30%] h-14 bg-gray-200 text-gray-700 rounded-2xl font-semibold hover:bg-gray-300 transition-all"
              >
                이전
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleConsNext}
                className="flex-1 h-14 bg-[#0084FE] text-white rounded-2xl font-semibold hover:opacity-90 transition-all"
              >
                다음 ({selectedCons.length}/3)
              </motion.button>
            </div>
          )}

          {/* Step 3: Budget - with 이전 button */}
          {step === 'budget' && (
            <div className="flex gap-3">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleStepBack}
                className="w-[30%] h-14 bg-gray-200 text-gray-700 rounded-2xl font-semibold hover:bg-gray-300 transition-all"
              >
                이전
              </motion.button>
              <motion.button
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                whileHover={budget ? { scale: 1.02 } : {}}
                whileTap={budget ? { scale: 0.98 } : {}}
                onClick={handleConfirm}
                disabled={!budget}
                className={`flex-1 h-14 rounded-2xl font-semibold text-base transition-all flex items-center justify-center gap-2 ${
                  budget
                    ? 'bg-[#0084FE] text-white hover:opacity-90'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                <span>맞춤 추천 받기</span>
                
              </motion.button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function TagsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gray-100">
          <div className="relative w-full max-w-[480px] min-h-screen bg-white shadow-lg flex items-center justify-center">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-[#0084FE] mb-4"></div>
              <p className="text-gray-600">로딩 중...</p>
            </div>
          </div>
        </div>
      }
    >
      <TagsPageContent />
    </Suspense>
  );
}
