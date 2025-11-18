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
      {/* Thumbnail with Ranking Badge */}
      <div className="relative w-20 h-20 flex-shrink-0 bg-gray-50 rounded-lg overflow-hidden">
        <Image
          src={product.thumbnail}
          alt={product.title}
          fill
          sizes="80px"
          className="object-cover"
        />
        {/* Ranking Badge */}
        <div className="absolute top-0 left-0 w-5 h-5 bg-gray-900 rounded-tl-md rounded-br-md flex items-center justify-center">
          <span className="text-white font-bold text-[10px]">
            {product.ranking}
          </span>
        </div>
      </div>

      {/* Product Info */}
      <div className="flex-1 flex flex-col justify-center gap-1 min-w-0">
        {/* Title - 2 lines max */}
        <h3 className="text-sm font-medium text-gray-900 line-clamp-2 leading-snug">
          {product.title}
        </h3>

        {/* Price and Review */}
        <div className="flex items-center justify-between gap-2">
          {/* Price */}
          <span className="text-base font-bold text-gray-900">
            {product.price.toLocaleString()}원
          </span>

          {/* Review Count with Star */}
          <div className="flex items-center gap-1 text-xs text-gray-600 flex-shrink-0">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="#FCD34D" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
            </svg>
            <span className="font-medium">{product.reviewCount.toLocaleString()}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
