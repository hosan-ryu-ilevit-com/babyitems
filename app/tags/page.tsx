'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Category, CATEGORY_NAMES, CATEGORY_BUDGET_OPTIONS, BudgetOption } from '@/lib/data';

interface Tag {
  id: string;
  text: string;
  mentionCount?: number;
}

type Step = 'loading' | 'pros' | 'cons' | 'budget' | 'done';

function TagsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const category = searchParams.get('category') as Category;
  const anchorId = searchParams.get('anchorId');
  const productTitleFromUrl = searchParams.get('productTitle') || '';

  const [step, setStep] = useState<Step>('loading');
  const [prosTags, setProsTags] = useState<Tag[]>([]);
  const [consTags, setConsTags] = useState<Tag[]>([]);
  const [selectedPros, setSelectedPros] = useState<string[]>([]);
  const [selectedCons, setSelectedCons] = useState<string[]>([]);
  const [budget, setBudget] = useState<string>('');
  const [customBudget, setCustomBudget] = useState<string>('');
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [isParsingBudget, setIsParsingBudget] = useState(false);
  const [parsedBudgetDisplay, setParsedBudgetDisplay] = useState<string>('');
  const [productTitle, setProductTitle] = useState(productTitleFromUrl);
  const [error, setError] = useState('');
  const [showBackConfirmModal, setShowBackConfirmModal] = useState(false);

  // 중복 실행 방지를 위한 ref
  const hasGeneratedRef = useRef(false);

  // 카테고리별 예산 옵션
  const budgetOptions: BudgetOption[] = category ? CATEGORY_BUDGET_OPTIONS[category] : [];

  const generateTags = async () => {
    try {
      setStep('loading');
      setError('');

      const response = await fetch('/api/generate-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, productId: anchorId, productTitle: productTitleFromUrl }),
      });

      const data = await response.json();

      if (data.success) {
        // Sort by mentionCount (descending)
        const sortedPros = [...data.pros].sort((a, b) => (b.mentionCount || 0) - (a.mentionCount || 0));
        const sortedCons = [...data.cons].sort((a, b) => (b.mentionCount || 0) - (a.mentionCount || 0));

        setProsTags(sortedPros);
        setConsTags(sortedCons);
        // API에서 받은 productTitle이 있으면 사용, 없으면 URL에서 가져온 값 유지
        if (data.productTitle && data.productTitle !== productTitleFromUrl) {
          setProductTitle(data.productTitle);
        }
        setStep('pros');
      } else {
        setError(data.error || '태그 생성 실패');
      }
    } catch (err) {
      setError('태그 생성 중 오류가 발생했습니다');
      console.error(err);
    }
  };

  useEffect(() => {
    if (!category || !anchorId) {
      router.push('/categories');
      return;
    }

    // 이미 태그를 생성했으면 스킵
    if (hasGeneratedRef.current) {
      return;
    }

    hasGeneratedRef.current = true;
    generateTags();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, anchorId]);

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
    setIsCustomMode(false);
    setCustomBudget('');
  };

  const handleCustomModeToggle = () => {
    setIsCustomMode(true);
    setBudget('');
    setParsedBudgetDisplay('');
  };

  const handleCustomBudgetChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setCustomBudget(value);
    // 입력이 변경되면 이전 파싱 결과 초기화
    setParsedBudgetDisplay('');
    setBudget('');
  };

  const handleParseBudget = async () => {
    if (!customBudget.trim()) {
      alert('예산을 입력해주세요');
      return;
    }

    setIsParsingBudget(true);
    try {
      const response = await fetch('/api/parse-budget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: customBudget }),
      });

      const data = await response.json();

      if (data.success && data.budgetRange) {
        setBudget(data.budgetRange);
        // 파싱된 범위를 사용자 친화적으로 표시
        const displayText = formatBudgetRangeForDisplay(data.budgetRange);
        setParsedBudgetDisplay(displayText);
      } else {
        alert(data.error || '예산 파싱에 실패했습니다');
      }
    } catch (err) {
      console.error('Budget parsing error:', err);
      alert('예산 파싱 중 오류가 발생했습니다');
    } finally {
      setIsParsingBudget(false);
    }
  };

  // 예산 범위를 사용자 친화적으로 표시
  const formatBudgetRangeForDisplay = (range: string): string => {
    if (range.endsWith('+')) {
      const min = parseInt(range.replace('+', ''));
      return `${(min / 10000).toFixed(0)}만원 이상`;
    }
    const [min, max] = range.split('-').map(v => parseInt(v));
    if (min === 0) {
      return `${(max / 10000).toFixed(0)}만원 이하`;
    }
    if (Math.abs(max - min) <= min * 0.2) {
      // 범위가 좁으면 "약 N만원"으로 표시
      return `약 ${((min + max) / 2 / 10000).toFixed(0)}만원`;
    }
    return `${(min / 10000).toFixed(0)}~${(max / 10000).toFixed(0)}만원`;
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

  const handleBackClick = () => {
    setShowBackConfirmModal(true);
  };

  const handleConfirmBack = () => {
    setShowBackConfirmModal(false);
    router.push('/');
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
                onClick={handleBackClick}
                className="text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors"
              >
                홈으로
              </button>
              <div className="absolute left-1/2 -translate-x-1/2">
                <h1 className="text-lg font-bold text-gray-900">
                  {CATEGORY_NAMES[category]} 추천
                </h1>
              </div>
              <div className="w-12" /> {/* Spacer for alignment */}
            </div>
            {productTitle && (
              <p className="text-xs text-gray-500 text-center">
                <span className="font-medium">선택한 제품:</span> {productTitle}
              </p>
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
            className="py-8 px-4"
          >
            
            {/* Loading Text */}
            <motion.div
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="text-center mb-8"
            >
              <h3 className="text-lg font-bold text-gray-900">
                내돈내산 리뷰 분석 중...
              </h3>
              <p className="text-sm text-gray-500">
                핵심 장단점을 추출 중이에요
              </p>
            </motion.div>

            {/* Skeleton Tags - Pros */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="mb-6"
            >
              <div className="flex items-center gap-2 mb-3">
                <div className="w-5 h-5 bg-emerald-100 rounded-full flex items-center justify-center">
                  <span className="text-emerald-600 text-xs">✓</span>
                </div>
                <span className="text-sm font-semibold text-gray-700">장점 분석 중...</span>
              </div>
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <motion.div
                    key={`pros-${i}`}
                    initial={{ width: '60%', opacity: 0 }}
                    animate={{
                      width: ['60%', '90%', '75%'],
                      opacity: [0.3, 0.6, 0.4]
                    }}
                    transition={{
                      duration: 1.5,
                      repeat: Infinity,
                      delay: i * 0.1,
                      ease: 'easeInOut'
                    }}
                    className="h-12 bg-gray-100 rounded-xl"
                  />
                ))}
              </div>
            </motion.div>

            {/* Skeleton Tags - Cons */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.6 }}
            >
              <div className="flex items-center gap-2 mb-3">
                <div className="w-5 h-5 bg-rose-100 rounded-full flex items-center justify-center">
                  <span className="text-rose-600 text-xs">!</span>
                </div>
                <span className="text-sm font-semibold text-gray-700">단점 분석 중...</span>
              </div>
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <motion.div
                    key={`cons-${i}`}
                    initial={{ width: '50%', opacity: 0 }}
                    animate={{
                      width: ['50%', '85%', '65%'],
                      opacity: [0.3, 0.6, 0.4]
                    }}
                    transition={{
                      duration: 1.5,
                      repeat: Infinity,
                      delay: i * 0.1,
                      ease: 'easeInOut'
                    }}
                    className="h-12 bg-gray-100 rounded-xl"
                  />
                ))}
              </div>
            </motion.div>
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

              {/* Title */}
              <h2 className="text-lg font-bold text-gray-900 mb-2">
                가장 마음에 드는 장점을 선택하세요
              </h2>
              <p className="text-sm text-gray-600 mb-6">
                최대 4개 선택 가능 • 선택한 순서대로 우선순위가 적용됩니다
              </p>

              <div className="space-y-3 mb-6">
                {prosTags.map((tag, index) => {
                  const isSelected = selectedPros.includes(tag.id);
                  const selectedIndex = selectedPros.indexOf(tag.id);
                  // 상위 4개만 "많이 언급"으로 표시
                  const sortedByMentions = [...prosTags].sort((a, b) => (b.mentionCount || 0) - (a.mentionCount || 0));
                  const top4Tags = sortedByMentions.slice(0, 4).map(t => t.id);
                  const isFrequentlyMentioned = top4Tags.includes(tag.id) && tag.mentionCount && tag.mentionCount > 0;

                  return (
                    <motion.button
                      key={tag.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.15, delay: index * 0.02 }}
                      onClick={() => toggleProsTag(tag.id)}
                      className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
                        isSelected
                          ? 'border-emerald-300 bg-emerald-100'
                          : 'border-transparent bg-gray-100 hover:bg-gray-200'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center text-[10px] font-bold shrink-0 ${
                            isSelected
                              ? 'border-emerald-500 bg-emerald-500 text-white'
                              : 'border-gray-300 text-gray-400'
                          }`}
                        >
                          {isSelected ? selectedIndex + 1 : ''}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`text-sm leading-snug font-medium ${
                              isSelected ? 'text-emerald-700' : 'text-gray-700'
                            }`}>{tag.text}</span>
                            {isFrequentlyMentioned && (
                              <span
                                className="text-[10px] px-1.5 py-0.5 rounded-md font-bold shrink-0"
                                style={
                                  isSelected
                                    ? { backgroundColor: 'white', color: '#059669' }
                                    : { backgroundColor: '#EAF8F8', color: '#009896' }
                                }
                              >
                                많이 언급
                              </span>
                            )}
                          </div>
                        </div>
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

              {consTags.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl p-8 mb-4 text-center"
                >
                  <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <span className="text-2xl">😊</span>
                  </div>
                  <p className="text-sm font-semibold text-gray-700 mb-1">
                    단점을 언급한 리뷰가 없습니다!
                  </p>
                  <p className="text-xs text-gray-500">
                    이 제품은 저평점 리뷰가 없어요
                  </p>
                </motion.div>
              ) : (
                <div className="space-y-3 mb-4">
                  {consTags.map((tag, index) => {
                    const isSelected = selectedCons.includes(tag.id);
                    const selectedIndex = selectedCons.indexOf(tag.id);
                    // 상위 4개만 "많이 언급"으로 표시
                    const sortedByMentions = [...consTags].sort((a, b) => (b.mentionCount || 0) - (a.mentionCount || 0));
                    const top4Tags = sortedByMentions.slice(0, 4).map(t => t.id);
                    const isFrequentlyMentioned = top4Tags.includes(tag.id) && tag.mentionCount && tag.mentionCount > 0;

                    return (
                    <motion.button
                      key={tag.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.15, delay: index * 0.02 }}
                      onClick={() => toggleConsTag(tag.id)}
                      className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
                        isSelected
                          ? 'border-rose-300 bg-rose-100'
                          : 'border-transparent bg-gray-100 hover:bg-gray-200'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center text-[10px] font-bold shrink-0 ${
                            isSelected
                              ? 'border-rose-500 bg-rose-500 text-white'
                              : 'border-gray-300 text-gray-400'
                          }`}
                        >
                          {isSelected ? selectedIndex + 1 : ''}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`text-sm leading-snug font-medium ${
                              isSelected ? 'text-rose-700' : 'text-gray-700'
                            }`}>{tag.text}</span>
                            {isFrequentlyMentioned && (
                              <span
                                className="text-[10px] px-1.5 py-0.5 rounded-md font-bold shrink-0"
                                style={
                                  isSelected
                                    ? { backgroundColor: 'white', color: '#E11D48' }
                                    : { backgroundColor: '#FEE', color: '#DC2626' }
                                }
                              >
                                많이 언급
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </motion.button>
                    );
                  })}
                </div>
              )}

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

              {/* 미리 정의된 예산 범위 */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                {budgetOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => handleBudgetSelect(option.value)}
                    className={`p-4 rounded-xl text-left transition-all border-2 ${
                      budget === option.value && !isCustomMode
                        ? 'bg-blue-50 border-blue-300'
                        : 'bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-1">
                      <span className={`font-semibold text-sm ${budget === option.value && !isCustomMode ? 'text-[#0084FE]' : 'text-gray-900'}`}>
                        {option.label}
                      </span>
                      {option.popular && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md font-bold bg-teal-50 text-teal-600">
                          인기
                        </span>
                      )}
                    </div>
                    <div className={`text-xs ${budget === option.value && !isCustomMode ? 'text-blue-600' : 'text-gray-500'}`}>
                      {option.desc}
                    </div>
                  </button>
                ))}
              </div>

              {/* 직접 입력 버튼 */}
              {!isCustomMode && (
                <button
                  onClick={handleCustomModeToggle}
                  className="w-full p-4 rounded-xl text-center border-2 border-dashed border-gray-300 hover:border-gray-400 hover:bg-gray-50 transition-all mb-4"
                >
                  <span className="text-sm font-semibold text-gray-700">💰 직접 입력하기</span>
                </button>
              )}

              {/* 커스텀 예산 입력 필드 */}
              {isCustomMode && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-4"
                >
                  <div className="bg-blue-50 border-2 border-blue-300 rounded-xl p-4">
                    <label className="block text-sm font-semibold text-gray-900 mb-2">
                      원하는 예산을 입력하세요
                    </label>
                    <div className="flex gap-2 mb-2">
                      <input
                        type="text"
                        value={customBudget}
                        onChange={handleCustomBudgetChange}
                        placeholder="예: 7만 이하, 10만원 정도, 80000"
                        className="flex-1 px-4 py-3 rounded-lg border-2 border-gray-300 focus:border-[#0084FE] focus:outline-none text-base"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleParseBudget();
                          }
                        }}
                      />
                      <button
                        onClick={handleParseBudget}
                        disabled={!customBudget.trim() || isParsingBudget}
                        className={`px-5 py-3 rounded-lg font-semibold text-sm transition-all ${
                          customBudget.trim() && !isParsingBudget
                            ? 'bg-[#0084FE] text-white hover:opacity-90'
                            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        }`}
                      >
                        {isParsingBudget ? '분석 중...' : '확인'}
                      </button>
                    </div>

                    {/* 파싱 결과 표시 */}
                    {parsedBudgetDisplay && (
                      <motion.div
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mb-3 p-3 bg-white rounded-lg border border-blue-200"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xl">✅</span>
                          <div>
                            <p className="text-sm font-semibold text-gray-900">
                              {parsedBudgetDisplay}
                            </p>
                            <p className="text-xs text-gray-500">
                              이 범위로 추천해드릴게요
                            </p>
                          </div>
                        </div>
                      </motion.div>
                    )}

                    <div className="text-xs text-gray-600 mb-3">
                      <p className="mb-1 font-semibold">💡 입력 예시:</p>
                      <ul className="space-y-0.5 text-gray-500">
                        <li>• &quot;7만 이하&quot; → 7만원까지의 제품 추천</li>
                        <li>• &quot;10만원 정도&quot; → 9~11만원대 제품 추천</li>
                        <li>• &quot;15~20만원&quot; → 15~20만원 사이 제품 추천</li>
                      </ul>
                    </div>

                    <button
                      onClick={() => {
                        setIsCustomMode(false);
                        setCustomBudget('');
                        setBudget('');
                        setParsedBudgetDisplay('');
                      }}
                      className="text-sm text-gray-600 hover:text-gray-900 underline"
                    >
                      범위로 다시 선택하기
                    </button>
                  </div>
                </motion.div>
              )}
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
              다음
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
                다음
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

        {/* Back Confirmation Modal */}
        <AnimatePresence>
          {showBackConfirmModal && (
            <>
              {/* 반투명 배경 */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/50 z-40"
                onClick={() => setShowBackConfirmModal(false)}
              />

              {/* 모달 */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="fixed inset-0 flex items-center justify-center z-50 px-4"
              >
                <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full mx-auto">
                  <p className="text-m text-gray-800 mb-6 leading-relaxed">
                    나가시면 다시 이 페이지로 돌아올 수 없어요. 정말 나가시겠어요?
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowBackConfirmModal(false)}
                      className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-900 font-semibold rounded-xl transition-colors"
                    >
                      취소
                    </button>
                    <button
                      onClick={handleConfirmBack}
                      className="flex-1 px-4 py-3 text-white font-semibold rounded-xl transition-colors"
                      style={{ backgroundColor: '#0074F3' }}
                    >
                      홈으로
                    </button>
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
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
