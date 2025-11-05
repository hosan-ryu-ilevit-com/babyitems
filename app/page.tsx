'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import Image from 'next/image';
import { ChatCircleDots, ChartBar, ArrowDown } from '@phosphor-icons/react/dist/ssr';
import { products } from '@/data/products';
import { useState, useEffect } from 'react';
import { logPageView, logButtonClick } from '@/lib/logging/clientLogger';

export default function Home() {
  const [showFloatingButton, setShowFloatingButton] = useState(false);

  // 페이지 뷰 로깅
  useEffect(() => {
    logPageView('home');
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      // 조금만 스크롤해도 플로팅 버튼 표시
      const scrollThreshold = 190;
      setShowFloatingButton(window.scrollY > scrollThreshold);
    };

    window.addEventListener('scroll', handleScroll);
    handleScroll(); // 초기 상태 설정

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToRanking = () => {
    const rankingSection = document.getElementById('ranking-section');
    if (rankingSection) {
      rankingSection.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100">
      {/* 모바일 최적화 컨테이너 */}
      <div className="relative w-full max-w-[480px] bg-white shadow-lg">
        {/* Hero Section */}
        <section className="flex flex-col items-center justify-between min-h-screen px-6 py-12">
          <div className="flex-1 flex flex-col items-center justify-center w-full">
         

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
            className="text-center mb-4"
            suppressHydrationWarning
          >
            <h1 className="text-3xl font-extrabold text-gray-900 mb-3 leading-tight">
              
              AI가 찾아주는<br></br>내게 딱 맞는 분유포트
            </h1>
            <p className="text-base text-gray-600 leading-relaxed px-2">
              <strong className="font-bold">놓칠 수도 있는 기준</strong>까지<br />
              꼼꼼하게 전부 챙겨드려요
            </p>
          </motion.div>

          

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="w-full max-w-sm space-y-3 mt-34 px-2"
            suppressHydrationWarning
          >
            <Link href="/priority" className="block">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => logButtonClick('나에게 맞는 분유포트 찾기 시작', 'home')}
                className="w-full h-14 bg-linear-to-r from-gray-900 to-gray-700 text-white text-base font-semibold rounded-2xl shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2.5"
              >
                <ChatCircleDots size={24} weight="bold" />
                <span>1분만에 추천받기</span>
              </motion.button>
            </Link>

            
          </motion.div>
          </div>
        </section>

        {/* Ranking Section */}
        <section id="ranking-section" className="min-h-screen bg-white px-6 pt-4 pb-8">
          {/* Section Header */}
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-1">
              실시간 랭킹
            </h2>
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
            
              <span>네이버 스토어 분유포트 판매량 많은 순</span>
              <span className="text-gray-400">•</span>
              <span>2025년 11월 3일 기준</span>
            </div>
          </div>

          {/* Product Grid - 2 columns */}
          <div className="grid grid-cols-2 gap-4 pb-24">
            {products.map((product, index) => (
              <motion.a
                key={product.id}
                href={product.reviewUrl}
                target="_blank"
                rel="noopener noreferrer"
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
              </motion.a>
            ))}
          </div>

          {/* Bottom CTA - 스크롤 시에만 표시 */}
          {showFloatingButton && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.3 }}
              className="fixed bottom-0 left-0 right-0 px-6 py-4 bg-white/95 backdrop-blur-sm border-t border-gray-200"
              style={{ maxWidth: '480px', margin: '0 auto' }}
            >
              <Link href="/priority">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => logButtonClick('나에게 맞는 분유포트 찾기 시작 (플로팅)', 'home')}
                  className="w-full h-14 bg-linear-to-r from-gray-900 to-gray-700 text-white text-base font-semibold rounded-2xl shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2.5"
                >
                  <ChatCircleDots size={24} weight="bold" />
                  <span>1분만에 추천받기</span>
                </motion.button>
              </Link>
            </motion.div>
          )}
        </section>
      </div>
    </div>
  );
}
