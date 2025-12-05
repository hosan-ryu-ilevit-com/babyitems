'use client';

import { useRouter } from 'next/navigation';
import { CATEGORY_NAMES, Category } from '@/lib/data';
import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import Image from 'next/image';
import { CaretLeft } from '@phosphor-icons/react/dist/ssr';
import { logPageView, logCategorySelection } from '@/lib/logging/clientLogger';

// Category icons (fallback when no product thumbnail available)
const CATEGORY_ICONS: Record<Category, string> = {
  baby_bottle: '🍼',
  baby_bottle_sterilizer: '🧼',
  baby_formula_dispenser: '🥛',
  baby_monitor: '📹',
  baby_play_mat: '🧸',
  car_seat: '🚗',
  milk_powder_port: '☕',
  nasal_aspirator: '👃',
  thermometer: '🌡️',
};

// Category groups
const FEEDING_CATEGORIES: Category[] = [
  // 'baby_formula_dispenser', // 현재 상품 부족으로 임시 숨김
  'milk_powder_port',
  'baby_bottle',
  'baby_bottle_sterilizer',
];

const BABY_LIFE_CATEGORIES: Category[] = [
  'baby_monitor',
  'baby_play_mat',
  'car_seat',
  'nasal_aspirator',
  'thermometer',
];

// Category Button Component
function CategoryButton({
  category,
  isSelected,
  onSelect,
  isPriority
}: {
  category: Category;
  isSelected: boolean;
  onSelect: (category: Category) => void;
  isPriority?: boolean;
}) {
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const thumbnailUrl = `/categoryThumbnails/${category}.png`;

  return (
    <motion.button
      whileTap={{ scale: 0.96, opacity: 0.7 }}
      whileHover={{ scale: 1.02 }}
      animate={{ scale: isSelected ? 1.03 : 1 }}
      onClick={() => onSelect(category)}
      className={`rounded-2xl p-3 transition-all duration-200 relative overflow-hidden ${
        isSelected
          ? 'bg-white ring-4 ring-inset ring-[#93C5FD]'
          : 'bg-white hover:bg-gray-50'
      }`}
    >
      <div className="relative z-10 flex flex-col items-center">
        {/* Thumbnail or Icon */}
        {!imageError ? (
          <div className={`w-20 h-20 mb-2 relative rounded-xl overflow-hidden bg-white transition-all duration-200 ${
            isSelected ? 'scale-95' : 'scale-100'
          }`}>
            {!imageLoaded && (
              <div className="absolute inset-0 bg-gray-200 animate-pulse" />
            )}
            <Image
              src={thumbnailUrl}
              alt={CATEGORY_NAMES[category]}
              fill
              sizes="80px"
              className="object-cover"
              priority={isPriority}
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageError(true)}
            />
          </div>
        ) : (
          <div className="text-4xl mb-2">
            {CATEGORY_ICONS[category]}
          </div>
        )}

        {/* Category Name */}
        <div className="text-xs font-semibold text-gray-900">
          {CATEGORY_NAMES[category]}
        </div>
      </div>
    </motion.button>
  );
}

export default function CategoriesPage() {
  const router = useRouter();
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);

  // 페이지뷰 로깅
  useEffect(() => {
    logPageView('categories');
  }, []);

  const handleCategorySelect = (category: Category) => {
    setSelectedCategory(category);

    // 카테고리 선택 로깅
    logCategorySelection(category, CATEGORY_NAMES[category]);

    // 약간의 delay 후 이동 (선택 feedback)
    setTimeout(() => {
      router.push(`/tags?category=${category}`);
    }, 200);
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F8F9FB' }}>
      <div className="max-w-[480px] mx-auto min-h-screen">
        {/* Top Header with Back Button */}
        <header className="sticky top-0 bg-gray-50 z-50">
          <div className="px-5 py-3">
            <div className="flex items-center justify-between">
              <button
                onClick={() => router.push('/')}
                className="text-gray-600 hover:text-gray-900 transition-colors"
              >
                <CaretLeft size={20} weight="bold" />
              </button>
              <div className="absolute left-1/2 -translate-x-1/2">
                <h1 className="text-m font-semibold text-gray-900">
                  추천받을 상품 선택
                </h1>
              </div>
              <div className="w-6" /> {/* Spacer for alignment */}
            </div>
          </div>
        </header>

        <motion.div
          className="px-4 py-8 pb-24"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          {/* Feeding Category Group */}
          <div className="mb-6">
            <h2 className="text-sm font-bold text-gray-700 mb-3 px-1">분유/젖병</h2>
            <div className="grid grid-cols-2 gap-3">
              {FEEDING_CATEGORIES.map((category, index) => (
                <CategoryButton
                  key={category}
                  category={category}
                  isSelected={selectedCategory === category}
                  onSelect={handleCategorySelect}
                  isPriority={index < 2}
                />
              ))}
            </div>
          </div>

          {/* Baby Life Category Group */}
          <div>
            <h2 className="text-sm font-bold text-gray-700 mb-3 px-1">유아생활</h2>
            <div className="grid grid-cols-2 gap-3">
              {BABY_LIFE_CATEGORIES.map((category) => (
                <CategoryButton
                  key={category}
                  category={category}
                  isSelected={selectedCategory === category}
                  onSelect={handleCategorySelect}
                />
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
