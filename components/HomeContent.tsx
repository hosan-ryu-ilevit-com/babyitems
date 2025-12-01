'use client';

import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { products } from '@/data/products';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { logPageView, logButtonClick, logFavoriteAction } from '@/lib/logging/clientLogger';
import ProductBottomSheet from '@/components/ProductBottomSheet';
import FavoritesBottomSheet from '@/components/FavoritesBottomSheet';
import { GuideBottomSheet } from '@/components/GuideBottomSheet';
import { Product } from '@/types';
import { useFavorites } from '@/hooks/useFavorites';
import { Playfair_Display } from 'next/font/google';

const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: ['600'],
});

export function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(false);
  const [isFavoritesSheetOpen, setIsFavoritesSheetOpen] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const { favorites, toggleFavorite, isFavorite, count } = useFavorites();

  // 페이지 뷰 로깅
  useEffect(() => {
    logPageView('home');
  }, []);

  const handleProductClick = (product: Product) => {
    setSelectedProduct(product);
    setIsBottomSheetOpen(true);
    logButtonClick(`제품 클릭: ${product.title}`, 'home');
  };

  const handleHeartClick = (e: React.MouseEvent, productId: string) => {
    e.stopPropagation(); // Prevent product click event
    const wasFavorite = isFavorite(productId);
    toggleFavorite(productId);

    // Log favorite action
    const product = products.find(p => p.id === productId);
    if (product) {
      const action = wasFavorite ? 'removed' : 'added';
      const newCount = wasFavorite ? count - 1 : count + 1;
      logFavoriteAction(action, productId, product.title, newCount);
    }
  };

  const handleFavoritesClick = () => {
    setIsFavoritesSheetOpen(true);
    logButtonClick('찜 목록 열기', 'home');
  };

  const handleGuideOpen = () => {
    setIsGuideOpen(true);
    logButtonClick('아기용품 1분 가이드 열기', 'home');
  };

  const handleGuideClose = () => {
    setIsGuideOpen(false);
    // Mark guide as viewed
    localStorage.setItem('babyitem_guide_viewed', 'true');
  };

  const favoriteProducts = products.filter((p) => favorites.includes(p.id));

  return (
    <div className="flex min-h-screen items-start justify-center bg-gray-100">
      {/* 모바일 최적화 컨테이너 */}
      <div className="relative w-full max-w-[480px] min-h-screen shadow-lg" style={{ backgroundColor: '#FCFCFC' }}>
        {/* Header */}
        <header className="flex items-center justify-between px-6 py-4">
          <h1 className="text-xl font-bold text-gray-900"></h1>
          <button
            onClick={() => {
              router.push('/favorites');
              logButtonClick('찜한거 보기 아이콘 클릭', 'home');
            }}
            className="relative p-2"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="#FF6B6B"
              stroke="#FF6B6B"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
            {count > 0 && (
              <div className="absolute -top-1 -right-1 w-5 h-5 bg-[#FF6B6B] rounded-full flex items-center justify-center">
                <span className="text-white text-xs font-bold">{count}</span>
              </div>
            )}
          </button>
        </header>

        {/* Main Content */}
        <section className="flex flex-col items-center justify-center px-6 pt-8 pb-24 min-h-[calc(100vh-180px)]">

            {/* Main Title */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-center mb-auto mt-0 w-full"
              suppressHydrationWarning
            >
              <h1 className="text-2xl font-bold text-gray-900 mb-2 leading-tight">
                수천 개 아기용품 중<br />
                <span style={{ color: '#0084FE' }}>내게 딱 맞는 하나</span> 찾기
              </h1>
              <p className="text-sm text-gray-500 mt-3 mb-8">고민하는 시간을 줄여보세요.</p>

              {/* Video Character Animation */}
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
                className="w-48 h-48 mx-auto"
              >
                <video
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="w-full h-full object-contain"
                >
                  <source src="/animations/character.mp4" type="video/mp4" />
                </video>
              </motion.div>


              {/* Guide Button with Floating Bubble */}
              {/* <div className="mt-12 flex flex-col items-center gap-3">
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4, delay: 0.5 }}
                  className="relative"
                >
                  <motion.div
                    animate={{ y: [0, -4, 0] }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: "easeInOut"
                    }}
                    className="relative"
                  >
                    <div className="text-xs font-semibold px-3 py-1.5 rounded-full whitespace-nowrap text-white flex items-center gap-1.5" style={{ backgroundColor: '#4B4B4B' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="#FCD34D">
                        <path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z"/>
                      </svg>
                      <span>첫 구매라면 필수!</span>

                    </div>
                    <div className="absolute left-1/2 -translate-x-1/2 -bottom-1 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px]" style={{ borderTopColor: '#4B4B4B' }}></div>
                  </motion.div>
                </motion.div>

                <button
                  onClick={handleGuideOpen}
                  className="px-4 py-2 bg-gray-100 text-gray-600 text-sm font-semibold rounded-lg hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
                >
                  아기용품 1분 가이드
                </button>
              </div> */}
            </motion.div>
        </section>

        <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.4 }}
            className="fixed left-0 right-0 flex justify-center"
            style={{
              bottom: '100px',
              maxWidth: '480px',
              margin: '0 auto',
              pointerEvents: 'none',
              zIndex: 100
            }}
          >
            <motion.div
              animate={{ y: [0, -4, 0] }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut"
              }}
              className="relative"
            >
              <div className="text-xs font-semibold px-4 py-2 rounded-full whitespace-nowrap text-white" style={{ backgroundColor: '#4B4B4B' }}>
                AI가 대신 발품 파는, <span style={{ color: '#FCD34D' }}>광고 없는</span> 구매 가이드
              </div>
              {/* Speech bubble tail pointing down */}
              <div className="absolute left-1/2 -translate-x-1/2 -bottom-1 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px]" style={{ borderTopColor: '#4B4B4B' }}></div>
            </motion.div>
        </motion.div>

        {/* Bottom Fixed Container - CTA Button + Input Bar */}
        <div className="fixed bottom-0 left-0 right-0 px-4 py-4 border-t border-gray-200 z-40" style={{ maxWidth: '480px', margin: '0 auto', backgroundColor: '#FCFCFC' }}>
          {/* 1분만에 추천받기 Button */}
          <Link href="/categories">
            <button
              onClick={() => logButtonClick('1분만에 추천받기', 'home')}
              className="w-full h-14 text-white text-base font-semibold rounded-2xl transition-all flex items-center justify-center gap-2.5 mb-3"
              style={{ backgroundColor: '#0084FE' }}
            >
              <span>바로 추천받기</span>
              <span className="px-2 py-0.5 rounded-md text-xs font-bold flex items-center gap-1 text-white" style={{ background: 'linear-gradient(135deg, #5855ff, #71c4fd, #5cdcdc)' }}>
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 22l-.394-1.433a2.25 2.25 0 00-1.423-1.423L13.25 19l1.433-.394a2.25 2.25 0 001.423-1.423L16.5 16l.394 1.433a2.25 2.25 0 001.423 1.423L19.75 19l-1.433.394a2.25 2.25 0 00-1.423 1.423z" />
                </svg>
                <span>AI</span>
              </span>
            </button>
          </Link>
        </div>


        {/* Product Bottom Sheet */}
        <ProductBottomSheet
          isOpen={isBottomSheetOpen}
          product={selectedProduct}
          onClose={() => setIsBottomSheetOpen(false)}
          onAddToFavorites={(productId) => {
            toggleFavorite(productId);
          }}
          isFavorite={selectedProduct ? isFavorite(selectedProduct.id) : false}
          onOpenFavorites={() => {
            setIsBottomSheetOpen(false);
            setTimeout(() => setIsFavoritesSheetOpen(true), 300);
          }}
          favoritesCount={count}
        />

        {/* Favorites Bottom Sheet */}
        <FavoritesBottomSheet
          isOpen={isFavoritesSheetOpen}
          onClose={() => setIsFavoritesSheetOpen(false)}
          favorites={favoriteProducts}
          onRemove={(productId) => {
            toggleFavorite(productId);
            logButtonClick(`찜 취소: ${productId}`, 'home');
          }}
        />

        {/* Guide Bottom Sheet */}
        <GuideBottomSheet
          isOpen={isGuideOpen}
          onClose={handleGuideClose}
        />
      </div>
    </div>
  );
}
