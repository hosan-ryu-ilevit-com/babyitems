'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { GuideCardsData } from '@/types/recommend-v2';

interface GuideCardsProps {
  data: GuideCardsData;
  introMessage?: string;
  onNext?: () => void;  // 다음 버튼 클릭 시 호출
}

interface CardData {
  id: string;
  type: 'summary' | 'points' | 'trend';
  title: string;
  content: string | string[];
  icon: React.ReactNode;
  bgGradient: string;
  iconBg: string;
  accentColor: string;
}

/**
 * 가이드 카드 캐러셀
 * - 세로로 긴 글래스모피즘 카드
 * - 다음 버튼으로 카드 전환 + 최종 진행
 */
export function GuideCards({ data, introMessage, onNext }: GuideCardsProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(0);

  // 카드 데이터 구성
  const cards: CardData[] = useMemo(() => {
    const cardList: CardData[] = [];

    // 1. 핵심 선택 기준 카드 (summary)
    if (data.summary && data.summary.trim()) {
      cardList.push({
        id: 'summary',
        type: 'summary',
        title: '핵심 선택 기준',
        content: data.summary,
        icon: (
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ),
        bgGradient: 'from-blue-400 via-blue-500 to-indigo-600',
        iconBg: 'bg-white/20',
        accentColor: 'blue',
      });
    }

    // 2. 선택 가이드 카드 (points)
    if (data.points && data.points.length > 0) {
      cardList.push({
        id: 'points',
        type: 'points',
        title: data.title || '선택 가이드',
        content: data.points,
        icon: (
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        ),
        bgGradient: 'from-purple-400 via-purple-500 to-pink-600',
        iconBg: 'bg-white/20',
        accentColor: 'purple',
      });
    }

    // 3. 트렌드 카드 (trend)
    if (data.trend && data.trend.trim()) {
      cardList.push({
        id: 'trend',
        type: 'trend',
        title: '요즘 트렌드',
        content: data.trend,
        icon: (
          <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" clipRule="evenodd" />
          </svg>
        ),
        bgGradient: 'from-amber-400 via-orange-500 to-red-500',
        iconBg: 'bg-white/20',
        accentColor: 'amber',
      });
    }

    return cardList;
  }, [data]);

  // 카드가 없으면 렌더링하지 않음
  if (cards.length === 0) return null;

  const currentCard = cards[currentIndex];
  const isLastCard = currentIndex === cards.length - 1;

  // 다음 버튼 클릭 핸들러
  const handleNext = () => {
    if (isLastCard) {
      // 마지막 카드에서는 다음 단계로 진행
      onNext?.();
    } else {
      // 다음 카드로 이동
      setDirection(1);
      setCurrentIndex(prev => prev + 1);
    }
  };

  // 슬라이드 애니메이션 variants
  const slideVariants = {
    enter: (dir: number) => ({
      x: dir > 0 ? 100 : -100,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (dir: number) => ({
      x: dir < 0 ? 100 : -100,
      opacity: 0,
    }),
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-4"
    >
      {/* 인트로 메시지 (말풍선 스타일, 왼쪽 정렬) */}
      {introMessage && (
        <div className="flex justify-start">
          <div className="relative max-w-[85%] bg-white rounded-2xl rounded-tl-md px-4 py-3 shadow-sm border border-gray-100">
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
              {introMessage}
            </p>
            {/* 말풍선 꼬리 */}
            <div className="absolute -left-2 top-3 w-3 h-3 bg-white border-l border-t border-gray-100 transform -rotate-45" />
          </div>
        </div>
      )}

      {/* 카드 영역 */}
      <div className="relative h-[320px] overflow-hidden">
        <AnimatePresence initial={false} custom={direction} mode="wait">
          <motion.div
            key={currentCard.id}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{
              x: { type: 'spring', stiffness: 300, damping: 30 },
              opacity: { duration: 0.2 },
            }}
            className="absolute inset-0"
          >
            {/* 그라데이션 카드 */}
            <div
              className={`h-full rounded-3xl p-6 bg-gradient-to-br ${currentCard.bgGradient} shadow-xl relative overflow-hidden`}
            >
              {/* 배경 장식 */}
              <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
              <div className="absolute bottom-0 left-0 w-32 h-32 bg-black/5 rounded-full translate-y-1/2 -translate-x-1/2" />

              {/* 카드 헤더 */}
              <div className="relative z-10 flex items-center gap-3 mb-5">
                <div className={`w-12 h-12 rounded-2xl ${currentCard.iconBg} backdrop-blur-sm flex items-center justify-center`}>
                  {currentCard.icon}
                </div>
                <div>
                  <h3 className="font-bold text-white text-lg">{currentCard.title}</h3>
                  <p className="text-white/70 text-xs">{currentIndex + 1} / {cards.length}</p>
                </div>
              </div>

              {/* 카드 내용 */}
              <div className="relative z-10 bg-white/15 backdrop-blur-sm rounded-2xl p-4 min-h-[160px]">
                {currentCard.type === 'points' && Array.isArray(currentCard.content) ? (
                  <ul className="space-y-3">
                    {(currentCard.content as string[]).map((point, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <span className="w-6 h-6 rounded-full bg-white/30 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                          {i + 1}
                        </span>
                        <span className="text-white text-sm leading-relaxed">{point}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-white text-sm leading-relaxed">
                    {currentCard.content as string}
                  </p>
                )}
              </div>

              {/* 인디케이터 */}
              {cards.length > 1 && (
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2">
                  {cards.map((_, index) => (
                    <div
                      key={index}
                      className={`h-1.5 rounded-full transition-all duration-300 ${
                        index === currentIndex
                          ? 'w-6 bg-white'
                          : 'w-1.5 bg-white/40'
                      }`}
                    />
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* 다음 버튼 */}
      <motion.button
        onClick={handleNext}
        whileTap={{ scale: 0.98 }}
        className="w-full py-4 bg-gray-900 text-white font-semibold rounded-2xl flex items-center justify-center gap-2 hover:bg-gray-800 transition-colors"
      >
        <span>{isLastCard ? '시작하기' : '다음'}</span>
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </motion.button>

      {/* 분석 기반 알림 */}
      <div className="flex items-center justify-center gap-2 py-1 text-xs text-gray-400">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
        <span>실제 구매자 리뷰 분석 기반</span>
      </div>
    </motion.div>
  );
}
