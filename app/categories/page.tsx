'use client';

import { useRouter } from 'next/navigation';
import { CATEGORIES, CATEGORY_NAMES, Category } from '@/lib/data';
import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';

// Category icons (emoji for MVP, can be replaced with actual icons)
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

// Category descriptions
const CATEGORY_DESCRIPTIONS: Record<Category, string> = {
  baby_bottle: '수유의 시작, 아이에게 딱 맞는 젖병',
  baby_bottle_sterilizer: '위생 관리의 핵심, 깨끗한 소독',
  baby_formula_dispenser: '분유 타기가 편해지는 디스펜서',
  baby_monitor: '아이의 안전을 지키는 모니터',
  baby_play_mat: '안전한 놀이 공간, 발달을 돕는 매트',
  car_seat: '이동 중 안전을 지키는 카시트',
  milk_powder_port: '따뜻한 물이 필요할 때, 분유포트',
  nasal_aspirator: '답답한 코를 시원하게, 코흡기',
  thermometer: '정확한 건강 체크, 체온계',
};

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
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <div className="max-w-4xl mx-auto px-4 py-8 pb-24">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-10"
        >
          <h1 className="text-3xl font-bold text-gray-900 mb-3">
            어떤 제품을 찾으시나요?
          </h1>
          <p className="text-base text-gray-600">
            AI가 실제 사용자 리뷰를 분석해 맞춤 추천해드립니다
          </p>
        </motion.div>

        {/* Category Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {CATEGORIES.map((category, index) => {
            const isSelected = selectedCategory === category;
            return (
              <motion.button
                key={category}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.05, duration: 0.3 }}
                whileHover={{ scale: 1.03, y: -4 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => handleCategorySelect(category)}
                className={`bg-white rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all duration-300 border-2 ${
                  isSelected
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-transparent hover:border-blue-300'
                } relative overflow-hidden group`}
              >
                {/* Gradient overlay on hover */}
                <div className="absolute inset-0 bg-gradient-to-br from-blue-50/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                <div className="relative z-10">
                  <motion.div
                    className="text-5xl mb-3"
                    animate={isSelected ? { scale: [1, 1.2, 1] } : {}}
                    transition={{ duration: 0.3 }}
                  >
                    {CATEGORY_ICONS[category]}
                  </motion.div>
                  <div className="text-base font-bold text-gray-900 mb-1">
                    {CATEGORY_NAMES[category]}
                  </div>
                  <div className="text-xs text-gray-500 leading-relaxed">
                    {CATEGORY_DESCRIPTIONS[category]}
                  </div>
                </div>

                {/* Selection checkmark */}
                {isSelected && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute top-2 right-2 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center"
                  >
                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </motion.div>
                )}
              </motion.button>
            );
          })}
        </div>

        {/* Info */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="mt-12 text-center"
        >
          <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 shadow-md border border-blue-100">
            <div className="flex items-center justify-center gap-8 text-sm text-gray-600">
              <div className="flex items-center gap-2">
                <span className="text-2xl">💡</span>
                <span>수백 개 제품 분석</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-2xl">📊</span>
                <span>데이터 기반 추천</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-2xl">🚫</span>
                <span>광고 없음</span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
