'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import type { ScoredProduct, V2ResultProduct } from '@/types/recommend-v2';
import type { Recommendation } from '@/types';
import { V2ResultProductCard } from '@/components/recommend-v2/V2ResultProductCard';
import DetailedComparisonTable from '@/components/DetailedComparisonTable';
import { logButtonClick } from '@/lib/logging/clientLogger';
import { useDanawaPrices } from '@/hooks/useDanawaPrices';

// SessionStorage 키
const V2_RESULT_KEY = 'v2_recommendation_result';
// LocalStorage 키 (히스토리)
const V2_HISTORY_KEY = 'v2_recommendation_history';
const V2_HISTORY_MAX = 10;

// 히스토리에 결과 저장
function saveToHistory(data: V2ResultData) {
  try {
    const history = JSON.parse(localStorage.getItem(V2_HISTORY_KEY) || '[]');

    // 중복 방지: 같은 카테고리 + 같은 제품 조합이면 저장 안 함
    const newProductIds = data.products.map(p => p.pcode).sort().join(',');
    const isDuplicate = history.some((h: { products: Array<{ pcode: string }> }) => {
      const existingIds = h.products.map((p: { pcode: string }) => p.pcode).sort().join(',');
      return existingIds === newProductIds;
    });

    if (isDuplicate) return;

    const historyItem = {
      id: crypto.randomUUID(),
      categoryKey: data.categoryKey,
      categoryName: data.categoryName,
      products: data.products.slice(0, 3), // Top 3만 저장
      conditions: data.conditions,
      budget: data.budget,
      completedAt: new Date().toISOString(),
    };

    history.unshift(historyItem);
    localStorage.setItem(V2_HISTORY_KEY, JSON.stringify(history.slice(0, V2_HISTORY_MAX)));
  } catch (e) {
    console.error('Failed to save to history:', e);
  }
}

interface V2ResultData {
  products: ScoredProduct[];
  categoryKey: string;
  categoryName: string;
  conditions: Array<{ label: string; value: string }>;
  budget: { min: number; max: number };
  hardFilterAnswers: Record<string, string>;
}

export default function V2ResultPage() {
  const params = useParams();
  const router = useRouter();
  const categoryKey = params.categoryKey as string;

  // States
  const [resultData, setResultData] = useState<V2ResultData | null>(null);
  const [products, setProducts] = useState<V2ResultProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Danawa prices (공통 훅 사용)
  const pcodes = useMemo(() => products.map(p => p.pcode), [products]);
  const { danawaData } = useDanawaPrices(pcodes);

  // Comparison table states
  const [comparisonFeatures, setComparisonFeatures] = useState<Record<string, string[]>>({});
  const [comparisonDetails, setComparisonDetails] = useState<Record<string, { pros: string[]; cons: string[]; comparison: string; specs?: Record<string, unknown> | null }>>({});

  // Anchor product state (for comparison table change)
  const [anchorProduct, setAnchorProduct] = useState<{
    productId: string;
    브랜드: string;
    모델명: string;
    최저가: number;
    썸네일: string;
  } | null>(null);

  // Load data from sessionStorage
  useEffect(() => {
    const stored = sessionStorage.getItem(V2_RESULT_KEY);
    if (!stored) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError('추천 결과를 찾을 수 없습니다. 다시 시도해주세요.');
      setLoading(false);
      return;
    }

    try {
      const data: V2ResultData = JSON.parse(stored);
      setResultData(data);

      // Set initial products with matched hard filters
      const productsWithFilters: V2ResultProduct[] = data.products.map(p => ({
        ...p,
        matchedHardFilters: data.conditions,
      }));
      setProducts(productsWithFilters);

      // Set first product as anchor (for comparison)
      if (data.products.length > 0) {
        const first = data.products[0];
        setAnchorProduct({
          productId: first.pcode,
          브랜드: first.brand || '',
          모델명: first.title,
          최저가: first.price || 0,
          썸네일: first.thumbnail || '',
        });
      }

      // 히스토리에 저장 (localStorage)
      saveToHistory(data);

      // 즉시 렌더링 (비블로킹) - 다나와 가격은 useDanawaPrices 훅에서 자동 로드
      setLoading(false);
    } catch (e) {
      console.error('Failed to parse result data:', e);
      setError('데이터를 불러오는 중 오류가 발생했습니다.');
      setLoading(false);
    }
  }, []);

  // danawaData가 로드되면 products에 병합
  useEffect(() => {
    if (Object.keys(danawaData).length === 0) return;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProducts(prev => prev.map(p => ({
      ...p,
      danawaPrice: danawaData[p.pcode] || null,
    })));

    console.log(`✅ [V2ResultPage] Merged danawa prices for ${Object.keys(danawaData).length} products`);
  }, [danawaData]);

  // Convert V2ResultProduct to Recommendation for DetailedComparisonTable
  const recommendations: Recommendation[] = useMemo(() => {
    return products.map((p, index) => ({
      product: {
        id: p.pcode,
        title: p.title,
        brand: p.brand || undefined,
        price: p.price || 0,
        reviewUrl: '',
        thumbnail: p.thumbnail || '',
        reviewCount: 0,
        ranking: index + 1,
        category: 'milk_powder_port' as const,
        coreValues: {
          temperatureControl: 0,
          hygiene: 0,
          material: 0,
          usability: 0,
          portability: 0,
          priceValue: 0,
          durability: 0,
          additionalFeatures: 0,
        },
      },
      rank: (index + 1) as 1 | 2 | 3,
      finalScore: p.totalScore,
      reasoning: '',
      selectedTagsEvaluation: [],
      additionalPros: [],
      cons: [],
      anchorComparison: [],
      purchaseTip: [],
      citedReviews: [],
    }));
  }, [products]);

  // Go back to recommendation flow
  const handleGoBack = () => {
    router.push(`/recommend-v2/${categoryKey}`);
  };

  // Go to home
  const handleGoHome = () => {
    sessionStorage.removeItem(V2_RESULT_KEY);
    router.push('/');
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FBFCFC]">
        <div className="relative w-full max-w-[480px] min-h-screen bg-[#FBFCFC] flex flex-col items-center justify-center px-8">
          {/* Character animation */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <video
              autoPlay
              loop
              muted
              playsInline
              style={{ width: 120, height: 120 }}
              className="object-contain"
            >
              <source src="/animations/character.mp4" type="video/mp4" />
            </video>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-base font-medium text-gray-700 shimmer-text"
          >
            추천 결과를 불러오는 중...
          </motion.p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="relative w-full max-w-[480px] min-h-screen bg-white flex flex-col items-center justify-center px-8">
          <div className="text-6xl mb-4">😔</div>
          <p className="text-gray-900 font-semibold text-lg mb-2">오류가 발생했습니다</p>
          <p className="text-gray-600 text-center mb-6 text-sm">{error}</p>
          <button
            onClick={handleGoBack}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-full transition-colors font-semibold"
          >
            다시 시도하기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-white">
      <div className="relative w-full max-w-[480px] min-h-screen flex flex-col bg-white">
        {/* Header */}
        <header className="px-3 py-3 bg-white border-b border-gray-200 sticky top-0 z-20">
          <div className="flex items-center justify-between">
            <button
              onClick={handleGoBack}
              className="p-1 -ml-1"
            >
              <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-base font-bold text-gray-900">추천 결과</h1>
            <button
              onClick={handleGoHome}
              className="text-sm text-gray-600 hover:text-gray-900 font-medium"
            >
              처음으로
            </button>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto px-3 pb-20">
          {/* AI Summary */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="mt-4 mb-4"
          >
            <div className="bg-white rounded-2xl p-1">
              <p className="text-sm text-gray-900 font-medium leading-normal">
                입력하신 조건에 맞는 TOP 3 제품을 추천해드려요!
              </p>
            </div>
          </motion.div>

          {/* Selected Conditions Tags */}
          {resultData?.conditions && resultData.conditions.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="mb-4"
            >
              <p className="text-xs text-gray-500 mb-2">선택한 조건</p>
              <div className="flex flex-wrap gap-2">
                {resultData.conditions.map((cond, i) => (
                  <span
                    key={i}
                    className="text-xs px-3 py-1.5 rounded-full bg-blue-50 text-blue-700 font-medium"
                  >
                    {cond.value}
                  </span>
                ))}
                {resultData.budget && (
                  <span className="text-xs px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 font-medium">
                    {resultData.budget.min.toLocaleString()}원 ~ {resultData.budget.max.toLocaleString()}원
                  </span>
                )}
              </div>
            </motion.div>
          )}

          {/* Product Cards */}
          <div className="space-y-3 mb-6">
            {products.map((product, index) => (
              <V2ResultProductCard
                key={product.pcode}
                product={product}
                rank={index + 1}
                onClick={() => {
                  logButtonClick(`제품카드_클릭_${product.brand}_${product.title}`, 'v2-result');
                  // TODO: Open product detail modal
                }}
              />
            ))}
          </div>

          {/* Detailed Comparison Table */}
          {recommendations.length > 0 && (
            <DetailedComparisonTable
              recommendations={recommendations}
              cachedFeatures={comparisonFeatures}
              cachedDetails={comparisonDetails}
              showScore={false}
              anchorProduct={anchorProduct}
              isTagBasedFlow={true}
              category={categoryKey}
              onProductClick={(rec) => {
                logButtonClick(`비교표_상세보기_${rec.product.title}`, 'v2-result');
                // TODO: Open product detail modal
              }}
            />
          )}

          {/* User Context Summary */}
          {resultData && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="mt-6"
            >
              <div className="bg-white rounded-2xl p-4">
                <h3 className="text-base font-bold text-gray-900 mb-3">내 구매 기준</h3>
                <div className="space-y-2">
                  {resultData.conditions.map((cond, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <svg className="w-4 h-4 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-gray-500">{cond.label}:</span>
                      <span className="text-gray-900 font-medium">{cond.value}</span>
                    </div>
                  ))}
                  <div className="flex items-center gap-2 text-sm">
                    <svg className="w-4 h-4 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-gray-500">예산:</span>
                    <span className="text-gray-900 font-medium">
                      {resultData.budget.min.toLocaleString()}원 ~ {resultData.budget.max.toLocaleString()}원
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </main>

        {/* Bottom CTA */}
        <div className="fixed bottom-0 left-0 right-0 max-w-[480px] mx-auto p-3 bg-white border-t border-gray-200">
          <button
            onClick={handleGoBack}
            className="w-full h-14 rounded-2xl font-semibold text-base bg-gray-100 text-gray-700 hover:bg-gray-200 transition-all"
          >
            조건 다시 선택하기
          </button>
        </div>
      </div>
    </div>
  );
}
