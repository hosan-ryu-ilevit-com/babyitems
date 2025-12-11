'use client';

import { motion } from 'framer-motion';

import type { ProductItem } from '@/types/recommend-v2';

interface SubCategory {
  code: string;
  name: string;
  description?: string;
  icon?: string;
}

interface SubCategorySelectorProps {
  categoryName: string;
  subCategories: SubCategory[];
  selectedCode: string | null;
  onSelect: (code: string) => void;
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
      const attrValue = product.filter_attrs[filterKey];
      return String(attrValue) === subCategoryCode;
    }
    return false;
  }).length;
}

/**
 * 세부 카테고리 선택 컴포넌트
 * - 유모차, 카시트, 기저귀 등 하위 카테고리가 있는 경우 사용
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
              className={`px-4 py-3 rounded-xl border-2 transition-all ${
                isSelected
                  ? 'border-emerald-400 bg-emerald-50'
                  : 'border-gray-100 bg-white hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center justify-between">
                {/* 이름 */}
                <span
                  className={`text-sm font-semibold ${
                    isSelected ? 'text-emerald-700' : 'text-gray-800'
                  }`}
                >
                  {sub.name}
                </span>

                {/* 제품 개수 */}
                {productCount !== null && (
                  <span className={`text-xs font-medium ${
                    isSelected ? 'text-emerald-500' : 'text-gray-400'
                  }`}>
                    {productCount}개
                  </span>
                )}
              </div>
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
}
