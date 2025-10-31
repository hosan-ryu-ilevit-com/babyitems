'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import Image from 'next/image';
import { ChatCircleDots, ChartBar, ArrowDown } from '@phosphor-icons/react/dist/ssr';
import { products } from '@/data/products';
import { useState, useEffect } from 'react';

export default function Home() {
  const [showFloatingButton, setShowFloatingButton] = useState(false);

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
          {/* Test Version Badge */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="mb-4"
            suppressHydrationWarning
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 border border-blue-200 rounded-full">
              <span className="text-xs font-semibold text-blue-700">BETA</span>
              <span className="text-xs text-blue-600">분유포트 전용</span>
            </div>
          </motion.div>

          {/* Character with Speech Bubble */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="relative mb-6"
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
            className="text-center mb-2"
            suppressHydrationWarning
          >
            <h1 className="text-3xl font-bold text-gray-900 mb-4 leading-tight">
              AI가 찾아주는<br />
              나만의 분유포트
            </h1>
            <p className="text-base text-gray-600 leading-relaxed px-2">
              가장 많이 팔린 대표제품들 중에서<br />
              내 상황에 딱 맞는 제품을 찾아드려요
            </p>
          </motion.div>

           {/* Powered by Naver Store */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="flex items-center gap-2 mt-4 mb-12"
            suppressHydrationWarning
          >
            <span className="text-xs text-gray-500">Powered by</span>
            <Image
              src="/images/naverstorelogo.png"
              alt="네이버 스토어"
              width={80}
              height={20}
              className="object-contain"
            />
          </motion.div>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="w-full max-w-sm space-y-3 mb-4 px-2"
            suppressHydrationWarning
          >
            <Link href="/chat" className="block">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="w-full h-14 bg-linear-to-r from-gray-900 to-gray-700 text-white text-base font-semibold rounded-2xl shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2.5"
              >
                <ChatCircleDots size={24} weight="bold" />
                <span>1분만에 추천받기</span>
              </motion.button>
            </Link>

            <button
              onClick={scrollToRanking}
              className="w-full h-14 bg-white border border-gray-300 text-gray-700 text-base font-medium rounded-2xl hover:bg-gray-50 hover:border-gray-400 transition-all flex items-center justify-center gap-2"
            >
              <ChartBar size={22} weight="bold" />
              <span>대표제품 랭킹 보기</span>
            </button>
          </motion.div>
          </div>

          {/* Scroll Indicator */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="flex flex-col items-center cursor-pointer pb-8"
            onClick={scrollToRanking}
            suppressHydrationWarning
          >
            <motion.div
              animate={{ y: [0, 8, 0] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
              suppressHydrationWarning
            >
              <ArrowDown size={24} weight="bold" className="text-gray-400" />
            </motion.div>
          </motion.div>
        </section>

        {/* Ranking Section */}
        <section id="ranking-section" className="min-h-screen bg-gray-50 px-6 py-8">
          {/* Section Header */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              실시간 인기 랭킹
            </h2>
             <p className="text-l font-bold text-gray-900 mb-2">
              ✅ 검증된 선택 - 이 중에서 골라드려요!
            </p>
            
            <p className="text-sm text-gray-600">
              *네이버 스토어 분유포트 판매량 많은 순 <br></br>*2025년 10월 31일 기준
            </p>
          </div>

          {/* Product List */}
          <div className="space-y-4 pb-24">
            {products.map((product, index) => (
              <motion.div
                key={product.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.1 + index * 0.03 }}
                className="bg-white rounded-2xl overflow-hidden border border-gray-200 hover:border-gray-300 transition-all"
                suppressHydrationWarning
              >
                <div className="flex gap-4 p-4">
                  {/* Ranking Badge */}
                  <div className="shrink-0 w-8 flex flex-col items-center justify-start pt-1">
                    <div className="w-8 h-8 bg-gray-900 rounded-full flex items-center justify-center">
                      <span className="text-white font-bold text-sm">
                        {product.ranking}
                      </span>
                    </div>
                  </div>

                  {/* Thumbnail */}
                  <div className="shrink-0 w-24 h-24 rounded-xl overflow-hidden bg-gray-100">
                    <Image
                      src={product.thumbnail}
                      alt={product.title}
                      width={96}
                      height={96}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  {/* Product Info */}
                  <div className="flex-1 min-w-0 flex flex-col justify-between py-1">
                    <h3 className="text-sm font-medium text-gray-900 line-clamp-2 leading-snug mb-2">
                      {product.title}
                    </h3>
                    <div className="space-y-1.5">
                      <div className="text-lg font-bold text-gray-900">
                        {product.price.toLocaleString()}<span className="text-sm font-normal text-gray-600 ml-0.5">원</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="inline-flex items-center gap-1 bg-gray-100 px-2 py-0.5 rounded-md">
                          <span className="font-medium text-gray-700">리뷰 {product.reviewCount.toLocaleString()}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Action Button */}
                <div className="px-4 pb-4">
                  <a
                    href={product.reviewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full py-2.5 text-center text-sm font-medium text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
                  >
                    상세보기
                  </a>
                </div>
              </motion.div>
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
              <Link href="/chat">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
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
