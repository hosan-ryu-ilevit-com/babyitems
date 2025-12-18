'use client';

import { useRef, useEffect, useState } from 'react';

interface CategoryItem {
  id: string;
  name: string;
  emoji: string;
  isPopular?: boolean;
}

// 인기 카테고리: 기저귀, 분유, 젖병, 분유제조기, 분유포트, 유모차, 카시트
const ALL_CATEGORIES: CategoryItem[] = [
  // Row 1 - 인기 카테고리만
  { id: 'diaper', name: '기저귀', emoji: '🧒', isPopular: true },
  { id: 'formula', name: '분유', emoji: '🥛', isPopular: true },
  { id: 'baby_bottle', name: '젖병', emoji: '🍼', isPopular: true },
  { id: 'baby_formula_dispenser', name: '분유제조기', emoji: '⚙️', isPopular: true },
  { id: 'milk_powder_port', name: '분유포트', emoji: '🫖', isPopular: true },
  { id: 'stroller', name: '유모차', emoji: '🚼', isPopular: true },
  { id: 'car_seat', name: '카시트', emoji: '🚗', isPopular: true },
  // Row 2 - 기타 카테고리
  { id: 'pacifier', name: '쪽쪽이', emoji: '😊' },
  { id: 'baby_wipes', name: '아기물티슈', emoji: '🧻' },
  { id: 'thermometer', name: '체온계', emoji: '🌡️' },
  { id: 'nasal_aspirator', name: '코흡입기', emoji: '👃' },
  { id: 'ip_camera', name: '홈캠', emoji: '📹' },
  { id: 'baby_bed', name: '유아침대', emoji: '🛏️' },
  { id: 'high_chair', name: '유아의자', emoji: '🪑' },
  { id: 'baby_sofa', name: '유아소파', emoji: '🛋️' },
  { id: 'baby_desk', name: '유아책상', emoji: '📝' },
];

const ROW1_ITEMS = ALL_CATEGORIES.slice(0, 7);  // 인기 카테고리 7개만
const ROW2_ITEMS = ALL_CATEGORIES.slice(7);     // 쪽쪽이 + 기타 카테고리

// 클릭 이벤트에 전달되는 상세 정보
export interface CategoryClickData {
  id: string;
  name: string;
  isPopular: boolean;
  row: 1 | 2;
}

interface CategoryMarqueeProps {
  onCategoryClick: (data: CategoryClickData) => void;
}

function CategoryCard({
  item,
  row,
  onClick,
  isLoading,
}: {
  item: CategoryItem;
  row: 1 | 2;
  onClick: (data: CategoryClickData) => void;
  isLoading: boolean;
}) {
  return (
    <button
      onClick={() => onClick({
        id: item.id,
        name: item.name,
        isPopular: item.isPopular ?? false,
        row,
      })}
      disabled={isLoading}
      className={`shrink-0 mx-1.5 px-3.5 py-2 rounded-xl border transition-all duration-200
                 flex items-center gap-2 active:scale-95 active:opacity-70
                 ${isLoading
                   ? 'animate-pulse bg-blue-100 border-blue-200 opacity-80'
                   : 'bg-white border-gray-100 hover:bg-gray-50'}`}
    >
      {/* Emoji or Spinner */}
      <span className="text-base w-3 h-3 flex items-center justify-center">
        {isLoading ? (
          <svg className="w-3 h-3 animate-spin text-blue-500" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        ) : (
          item.emoji
        )}
      </span>
      <span className={`text-xs font-semibold whitespace-nowrap
                       ${isLoading ? 'text-blue-600' : 'text-gray-500'}`}>
        {item.name}
      </span>
      {item.isPopular && !isLoading && (
        <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-500 text-[10px] font-medium">
          인기
        </span>
      )}
    </button>
  );
}

function MarqueeRow({
  items,
  direction,
  speed = 0.4,
  row,
  onCategoryClick,
  loadingId,
}: {
  items: CategoryItem[];
  direction: 'left' | 'right';
  speed?: number;
  row: 1 | 2;
  onCategoryClick: (data: CategoryClickData) => void;
  loadingId: string | null;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const positionRef = useRef(0);
  const animationRef = useRef<number | null>(null);

  const tripled = [...items, ...items, ...items];

  useEffect(() => {
    if (direction === 'right' && scrollRef.current) {
      const singleSetWidth = scrollRef.current.scrollWidth / 3;
      positionRef.current = singleSetWidth;
    }

    const animate = () => {
      if (!scrollRef.current) {
        animationRef.current = requestAnimationFrame(animate);
        return;
      }

      const container = scrollRef.current;
      const singleSetWidth = container.scrollWidth / 3;

      if (direction === 'left') {
        positionRef.current += speed;
        if (positionRef.current >= singleSetWidth) {
          positionRef.current = 0;
        }
      } else {
        positionRef.current -= speed;
        if (positionRef.current <= 0) {
          positionRef.current = singleSetWidth;
        }
      }

      container.style.transform = `translateX(-${positionRef.current}px)`;

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [direction, speed]);

  return (
    <div className="overflow-hidden">
      <div
        ref={scrollRef}
        className="flex will-change-transform"
      >
        {tripled.map((item, idx) => (
          <CategoryCard
            key={`${item.id}-${idx}`}
            item={item}
            row={row}
            onClick={onCategoryClick}
            isLoading={loadingId === item.id}
          />
        ))}
      </div>
    </div>
  );
}

export function CategoryMarquee({ onCategoryClick }: CategoryMarqueeProps) {
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const handleClick = (data: CategoryClickData) => {
    setLoadingId(data.id);
    onCategoryClick(data);
  };

  return (
    <div className="mt-8 mb-4 w-full -mx-6" style={{ width: 'calc(100% + 48px)' }}>
      <div className="mb-2.5">
        <MarqueeRow items={ROW1_ITEMS} direction="left" speed={0.4} row={1} onCategoryClick={handleClick} loadingId={loadingId} />
      </div>
      <MarqueeRow items={ROW2_ITEMS} direction="right" speed={0.4} row={2} onCategoryClick={handleClick} loadingId={loadingId} />
    </div>
  );
}
