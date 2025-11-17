'use client';

import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import Image from 'next/image';
import { products } from '@/data/products';
import { useEffect, useState } from 'react';
import { logPageView, logButtonClick, logFavoriteAction } from '@/lib/logging/clientLogger';
import ProductBottomSheet from '@/components/ProductBottomSheet';
import FavoritesBottomSheet from '@/components/FavoritesBottomSheet';
import { Product } from '@/types';
import { useFavorites } from '@/hooks/useFavorites';

export default function Home() {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(false);
  const [isFavoritesSheetOpen, setIsFavoritesSheetOpen] = useState(false);
  const { favorites, toggleFavorite, isFavorite, canAddMore, count } = useFavorites();

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
    const success = toggleFavorite(productId);

    if (!success && !wasFavorite) {
      // Show toast or alert when max limit reached
      alert('최대 3개까지 찜할 수 있습니다');
    } else if (success) {
      // Log favorite action
      const product = products.find(p => p.id === productId);
      if (product) {
        const action = wasFavorite ? 'removed' : 'added';
        const newCount = wasFavorite ? count - 1 : count + 1;
        logFavoriteAction(action, productId, product.title, newCount);
      }
    }
  };

  const handleFavoritesClick = () => {
    setIsFavoritesSheetOpen(true);
    logButtonClick('찜 목록 열기', 'home');
  };

  const favoriteProducts = products.filter((p) => favorites.includes(p.id));

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100">
      {/* 모바일 최적화 컨테이너 */}
      <div className="relative w-full max-w-[480px] bg-white shadow-lg">
        {/* Hero Section */}
        <section className="px-6 pt-12 pb-8">
          {/* Character */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="relative mb-0"
            suppressHydrationWarning
          >
            {/* Character */}
            <div className="flex justify-center">
              <Image
                src="/images/mainchartrans.png"
                alt="AI 추천 도우미"
                width={180}
                height={180}
                className="object-contain"
              />
            </div>
          </motion.div>

          {/* Main Title */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-center mb-8"
            suppressHydrationWarning
          >
            <h1 className="text-3xl font-extrabold text-gray-900 mb-3 leading-tight">
              분유포트, 수천 개를<br />다 비교해 볼 순 없잖아요
            </h1>
            <p className="text-lg text-gray-500 font-semibold leading-6 px-1">
            
              AI 비서가 딱 맞는 제품을 찾아드려요
            </p>
          </motion.div>
        </section>

        {/* Ranking Section */}
        <section id="ranking-section" className="min-h-screen bg-white px-6 pt-4 pb-8">
          {/* Section Header */}
          <div className="mb-6">
            <div className="flex items-center gap-3 mt-0 mb-0">
              <h2 className="text-xl font-bold text-gray-900">
                실시간 랭킹
              </h2>
              {/* Speech Bubble */}
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: 0.2 }}
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
                  <div className="bg-gray-100 text-xs font-semibold px-3 py-1.5 rounded-full whitespace-nowrap flex items-center gap-1.5" style={{ color: '#FF6B6B' }}>
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="#FF6B6B"
                      stroke="#FF6B6B"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                    </svg>
                    찜하고 바로 상세비교 가능!
                  </div>
                  {/* Speech bubble tail */}
                  <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-0 h-0 border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent border-r-[6px] border-r-gray-100"></div>
                </motion.div>
              </motion.div>
            </div>
            <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
              <span>판매 많은 순</span>
              <span className="text-gray-400">•</span>
              <span>11월 17일 기준</span>
            </div>
          </div>

          {/* Product Grid - 2 columns */}
          <div className="grid grid-cols-2 gap-4 pb-24">
            {[...products].sort((a, b) => a.ranking - b.ranking).map((product, index) => (
              <motion.div
                key={product.id}
                onClick={() => handleProductClick(product)}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.1 + index * 0.03 }}
                className="cursor-pointer group"
                suppressHydrationWarning
              >
                {/* Thumbnail with Ranking Badge */}
                <div className="relative aspect-square bg-gray-50 rounded-xl overflow-hidden border border-gray-100 mb-2.5 group-hover:border-gray-200 transition-colors">
                  <Image
                    src={product.thumbnail}
                    alt={product.title}
                    fill
                    className="object-cover"
                  />
                  {/* Ranking Badge - Top Left - All Products */}
                  <div className="absolute top-0 left-0 w-7 h-7 bg-gray-900 rounded-tl-md rounded-tr-none rounded-bl-none rounded-br-md flex items-center justify-center">
                    <span className="text-white font-bold text-sm">
                      {product.ranking}
                    </span>
                  </div>

                  {/* Heart Button - Bottom Right */}
                  <motion.button
                    onClick={(e) => handleHeartClick(e, product.id)}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    className={`absolute bottom-2 right-2 w-7 h-7 rounded-full flex items-center justify-center transition-colors z-10 ${
                      isFavorite(product.id) ? 'bg-[#FF6B6B]' : 'bg-black/30'
                    }`}
                  >
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill={isFavorite(product.id) ? "white" : "none"}
                      stroke="white"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                    </svg>
                  </motion.button>
                </div>

                {/* Product Info */}
                <div className="space-y-0">
                  {/* Title - 2 lines max */}
                  <h3 className="text-xs font-medium text-gray-900 line-clamp-2 leading-[1.4] h-[2.1rem]">
                    {product.title}
                  </h3>

                  {/* Price */}
                  <div className="text-base font-bold text-gray-900">
                    {product.price.toLocaleString()}원
                  </div>

                  {/* Review Count with Star */}
                  <div className="flex items-center gap-1 text-xs text-gray-600">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="#FCD34D" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
                    </svg>
                    <span className="font-medium">리뷰 {product.reviewCount.toLocaleString()}</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Bottom CTA - 항상 표시 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed bottom-0 left-0 right-0 px-6 py-4 bg-white/95 backdrop-blur-sm border-t border-gray-200 z-40"
            style={{ maxWidth: '480px', margin: '0 auto' }}
          >
            <Link href="/priority">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => logButtonClick('나에게 맞는 분유포트 찾기 시작 (플로팅)', 'home')}
                className="w-full h-14 text-white text-base font-semibold rounded-2xl transition-all flex items-center justify-center gap-2.5"
                style={{ backgroundColor: '#0084FE' }}
              >
                <span>1분만에 추천받기</span>
                <span className="px-2 py-0.5 bg-white/20 rounded-md text-xs font-bold flex items-center gap-1">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 22l-.394-1.433a2.25 2.25 0 00-1.423-1.423L13.25 19l1.433-.394a2.25 2.25 0 001.423-1.423L16.5 16l.394 1.433a2.25 2.25 0 001.423 1.423L19.75 19l-1.433.394a2.25 2.25 0 00-1.423 1.423z" />
                  </svg>
                  <span>AI</span>
                </span>
              </motion.button>
            </Link>
          </motion.div>

          {/* Favorites Floating Button - Bottom Right (above CTA) - Capsule Style */}
          <AnimatePresence>
            {count > 0 && (
              <motion.button
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleFavoritesClick}
                className="fixed bottom-[100px] right-6 px-4 py-3 bg-white rounded-full shadow-lg flex items-center gap-2 border-2 z-40"
                style={{
                  maxWidth: '480px',
                  borderColor: '#FF6B6B'
                }}
              >
                <div className="relative flex items-center gap-2">
                  {/* Heart Icon */}
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

                  {/* Count Badge */}
                  <div className="flex items-center justify-center w-6 h-6 bg-[#FF6B6B] rounded-full">
                    <span className="text-white text-xs font-bold">{count}</span>
                  </div>

                  {/* Text */}
                  <span className="text-sm font-semibold whitespace-nowrap" style={{ color: '#FF6B6B' }}>
                    찜한 상품 비교하기
                  </span>
                </div>
              </motion.button>
            )}
          </AnimatePresence>
        </section>

        {/* Product Bottom Sheet */}
        <ProductBottomSheet
          isOpen={isBottomSheetOpen}
          product={selectedProduct}
          onClose={() => setIsBottomSheetOpen(false)}
          onAddToFavorites={(productId) => {
            const success = toggleFavorite(productId);
            if (!success && !isFavorite(productId)) {
              alert('최대 3개까지 찜할 수 있습니다');
            }
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
      </div>
    </div>
  );
}
