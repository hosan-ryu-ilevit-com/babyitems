'use client';

import { useRouter } from 'next/navigation';
import { CATEGORIES, CATEGORY_NAMES, CATEGORY_THUMBNAILS, Category } from '@/lib/data';
import { motion } from 'framer-motion';
import { useState } from 'react';
import Image from 'next/image';

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

  const renderCategoryButton = (category: Category, index: number) => {
    const isSelected = selectedCategory === category;
    const thumbnailUrl = CATEGORY_THUMBNAILS[category];
    const hasThumbnail = !!thumbnailUrl;
    const [imageError, setImageError] = useState(false);

    return (
      <motion.button
        key={category}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: index * 0.05, duration: 0.3 }}
        whileTap={{ scale: 0.97 }}
        onClick={() => handleCategorySelect(category)}
        className={`rounded-2xl p-3 transition-all duration-200 ${
          isSelected
            ? 'bg-blue-50 border-2 border-blue-500'
            : 'bg-white'
        } relative overflow-hidden`}
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
            <motion.div
              className="text-4xl mb-2"
              animate={isSelected ? { scale: [1, 1.1, 1] } : {}}
              transition={{ duration: 0.3 }}
            >
              {CATEGORY_ICONS[category]}
            </motion.div>
          )}

          {/* Category Name */}
          <div className="text-xs font-semibold text-gray-900">
            {CATEGORY_NAMES[category]}
          </div>
        </div>

        {/* Selection checkmark */}
        {isSelected && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute top-2 right-2 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center"
          >
            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </motion.div>
        )}
      </motion.button>
    );
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F8F9FB' }}>
      <div className="max-w-[480px] mx-auto px-4 py-8 pb-24 min-h-screen">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            어떤 아기용품을 찾으시나요?
          </h1>
          <p className="text-sm font-regular text-gray-600">
            AI가 광고 빼고 대신 찾아드려요
          </p>
        </motion.div>

        {/* Feeding Category Group */}
        <div className="mb-6">
          <h2 className="text-sm font-bold text-gray-700 mb-3 px-1">분유/젖병</h2>
          <div className="grid grid-cols-2 gap-3">
            {FEEDING_CATEGORIES.map((category, index) => renderCategoryButton(category, index))}
          </div>
        </div>

        {/* Baby Life Category Group */}
        <div>
          <h2 className="text-sm font-bold text-gray-700 mb-3 px-1">유아생활</h2>
          <div className="grid grid-cols-2 gap-3">
            {BABY_LIFE_CATEGORIES.map((category, index) => renderCategoryButton(category, index + FEEDING_CATEGORIES.length))}
          </div>
        </div>
      </div>
    </div>
  );
}
