'use client';

import { useRef, useEffect } from 'react';

interface CategoryItem {
  id: string;
  name: string;
  emoji: string;
  isPopular?: boolean;
}

// 인기 카테고리: 기저귀, 분유, 젖병, 분유제조기, 분유포트, 유모차, 카시트
const ALL_CATEGORIES: CategoryItem[] = [
  // Row 1 - 인기 카테고리 위주
  { id: 'diaper', name: '기저귀', emoji: '🧒', isPopular: true },
  { id: 'formula', name: '분유', emoji: '🥛', isPopular: true },
  { id: 'baby_bottle', name: '젖병', emoji: '🍼', isPopular: true },
  { id: 'formula_maker', name: '분유제조기', emoji: '⚙️', isPopular: true },
  { id: 'formula_pot', name: '분유포트', emoji: '🫖', isPopular: true },
  { id: 'stroller', name: '유모차', emoji: '🚼', isPopular: true },
  { id: 'car_seat', name: '카시트', emoji: '🚗', isPopular: true },
  { id: 'pacifier', name: '쪽쪽이', emoji: '😊' },
  // Row 2 - 기타 카테고리
  { id: 'baby_wipes', name: '아기물티슈', emoji: '🧻' },
  { id: 'thermometer', name: '체온계', emoji: '🌡️' },
  { id: 'nasal_aspirator', name: '코흡입기', emoji: '👃' },
  { id: 'ip_camera', name: '홈캠', emoji: '📹' },
  { id: 'baby_bed', name: '유아침대', emoji: '🛏️' },
  { id: 'high_chair', name: '유아의자', emoji: '🪑' },
  { id: 'baby_sofa', name: '유아소파', emoji: '🛋️' },
  { id: 'baby_desk', name: '유아책상', emoji: '📝' },
];

const ROW1_ITEMS = ALL_CATEGORIES.slice(0, 8);
const ROW2_ITEMS = ALL_CATEGORIES.slice(8);

interface CategoryMarqueeProps {
  onCategoryClick: (categoryId: string) => void;
}

function CategoryCard({
  item,
  onClick
}: {
  item: CategoryItem;
  onClick: (id: string) => void;
}) {
  return (
    <button
      onClick={() => onClick(item.id)}
      className={`shrink-0 mx-1.5 px-3.5 py-2 rounded-xl border transition-all duration-200
                 flex items-center gap-2 active:scale-95
                 ${item.isPopular
                   ? 'bg-blue-50 border-blue-200 hover:bg-blue-100'
                   : 'bg-white border-gray-200 hover:bg-gray-50'}`}
    >
      <span className="text-base">{item.emoji}</span>
      <span className={`text-sm font-semibold whitespace-nowrap
                       ${item.isPopular ? 'text-blue-700' : 'text-gray-600'}`}>
        {item.name}
      </span>
      {item.isPopular && (
        <span className="px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-500 text-[10px] font-medium">
          인기
        </span>
      )}
      <svg
        className={`w-3.5 h-3.5 ${item.isPopular ? 'text-blue-400' : 'text-gray-400'}`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
      </svg>
    </button>
  );
}

function MarqueeRow({
  items,
  direction,
  speed = 0.4,
  onCategoryClick,
}: {
  items: CategoryItem[];
  direction: 'left' | 'right';
  speed?: number;
  onCategoryClick: (id: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isPausedRef = useRef(false);
  const positionRef = useRef(0);
  const animationRef = useRef<number | null>(null);
  const dragStartRef = useRef<{ x: number; position: number } | null>(null);

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

      if (!isPausedRef.current) {
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
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [direction, speed]);

  const handleDragStart = (clientX: number) => {
    isPausedRef.current = true;
    dragStartRef.current = { x: clientX, position: positionRef.current };
  };

  const handleDragMove = (clientX: number) => {
    if (!dragStartRef.current || !scrollRef.current) return;

    const delta = dragStartRef.current.x - clientX;
    const singleSetWidth = scrollRef.current.scrollWidth / 3;
    let newPosition = dragStartRef.current.position + delta;

    if (newPosition >= singleSetWidth) {
      newPosition = newPosition - singleSetWidth;
      dragStartRef.current.position -= singleSetWidth;
    } else if (newPosition < 0) {
      newPosition = newPosition + singleSetWidth;
      dragStartRef.current.position += singleSetWidth;
    }

    positionRef.current = newPosition;
    scrollRef.current.style.transform = `translateX(-${newPosition}px)`;
  };

  const handleDragEnd = () => {
    isPausedRef.current = false;
    dragStartRef.current = null;
  };

  return (
    <div className="overflow-hidden">
      <div
        ref={scrollRef}
        className="flex will-change-transform cursor-grab active:cursor-grabbing"
        onTouchStart={(e) => handleDragStart(e.touches[0].clientX)}
        onTouchMove={(e) => handleDragMove(e.touches[0].clientX)}
        onTouchEnd={handleDragEnd}
        onMouseDown={(e) => { e.preventDefault(); handleDragStart(e.clientX); }}
        onMouseMove={(e) => { if (dragStartRef.current) handleDragMove(e.clientX); }}
        onMouseUp={handleDragEnd}
        onMouseLeave={handleDragEnd}
      >
        {tripled.map((item, idx) => (
          <CategoryCard
            key={`${item.id}-${idx}`}
            item={item}
            onClick={onCategoryClick}
          />
        ))}
      </div>
    </div>
  );
}

export function CategoryMarquee({ onCategoryClick }: CategoryMarqueeProps) {
  return (
    <div className="mt-8 mb-4 w-full -mx-6" style={{ width: 'calc(100% + 48px)' }}>
      <div className="mb-2.5">
        <MarqueeRow items={ROW1_ITEMS} direction="left" speed={0.4} onCategoryClick={onCategoryClick} />
      </div>
      <MarqueeRow items={ROW2_ITEMS} direction="right" speed={0.4} onCategoryClick={onCategoryClick} />
    </div>
  );
}
