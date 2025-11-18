'use client';

import { ScoredProduct } from '@/lib/filtering/quickScore';
import Image from 'next/image';
import { motion } from 'framer-motion';

interface ProductListItemProps {
  product: ScoredProduct;
  index: number;
  onClick: (product: ScoredProduct) => void;
}

/**
 * Step 3용 상품 리스트 아이템 (1xN 배열)
 * - 썸네일, 타이틀, 가격, 리뷰
 * - 클릭 시 제품 정보 바텀시트 오픈
 * - 찜하기 버튼 없음
 */
export default function ProductListItem({ product, index, onClick }: ProductListItemProps) {
  return (
    <motion.div
      onClick={() => onClick(product)}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: index * 0.03 }}
      className="flex gap-3 p-3 bg-white rounded-xl border border-gray-100 hover:border-gray-200 transition-colors cursor-pointer active:bg-gray-50"
    >
      {/* Thumbnail */}
      <div className="relative w-20 h-20 flex-shrink-0 bg-gray-50 rounded-lg overflow-hidden">
        <Image
          src={product.thumbnail}
          alt={product.title}
          fill
          sizes="80px"
          className="object-cover"
        />
      </div>

      {/* Product Info */}
      <div className="flex-1 flex flex-col justify-center gap-1 min-w-0">
        {/* Title - 2 lines max */}
        <h3 className="text-sm font-medium text-gray-900 line-clamp-2 leading-snug">
          {product.title}
        </h3>

        {/* Price */}
        <span className="text-base font-bold text-gray-900">
          {product.price.toLocaleString()}원
        </span>
      </div>
    </motion.div>
  );
}
