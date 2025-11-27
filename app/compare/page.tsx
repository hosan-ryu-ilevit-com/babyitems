'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { products } from '@/data/products';
import { Product, Recommendation } from '@/types';
import { logComparisonChat, logPageView } from '@/lib/logging/clientLogger';
import { ChatInputBar } from '@/components/ChatInputBar';
import DetailedComparisonTable from '@/components/DetailedComparisonTable';

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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [selectedProducts, setSelectedProducts] = useState<Product[]>([]);
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string; id?: string }>>([]);
  const [inputValue, setInputValue] = useState('');
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

  // Convert to Recommendation[] for DetailedComparisonTable
  const recommendations: Recommendation[] = selectedProducts.map((product, index) => ({
    product,
    rank: (productRanks[product.id] || (index + 1)) as 1 | 2 | 3 | 4,
    finalScore: productScores[product.id] || 0,
    personalizedReason: { strengths: [], weaknesses: [] },
    comparison: [],
    additionalConsiderations: ''
  }));

  useEffect(() => {
    const productIds = searchParams.get('products')?.split(',') || [];

    if (productIds.length < 3 || productIds.length > 4) {
      // Redirect back if not 3-4 products
      router.push('/');
      return;
    }

    const foundProducts = productIds
      .map((id) => products.find((p) => p.id === id))
      .filter((p): p is Product => p !== undefined);

    if (foundProducts.length < 3 || foundProducts.length > 4) {
      router.push('/');
      return;
    }

    setSelectedProducts(foundProducts);

    // Log page view
    logPageView('compare');

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
      }
    };

    fetchProductDetails();
  }, [searchParams, router]);

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoadingMessage) return;

    const userMessage = inputValue.trim();
    const messageId = Date.now().toString();

    // Add user message
    setMessages((prev) => [...prev, { role: 'user', content: userMessage, id: `user-${messageId}` }]);
    setInputValue('');
    setIsLoadingMessage(true);

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

      // Log comparison chat
      logComparisonChat(
        'home',
        selectedProducts.map(p => p.id),
        userMessage,
        data.response
      );

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
              <h1 className="text-lg font-bold text-gray-900">상세 비교표</h1>

            </div>
            <div className="w-10" /> {/* Spacer */}
          </div>

          {/* Comparison Table */}
          <div className="p-4 pb-32">
            <DetailedComparisonTable
              recommendations={recommendations}
              cachedDetails={productDetails}
              showRankBadge={false}
              showScore={false}
            />
          </div>
        </div>

        {/* 플로팅 ChatInputBar - 하단 고정 */}
        {!isChatOpen && (
          <div className="fixed bottom-0 left-0 right-0 max-w-[480px] mx-auto w-full px-3 py-4 bg-white border-t border-gray-200 z-30">
            <ChatInputBar
              value=""
              onChange={() => {}} // 더미 함수 (실제 입력은 바텀시트에서)
              onSend={() => {}} // 더미 함수
              placeholder="제품 비교 질문하기"
              disabled={false}
              onFocus={() => {
                setIsChatOpen(true);
              }}
            />
          </div>
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
                        <div className="text-base">
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
                <ChatInputBar
                  value={inputValue}
                  onChange={setInputValue}
                  onSend={handleSendMessage}
                  placeholder="비교하는 질문을 입력해보세요"
                  disabled={isLoadingMessage}
                />
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
