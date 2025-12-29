'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X } from '@phosphor-icons/react/dist/ssr';
import { Product } from '@/types';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { logButtonClick } from '@/lib/logging/clientLogger';

interface ProductBottomSheetProps {
  isOpen: boolean;
  product: Product | null;
  onClose: () => void;
  onAddToFavorites?: (productId: string) => void;
  isFavorite?: boolean;
  onOpenFavorites?: () => void;
  favoritesCount?: number;
  fromPage?: string; // 돌아갈 페이지 경로 (기본값: '/')
}

export default function ProductBottomSheet({
  isOpen,
  product,
  onClose,
  onAddToFavorites,
  isFavorite = false,
  onOpenFavorites,
  favoritesCount = 0,
  fromPage = '/' // 기본값은 홈 페이지
}: ProductBottomSheetProps) {
  const router = useRouter();

  if (!product) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 z-40"
          />

          {/* Bottom Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl z-50 max-w-[480px] mx-auto"
          >
            {/* Handle Bar */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 bg-gray-300 rounded-full" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-6 pb-4 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-900">제품 정보</h3>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X size={24} weight="bold" className="text-gray-600" />
              </button>
            </div>

            {/* Content */}
            <div className="px-6 py-5">
              {/* Product Info - Horizontal Layout */}
              <div className="flex gap-4 mb-5">
                {/* Product Image - Left Side */}
                <div className="relative w-24 h-24 bg-gray-50 rounded-xl overflow-hidden border border-gray-200 flex-shrink-0">
                  <Image
                    src={product.thumbnail}
                    alt={product.title}
                    fill
                    className="object-cover"
                  />
                  {/* Ranking Badge */}
                  <div className="absolute top-0 left-0 w-7 h-7 bg-gray-900 rounded-tl-md rounded-tr-none rounded-bl-none rounded-br-md flex items-center justify-center">
                    <span className="text-white font-bold text-sm">
                      {product.ranking}
                    </span>
                  </div>
                </div>

                {/* Product Details - Right Side */}
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-medium text-gray-800 mb-1 leading-[1.4] line-clamp-2">
                    {product.title}
                  </h4>
                  {product.brand && (
                    <p className="text-[13px] text-gray-500 font-medium mb-2">{product.brand}</p>
                  )}

                  {/* Review Count - 위로 올림 */}
                  <div className="flex items-center gap-1 text-xs text-gray-600 mb-2">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="#FCD34D" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
                    </svg>
                    <span className="font-medium">리뷰 {product.reviewCount.toLocaleString()}</span>
                  </div>

                  <div className="mb-2">
                    <span className="text-[16px] font-bold text-gray-900">
                      {product.price.toLocaleString()}<span className="text-sm">원</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pb-2">
                {/* Top Row - 쿠팡에서 보기 + 최저가 보기 */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      logButtonClick(`쿠팡에서 보기: ${product.title}`, 'home_bottomsheet');
                      window.open(`https://www.coupang.com/vp/products/${product.id}`, '_blank');
                    }}
                    className="py-3 font-semibold rounded-xl text-sm transition-all bg-gray-100 hover:bg-gray-200 text-gray-700"
                  >
                    쿠팡에서 보기
                  </button>
                  <button
                    onClick={() => {
                      logButtonClick(`최저가 보기: ${product.title}`, 'home_bottomsheet');
                      window.open(`https://search.danawa.com/mobile/dsearch.php?keyword=${encodeURIComponent(product.title)}&sort=priceASC`, '_blank');
                    }}
                    className="py-3 font-semibold rounded-xl text-sm transition-all bg-gray-100 hover:bg-gray-200 text-gray-700"
                  >
                    최저가 보기
                  </button>
                </div>

                {/* Bottom Row - Add to Favorites - 나중에 사용할 수 있도록 임시 숨김 */}
                {/* {onAddToFavorites && (
                  <button
                    onClick={() => {
                      onAddToFavorites(product.id);
                      logButtonClick(`찜하고 비교하기: ${product.title}`, 'home_bottomsheet');
                    }}
                    className="w-full py-3 font-semibold rounded-xl text-sm transition-all flex items-center justify-center gap-2"
                    style={{
                      backgroundColor: isFavorite ? '#FFE5E5' : '#FFF4F4',
                      color: isFavorite ? '#FF6B6B' : '#FF8888',
                      border: `2px solid ${isFavorite ? '#FF6B6B' : '#FFD0D0'}`
                    }}
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill={isFavorite ? "#FF6B6B" : "none"}
                      stroke="#FF6B6B"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                    </svg>
                    {isFavorite ? '찜 완료' : '찜하고 비교하기'}
                  </button>
                )} */}

                {/* Open Favorites Button - Show when user has favorites - 나중에 사용할 수 있도록 임시 숨김 */}
                {/* {isFavorite && favoritesCount > 0 && onOpenFavorites && (
                  <motion.button
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                    onClick={() => {
                      onOpenFavorites();
                      logButtonClick('찜 목록 보기 (제품 바텀시트)', 'home_bottomsheet');
                    }}
                    className="w-full py-2 text-xs font-medium transition-all flex items-center justify-center gap-1.5 text-gray-600 hover:text-[#FF6B6B]"
                  >
                    <span>찜한 상품 보기 ({favoritesCount}개)</span>
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </motion.button>
                )} */}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
