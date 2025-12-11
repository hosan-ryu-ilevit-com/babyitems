'use client';

import { motion } from 'framer-motion';

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
  onSelectAll?: () => void;
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
  onSelectAll,
}: SubCategorySelectorProps) {
  const isAllSelected = selectedCode === '__all__';
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
          const isSelected = selectedCode === sub.code && !isAllSelected;

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
              <span
                className={`text-sm font-semibold ${
                  isSelected ? 'text-emerald-700' : 'text-gray-800'
                }`}
              >
                {sub.name}
              </span>
            </motion.button>
          );
        })}
      </div>

      {/* 전부 좋아요 버튼 */}
      {onSelectAll && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: subCategories.length * 0.05 + 0.1 }}
          className="flex justify-center mt-1"
        >
          <button
            onClick={onSelectAll}
            className={`px-4 py-3 rounded-xl border-2 transition-all ${
              isAllSelected
                ? 'border-emerald-400 bg-emerald-50'
                : 'border-gray-100 bg-white hover:border-gray-300 hover:bg-gray-50'
            }`}
          >
            <span
              className={`text-sm font-semibold ${
                isAllSelected ? 'text-emerald-700' : 'text-gray-800'
              }`}
            >
              전부 좋아요 👍
            </span>
          </button>
        </motion.div>
      )}
    </motion.div>
  );
}
