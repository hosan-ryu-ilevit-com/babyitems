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
}

export default function ProductBottomSheet({ isOpen, product, onClose }: ProductBottomSheetProps) {
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
                  <div className="absolute top-2 left-2 w-6 h-6 bg-gray-900 rounded-full flex items-center justify-center shadow-lg">
                    <span className="text-white font-bold text-xs">
                      {product.ranking}
                    </span>
                  </div>
                </div>

                {/* Product Details - Right Side */}
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-bold text-gray-900 mb-2 leading-[1.4] line-clamp-2">
                    {product.title}
                  </h4>

                  <div className="mb-2">
                    <span className="text-lg font-bold text-gray-900">
                      {product.price.toLocaleString()}원
                    </span>
                  </div>

                  {/* Review Count */}
                  <div className="flex items-center gap-1 text-xs text-gray-600">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="#FCD34D" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
                    </svg>
                    <span className="font-medium">리뷰 {product.reviewCount.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-2 pb-2">
                <button
                  onClick={() => {
                    logButtonClick(`쿠팡에서 보기: ${product.title}`, 'home_bottomsheet');
                    window.open(product.reviewUrl, '_blank');
                  }}
                  className="py-3 font-semibold rounded-xl text-sm transition-all bg-gray-100 hover:bg-gray-200 text-gray-700"
                >
                  쿠팡에서 보기
                </button>
                <button
                  onClick={() => {
                    logButtonClick(`이 상품 질문하기: ${product.title}`, 'home_bottomsheet');
                    router.push(`/product-chat?productId=${product.id}&from=/`);
                    onClose();
                  }}
                  className="py-3 font-semibold rounded-xl text-sm transition-all hover:opacity-90 flex items-center justify-center gap-1.5"
                  style={{ backgroundColor: '#E5F1FF', color: '#0074F3' }}
                >
                  <svg
                    className="w-4 h-4"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 22l-.394-1.433a2.25 2.25 0 00-1.423-1.423L13.25 19l1.433-.394a2.25 2.25 0 001.423-1.423L16.5 16l.394 1.433a2.25 2.25 0 001.423 1.423L19.75 19l-1.433.394a2.25 2.25 0 00-1.423 1.423z" />
                  </svg>
                  이 상품 질문하기
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
