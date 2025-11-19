'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { Recommendation } from '@/types';
import { products } from '@/data/products';
import { logComparisonProductAction } from '@/lib/logging/clientLogger';

interface DetailedComparisonTableProps {
  recommendations: Recommendation[];
  cachedFeatures?: Record<string, string[]>;
  cachedDetails?: Record<string, { pros: string[]; cons: string[]; comparison: string }>;
}

export default function DetailedComparisonTable({ recommendations, cachedFeatures, cachedDetails }: DetailedComparisonTableProps) {
  const [productFeatures, setProductFeatures] = useState<Record<string, string[]>>(cachedFeatures || {});
  const [productDetails, setProductDetails] = useState<Record<string, { pros: string[]; cons: string[]; comparison: string }>>({});
  const [isLoadingComparison, setIsLoadingComparison] = useState(false);

  const top3 = recommendations.slice(0, 3);
  const selectedProducts = top3.map(rec => products.find(p => p.id === rec.product.id)).filter(Boolean);

  // Absolute evaluation color system
  const getColorForScore = (value: number): string => {
    if (value >= 8) return '#49CDCB'; // Excellent (8-10): cyan
    if (value >= 5) return '#F9B73B'; // Good (5-7): yellow
    return '#F15850'; // Poor (4 or less): red
  };

  // 캐시된 데이터 사용 (부모에서 전달받은 경우)
  useEffect(() => {
    if (cachedFeatures && Object.keys(cachedFeatures).length > 0) {
      console.log('✅ Using cached features from parent');
      setProductFeatures(cachedFeatures);
    }
  }, [cachedFeatures]);

  useEffect(() => {
    if (cachedDetails && Object.keys(cachedDetails).length > 0) {
      console.log('✅ Using cached details from parent');
      setProductDetails(cachedDetails);
    }
  }, [cachedDetails]);

  useEffect(() => {
    // 이미 캐시된 데이터가 있으면 API 호출 건너뛰기
    if (cachedFeatures && Object.keys(cachedFeatures).length > 0 &&
        cachedDetails && Object.keys(cachedDetails).length > 0) {
      console.log('✅ Skipping API calls - using cached data');
      return;
    }

    const productIds = recommendations.slice(0, 3).map(rec => rec.product.id);

    // Fetch pros/cons from API (캐시 없을 때만)
    const fetchProductDetails = async () => {
      if (cachedDetails && Object.keys(cachedDetails).length > 0) return;

      setIsLoadingComparison(true);
      try {
        const response = await fetch('/api/compare', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productIds }),
        });

        if (response.ok) {
          const data = await response.json();
          setProductDetails(data.productDetails);
        }
      } catch (error) {
        console.error('Failed to fetch product details:', error);
      } finally {
        setIsLoadingComparison(false);
      }
    };

    // Fetch core features (LLM-generated tags) (캐시 없을 때만)
    const fetchProductFeatures = async () => {
      if (cachedFeatures && Object.keys(cachedFeatures).length > 0) return;

      try {
        const response = await fetch('/api/compare-features', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productIds }),
        });

        if (response.ok) {
          const data = await response.json();
          setProductFeatures(data.features);
          console.log('📊 Product features loaded:', data.features);
        }
      } catch (error) {
        console.error('Failed to fetch product features:', error);
      }
    };

    fetchProductDetails();
    fetchProductFeatures();
  }, [recommendations, cachedFeatures, cachedDetails]);

  if (selectedProducts.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="comparison-table-section bg-white rounded-2xl p-5 border border-gray-100 mb-8"
    >
      {/* <h3 className="text-lg font-bold text-gray-900 mb-4">🔎 한 눈에 비교</h3> */}

      {/* 가로 스크롤 힌트 */}
      <p className="text-xs text-gray-400 text-center mb-3">
        ← 좌우 스크롤 →
      </p>

      {/* 모바일 가로 스크롤 테이블 */}
      <div className="overflow-x-auto -mx-5 px-5 scrollbar-hide">
        <table className="w-full min-w-[600px]">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-3 px-2 text-xs font-semibold text-gray-500 w-24"></th>
              {top3.map((rec) => (
                <th key={rec.product.id} className="py-3 px-2 text-center" style={{ width: '28%' }}>
                  <div className="flex flex-col items-center gap-2">
                    <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-gray-100 border border-gray-100">
                      {rec.product.thumbnail && (
                        <Image
                          src={rec.product.thumbnail}
                          alt={rec.product.title}
                          width={48}
                          height={48}
                          className="w-full h-full object-cover"
                          quality={85}
                          sizes="48px"
                        />
                      )}
                      {/* 랭킹 배지 - 좌측 상단 */}
                      <div className="absolute top-0 left-0 w-4 h-4 bg-gray-900 rounded-tl-lg rounded-tr-none rounded-bl-none rounded-br-sm flex items-center justify-center">
                        <span className="text-white font-bold text-[10px]">
                          {rec.rank}
                        </span>
                      </div>
                    </div>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* 제품명 */}
            <tr className="border-b border-gray-100">
              <td className="py-3 px-2 text-xs font-semibold text-gray-700">제품명</td>
              {top3.map((rec) => (
                <td key={rec.product.id} className="py-3 px-2 text-center">
                  <p className="text-xs text-gray-900 leading-tight font-semibold line-clamp-2">
                    {rec.product.title}
                  </p>
                </td>
              ))}
            </tr>

            {/* 가격 */}
            <tr className="border-b border-gray-100">
              <td className="py-3 px-2 text-xs font-semibold text-gray-700">가격</td>
              {top3.map((rec) => (
                <td key={rec.product.id} className="py-3 px-2 text-center">
                  <p className="text-sm font-bold text-gray-900">
                    {rec.product.price.toLocaleString()}원
                  </p>
                </td>
              ))}
            </tr>

            {/* 적합도 */}
            <tr className="border-b border-gray-100">
              <td className="py-3 px-2 text-xs font-semibold text-gray-700">적합도</td>
              {top3.map((rec) => (
                <td key={rec.product.id} className="py-3 px-2 text-center">
                  <p className="text-sm font-bold" style={{ color: '#009896' }}>{rec.finalScore}%</p>
                </td>
              ))}
            </tr>

            {/* 쿠팡에서 보기 + 최저가 보기 + 이 상품 질문하기 버튼 */}
            <tr className="border-b border-gray-100">
              <td className="py-3 px-2 text-xs font-semibold text-gray-700"></td>
              {top3.map((rec) => (
                <td key={rec.product.id} className="py-3 px-2">
                  <div className="space-y-1.5">
                    <button
                      onClick={() => {
                        logComparisonProductAction(
                          'result',
                          'coupang_clicked',
                          rec.product.id,
                          rec.product.title,
                          top3.map(r => r.product.id)
                        );
                        window.open(rec.product.reviewUrl, '_blank');
                      }}
                      className="w-full py-2 text-xs font-semibold rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
                    >
                      쿠팡에서 보기
                    </button>
                    <button
                      onClick={() => {
                        logComparisonProductAction(
                          'result',
                          'coupang_clicked',
                          rec.product.id,
                          rec.product.title,
                          top3.map(r => r.product.id)
                        );
                        window.open(`https://search.danawa.com/mobile/dsearch.php?keyword=${encodeURIComponent(rec.product.title)}&sort=priceASC`, '_blank');
                      }}
                      className="w-full py-2 text-xs font-semibold rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
                    >
                      최저가 보기
                    </button>
                    <button
                      onClick={() => {
                        logComparisonProductAction(
                          'result',
                          'product_chat_clicked',
                          rec.product.id,
                          rec.product.title,
                          top3.map(r => r.product.id)
                        );
                        // Navigate to product-chat page
                        window.location.href = `/product-chat?productId=${rec.product.id}&from=/result`;
                      }}
                      className="w-full py-2 text-xs font-semibold rounded-lg transition-colors hover:opacity-90 flex items-center justify-center gap-1"
                      style={{ backgroundColor: '#E5F1FF', color: '#0074F3' }}
                    >
                      <svg
                        className="w-3 h-3"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 22l-.394-1.433a2.25 2.25 0 00-1.423-1.423L13.25 19l1.433-.394a2.25 2.25 0 001.423-1.423L16.5 16l.394 1.433a2.25 2.25 0 001.423 1.423L19.75 19l-1.433.394a2.25 2.25 0 00-1.423 1.423z" />
                      </svg>
                      질문하기
                    </button>
                  </div>
                </td>
              ))}
            </tr>

            {/* 핵심 특징 (LLM 생성 태그) */}
            {Object.keys(productFeatures).length > 0 && (
              <tr className="border-b border-gray-100">
                <td className="py-3 px-2 text-xs font-semibold text-gray-700 align-top">핵심 특징</td>
                {selectedProducts.map((product) => {
                  if (!product) return <td key="empty"></td>;
                  const features = productFeatures[product.id] || [];
                  return (
                    <td key={product.id} className="py-3 px-2 align-top">
                      {features.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 justify-center">
                          {features.map((feature, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold text-left bg-gray-100 text-gray-700"
                            >
                              {feature}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400 text-center">분석 중...</p>
                      )}
                    </td>
                  );
                })}
              </tr>
            )}

            {/* 장점 */}
            {!isLoadingComparison && Object.keys(productDetails).length > 0 && (
              <tr className="border-b border-gray-100">
                <td className="py-3 px-2 text-xs font-semibold text-gray-700 align-top">장점</td>
                {selectedProducts.map((product) => {
                  if (!product) return <td key="empty"></td>;
                  const details = productDetails[product.id];
                  return (
                    <td key={product.id} className="py-3 px-2 align-top">
                      {details && details.pros.length > 0 ? (
                        <div className="rounded-lg p-2.5 space-y-1.5" style={{ backgroundColor: '#ECFAF3' }}>
                          {details.pros.slice(0, 3).map((pro, idx) => (
                            <div key={idx} className="text-xs leading-relaxed flex items-start gap-1.5 text-gray-700">
                              <svg
                                className="shrink-0 mt-0.5"
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="#22C55E"
                                strokeWidth="3"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                              <span>{pro}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400">-</p>
                      )}
                    </td>
                  );
                })}
              </tr>
            )}

            {/* 주의점 */}
            {!isLoadingComparison && Object.keys(productDetails).length > 0 && (
              <tr className="border-b border-gray-100">
                <td className="py-3 px-2 text-xs font-semibold text-gray-700 align-top">주의점</td>
                {selectedProducts.map((product) => {
                  if (!product) return <td key="empty"></td>;
                  const details = productDetails[product.id];
                  return (
                    <td key={product.id} className="py-3 px-2 align-top">
                      {details && details.cons.length > 0 ? (
                        <div className="rounded-lg p-2.5 space-y-1.5" style={{ backgroundColor: '#FFF6EC' }}>
                          {details.cons.slice(0, 3).map((con, idx) => (
                            <div key={idx} className="text-xs leading-relaxed flex items-start gap-1.5 text-gray-700">
                              <svg
                                className="shrink-0 mt-0.5"
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="#EF4444"
                                strokeWidth="3"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                              </svg>
                              <span>{con}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400">-</p>
                      )}
                    </td>
                  );
                })}
              </tr>
            )}

            {/* 한줄 비교 */}
            {!isLoadingComparison && Object.keys(productDetails).length > 0 && (
              <tr className="border-b border-gray-100">
                <td className="py-3 px-2 text-xs font-semibold text-gray-700 align-top">한줄 비교</td>
                {selectedProducts.map((product) => {
                  if (!product) return <td key="empty"></td>;
                  const details = productDetails[product.id];
                  return (
                    <td key={product.id} className="py-3 px-2 align-top">
                      {details && details.comparison ? (
                        <p className="text-xs text-gray-700 leading-relaxed font-semibold">
                          {details.comparison}
                        </p>
                      ) : (
                        <p className="text-xs text-gray-400">-</p>
                      )}
                    </td>
                  );
                })}
              </tr>
            )}

            {/* 속성 점수들 */}
            {selectedProducts.length > 0 && selectedProducts[0] && (
              <>
                {/* Temperature Control */}
                <tr className="border-b border-gray-100">
                  <td className="py-3 px-2 text-xs font-semibold text-gray-700">온도 조절/유지</td>
                  {selectedProducts.map((product) => {
                    if (!product) return <td key="empty"></td>;
                    const value = product.coreValues.temperatureControl;
                    const color = getColorForScore(value);
                    return (
                      <td key={product.id} className="py-3 px-2">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold" style={{ color }}>
                              {value}/10
                            </span>
                          </div>
                          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full transition-all"
                              style={{ width: `${(value / 10) * 100}%`, backgroundColor: color }}
                            />
                          </div>
                        </div>
                      </td>
                    );
                  })}
                </tr>

                {/* Hygiene */}
                <tr className="border-b border-gray-100">
                  <td className="py-3 px-2 text-xs font-semibold text-gray-700">위생/세척</td>
                  {selectedProducts.map((product) => {
                    if (!product) return <td key="empty"></td>;
                    const value = product.coreValues.hygiene;
                    const color = getColorForScore(value);
                    return (
                      <td key={product.id} className="py-3 px-2">
                        <div className="space-y-1">
                          <span className="text-xs font-bold" style={{ color }}>{value}/10</span>
                          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full transition-all"
                              style={{ width: `${(value / 10) * 100}%`, backgroundColor: color }}
                            />
                          </div>
                        </div>
                      </td>
                    );
                  })}
                </tr>

                {/* Material */}
                <tr className="border-b border-gray-100">
                  <td className="py-3 px-2 text-xs font-semibold text-gray-700">소재/안전성</td>
                  {selectedProducts.map((product) => {
                    if (!product) return <td key="empty"></td>;
                    const value = product.coreValues.material;
                    const color = getColorForScore(value);
                    return (
                      <td key={product.id} className="py-3 px-2">
                        <div className="space-y-1">
                          <span className="text-xs font-bold" style={{ color }}>{value}/10</span>
                          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full transition-all"
                              style={{ width: `${(value / 10) * 100}%`, backgroundColor: color }}
                            />
                          </div>
                        </div>
                      </td>
                    );
                  })}
                </tr>

                {/* Usability */}
                <tr className="border-b border-gray-100">
                  <td className="py-3 px-2 text-xs font-semibold text-gray-700">사용 편의성</td>
                  {selectedProducts.map((product) => {
                    if (!product) return <td key="empty"></td>;
                    const value = product.coreValues.usability;
                    const color = getColorForScore(value);
                    return (
                      <td key={product.id} className="py-3 px-2">
                        <div className="space-y-1">
                          <span className="text-xs font-bold" style={{ color }}>{value}/10</span>
                          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full transition-all"
                              style={{ width: `${(value / 10) * 100}%`, backgroundColor: color }}
                            />
                          </div>
                        </div>
                      </td>
                    );
                  })}
                </tr>

                {/* Portability */}
                <tr className="border-b border-gray-100">
                  <td className="py-3 px-2 text-xs font-semibold text-gray-700">휴대성</td>
                  {selectedProducts.map((product) => {
                    if (!product) return <td key="empty"></td>;
                    const value = product.coreValues.portability;
                    const color = getColorForScore(value);
                    return (
                      <td key={product.id} className="py-3 px-2">
                        <div className="space-y-1">
                          <span className="text-xs font-bold" style={{ color }}>{value}/10</span>
                          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full transition-all"
                              style={{ width: `${(value / 10) * 100}%`, backgroundColor: color }}
                            />
                          </div>
                        </div>
                      </td>
                    );
                  })}
                </tr>

                {/* Price Value */}
                <tr className="border-b border-gray-100">
                  <td className="py-3 px-2 text-xs font-semibold text-gray-700">가격 대비 가치</td>
                  {selectedProducts.map((product) => {
                    if (!product) return <td key="empty"></td>;
                    const value = product.coreValues.priceValue;
                    const color = getColorForScore(value);
                    return (
                      <td key={product.id} className="py-3 px-2">
                        <div className="space-y-1">
                          <span className="text-xs font-bold" style={{ color }}>{value}/10</span>
                          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full transition-all"
                              style={{ width: `${(value / 10) * 100}%`, backgroundColor: color }}
                            />
                          </div>
                        </div>
                      </td>
                    );
                  })}
                </tr>

                {/* Additional Features */}
                <tr className="border-b border-gray-100">
                  <td className="py-3 px-2 text-xs font-semibold text-gray-700">부가 기능/디자인</td>
                  {selectedProducts.map((product) => {
                    if (!product) return <td key="empty"></td>;
                    const value = product.coreValues.additionalFeatures;
                    const color = getColorForScore(value);
                    return (
                      <td key={product.id} className="py-3 px-2">
                        <div className="space-y-1">
                          <span className="text-xs font-bold" style={{ color }}>{value}/10</span>
                          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full transition-all"
                              style={{ width: `${(value / 10) * 100}%`, backgroundColor: color }}
                            />
                          </div>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}
