'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { products } from '@/data/products';
import { Product } from '@/types';
import { motion } from 'framer-motion';

function ComparePageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [selectedProducts, setSelectedProducts] = useState<Product[]>([]);
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoadingComparison, setIsLoadingComparison] = useState(true);
  const [productDetails, setProductDetails] = useState<Record<string, { pros: string[]; cons: string[]; comparison: string }>>({});

  // Absolute evaluation color system (based on score thresholds)
  const getColorForScore = (value: number): string => {
    if (value >= 8) return '#49CDCB'; // Excellent (8-10): cyan
    if (value >= 6) return '#F9B73B'; // Good (6-7): yellow
    return '#F15850'; // Poor (5 or less): red
  };

  useEffect(() => {
    const productIds = searchParams.get('products')?.split(',') || [];

    if (productIds.length !== 3) {
      // Redirect back if not exactly 3 products
      router.push('/');
      return;
    }

    const foundProducts = productIds
      .map((id) => products.find((p) => p.id === id))
      .filter((p): p is Product => p !== undefined);

    if (foundProducts.length !== 3) {
      router.push('/');
      return;
    }

    setSelectedProducts(foundProducts);

    // Fetch pros/cons from API
    const fetchProductDetails = async () => {
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

    fetchProductDetails();
  }, [searchParams, router]);

  const handleSendMessage = () => {
    if (!inputValue.trim()) return;

    // Add user message
    setMessages((prev) => [...prev, { role: 'user', content: inputValue }]);
    setInputValue('');

    // TODO: Call API to get AI response
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `You said: ${inputValue}` },
      ]);
    }, 500);
  };

  if (selectedProducts.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-gray-500">로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100">
      {/* Mobile Container */}
      <div className="relative w-full max-w-[480px] bg-white shadow-lg h-screen flex flex-col">
        {/* Comparison Table - Fixed Top 60% with scrollable content */}
        <div className="flex-[6] overflow-y-auto bg-gray-50 border-b border-gray-200">
          {/* Header - Scrolls with content */}
          <div className="px-6 py-1 flex items-center justify-between bg-gray-50">
            <button
              onClick={() => router.back()}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-gray-900">제품 비교하기</h1>
              <span className="px-2 py-0.5 bg-[#0084FE]/10 rounded-md text-xs font-bold flex items-center gap-1 text-[#0084FE]">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 22l-.394-1.433a2.25 2.25 0 00-1.423-1.423L13.25 19l1.433-.394a2.25 2.25 0 001.423-1.423L16.5 16l.394 1.433a2.25 2.25 0 001.423 1.423L19.75 19l-1.433.394a2.25 2.25 0 00-1.423 1.423z" />
                </svg>
                <span>AI</span>
              </span>
            </div>
            <div className="w-10" /> {/* Spacer */}
          </div>

          {/* 가로 스크롤 힌트 */}
          <p className="text-xs text-gray-400 text-center py-2 bg-gray-50">
            ← 좌우로 스크롤해서 확인하세요 →
          </p>

          {/* Table content */}

          <div className="p-4">
            <div className="bg-white rounded-xl p-4">

              {/* Table Format */}
              <div className="overflow-x-auto -mx-4 px-4 scrollbar-hide">
                <table className="w-full min-w-[600px]">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-2 text-xs font-semibold text-gray-500 w-24"></th>
                      {selectedProducts.map((product) => (
                        <th key={product.id} className="py-3 px-2 text-center" style={{ width: '28%' }}>
                          <div className="flex flex-col items-center gap-2">
                            <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100">
                              <img
                                src={product.thumbnail}
                                alt={product.title}
                                className="w-full h-full object-cover"
                              />
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
                      {selectedProducts.map((product) => (
                        <td key={product.id} className="py-3 px-2">
                          <p className="text-xs text-gray-900 leading-tight font-semibold line-clamp-2">
                            {product.title}
                          </p>
                        </td>
                      ))}
                    </tr>

                    {/* 가격 */}
                    <tr className="border-b border-gray-100">
                      <td className="py-3 px-2 text-xs font-semibold text-gray-700">가격</td>
                      {selectedProducts.map((product) => (
                        <td key={product.id} className="py-3 px-2">
                          <p className="text-sm font-bold text-gray-900">
                            {product.price.toLocaleString()}원
                          </p>
                        </td>
                      ))}
                    </tr>

                    {/* Temperature Control */}
                    <tr className="border-b border-gray-100">
                      <td className="py-3 px-2 text-xs font-semibold text-gray-700">온도 조절/유지</td>
                      {selectedProducts.map((product) => {
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
                        const value = product.coreValues.hygiene;
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

                    {/* Material */}
                    <tr className="border-b border-gray-100">
                      <td className="py-3 px-2 text-xs font-semibold text-gray-700">소재/안전성</td>
                      {selectedProducts.map((product) => {
                        const value = product.coreValues.material;
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

                    {/* Usability */}
                    <tr className="border-b border-gray-100">
                      <td className="py-3 px-2 text-xs font-semibold text-gray-700">사용 편의성</td>
                      {selectedProducts.map((product) => {
                        const value = product.coreValues.usability;
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

                    {/* Portability */}
                    <tr className="border-b border-gray-100">
                      <td className="py-3 px-2 text-xs font-semibold text-gray-700">휴대성</td>
                      {selectedProducts.map((product) => {
                        const value = product.coreValues.portability;
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

                    {/* Price Value */}
                    <tr className="border-b border-gray-100">
                      <td className="py-3 px-2 text-xs font-semibold text-gray-700">가격 대비 가치</td>
                      {selectedProducts.map((product) => {
                        const value = product.coreValues.priceValue;
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

                    {/* Additional Features */}
                    <tr className="border-b border-gray-100">
                      <td className="py-3 px-2 text-xs font-semibold text-gray-700">부가 기능/디자인</td>
                      {selectedProducts.map((product) => {
                        const value = product.coreValues.additionalFeatures;
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

                    {/* 장점 */}
                    {!isLoadingComparison && Object.keys(productDetails).length > 0 && (
                      <tr className="border-b border-gray-100">
                        <td className="py-3 px-2 text-xs font-semibold text-gray-700 align-top">장점</td>
                        {selectedProducts.map((product) => {
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

                    {/* 비교 */}
                    {!isLoadingComparison && Object.keys(productDetails).length > 0 && (
                      <tr className="border-b border-gray-100">
                        <td className="py-3 px-2 text-xs font-semibold text-gray-700 align-top">한줄 비교</td>
                        {selectedProducts.map((product) => {
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

                    {/* Loading state */}
                    {isLoadingComparison && (
                      <tr className="border-b border-gray-100">
                        <td className="py-4 px-2 text-xs font-semibold text-gray-700 align-top">장점/주의점</td>
                        {selectedProducts.map((product) => (
                          <td key={product.id} className="py-4 px-2 align-top">
                            <div className="flex items-center justify-center">
                              <div className="animate-spin rounded-full h-5 w-5 border-2 border-gray-300 border-t-blue-500"></div>
                            </div>
                          </td>
                        ))}
                      </tr>
                    )}

                    {/* 쿠팡에서 보기 버튼 */}
                    <tr>
                      <td className="py-3 px-2"></td>
                      {selectedProducts.map((product) => (
                        <td key={product.id} className="py-3 px-2">
                          <button
                            onClick={() => window.open(product.reviewUrl, '_blank')}
                            className="w-full py-2 text-xs font-semibold rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
                          >
                            쿠팡에서 보기
                          </button>
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* Chat Area - Fixed at bottom 40% */}
        <div className="flex-[4] flex flex-col bg-white border-t border-gray-200">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center text-gray-400">
                <p className="text-sm">비교하고 싶은 내용을 물어보세요</p>
                <p className="text-xs mt-1">예: &quot;A와 B 중 소음이 더 적은 건 뭐야?&quot;</p>
              </div>
            ) : (
              messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] px-4 py-2 rounded-2xl ${
                      message.role === 'user'
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100 text-gray-900'
                    }`}
                  >
                    <p className="text-sm">{message.content}</p>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Input Area */}
          <div className="p-4 border-t border-gray-200">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder="메시지를 입력하세요..."
                className="flex-1 px-4 py-3 rounded-full border border-gray-300 focus:outline-none focus:border-blue-500 text-sm"
              />
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleSendMessage}
                disabled={!inputValue.trim()}
                className="w-10 h-10 rounded-full bg-blue-500 text-white flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="12 19 19 12 12 5" />
                  <line x1="19" y1="12" x2="5" y2="12" />
                </svg>
              </motion.button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center">로딩 중...</div>}>
      <ComparePageContent />
    </Suspense>
  );
}
