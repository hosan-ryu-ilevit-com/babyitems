'use client';

import { Product } from '@/types';
import Image from 'next/image';
import { motion } from 'framer-motion';

interface AnchorProductCardProps {
  product: Product;
  type: 'ranking' | 'value' | 'premium';
  label: string;
  description: string;
}

export default function AnchorProductCard({
  product,
  type,
  label,
  description
}: AnchorProductCardProps) {
  const labelColors = {
    ranking: 'bg-cyan-500 text-white',
    value: 'bg-amber-500 text-white',
    premium: 'bg-purple-500 text-white'
  };

  const borderColors = {
    ranking: 'border-cyan-200',
    value: 'border-amber-200',
    premium: 'border-purple-200'
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-white rounded-xl border-2 ${borderColors[type]} p-4 mb-3`}
    >
      {/* 라벨 */}
      <div className="flex items-center gap-2 mb-3">
        <span className={`${labelColors[type]} px-3 py-1 rounded-full text-xs font-bold`}>
          {label}
        </span>
        <span className="text-gray-500 text-xs">{description}</span>
      </div>

      {/* 제품 정보 */}
      <div className="flex gap-3">
        {/* 썸네일 */}
        <div className="relative w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden bg-gray-100">
          <Image
            src={product.thumbnail}
            alt={product.title}
            fill
            className="object-contain p-1"
            sizes="80px"
          />
        </div>

        {/* 제품명 & 가격 */}
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-gray-800 line-clamp-2 mb-1">
            {product.title}
          </h4>
          <div className="flex items-baseline gap-1">
            <span className="text-lg font-bold text-gray-900">
              {product.price.toLocaleString()}
            </span>
            <span className="text-xs text-gray-500">원</span>
          </div>
          <div className="text-xs text-gray-400 mt-1">
            리뷰 {product.reviewCount.toLocaleString()}개
          </div>
        </div>
      </div>
    </motion.div>
  );
}
