'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { products } from '@/data/products';
import { Product } from '@/types';

// Markdown formatting function (handles bold text and lists)
function formatMarkdown(text: string) {
  const lines = text.split('\n');

  return lines.map((line, lineIndex) => {
    // List item detection: "- " or "* " or "• "
    const listMatch = line.match(/^[\s]*[-*•]\s+(.+)$/);

    if (listMatch) {
      const content = listMatch[1];
      // **text** → <strong>text</strong>
      const parts = content.split(/(\*\*.*?\*\*)/g);
      const formattedContent = parts.map((part, index) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          const boldText = part.slice(2, -2);
          return <strong key={index} className="font-bold">{boldText}</strong>;
        }
        return <span key={index}>{part}</span>;
      });

      return (
        <div key={lineIndex} className="flex items-start gap-2 my-1.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-gray-300 mt-2 shrink-0" />
          <span className="flex-1">{formattedContent}</span>
        </div>
      );
    }

    // Regular text (with bold handling)
    const parts = line.split(/(\*\*.*?\*\*)/g);
    const formattedLine = parts.map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        const boldText = part.slice(2, -2);
        return <strong key={index} className="font-bold">{boldText}</strong>;
      }
      return <span key={index}>{part}</span>;
    });

    return <div key={lineIndex}>{formattedLine}</div>;
  });
}

// Typing message component with streaming effect
function TypingMessage({ content, onComplete }: { content: string; onComplete?: () => void }) {
  const [displayedContent, setDisplayedContent] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    // Safety check: ensure content is defined
    if (!content) {
      if (onComplete) onComplete();
      return;
    }

    if (currentIndex < content.length) {
      const timeout = setTimeout(() => {
        setDisplayedContent(content.slice(0, currentIndex + 1));
        setCurrentIndex(currentIndex + 1);
      }, 10); // 10ms per character

      return () => clearTimeout(timeout);
    } else if (onComplete) {
      onComplete();
    }
  }, [currentIndex, content, onComplete]);

  return <span className="whitespace-pre-wrap">{formatMarkdown(displayedContent)}</span>;
}

function ComparePageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [selectedProducts, setSelectedProducts] = useState<Product[]>([]);
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string; id?: string }>>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoadingComparison, setIsLoadingComparison] = useState(true);
  const [isLoadingMessage, setIsLoadingMessage] = useState(false);
  const [typingMessageId, setTypingMessageId] = useState<string | null>(null);
  const [productDetails, setProductDetails] = useState<Record<string, { pros: string[]; cons: string[]; comparison: string }>>({});
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [userContext, setUserContext] = useState<{
    prioritySettings?: Record<string, string>;
    budget?: { min: number; max: number };
    phase0Context?: string;
    chatConversations?: Record<string, Array<{ role: string; content: string }>>;
  } | null>(null);
  const [productScores, setProductScores] = useState<Record<string, number>>({});
  const [productRanks, setProductRanks] = useState<Record<string, number>>({});
  const [productFeatures, setProductFeatures] = useState<Record<string, string[]>>({});

  // Absolute evaluation color system (based on score thresholds)
  const getColorForScore = (value: number): string => {
    if (value >= 8) return '#49CDCB'; // Excellent (8-10): cyan
    if (value >= 5) return '#F9B73B'; // Good (5-7): yellow
    return '#F15850'; // Poor (4 or less): red
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

    // Parse user context from URL if available
    const contextParam = searchParams.get('context');
    if (contextParam) {
      try {
        const context = JSON.parse(decodeURIComponent(contextParam));
        setUserContext(context);
        console.log('📊 User context loaded:', context);
      } catch (error) {
        console.error('Failed to parse user context:', error);
      }
    }

    // Parse product scores from URL if available (from result page)
    const scoresParam = searchParams.get('scores');
    if (scoresParam) {
      try {
        const scores = JSON.parse(decodeURIComponent(scoresParam));
        setProductScores(scores);
        console.log('📊 Product scores loaded:', scores);
      } catch (error) {
        console.error('Failed to parse product scores:', error);
      }
    }

    // Parse product ranks from URL if available (from result page)
    const ranksParam = searchParams.get('ranks');
    if (ranksParam) {
      try {
        const ranks = JSON.parse(decodeURIComponent(ranksParam));
        setProductRanks(ranks);
        console.log('📊 Product ranks loaded:', ranks);
      } catch (error) {
        console.error('Failed to parse product ranks:', error);
      }
    }

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

    // Fetch core features (LLM-generated tags)
    const fetchProductFeatures = async () => {
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
  }, [searchParams, router]);

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoadingMessage) return;

    const userMessage = inputValue.trim();
    const messageId = Date.now().toString();

    // Add user message
    setMessages((prev) => [...prev, { role: 'user', content: userMessage, id: `user-${messageId}` }]);
    setInputValue('');
    setIsLoadingMessage(true);

    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }

    try {
      // Build conversation history
      const conversationHistory = messages
        .map((m) => `${m.role === 'user' ? '사용자' : 'AI'}: ${m.content}`)
        .join('\n');

      // Call API
      const response = await fetch('/api/compare-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          productIds: selectedProducts.map((p) => p.id),
          conversationHistory,
          userContext // Pass Priority context to API
        })
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();

      // Check if response has error
      if (data.error) {
        throw new Error(data.error);
      }

      const assistantMessageId = `assistant-${messageId}`;

      if (data.type === 'replace' || data.type === 'add') {
        // Product replacement/addition intent detected
        // Show AI response with suggested products
        let aiResponse = data.response;

        if (data.suggestedProducts && data.suggestedProducts.length > 0) {
          aiResponse += '\n\n추천 제품:\n';
          data.suggestedProducts.forEach((p: Product & { reason: string }, idx: number) => {
            aiResponse += `\n${idx + 1}. ${p.title} (${p.price.toLocaleString()}원)\n   ${p.reason}`;
          });
        }

        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: aiResponse, id: assistantMessageId }
        ]);
        setTypingMessageId(assistantMessageId);

        // TODO: Show product replacement UI or buttons
      } else {
        // General answer
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: data.response, id: assistantMessageId }
        ]);
        setTypingMessageId(assistantMessageId);
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      const errorMessageId = `error-${messageId}`;
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: '죄송합니다. 응답을 생성하는 중 오류가 발생했습니다.', id: errorMessageId }
      ]);
      setTypingMessageId(errorMessageId);
    } finally {
      setIsLoadingMessage(false);
    }
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
        {/* Comparison Table - Full screen with scrollable content */}
        <div className="flex-1 overflow-y-auto bg-gray-50">
          {/* Header - Scrolls with content */}
          <div className="px-6 py-1 flex items-center justify-between bg-gray-50">
            <button
              onClick={() => router.back()}
              className="p-4 hover:bg-gray-100 rounded-full transition-colors"
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

          <div className="p-4 pb-24">
            <div className="bg-white rounded-xl p-4">

              {/* Table Format */}
              <div className="overflow-x-auto -mx-4 px-4 scrollbar-hide">
                <table className="w-full min-w-[600px]">
                  <thead>
                    <tr className="border-b border-white">
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
                            {/* Ranking badge - show below thumbnail (from result page) */}
                            {productRanks[product.id] && (
                              <span
                                className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                                  productRanks[product.id] === 1
                                    ? 'bg-yellow-400 text-white'
                                    : 'bg-gray-600 text-white'
                                }`}
                              >
                                {productRanks[product.id]}
                              </span>
                            )}
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
                    <tr className="border-b border-white">
                      <td className="py-3 px-2 text-xs font-semibold text-gray-700">가격</td>
                      {selectedProducts.map((product) => (
                        <td key={product.id} className="py-3 px-2">
                          <p className="text-sm font-bold text-gray-900">
                            {product.price.toLocaleString()}원
                          </p>
                        </td>
                      ))}
                    </tr>

                    {/* 적합도 - Show only if scores are available (from result page) */}
                    {Object.keys(productScores).length > 0 && (
                      <tr className="border-b border-white">
                        <td className="py-3 px-2 text-xs font-semibold text-gray-700">적합도</td>
                        {selectedProducts.map((product) => {
                          const score = productScores[product.id];
                          return (
                            <td key={product.id} className="py-3 px-2">
                              {score ? (
                                <span className="text-xs font-bold px-2 py-1 rounded-full inline-block" style={{ backgroundColor: '#EAF8F8', color: '#009896' }}>
                                  {score}%
                                </span>
                              ) : (
                                <p className="text-xs text-gray-400">-</p>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    )}

                    {/* 액션 버튼 */}
                    <tr className="border-b border-gray-100">
                      <td className="py-3 px-2 text-xs font-semibold text-gray-700"></td>
                      {selectedProducts.map((product) => (
                        <td key={product.id} className="py-3 px-2">
                          <div className="space-y-1.5">
                            {/* 쿠팡에서 보기 */}
                            <button
                              onClick={() => window.open(product.reviewUrl, '_blank')}
                              className="w-full py-2 text-xs font-semibold rounded-lg transition-all bg-gray-100 hover:bg-gray-200 text-gray-700"
                            >
                              쿠팡에서 보기
                            </button>
                            {/* 이 상품 질문하기 */}
                            <button
                              onClick={() => router.push(`/product-chat?productId=${product.id}&from=/compare`)}
                              className="w-full py-2 text-xs font-semibold rounded-lg transition-all hover:opacity-90 flex items-center justify-center gap-1"
                              style={{ backgroundColor: '#E5F1FF', color: '#0074F3' }}
                            >
                              <svg
                                className="w-3 h-3"
                                fill="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 22l-.394-1.433a2.25 2.25 0 00-1.423-1.423L13.25 19l1.433-.394a2.25 2.25 0 001.423-1.423L16.5 16l.394 1.433a2.25 2.25 0 001.423 1.423L19.75 19l-1.433.394a2.25 2.25 0 00-1.423 1.423z" />
                              </svg>
                              <span>질문하기</span>
                            </button>
                          </div>
                        </td>
                      ))}
                    </tr>

                    {/* 핵심 특징 (LLM 생성 태그) */}
                    {Object.keys(productFeatures).length > 0 && (
                      <tr className="border-b border-gray-100 bg-blue-50/30">
                        <td className="py-3 px-2 text-xs font-semibold text-gray-700 align-top">핵심 특징</td>
                        {selectedProducts.map((product) => {
                          const features = productFeatures[product.id] || [];
                          return (
                            <td key={product.id} className="py-3 px-2 align-top">
                              {features.length > 0 ? (
                                <div className="flex flex-wrap gap-1.5">
                                  {features.map((feature, idx) => (
                                    <span
                                      key={idx}
                                      className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold"
                                      style={{ backgroundColor: '#E5F1FF', color: '#0074F3' }}
                                    >
                                      {feature}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-xs text-gray-400">분석 중...</p>
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

                    {/* 한줄 비교 */}
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
                        <td className="py-4 px-2 text-xs font-bold text-gray-700 align-top">AI 요약</td>
                        {selectedProducts.map((product) => (
                          <td key={product.id} className="py-4 px-2 align-top">
                            <div className="flex items-center justify-center">
                              <div className="animate-spin rounded-full h-5 w-5 border-2 border-gray-300 border-t-blue-500"></div>
                            </div>
                          </td>
                        ))}
                      </tr>
                    )}

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

                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* Chat Bottom Bar - Collapsed state */}
        {!isChatOpen && (
          <button
            onClick={() => setIsChatOpen(true)}
            className="fixed bottom-0 left-0 right-0 max-w-[480px] mx-auto w-full bg-[#E5F1FF] rounded-t-xl shadow-lg px-6 py-4 flex items-center justify-between hover:bg-[#D0E7FF] transition-colors"
          >
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-[#0074F3]" fill="currentColor" viewBox="0 0 24 24">
                <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 22l-.394-1.433a2.25 2.25 0 00-1.423-1.423L13.25 19l1.433-.394a2.25 2.25 0 001.423-1.423L16.5 16l.394 1.433a2.25 2.25 0 001.423 1.423L19.75 19l-1.433.394a2.25 2.25 0 00-1.423 1.423z" />
              </svg>
              <div className="flex flex-col items-start">
                <span className="text-sm font-bold text-gray-900">비교 질문하기</span>
                <span className="text-xs text-gray-500">3개 제품을 AI와 비교해보세요</span>
              </div>
            </div>
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
            </svg>
          </button>
        )}

        {/* Chat Bottom Sheet - Expanded state */}
        <AnimatePresence>
          {isChatOpen && (
            <>
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 bg-black/50 z-40"
                onClick={() => setIsChatOpen(false)}
              />

              {/* Bottom Sheet */}
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                className="fixed bottom-0 left-0 right-0 max-w-[480px] mx-auto bg-white rounded-t-3xl z-50 flex flex-col"
                style={{ height: '85vh' }}
              >
                {/* Handle Bar */}
                <div className="flex justify-center pt-4 pb-2">
                  <div className="w-12 h-1 bg-gray-300 rounded-full" />
                </div>

                {/* Header */}
                <div className="px-6 py-3 border-b border-gray-200">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      
                      <h2 className="text-base font-bold text-gray-900">비교 질문하기</h2>
                    </div>
                    <button
                      onClick={() => setIsChatOpen(false)}
                      className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>

                  {/* Product Info */}
                  <div className="flex items-center gap-2 text-xs">
                    {selectedProducts.map((product) => (
                      <div key={product.id} className="flex flex-col flex-1 bg-gray-50 rounded-lg p-2.5">
                        <span className="font-semibold text-gray-900 line-clamp-2 text-xs leading-tight mb-1">{product.title}</span>
                        <span className="text-xs font-bold text-gray-700">{product.price.toLocaleString()}원</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Messages - Scrollable area */}
                <div className={`flex-1 p-4 ${messages.length === 0 ? '' : 'overflow-y-auto'}`}>
                {messages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full px-4">
                    <p className="text-sm text-gray-500 mb-1 text-center">비교하고 싶은 내용을 물어보세요</p>
                  </div>
                )}

                <div className="space-y-3">
                  {messages.map((message) => (
                    <div
                      key={message.id || message.content}
                      className={`w-full flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[90%] px-4 py-3 ${
                          message.role === 'user'
                            ? 'bg-gray-100 text-gray-900 rounded-tl-2xl rounded-tr-md rounded-bl-2xl rounded-br-2xl'
                            : 'text-gray-900'
                        }`}
                      >
                        <div className="text-sm">
                          {message.role === 'assistant' && typingMessageId === message.id ? (
                            <TypingMessage
                              content={message.content}
                              onComplete={() => setTypingMessageId(null)}
                            />
                          ) : (
                            <div className="whitespace-pre-wrap">{formatMarkdown(message.content)}</div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Loading indicator - 3 dots animation */}
                  {isLoadingMessage && (
                    <div className="w-full flex justify-start">
                      <div className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <span className="w-2 h-2 bg-gray-400 rounded-full animate-[bounce_1s_ease-in-out_0s_infinite]"></span>
                          <span className="w-2 h-2 bg-gray-400 rounded-full animate-[bounce_1s_ease-in-out_0.15s_infinite]"></span>
                          <span className="w-2 h-2 bg-gray-400 rounded-full animate-[bounce_1s_ease-in-out_0.3s_infinite]"></span>
                        </div>
                      </div>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>
              </div>

              {/* Guide Chips - Above input area */}
              {!typingMessageId && !isLoadingMessage && (
                <div className="px-4 pb-3 border-t border-gray-100 pt-3 bg-white">
                  <div className="flex flex-wrap gap-2 justify-center animate-[fadeIn_0.3s_ease-in]">
                    {[
                      "가장 세척하기 편한 제품은?",
                      "소음이 가장 적은 제품은?",
                      "휴대성이 가장 좋은 제품은?",
                      "가격 대비 가장 좋은 제품은?"
                    ].map((query, index) => (
                      <button
                        key={index}
                        onClick={() => {
                          setInputValue(query);
                          // Send message immediately
                          const userMessage = { role: 'user' as const, content: query };
                          setMessages((prev) => [...prev, userMessage]);
                          setInputValue('');
                          setIsLoadingMessage(true);

                          // Send to API
                          fetch('/api/compare-chat', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              message: query,
                              productIds: selectedProducts.map((p) => p.id),
                              conversationHistory: messages.map((m) => `${m.role}: ${m.content}`).join('\n')
                            })
                          })
                            .then((res) => res.json())
                            .then((data) => {
                              const assistantMessage = {
                                role: 'assistant' as const,
                                content: data.response,
                                id: `assistant-${Date.now()}`
                              };
                              setMessages((prev) => [...prev, assistantMessage]);
                              setTypingMessageId(assistantMessage.id);
                            })
                            .catch((error) => {
                              console.error('Failed to send message:', error);
                              const errorMessage = {
                                role: 'assistant' as const,
                                content: '죄송합니다. 오류가 발생했습니다. 다시 시도해주세요.'
                              };
                              setMessages((prev) => [...prev, errorMessage]);
                            })
                            .finally(() => {
                              setIsLoadingMessage(false);
                            });
                        }}
                        disabled={isLoadingMessage}
                        className="px-3 py-2 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-full transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {query}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Input Area */}
              <div className="p-4 bg-white">
                <div className="flex gap-2 items-end">
                  <textarea
                    ref={inputRef}
                    value={inputValue}
                    onChange={(e) => {
                      setInputValue(e.target.value);
                      // Auto-resize textarea
                      e.target.style.height = 'auto';
                      e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
                    }}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    placeholder="메시지를 입력하세요..."
                    disabled={isLoadingMessage}
                    rows={1}
                    className="flex-1 min-h-12 max-h-[120px] px-4 py-3 border border-gray-300 rounded-3xl focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 resize-none overflow-y-auto scrollbar-hide text-gray-900"
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={!inputValue.trim() || isLoadingMessage}
                    className="w-12 h-12 text-white rounded-full flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:opacity-90"
                    style={{ backgroundColor: '#0074F3' }}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                    </svg>
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

export default function ComparePage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center">로딩 중...</div>}>
      <ComparePageContent />
    </Suspense>
  );
}
