'use client';

import { useRouter } from 'next/navigation';
import { CATEGORY_NAMES, CATEGORY_THUMBNAILS, Category } from '@/lib/data';
import { motion } from 'framer-motion';
import { useState } from 'react';
import Image from 'next/image';
import { CaretLeft } from '@phosphor-icons/react/dist/ssr';

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
  'baby_formula_dispenser',
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
  onSelect
}: {
  category: Category;
  isSelected: boolean;
  onSelect: (category: Category) => void;
}) {
  const [imageError, setImageError] = useState(false);
  const thumbnailUrl = CATEGORY_THUMBNAILS[category];
  const hasThumbnail = !!thumbnailUrl;

  return (
    <motion.button
      whileTap={{ scale: 0.96, opacity: 0.7 }}
      whileHover={{ scale: 1.02 }}
      animate={{ scale: isSelected ? 1.03 : 1 }}
      onClick={() => onSelect(category)}
      className={`rounded-2xl p-3 transition-all duration-200 relative overflow-hidden ${
        isSelected ? 'bg-gray-100' : 'bg-white hover:bg-gray-50'
      }`}
    >
      <div className="relative z-10 flex flex-col items-center">
        {/* Thumbnail or Icon */}
        {hasThumbnail && !imageError ? (
          <div className="w-16 h-16 mb-2 relative rounded-xl overflow-hidden">
            <Image
              src={thumbnailUrl}
              alt={CATEGORY_NAMES[category]}
              fill
              className="object-contain p-1"
              unoptimized
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

  const handleCategorySelect = (category: Category) => {
    setSelectedCategory(category);
    // 약간의 delay 후 이동 (선택 feedback)
    setTimeout(() => {
      router.push(`/anchor?category=${category}`);
    }, 200);
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F8F9FB' }}>
      <div className="max-w-[480px] mx-auto min-h-screen">
        {/* Top Header with Back Button */}
        <header className="sticky top-0 bg-white border-b border-gray-200 z-50">
          <div className="px-5 py-3">
            <div className="flex items-center justify-between">
              <button
                onClick={() => router.push('/')}
                className="text-gray-600 hover:text-gray-900 transition-colors"
              >
                <CaretLeft size={24} weight="bold" />
              </button>
              <div className="absolute left-1/2 -translate-x-1/2">
                <h1 className="text-lg font-bold text-gray-900">
                  카테고리 선택
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
              {FEEDING_CATEGORIES.map((category) => (
                <CategoryButton
                  key={category}
                  category={category}
                  isSelected={selectedCategory === category}
                  onSelect={handleCategorySelect}
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
