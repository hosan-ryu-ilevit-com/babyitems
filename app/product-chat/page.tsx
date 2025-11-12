'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { CaretLeft, PaperPlaneRight } from '@phosphor-icons/react/dist/ssr';
import Image from 'next/image';
import Link from 'next/link';
import { products } from '@/data/products';
import { Product } from '@/types';
import { logPageView, logButtonClick } from '@/lib/logging/clientLogger';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  productRecommendation?: Product; // AI가 다른 상품을 추천할 때
}

// 마크다운 볼드 및 리스트 처리 함수 (chat 페이지와 동일)
function formatMarkdown(text: string) {
  const lines = text.split('\n');

  return lines.map((line, lineIndex) => {
    // 리스트 아이템 감지
    const listMatch = line.match(/^[\s]*[-*•]\s+(.+)$/);

    if (listMatch) {
      const content = listMatch[1];
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
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-sky-200 mt-2 shrink-0" />
          <span className="flex-1">{formattedContent}</span>
        </div>
      );
    }

    // 일반 텍스트 (볼드 처리)
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

// 타이핑 이펙트 컴포넌트 (chat 페이지와 동일)
function TypingMessage({ content, onComplete }: { content: string; onComplete?: () => void }) {
  const [displayedContent, setDisplayedContent] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (currentIndex < content.length) {
      const timeout = setTimeout(() => {
        setDisplayedContent(content.slice(0, currentIndex + 1));
        setCurrentIndex(currentIndex + 1);
      }, 10);

      return () => clearTimeout(timeout);
    } else if (onComplete) {
      onComplete();
    }
  }, [currentIndex, content, onComplete]);

  return <>{formatMarkdown(displayedContent)}</>;
}

// 예시 질문들
const EXAMPLE_QUESTIONS = [
  '이 제품의 단점을 요약해줘',
  '비슷한데 더 저렴한 상품 있어?',
  '세척이 더 편한 제품 추천해줘',
  '쌍둥이 육아에 적합한지 알려줘',
];

function ProductChatContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const productId = searchParams.get('productId');
  const [product, setProduct] = useState<Product | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [typingMessageIndex, setTypingMessageIndex] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const initializedRef = useRef<string | null>(null); // 초기화 추적용

  // 페이지 뷰 로깅
  useEffect(() => {
    logPageView('product-chat');
  }, []);

  // 제품 로드
  useEffect(() => {
    if (productId && initializedRef.current !== productId) {
      // 이미 초기화된 productId면 스킵
      initializedRef.current = productId;

      const foundProduct = products.find((p) => p.id === productId);
      if (foundProduct) {
        setProduct(foundProduct);
        // 초기 메시지 (사용자가 입력한 것처럼)
        setMessages([
          {
            role: 'user',
            content: '이 상품에 대해 자세히 설명해줘',
          },
        ]);
        // AI 응답 생성
        handleInitialResponse(foundProduct);
      } else {
        alert('상품을 찾을 수 없습니다.');
        router.back();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  // 스크롤 자동 이동
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 초기 AI 응답
  const handleInitialResponse = async (prod: Product) => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/product-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'initial_description',
          productId: prod.id,
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();

      setMessages((prev) => {
        const newMessages = [
          ...prev,
          {
            role: 'assistant' as const,
            content: data.message,
          },
        ];
        // 새 메시지 추가 후 바로 인덱스 설정
        setTimeout(() => setTypingMessageIndex(newMessages.length - 1), 0);
        return newMessages;
      });
    } catch (error) {
      console.error('Failed to get initial response:', error);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: '상품 정보를 불러오는 중 오류가 발생했습니다.',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  // 메시지 전송
  const handleSendMessage = async () => {
    if (!inputValue.trim() || !product) return;

    const userMessage = inputValue.trim();
    setInputValue('');
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const response = await fetch('/api/product-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'chat',
          productId: product.id,
          userMessage,
          conversationHistory: messages,
        }),
      });

      const data = await response.json();

      // 다른 상품 추천이 있는 경우
      if (data.recommendedProduct) {
        const recommendedProd = products.find((p) => p.id === data.recommendedProduct.productId);
        setMessages((prev) => {
          const newMessages: Message[] = [
            ...prev,
            {
              role: 'assistant' as const,
              content: data.message,
              productRecommendation: recommendedProd,
            },
          ];
          // 새 메시지 추가 후 바로 인덱스 설정
          setTimeout(() => setTypingMessageIndex(newMessages.length - 1), 0);
          return newMessages;
        });
      } else {
        setMessages((prev) => {
          const newMessages: Message[] = [
            ...prev,
            {
              role: 'assistant' as const,
              content: data.message,
            },
          ];
          // 새 메시지 추가 후 바로 인덱스 설정
          setTimeout(() => setTypingMessageIndex(newMessages.length - 1), 0);
          return newMessages;
        });
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: '메시지를 처리하는 중 오류가 발생했습니다.',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  // 예시 질문 클릭
  const handleExampleClick = (question: string) => {
    setInputValue(question);
    inputRef.current?.focus();
  };

  // 추천 상품 클릭
  const handleRecommendedProductClick = (prod: Product) => {
    logButtonClick(`추천 상품 클릭: ${prod.title}`, 'product-chat');
    router.push(`/product-chat?productId=${prod.id}`);
  };

  if (!product) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4"></div>
          <p className="text-gray-600">제품 정보를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100">
      <div className="relative w-full max-w-[480px] min-h-screen bg-white shadow-lg flex flex-col">
        {/* Fixed Header with Product Info */}
        <header className="fixed top-0 left-0 right-0 bg-white border-b border-gray-200 px-4 py-3 z-20" style={{ maxWidth: '480px', margin: '0 auto' }}>
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => router.push('/result')}
              className="text-gray-600 hover:text-gray-900 transition-colors"
            >
              <CaretLeft size={24} weight="bold" />
            </button>
            <h1 className="text-base font-bold text-gray-900">상품 질문하기</h1>
            <div className="w-6"></div>
          </div>

          {/* Product Info Card */}
          <div className="flex gap-3 bg-gray-50 rounded-xl p-3">
            <div className="w-16 h-16 rounded-lg overflow-hidden shrink-0 bg-gray-100">
              {product.thumbnail && (
                <Image
                  src={product.thumbnail}
                  alt={product.title}
                  width={64}
                  height={64}
                  className="w-full h-full object-cover"
                />
              )}
            </div>
            <div className="flex-1 min-w-0 flex flex-col justify-between">
              <h3 className="text-sm font-bold text-gray-900 line-clamp-2 leading-tight">
                {product.title}
              </h3>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-gray-900">
                  {product.price.toLocaleString()}원
                </p>
                <button
                  onClick={() => {
                    logButtonClick(`쿠팡에서 보기: ${product.title}`, 'product-chat');
                    window.open(product.reviewUrl, '_blank');
                  }}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 transition-all whitespace-nowrap"
                >
                  쿠팡에서 보기
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Spacer for fixed header */}
        <div className="h-[140px]"></div>

        {/* Messages */}
        <main className="flex-1 px-4 py-4 overflow-y-auto pb-32">
          <AnimatePresence initial={false}>
            {messages.map((message, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className={`mb-4 w-full flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`${message.role === 'user' ? 'max-w-[90%]' : ''} px-4 py-3 whitespace-pre-wrap ${
                    message.role === 'user'
                      ? 'bg-gray-100 text-gray-900 rounded-tl-2xl rounded-tr-md rounded-bl-2xl rounded-br-2xl'
                      : 'text-gray-900 rounded-tl-md rounded-tr-2xl rounded-bl-2xl rounded-br-2xl'
                  }`}
                >
                  {typingMessageIndex === index && message.role === 'assistant' ? (
                    <TypingMessage
                      content={message.content}
                      onComplete={() => setTypingMessageIndex(null)}
                    />
                  ) : (
                    formatMarkdown(message.content)
                  )}

                  {/* 추천 상품 카드 */}
                  {message.productRecommendation && typingMessageIndex !== index && (
                    <div className="mt-3 bg-white rounded-xl p-3 border border-gray-200">
                      <div className="flex gap-3 mb-3">
                        <div className="w-16 h-16 rounded-lg overflow-hidden shrink-0 bg-gray-50">
                          {message.productRecommendation.thumbnail && (
                            <Image
                              src={message.productRecommendation.thumbnail}
                              alt={message.productRecommendation.title}
                              width={64}
                              height={64}
                              className="w-full h-full object-cover"
                            />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-bold text-gray-900 line-clamp-2 leading-tight mb-1">
                            {message.productRecommendation.title}
                          </h4>
                          <p className="text-xs font-semibold text-gray-900">
                            {message.productRecommendation.price.toLocaleString()}원
                          </p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => window.open(message.productRecommendation!.reviewUrl, '_blank')}
                          className="py-2 text-xs font-semibold rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-all"
                        >
                          쿠팡에서 보기
                        </button>
                        <button
                          onClick={() => handleRecommendedProductClick(message.productRecommendation!)}
                          className="py-2 text-xs font-semibold rounded-lg bg-gray-900 hover:bg-gray-800 text-white transition-all"
                        >
                          이 상품 질문하기
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Loading indicator */}
          {isLoading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex justify-start mb-4"
            >
              <div className="bg-gray-100 px-4 py-3 rounded-2xl">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
              </div>
            </motion.div>
          )}

          {/* 예시 질문 (첫 메시지 이후) */}
          {messages.length > 1 && messages.length < 5 && !isLoading && (
            <div className="mt-6 mb-4">
              <p className="text-xs text-gray-500 mb-2 font-semibold">💡 이런 질문을 해보세요</p>
              <div className="space-y-2">
                {EXAMPLE_QUESTIONS.map((question, index) => (
                  <button
                    key={index}
                    onClick={() => handleExampleClick(question)}
                    className="w-full px-3 py-2 text-left text-sm text-gray-700 bg-white border border-gray-200 rounded-lg hover:border-gray-400 hover:bg-gray-50 transition-all"
                  >
                    {question}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </main>

        {/* Fixed Input */}
        <footer className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-4"
          style={{ maxWidth: '480px', margin: '0 auto' }}
        >
          <div className="flex gap-2">
            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder="궁금한 점을 물어보세요..."
              className="flex-1 px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 text-sm resize-none"
              style={{ fontSize: '16px' }}
              rows={1}
              disabled={isLoading}
            />
            <button
              onClick={handleSendMessage}
              disabled={!inputValue.trim() || isLoading}
              className={`px-4 py-3 rounded-xl transition-all ${
                inputValue.trim() && !isLoading
                  ? 'bg-gray-900 hover:bg-gray-800 text-white'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              <PaperPlaneRight size={20} weight="bold" />
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default function ProductChatPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4"></div>
          <p className="text-gray-600">로딩 중...</p>
        </div>
      </div>
    }>
      <ProductChatContent />
    </Suspense>
  );
}
