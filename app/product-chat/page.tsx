'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { CaretLeft } from '@phosphor-icons/react/dist/ssr';
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
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-gray-300 mt-2 shrink-0" />
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

// 고정 예시 질문들
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
  const [showBackConfirmModal, setShowBackConfirmModal] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const initializedRef = useRef<string | null>(null); // 초기화 추적용

  // 페이지 뷰 로깅
  useEffect(() => {
    logPageView('product-chat');
  }, []);

  // 진입 경로 저장
  useEffect(() => {
    if (!productId) return;

    // URL의 from 파라미터 확인 (명시적으로 전달된 경우)
    const fromParam = searchParams.get('from');
    if (fromParam) {
      sessionStorage.setItem(`product-chat-referrer-${productId}`, fromParam);
      return;
    }

    // from 파라미터가 없으면 이미 저장된 값이 있는지 확인
    const existingReferrer = sessionStorage.getItem(`product-chat-referrer-${productId}`);
    if (!existingReferrer) {
      // 저장된 값도 없으면 기본값 설정
      sessionStorage.setItem(`product-chat-referrer-${productId}`, '/');
    }
  }, [productId, searchParams]);

  // 제품 로드 및 대화 내역 복원
  useEffect(() => {
    if (productId && initializedRef.current !== productId) {
      // 이미 초기화된 productId면 스킵
      initializedRef.current = productId;

      const foundProduct = products.find((p) => p.id === productId);
      if (foundProduct) {
        setProduct(foundProduct);

        // 저장된 대화 내역 확인
        const savedMessages = sessionStorage.getItem(`product-chat-messages-${productId}`);

        if (savedMessages) {
          // 저장된 대화 내역이 있으면 복원
          try {
            const parsedMessages = JSON.parse(savedMessages);
            setMessages(parsedMessages);
          } catch (error) {
            console.error('Failed to parse saved messages:', error);
            // 파싱 실패 시 초기 메시지 생성
            setMessages([
              {
                role: 'user',
                content: '이 상품에 대해 자세히 설명해줘',
              },
            ]);
            handleInitialResponse(foundProduct);
          }
        } else {
          // 저장된 대화 내역이 없으면 초기 메시지 생성
          setMessages([
            {
              role: 'user',
              content: '이 상품에 대해 자세히 설명해줘',
            },
          ]);
          handleInitialResponse(foundProduct);
        }
      } else {
        alert('상품을 찾을 수 없습니다.');
        router.back();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  // 대화 내역 저장 (messages 변경 시)
  useEffect(() => {
    if (productId && messages.length > 0) {
      sessionStorage.setItem(`product-chat-messages-${productId}`, JSON.stringify(messages));
    }
  }, [messages, productId]);

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

      // 초기 대화 로깅
      fetch('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: localStorage.getItem('baby_item_session_id'),
          eventType: 'product_chat_message',
          chatData: {
            productId: prod.id,
            productTitle: prod.title,
            userMessage: '이 상품에 대해 자세히 설명해줘',
            aiResponse: data.message,
            hasRecommendation: false,
            isInitialMessage: true,
          },
        }),
      }).catch(console.error);

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

      // 대화 로깅
      fetch('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: localStorage.getItem('baby_item_session_id'),
          eventType: 'product_chat_message',
          chatData: {
            productId: product.id,
            productTitle: product.title,
            userMessage,
            aiResponse: data.message,
            hasRecommendation: !!data.recommendedProduct,
            recommendedProductId: data.recommendedProduct?.productId,
          },
        }),
      }).catch(console.error);

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

  // 예시 질문 클릭 - 바로 전송
  const handleExampleClick = async (question: string) => {
    if (isLoading || !product) return;

    // 사용자 메시지 추가
    setMessages((prev) => [...prev, { role: 'user', content: question }]);
    setIsLoading(true);

    try {
      const response = await fetch('/api/product-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'chat',
          productId: product.id,
          userMessage: question,
          conversationHistory: messages,
        }),
      });

      const data = await response.json();

      // 대화 로깅 (예시 질문)
      fetch('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: localStorage.getItem('baby_item_session_id'),
          eventType: 'product_chat_message',
          chatData: {
            productId: product.id,
            productTitle: product.title,
            userMessage: question,
            aiResponse: data.message,
            hasRecommendation: !!data.recommendedProduct,
            recommendedProductId: data.recommendedProduct?.productId,
            isExampleQuestion: true,
          },
        }),
      }).catch(console.error);

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

  // 추천 상품 클릭
  const handleRecommendedProductClick = (prod: Product) => {
    logButtonClick(`추천 상품 클릭: ${prod.title}`, 'product-chat');
    // 다른 product-chat에서 온 것으로 표시
    const currentPath = `/product-chat?productId=${productId}`;
    router.push(`/product-chat?productId=${prod.id}&from=${encodeURIComponent(currentPath)}`);
  };

  // 뒤로가기 버튼 클릭 시 모달 표시
  const handleBackClick = () => {
    setShowBackConfirmModal(true);
  };

  // 실제 뒤로가기 처리
  const handleBack = () => {
    if (!productId) {
      router.push('/');
      return;
    }

    // sessionStorage에서 referrer 확인
    const savedReferrer = sessionStorage.getItem(`product-chat-referrer-${productId}`);

    if (savedReferrer) {
      // 저장된 referrer로 이동
      if (savedReferrer === '/result') {
        // Result 페이지로 직접 이동 (캐시된 추천 결과 유지)
        router.push('/result');
      } else if (savedReferrer === '/') {
        // 홈으로 이동
        router.push('/');
      } else if (savedReferrer.startsWith('/product-chat')) {
        // 다른 product-chat에서 온 경우 해당 페이지로 이동
        router.push(savedReferrer);
      } else {
        // 기타 경로
        router.push(savedReferrer);
      }
    } else {
      // referrer 정보가 없으면 홈으로
      router.push('/');
    }
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
              onClick={handleBackClick}
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
                          className="py-2 text-xs font-semibold rounded-lg transition-all hover:opacity-90 flex items-center justify-center gap-1"
                          style={{ backgroundColor: '#E5F1FF', color: '#0074F3' }}
                        >
                          <svg
                            className="w-3.5 h-3.5"
                            fill="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 22l-.394-1.433a2.25 2.25 0 00-1.423-1.423L13.25 19l1.433-.394a2.25 2.25 0 001.423-1.423L16.5 16l.394 1.433a2.25 2.25 0 001.423 1.423L19.75 19l-1.433.394a2.25 2.25 0 00-1.423 1.423z" />
                          </svg>
                          질문하기
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

          {/* 고정 예시 질문 (AI 응답 후 항상 표시) */}
          {messages.length > 1 && !isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="mt-6 mb-4"
            >
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
            </motion.div>
          )}

          <div ref={messagesEndRef} />
        </main>

        {/* Fixed Input */}
        <footer className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-4"
          style={{ maxWidth: '480px', margin: '0 auto' }}
        >
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
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder="궁금한 점을 물어보세요..."
              disabled={isLoading}
              rows={1}
              className="flex-1 min-h-12 max-h-[120px] px-4 py-3 border border-gray-300 rounded-3xl focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 resize-none overflow-y-auto scrollbar-hide text-gray-900"
            />
            <button
              onClick={handleSendMessage}
              disabled={!inputValue.trim() || isLoading}
              className="w-12 h-12 text-white rounded-full flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:opacity-90"
              style={{ backgroundColor: '#0074F3' }}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
              </svg>
            </button>
          </div>
        </footer>

        {/* 뒤로가기 확인 모달 */}
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
                      onClick={() => {
                        setShowBackConfirmModal(false);
                        logButtonClick('뒤로가기 확인 - 나가기', 'product-chat');
                        handleBack();
                      }}
                      className="flex-1 px-4 py-3 text-white font-semibold rounded-xl transition-colors"
                      style={{ backgroundColor: '#0074F3' }}
                    >
                      뒤로가기
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
