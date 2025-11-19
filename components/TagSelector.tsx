'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Check } from '@phosphor-icons/react/dist/ssr';

interface Tag {
  id: string;
  text: string;
}

interface TagSelectorProps {
  tags: Tag[];
  selectedIds: string[];
  onToggle: (tagId: string) => void;
  maxSelection: number;
  minSelection?: number;
  type: 'pros' | 'cons';
}

export default function TagSelector({
  tags,
  selectedIds,
  onToggle,
  maxSelection,
  minSelection = 0,
  type
}: TagSelectorProps) {
  const isSelected = (tagId: string) => selectedIds.includes(tagId);
  const canSelectMore = selectedIds.length < maxSelection;

  const handleClick = (tagId: string) => {
    if (isSelected(tagId)) {
      // 이미 선택됨 → 해제
      onToggle(tagId);
    } else if (canSelectMore) {
      // 선택 가능 → 선택
      onToggle(tagId);
    }
    // maxSelection 도달 시 클릭 무시
  };

  const colorScheme = type === 'pros'
    ? {
        selected: 'bg-cyan-500 text-white border-cyan-500',
        unselected: 'bg-white text-gray-700 border-gray-300 hover:border-cyan-300',
        disabled: 'bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed'
      }
    : {
        selected: 'bg-red-500 text-white border-red-500',
        unselected: 'bg-white text-gray-700 border-gray-300 hover:border-red-300',
        disabled: 'bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed'
      };

  return (
    <div className="space-y-3">
      {/* 선택 상태 표시 */}
      <div className="text-right text-sm text-gray-500">
        {selectedIds.length}/{maxSelection} 선택
        {minSelection > 0 && selectedIds.length < minSelection && (
          <span className="text-red-500 ml-2">
            (최소 {minSelection}개 선택)
          </span>
        )}
      </div>

      {/* 태그 목록 */}
      <div className="space-y-2">
        <AnimatePresence mode="popLayout">
          {tags.map((tag) => {
            const selected = isSelected(tag.id);
            const disabled = !selected && !canSelectMore;

            return (
              <motion.button
                key={tag.id}
                onClick={() => handleClick(tag.id)}
                disabled={disabled}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                whileTap={disabled ? {} : { scale: 0.98 }}
                className={`
                  w-full px-4 py-3 rounded-xl border-2 text-left
                  transition-all duration-200
                  flex items-start gap-3
                  ${
                    selected
                      ? colorScheme.selected
                      : disabled
                      ? colorScheme.disabled
                      : colorScheme.unselected
                  }
                `}
              >
                {/* 체크박스 */}
                <div
                  className={`
                    w-5 h-5 rounded-md border-2 flex-shrink-0 mt-0.5
                    flex items-center justify-center
                    ${
                      selected
                        ? 'bg-white border-transparent'
                        : 'bg-transparent border-gray-400'
                    }
                  `}
                >
                  {selected && (
                    <Check
                      className={type === 'pros' ? 'text-cyan-500' : 'text-red-500'}
                      size={14}
                      weight="bold"
                    />
                  )}
                </div>

                {/* 태그 텍스트 */}
                <span className="text-sm leading-relaxed flex-1">
                  {tag.text}
                </span>
              </motion.button>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
