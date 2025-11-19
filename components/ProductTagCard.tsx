'use client';

import { Product } from '@/types';
import Image from 'next/image';
import { motion } from 'framer-motion';

interface Tag {
  id: string;
  text: string;
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

  const tagColors = type === 'pros'
    ? {
        selected: 'bg-emerald-100 text-emerald-700 border border-emerald-300',
        unselected: 'bg-gray-100 text-gray-400 hover:bg-gray-200'
      }
    : {
        selected: 'bg-red-100 text-red-700 border border-red-300',
        unselected: 'bg-gray-100 text-gray-400 hover:bg-gray-200'
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
        <div className="relative w-16 h-16 flex-shrink-0 rounded-xl overflow-hidden bg-gray-50 border border-gray-200">
          <Image
            src={product.thumbnail}
            alt={product.title}
            fill
            className="object-cover"
            sizes="64px"
          />
          {/* 랭킹 라벨 */}
          {label && (
            <div className="absolute top-1 left-1 bg-black/70 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
              {label}
            </div>
          )}
        </div>

        {/* 제품명, 가격, 리뷰수 */}
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-gray-800 line-clamp-2 mb-1">
            {product.title}
          </h4>
          <div className="flex items-baseline gap-2">
            <span className="text-base font-bold text-gray-900">
              {product.price.toLocaleString()}<span className="font-bold text-gray-900">원</span>
            </span>
            <span className="text-[10px] text-gray-400">
              리뷰 {product.reviewCount.toLocaleString()}개
            </span>
          </div>
        </div>
      </div>

      {/* 태그 목록 */}
      <div className="overflow-x-auto scrollbar-hide max-h-[4.5rem]">
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => {
            const selected = isTagSelected(tag.id);
            return (
              <button
                key={tag.id}
                onClick={() => onTagToggle(tag.id)}
                className={`
                  px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap
                  ${selected ? tagColors.selected : tagColors.unselected}
                `}
              >
                {tag.text}
              </button>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
