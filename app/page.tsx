'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import Image from 'next/image';
import { products } from '@/data/products';
import { useEffect, useState } from 'react';
import { logPageView, logButtonClick } from '@/lib/logging/clientLogger';
import ProductBottomSheet from '@/components/ProductBottomSheet';
import { Product } from '@/types';

export default function Home() {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(false);

  // 페이지 뷰 로깅
  useEffect(() => {
    logPageView('home');
  }, []);

  const handleProductClick = (product: Product) => {
    setSelectedProduct(product);
    setIsBottomSheetOpen(true);
    logButtonClick(`제품 클릭: ${product.title}`, 'home');
  };

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
            <p className="text-lg text-gray-600 leading-6 px-2">
              지금 가장 <strong className="font-bold">사랑받는 제품</strong> 중,<br />
              나만의 최고를 찾아드려요
            </p>
          </motion.div>
        </section>

        {/* Ranking Section */}
        <section id="ranking-section" className="min-h-screen bg-white px-6 pt-4 pb-8">
          {/* Section Header */}
          <div className="mb-6">
            <div className="flex items-center gap-3 mt-6 mb-1">
              <h2 className="text-2xl font-bold text-gray-900">
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
                  <div className="bg-gray-100 text-xs font-semibold px-3 py-1.5 rounded-full whitespace-nowrap" style={{ color: '#0074F3' }}>
                    이 중에서 골라드려요!
                  </div>
                  {/* Speech bubble tail */}
                  <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-0 h-0 border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent border-r-[6px] border-r-gray-100"></div>
                </motion.div>
              </motion.div>
            </div>
            <div className="flex items-center gap-1">
                <span className="text-[10px] text-gray-500">Powered by</span>
                <Image
                  src="/images/naverstorelogo.png"
                  alt="네이버 스토어"
                  width={60}
                  height={15}
                  className="object-contain"
                />
              </div>
            <div className="flex items-center gap-2 mt-4 text-xs text-gray-500">

              <span>판매량 많은 순</span>
              <span className="text-gray-400">•</span>
              <span>2025년 11월 12일 기준</span>
            </div>
          </div>

          {/* Product Grid - 2 columns */}
          <div className="grid grid-cols-2 gap-4 pb-24">
            {products.map((product, index) => (
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
                <div className="relative aspect-square bg-gray-50 rounded-2xl overflow-hidden border border-gray-200 mb-2.5 group-hover:border-gray-300 transition-colors">
                  <Image
                    src={product.thumbnail}
                    alt={product.title}
                    fill
                    className="object-cover"
                  />
                  {/* Ranking Badge - Top Left - All Products */}
                  <div className="absolute top-2 left-2 w-8 h-8 bg-gray-900 rounded-full flex items-center justify-center shadow-lg">
                    <span className="text-white font-bold text-sm">
                      {product.ranking}
                    </span>
                  </div>
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
            className="fixed bottom-0 left-0 right-0 px-6 py-4 bg-white/95 backdrop-blur-sm border-t border-gray-200"
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
              </motion.button>
            </Link>
          </motion.div>
        </section>

        {/* Product Bottom Sheet */}
        <ProductBottomSheet
          isOpen={isBottomSheetOpen}
          product={selectedProduct}
          onClose={() => setIsBottomSheetOpen(false)}
        />
      </div>
    </div>
  );
}
