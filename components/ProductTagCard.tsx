'use client';

import { Product } from '@/types';
import Image from 'next/image';
import { motion } from 'framer-motion';

interface Tag {
  id: string;
  text: string;
  popular?: boolean; // 인기 태그 여부
}

interface ProductTagCardProps {
  product: Product;
  tags: Tag[];
  selectedTagIds: string[];
  onTagToggle: (tagId: string) => void;
  type: 'pros' | 'cons';
  disabled?: boolean;
  label?: string; // '국민템 1위', '가성비 1위', '프리미엄 1위'
}

export default function ProductTagCard({
  product,
  tags,
  selectedTagIds,
  onTagToggle,
  type,
  disabled = false,
  label
}: ProductTagCardProps) {
  const isTagSelected = (tagId: string) => selectedTagIds.includes(tagId);

  // 최대 선택 제한 체크
  const maxSelections = type === 'pros' ? 5 : 4;
  const isMaxReached = selectedTagIds.length >= maxSelections;

  const tagColors = type === 'pros'
    ? {
        selected: 'bg-emerald-100 text-emerald-700 border-emerald-300',
        unselected: 'bg-gray-100 text-gray-400 hover:bg-gray-200 border-transparent',
        disabled: 'bg-gray-50 text-gray-300 border-transparent opacity-70 cursor-not-allowed'
      }
    : {
        selected: 'bg-red-100 text-red-700 border-red-300',
        unselected: 'bg-gray-100 text-gray-400 hover:bg-gray-200 border-transparent',
        disabled: 'bg-gray-50 text-gray-300 border-transparent opacity-70 cursor-not-allowed'
      };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-white border border-gray-200 rounded-2xl p-4 ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
    >
      {/* 상품 정보 */}
      <div className="flex gap-3 mb-3">
        {/* 썸네일 */}
        <div className="relative w-20 h-20 flex-shrink-0 rounded-xl overflow-hidden bg-gray-50 border border-gray-200">
          <Image
            src={product.thumbnail}
            alt={product.title}
            fill
            className="object-cover"
            sizes="80px"
          />
          {/* 랭킹 라벨 - 썸네일 내부 좌측 상단 */}
          {label && (
            <div className="absolute top-0 left-0 bg-black/80 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-tl-xl rounded-br-md">
              {label}
            </div>
          )}
        </div>

        {/* 제품명, 브랜드, 가격, 리뷰수 */}
        <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
          {/* 브랜드 */}
          {product.brand && (
            <div className="text-xs text-gray-500 font-medium mb-0.5">
              {product.brand}
            </div>
          )}
          {/* 제품명 */}
          <h4 className="text-sm font-bold text-gray-900 line-clamp-2 leading-tight">
            {product.title}
          </h4>
          {/* 가격 & 리뷰수 */}
          <div className="space-y-0.5 mt-auto">
            <p className="text-base font-bold text-gray-900">
              {product.price.toLocaleString()}<span className="text-sm">원</span>
            </p>
            {product.reviewCount > 0 && (
              <div className="flex items-center gap-1 text-xs text-gray-600">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="#FCD34D" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
                </svg>
                <span className="font-medium">리뷰 {product.reviewCount.toLocaleString()}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 태그 목록 */}
      <div className="overflow-x-auto overflow-y-hidden scrollbar-hide -mx-4">
        <div className="grid grid-rows-2 grid-flow-col auto-cols-max gap-2 px-4">
          {tags.map((tag) => {
            const selected = isTagSelected(tag.id);
            const isDisabled = !selected && isMaxReached;

            return (
              <button
                key={tag.id}
                onClick={() => !isDisabled && onTagToggle(tag.id)}
                disabled={isDisabled}
                className={`
                  px-3 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap border
                  ${selected ? tagColors.selected : isDisabled ? tagColors.disabled : tagColors.unselected}
                `}
              >
                <span className="flex items-center gap-1.5">
                  <span>{tag.text}</span>
                  {tag.popular && (
                    <span
                      className="text-xs px-1.5 py-0.5 rounded-md font-bold"
                      style={
                        type === 'pros'
                          ? (selected
                            ? { backgroundColor: '#10B981', color: 'white' }     // emerald for selected pros
                            : { backgroundColor: '#EAF8F8', color: '#009896' })  // teal for unselected pros
                          : (selected
                            ? { backgroundColor: '#EF4444', color: 'white' }     // red for selected cons
                            : { backgroundColor: '#FEE2E2', color: '#DC2626' })  // light red for unselected cons
                      }
                    >
                      인기
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
