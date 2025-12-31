'use client';

import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import Image from 'next/image';
import type { GuideCardsData, GuideProConItem, GuideTradeoff } from '@/types/recommend-v2';

interface GuideCardsProps {
  data: GuideCardsData;
  introMessage?: string;
  onNext?: () => void;
  isActive?: boolean; // 활성 상태일 때만 플로팅 버튼 표시
  enableTyping?: boolean; // 타이핑 애니메이션 활성화 여부
  onTabChange?: (tab: 'pros' | 'cons', tabLabel: string) => void; // 탭 변경 시 콜백 (로깅용)
  onToggle?: (type: 'pros' | 'cons', isOpen: boolean) => void; // 토글 열기/닫기 시 콜백 (로깅용)
  disabled?: boolean; // 버튼 비활성화 (로딩 중 클릭 방지)
  categoryName?: string; // 카테고리 이름 (토글 제목에 표시)
}

interface CardData {
  id: string;
  type: 'must-check' | 'avoid' | 'dilemma' | 'summary' | 'points' | 'trend';
  title: string;
  subtitle?: string;
  content: GuideProConItem[] | GuideTradeoff | string | string[];
}

/**
 * 가이드 카드 캐러셀
 * - 심플한 디자인
 * - 최대 높이 제한 + 스크롤
 * - 플로팅 다음 버튼
 */
// 썸네일 그룹 컴포넌트 (로딩 완료 순으로 왼쪽 배치)
function ThumbnailGroup({ thumbnails }: { thumbnails: string[] }) {
  const [loadedUrls, setLoadedUrls] = useState<Set<string>>(new Set());

  const handleLoad = (url: string) => {
    setLoadedUrls(prev => new Set([...prev, url]));
  };

  // 로딩 완료된 것을 앞으로, 아직 로딩 중인 것을 뒤로
  const sortedThumbnails = useMemo(() => {
    const loaded = thumbnails.filter(url => loadedUrls.has(url));
    const loading = thumbnails.filter(url => !loadedUrls.has(url));
    return [...loaded, ...loading];
  }, [thumbnails, loadedUrls]);

  return (
    <div className="flex -space-x-2">
      {sortedThumbnails.map((thumb, i) => {
        const isLoaded = loadedUrls.has(thumb);
        return (
          <motion.div
            key={thumb}
            layout
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ layout: { duration: 0.3 }, opacity: { duration: 0.2 } }}
            className="w-[26px] h-[26px] rounded-full border border-gray-200 overflow-hidden relative"
            style={{ zIndex: i }}
          >
            {/* 스켈레톤 shimmer */}
            {!isLoaded && (
              <div className="absolute inset-0 bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 animate-shimmer" />
            )}
            <Image
              src={thumb}
              alt=""
              fill
              className={`object-cover transition-opacity duration-300 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
              sizes="32px"
              loading="eager"
              unoptimized
              onLoad={() => handleLoad(thumb)}
            />
          </motion.div>
        );
      })}
    </div>
  );
}

// 스트리밍 텍스트 컴포넌트 (글자가 하나씩 나타남)
function StreamingText({ content, speed = 15, onComplete }: { content: string; speed?: number; onComplete?: () => void }) {
  const [displayedContent, setDisplayedContent] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (!content) {
      if (onComplete) onComplete();
      return;
    }

    if (currentIndex < content.length) {
      const timeout = setTimeout(() => {
        setDisplayedContent(content.slice(0, currentIndex + 1));
        setCurrentIndex(currentIndex + 1);
      }, speed);

      return () => clearTimeout(timeout);
    } else if (onComplete) {
      onComplete();
    }
  }, [currentIndex, content, speed, onComplete]);

  return <span className="whitespace-pre-wrap">{displayedContent}</span>;
}

export function GuideCards({ data, introMessage, onNext, isActive = true, enableTyping = true, onTabChange, onToggle, disabled = false, categoryName }: GuideCardsProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(0);
  const [isTypingComplete, setIsTypingComplete] = useState(!enableTyping);

  // 순차적 애니메이션 상태
  const [showThumbnails, setShowThumbnails] = useState(false);
  const [showProsToggle, setShowProsToggle] = useState(false);
  const [showConsToggle, setShowConsToggle] = useState(false);
  const [showFloatingButton, setShowFloatingButton] = useState(false);

  // 토글 형식: 각각 독립적으로 열고 닫을 수 있음 (기본: 접힘)
  const [isProsOpen, setIsProsOpen] = useState(false);
  const [isConsOpen, setIsConsOpen] = useState(false);

  // 순차적 애니메이션 트리거 (더 느린 타이밍)
  useEffect(() => {
    if (!isTypingComplete) return;

    // 타이핑 완료 후 → 썸네일 표시 (0.5초 후)
    const thumbnailTimer = setTimeout(() => {
      setShowThumbnails(true);
    }, 500);

    // 썸네일 후 → 구매/불만 포인트 토글 동시 표시 (1.0초 후)
    const toggleTimer = setTimeout(() => {
      setShowProsToggle(true);
      setShowConsToggle(true);
    }, 1000);

    // 토글 후 → 플로팅 버튼 표시 (1.5초 후)
    const buttonTimer = setTimeout(() => {
      setShowFloatingButton(true);
    }, 1500);

    return () => {
      clearTimeout(thumbnailTimer);
      clearTimeout(toggleTimer);
      clearTimeout(buttonTimer);
    };
  }, [isTypingComplete]);

  const hasPros = data.topPros && data.topPros.length > 0;
  const hasCons = data.topCons && data.topCons.length > 0;
  const hasTabData = hasPros || hasCons;

  // Fallback용 카드 (탭 데이터가 없을 때만 사용)
  const cards: CardData[] = useMemo(() => {
    if (hasTabData) return []; // 탭 데이터가 있으면 카드 사용 안 함

    const cardList: CardData[] = [];

    if (data.summary && data.summary.trim()) {
      cardList.push({
        id: 'summary',
        type: 'summary',
        title: '핵심 포인트',
        content: data.summary,
      });
    }

    if (data.points && data.points.length > 0) {
      cardList.push({
        id: 'points',
        type: 'points',
        title: data.title || '선택 가이드',
        content: data.points,
      });
    }

    if (data.trend && data.trend.trim()) {
      cardList.push({
        id: 'trend',
        type: 'trend',
        title: '요즘 트렌드',
        content: data.trend,
      });
    }

    return cardList;
  }, [data, hasTabData]);

  // 탭 데이터도 없고 카드 데이터도 없으면 렌더링 안 함
  if (!hasTabData && cards.length === 0) return null;

  // 탭 UI용 데이터
  const prosItems = data.topPros || [];
  const consItems = data.topCons || [];

  // Fallback 카드용 (탭 데이터 없을 때)
  const currentCard = cards.length > 0 ? cards[currentIndex] : null;
  const isLastCard = currentIndex === cards.length - 1;
  const isFirstCard = currentIndex === 0;

  const handlePrev = () => {
    if (!isFirstCard) {
      setDirection(-1);
      setCurrentIndex(prev => prev - 1);
    }
  };

  const handleNextCard = () => {
    if (!isLastCard) {
      setDirection(1);
      setCurrentIndex(prev => prev + 1);
    }
  };

  const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const threshold = 50;
    if (info.offset.x < -threshold && !isLastCard) handleNextCard();
    else if (info.offset.x > threshold && !isFirstCard) handlePrev();
  };

  const renderCardContent = (card: CardData) => {
    switch (card.type) {
      case 'must-check':
        const pros = card.content as GuideProConItem[];
        return (
          <div className="space-y-4">
            {pros.map((pro, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className="text-green-500 mt-0.5">✓</span>
                <div className="flex-1">
                  <p className="text-gray-800 text-[15px] leading-relaxed">{pro.text}</p>
                  {pro.mentionRate && (
                    <span className="inline-flex items-center mt-2 px-2.5 py-1 rounded-full bg-blue-50 text-blue-600 text-xs font-medium">
                      {pro.mentionRate}% 만족
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        );

      case 'avoid':
        const cons = card.content as GuideProConItem[];
        return (
          <div className="space-y-4">
            {cons.map((con, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className="text-rose-400 mt-0.5">!</span>
                <div className="flex-1">
                  <p className="text-gray-800 text-[15px] leading-relaxed">{con.text}</p>
                  {con.dealBreakerFor && (
                    <span className="inline-flex items-center mt-2 px-2.5 py-1 rounded-full bg-rose-50 text-rose-500 text-xs font-medium">
                      {con.dealBreakerFor}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        );

      case 'dilemma':
        const tradeoff = card.content as GuideTradeoff;
        return (
          <div className="space-y-4">
            <div className="p-4 bg-gray-50 rounded-2xl">
              <p className="text-gray-800 text-[15px] leading-relaxed">
                {tradeoff.optionA}
              </p>
            </div>
            <div className="text-center text-gray-300 text-sm font-medium">vs</div>
            <div className="p-4 bg-gray-50 rounded-2xl">
              <p className="text-gray-800 text-[15px] leading-relaxed">
                {tradeoff.optionB}
              </p>
            </div>
          </div>
        );

      case 'points':
        const points = card.content as string[];
        return (
          <div className="space-y-3">
            {points.map((point, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className="text-gray-400">{i + 1}.</span>
                <span className="text-gray-700 text-[15px] leading-relaxed">{point}</span>
              </div>
            ))}
          </div>
        );

      default:
        return (
          <p className="text-gray-700 text-[15px] leading-relaxed">
            {card.content as string}
          </p>
        );
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="pb-24"
    >
      {/* 인트로 메시지 - AssistantMessage 스타일과 동일하게 (스트리밍) */}
      {introMessage && (
        <motion.div
          initial={{ opacity: 0, y: 0 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="w-full mb-4"
        >
          <div className="w-full flex justify-start">
            <div className="py-1 rounded-tl-md rounded-tr-2xl rounded-bl-2xl rounded-br-2xl text-base text-gray-900 font-medium leading-[1.4]">
              {enableTyping ? (
                <StreamingText
                  content={introMessage}
                  speed={20}
                  onComplete={() => setIsTypingComplete(true)}
                />
              ) : (
                introMessage
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* 토글 UI (topPros/topCons 데이터가 있을 때) - 순차적 페이드인 */}
      {hasTabData && (
        <div className="flex flex-col gap-3">
          {/* 썸네일 + 분석 완료 태그 */}
          <AnimatePresence>
            {showThumbnails && data.productThumbnails && data.productThumbnails.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                className="flex items-center gap-3 mb-1"
              >
                <ThumbnailGroup thumbnails={data.productThumbnails.slice(0, 5)} />
                {data.analyzedReviewCount && (
                  <span className="px-2.5 py-1 bg-gray-50 text-gray-500 text-[14px] font-medium rounded-full">
                    리뷰 {data.analyzedReviewCount.toLocaleString()}개 분석 완료
                  </span>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* 주요 구매 포인트 토글 */}
          <AnimatePresence>
            {showProsToggle && hasPros && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
              >
                <button
                  onClick={() => {
                    const newState = !isProsOpen;
                    setIsProsOpen(newState);
                    onToggle?.('pros', newState);
                    onTabChange?.('pros', `${categoryName || ''} 주요 만족 포인트`);
                  }}
                  className={`w-full px-4 py-3 rounded-xl border-2 transition-all text-left ${
                    isProsOpen
                      ? 'border-green-400 bg-green-50'
                      : 'border-gray-100 bg-white hover:border-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-green-500 font-bold w-4 text-center">✓</span>
                      <span className={`text-sm font-semibold ${isProsOpen ? 'text-green-700' : 'text-gray-700'}`}>
                        {categoryName && <span className="font-bold">{categoryName}</span>} 주요 만족 포인트
                      </span>
                    </div>
                    <motion.svg
                      animate={{ rotate: isProsOpen ? 180 : 0 }}
                      transition={{ duration: 0.2 }}
                      className={`w-4 h-4 ${isProsOpen ? 'text-green-500' : 'text-gray-400'}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </motion.svg>
                  </div>
                </button>
                <AnimatePresence>
                  {isProsOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-2 p-4 bg-white rounded-xl border border-gray-100">
                        <div className="space-y-3">
                          {prosItems.map((item, i) => (
                            <div key={i} className="flex items-start gap-2">
                              <span className="text-green-500 text-sm mt-0.5">✓</span>
                              <div className="flex-1">
                                <p className="text-gray-800 text-sm leading-relaxed">{item.text}</p>
                                {item.mentionRate && (
                                  <span className="inline-flex items-center mt-1.5 px-2 py-0.5 rounded-full bg-green-100 text-green-600 text-xs">
                                    {item.mentionRate}% 만족
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 주요 불만 포인트 토글 */}
          <AnimatePresence>
            {showConsToggle && hasCons && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
              >
                <button
                  onClick={() => {
                    const newState = !isConsOpen;
                    setIsConsOpen(newState);
                    onToggle?.('cons', newState);
                    onTabChange?.('cons', `${categoryName || ''} 주요 불만 포인트`);
                  }}
                  className={`w-full px-4 py-3 rounded-xl border-2 transition-all text-left ${
                    isConsOpen
                      ? 'border-rose-400 bg-rose-50'
                      : 'border-gray-100 bg-white hover:border-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-rose-400 font-bold w-4 text-center">!</span>
                      <span className={`text-sm font-semibold ${isConsOpen ? 'text-rose-700' : 'text-gray-700'}`}>
                        {categoryName && <span className="font-bold">{categoryName}</span>} 주요 불만 포인트
                      </span>
                    </div>
                    <motion.svg
                      animate={{ rotate: isConsOpen ? 180 : 0 }}
                      transition={{ duration: 0.2 }}
                      className={`w-4 h-4 ${isConsOpen ? 'text-rose-500' : 'text-gray-400'}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </motion.svg>
                  </div>
                </button>
                <AnimatePresence>
                  {isConsOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-2 p-4 bg-white rounded-xl border border-gray-100">
                        <div className="space-y-3">
                          {consItems.map((item, i) => (
                            <div key={i} className="flex items-start gap-2">
                              <span className="text-rose-400 text-sm mt-0.5">!</span>
                              <div className="flex-1">
                                <p className="text-gray-800 text-sm leading-relaxed">{item.text}</p>
                                {item.dealBreakerFor && (
                                  <span className="inline-flex items-center mt-1.5 px-2 py-0.5 rounded-full bg-rose-100 text-rose-500 text-xs">
                                    {item.dealBreakerFor} 주의
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Fallback 카드 UI (탭 데이터 없을 때만) - 타이핑 완료 후 페이드인 */}
      {!hasTabData && currentCard && (
        <AnimatePresence>
          {isTypingComplete && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
            >
              <div className="relative">
                <AnimatePresence initial={false} custom={direction} mode="wait">
                  <motion.div
                    key={currentCard.id}
                    custom={direction}
                    initial={{ x: direction > 0 ? 100 : -100, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: direction < 0 ? 100 : -100, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    drag="x"
                    dragConstraints={{ left: 0, right: 0 }}
                    dragElastic={0.15}
                    onDragEnd={handleDragEnd}
                    className="cursor-grab active:cursor-grabbing"
                  >
                    <div className="bg-white rounded-2xl border border-green-100 overflow-hidden">
                      <div className="px-5 pt-5 pb-3">
                        <h3 className="font-semibold text-gray-900 text-lg text-center">
                          {currentCard.title}
                        </h3>
                      </div>
                      <div className="px-5 pb-5 min-h-[280px]">
                        {renderCardContent(currentCard)}
                      </div>
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Fallback 네비게이션 */}
              {cards.length > 1 && (
                <div className="flex items-center justify-center gap-5 mt-5">
                  <button
                    onClick={handlePrev}
                    disabled={isFirstCard}
                    className={`p-2 rounded-full transition-all ${
                      isFirstCard
                        ? 'text-gray-200 cursor-not-allowed'
                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100 active:scale-95'
                    }`}
                  >
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <div className="flex items-center gap-2">
                    {cards.map((_, idx) => (
                      <div
                        key={idx}
                        className={`h-2 rounded-full transition-all duration-300 ${
                          idx === currentIndex
                            ? 'w-6 bg-gray-800'
                            : 'w-2 bg-gray-200'
                        }`}
                      />
                    ))}
                  </div>
                  <button
                    onClick={() => {
                      if (isLastCard) {
                        setDirection(1);
                        setCurrentIndex(0);
                      } else {
                        handleNextCard();
                      }
                    }}
                    className="p-2 rounded-full text-gray-500 hover:text-gray-700 hover:bg-gray-100 active:scale-95 transition-all"
                  >
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {/* 플로팅 다음 버튼 - 순차적 애니메이션 완료 후 표시 */}
      <AnimatePresence>
        {isActive && showFloatingButton && (
          <motion.div
            initial={{ opacity: 0, y: 0 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className="fixed bottom-0 left-0 right-0 z-50"
          >
            {/* 흰색 플로팅바 배경 */}
            <div className="bg-white border-t border-gray-200 px-4 py-4" style={{ maxWidth: '480px', margin: '0 auto' }}>
              <button
                onClick={() => !disabled && onNext?.()}
                disabled={disabled}
                className={`w-full h-14 rounded-2xl font-semibold text-base transition-all ${
                  disabled
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-[#0084FE] text-white hover:bg-[#0074E0] active:scale-[0.98]'
                }`}
              >
                {disabled ? '...' : '다음'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
