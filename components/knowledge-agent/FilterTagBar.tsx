'use client';

import { motion } from 'framer-motion';
import type { FilterTag } from '@/lib/knowledge-agent/types';

interface FilterTagBarProps {
  tags: FilterTag[];
  selectedTagIds: Set<string>;
  onTagToggle: (tagId: string) => void;
  isLoading?: boolean;
}

export function FilterTagBar({
  tags,
  selectedTagIds,
  onTagToggle,
  isLoading = false,
}: FilterTagBarProps) {
  const isAllSelected = selectedTagIds.size === 0;

  if (isLoading) {
    return (
      <div className="flex gap-2 px-4 py-3 overflow-x-auto">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-8 w-20 bg-gray-100 rounded-full animate-pulse shrink-0"
          />
        ))}
      </div>
    );
  }

  if (tags.length === 0) {
    return null;
  }

  return (
    <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm -mx-4">
      <div className="flex gap-[6px] px-4 py-2 overflow-x-auto scrollbar-hide">
        {/* "모두" 태그 - 선택 해제용 */}
        <motion.button
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => onTagToggle('__all__')}
          className={`shrink-0 h-[32px] px-[14px] py-[6px] text-[14px] font-medium rounded-full transition-all flex items-center justify-center ${
            isAllSelected
              ? 'ai-gradient-border text-[#6366F1]'
              : 'bg-white text-gray-500 border border-gray-200'
          }`}
        >
          전체
        </motion.button>

        {/* 사용자 조건 태그들 - stagger 애니메이션 */}
        {tags.map((tag, index) => {
          const isSelected = selectedTagIds.has(tag.id);
          return (
            <motion.button
              key={tag.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 + index * 0.04 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => onTagToggle(tag.id)}
              className={`shrink-0 h-[32px] px-[14px] py-[6px] text-[14px] font-medium rounded-full transition-all whitespace-nowrap flex items-center justify-center ${
                isSelected
                  ? 'ai-gradient-border text-[#6366F1]'
                  : 'bg-white text-gray-500 border border-gray-200'
              }`}
            >
              {tag.label}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

export default FilterTagBar;
