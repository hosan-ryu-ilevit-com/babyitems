'use client';

import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { Product } from '@/types';
import { useRouter } from 'next/navigation';

interface FavoritesBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  favorites: Product[];
  onRemove: (productId: string) => void;
}

export default function FavoritesBottomSheet({
  isOpen,
  onClose,
  favorites,
  onRemove,
}: FavoritesBottomSheetProps) {
  const router = useRouter();

  const handleCompare = () => {
    if (favorites.length !== 3) {
      alert('정확히 3개의 제품을 선택해주세요');
      return;
    }
    // Navigate to compare page with product IDs
    const productIds = favorites.map((p) => p.id).join(',');
    router.push(`/compare?products=${productIds}`);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 z-50"
          />

          {/* Bottom Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl z-50 max-w-[480px] mx-auto"
            style={{ maxHeight: '80vh' }}
          >
            {/* Handle Bar */}
            <div className="flex justify-center pt-4 pb-2">
              <div className="w-12 h-1 bg-gray-300 rounded-full" />
            </div>

            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900">
                  찜하고 비교하기
                </h2>
                <button
                  onClick={onClose}
                  className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              <p className="text-sm text-gray-600 mt-1">
                3개 선택 가능 ({favorites.length}/3)
              </p>
            </div>

            {/* Content */}
            <div className="px-6 py-6 overflow-y-auto" style={{ maxHeight: 'calc(80vh - 220px)' }}>
              {favorites.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                  <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-4">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                  </svg>
                  <p className="text-base font-medium">찜한 상품이 없습니다</p>
                  <p className="text-sm mt-1">상품 사진 우측 위 하트를 눌러 상품을 찜해보세요</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {favorites.map((product) => (
                    <motion.div
                      key={product.id}
                      layout
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -100 }}
                      className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl border border-gray-200"
                    >
                      {/* Product Image */}
                      <div className="relative w-20 h-20 flex-shrink-0 bg-white rounded-xl overflow-hidden">
                        <Image
                          src={product.thumbnail}
                          alt={product.title}
                          fill
                          className="object-cover"
                        />
                        {/* Ranking Badge */}
                        <div className="absolute top-1 left-1 w-6 h-6 bg-gray-900 rounded-full flex items-center justify-center">
                          <span className="text-white font-bold text-xs">
                            {product.ranking}
                          </span>
                        </div>
                      </div>

                      {/* Product Info */}
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-medium text-gray-900 line-clamp-2 leading-tight mb-1">
                          {product.title}
                        </h3>
                        <p className="text-base font-bold text-gray-900">
                          {product.price.toLocaleString()}원
                        </p>
                      </div>

                      {/* Remove Button */}
                      <button
                        onClick={() => onRemove(product.id)}
                        className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-full hover:bg-gray-200 transition-colors"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="#FF6B6B" stroke="#FF6B6B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                        </svg>
                      </button>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer CTA */}
            {favorites.length > 0 && (
              <div className="px-6 py-4 border-t border-gray-200">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleCompare}
                  disabled={favorites.length !== 3}
                  className={`w-full h-14 text-white text-base font-semibold rounded-2xl transition-all ${
                    favorites.length === 3
                      ? 'bg-[#0084FE] hover:bg-[#0074DD]'
                      : 'bg-gray-300 cursor-not-allowed'
                  }`}
                >
                  {favorites.length === 3
                    ? '이 3개 비교하기'
                    : `${3 - favorites.length}개 더 선택해주세요`}
                </motion.button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
