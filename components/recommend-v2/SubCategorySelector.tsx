'use client';

import { motion } from 'framer-motion';
import {
  Package,
  Crown,
  Backpack,
  Users,
  Shield,
  StackSimple,
  ShoppingCart,
  ArrowUp,
  Baby,
  Footprints,
  Waves,
  Star,
  Heart,
  Coin,
  Leaf,
  Moon,
  DotsThree
} from '@phosphor-icons/react';

import type { ProductItem } from '@/types/recommend-v2';

interface SubCategory {
  code: string;
  name: string;
  description: string;
  icon: string;
}

interface SubCategorySelectorProps {
  categoryName: string;
  subCategories: SubCategory[];
  selectedCode: string | null;
  onSelect: (code: string) => void;
  // 디버깅용: 옵션별 제품 개수 표시
  products?: ProductItem[];
  showProductCounts?: boolean;
  filterBy?: string;
  filterKey?: string;
}

/**
 * 하위 카테고리별 제품 개수 계산
 */
function countProductsForSubCategory(
  products: ProductItem[],
  subCategoryCode: string,
  filterBy: string,
  filterKey?: string
): number {
  return products.filter(product => {
    if (filterBy === 'category_code') {
      return product.category_code === subCategoryCode;
    } else if (filterKey && product.filter_attrs) {
      // filter_attrs 기반 필터링
      const attrValue = product.filter_attrs[filterKey];
      return String(attrValue) === subCategoryCode;
    }
    return false;
  }).length;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ICON_MAP: Record<string, React.ComponentType<any>> = {
  package: Package,
  crown: Crown,
  backpack: Backpack,
  users: Users,
  shield: Shield,
  layers: StackSimple,
  'shopping-basket': ShoppingCart,
  'arrow-up': ArrowUp,
  baby: Baby,
  footprints: Footprints,
  waves: Waves,
  // 기저귀 브랜드용 아이콘
  star: Star,
  heart: Heart,
  coin: Coin,
  leaf: Leaf,
  moon: Moon,
  'dots-three': DotsThree,
};

/**
 * 세부 카테고리 선택 컴포넌트
 * - 유모차, 카시트, 기저귀 등 하위 카테고리가 있는 경우 사용
 * - 아이콘과 설명으로 시각적 구분
 */
export function SubCategorySelector({
  categoryName,
  subCategories,
  selectedCode,
  onSelect,
  products,
  showProductCounts = false,
  filterBy = 'category_code',
  filterKey,
}: SubCategorySelectorProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-4"
    >
      {/* 헤더 */}
      <div className="flex items-center gap-2">
        <span className="px-2.5 py-1 bg-emerald-100 text-emerald-600 rounded-full text-xs font-bold">
          세부 종류
        </span>
      </div>

      {/* 질문 텍스트 */}
      <h3 className="text-base font-medium text-gray-900 leading-snug">
        어떤 {categoryName}를 찾으세요?
      </h3>

      {/* 선택지 그리드 */}
      <div className="grid grid-cols-2 gap-3">
        {subCategories.map((sub, index) => {
          const isSelected = selectedCode === sub.code;
          const IconComponent = ICON_MAP[sub.icon] || Package;

          // 디버깅용: 옵션별 제품 개수 계산
          const productCount = showProductCounts && products
            ? countProductsForSubCategory(products, sub.code, filterBy, filterKey)
            : null;

          return (
            <motion.button
              key={sub.code}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.05 }}
              onClick={() => onSelect(sub.code)}
              className={`p-4 rounded-xl border-2 text-left transition-all ${
                isSelected
                  ? 'border-emerald-400 bg-emerald-50 shadow-sm'
                  : 'border-gray-100 bg-white hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <div className="flex flex-col items-center text-center gap-2">
                {/* 아이콘 */}
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    isSelected
                      ? 'bg-emerald-500 text-white'
                      : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  <IconComponent size={20} weight="bold" />
                </div>

                {/* 이름 */}
                <span
                  className={`text-sm font-bold ${
                    isSelected ? 'text-emerald-700' : 'text-gray-800'
                  }`}
                >
                  {sub.name}
                </span>

                {/* 설명 */}
                <span
                  className={`text-xs leading-tight ${
                    isSelected ? 'text-emerald-600' : 'text-gray-500'
                  }`}
                >
                  {sub.description}
                </span>

                {/* 디버깅용: 제품 개수 표시 */}
                {productCount !== null && (
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    productCount === 0
                      ? 'bg-red-100 text-red-600'
                      : productCount < 5
                      ? 'bg-yellow-100 text-yellow-700'
                      : 'bg-green-100 text-green-700'
                  }`}>
                    {productCount}개
                  </span>
                )}

                {/* 선택 표시 */}
                {isSelected && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute top-2 right-2"
                  >
                    <div className="w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center">
                      <svg
                        className="w-3 h-3 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={3}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* 안내 텍스트 */}
      <p className="text-xs text-gray-400 text-center pt-1">
      </p>
    </motion.div>
  );
}
