'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import type { GuideCardsData, GuideProConItem, GuideTradeoff } from '@/types/recommend-v2';

interface GuideCardsProps {
  data: GuideCardsData;
  introMessage?: string;
  onNext?: () => void;
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
export function GuideCards({ data, introMessage, onNext }: GuideCardsProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(0);

  // 탭 형식: 만족 포인트 / 주의점 두 개만
  const [activeTab, setActiveTab] = useState<'pros' | 'cons'>('pros');

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
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="pb-24"
    >
      {/* 인트로 메시지 */}
      {introMessage && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="mb-4"
        >
          <p className="text-gray-900 text-base leading-relaxed whitespace-pre-wrap">
            {introMessage}
          </p>
        </motion.div>
      )}

      {/* 탭 UI (topPros/topCons 데이터가 있을 때) */}
      {hasTabData && (
        <>
          {/* 탭 버튼 */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setActiveTab('pros')}
              className={`flex-1 py-2.5 px-4 rounded-full text-sm font-medium transition-all ${
                activeTab === 'pros'
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              만족 포인트
            </button>
            <button
              onClick={() => setActiveTab('cons')}
              className={`flex-1 py-2.5 px-4 rounded-full text-sm font-medium transition-all ${
                activeTab === 'cons'
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              주의점
            </button>
          </div>

          {/* 탭 콘텐츠 */}
          <div className="bg-white rounded-2xl border border-blue-100 overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, x: activeTab === 'pros' ? -20 : 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: activeTab === 'pros' ? 20 : -20 }}
                transition={{ duration: 0.2 }}
                className="p-5 min-h-[280px]"
              >
                {activeTab === 'pros' ? (
                  <div className="space-y-4">
                    {prosItems.map((item, i) => (
                      <div key={i} className="flex items-start gap-3">
                        <span className="text-green-500 mt-0.5">✓</span>
                        <div className="flex-1">
                          <p className="text-gray-800 text-[15px] leading-relaxed">{item.text}</p>
                          {item.mentionRate && (
                            <span className="inline-flex items-center mt-2 px-2.5 py-1 rounded-full bg-blue-50 text-blue-600 text-xs font-medium">
                              {item.mentionRate}% 만족
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                    {prosItems.length === 0 && (
                      <p className="text-gray-400 text-center py-8">데이터가 없습니다</p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {consItems.map((item, i) => (
                      <div key={i} className="flex items-start gap-3">
                        <span className="text-rose-400 mt-0.5">!</span>
                        <div className="flex-1">
                          <p className="text-gray-800 text-[15px] leading-relaxed">{item.text}</p>
                          {item.dealBreakerFor && (
                            <span className="inline-flex items-center mt-2 px-2.5 py-1 rounded-full bg-rose-50 text-rose-500 text-xs font-medium">
                              {item.dealBreakerFor}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                    {consItems.length === 0 && (
                      <p className="text-gray-400 text-center py-8">데이터가 없습니다</p>
                    )}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </>
      )}

      {/* Fallback 카드 UI (탭 데이터 없을 때만) */}
      {!hasTabData && currentCard && (
        <>
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
                <div className="bg-white rounded-2xl border border-blue-100 overflow-hidden">
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
        </>
      )}

      {/* 플로팅 다음 버튼 */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-linear-to-t from-white via-white to-transparent z-50">
        <div className="max-w-md mx-auto">
          <button
            onClick={() => onNext?.()}
            className="w-full py-4 rounded-2xl bg-[#0084FE] text-white font-semibold text-base hover:bg-[#0074E0] active:scale-[0.98] transition-all shadow-lg shadow-[#0084FE]/25"
          >
            시작하기
          </button>
        </div>
      </div>
    </motion.div>
  );
}
