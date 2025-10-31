'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import Image from 'next/image';
import { ChatCircleDots, ChartBar, ArrowDown, Star } from '@phosphor-icons/react/dist/ssr';
import { products } from '@/data/products';

export default function Home() {
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
        <section className="flex flex-col items-center justify-center min-h-screen px-8 py-16">
          {/* Main Title */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
            suppressHydrationWarning
          >
            <h1 className="text-4xl font-bold text-gray-900 mb-6 leading-tight">
             대표 분유포트 중에서
              <br />
              나만의 Top 3 찾기
            </h1>
            <p className="text-lg text-gray-600 leading-relaxed mb-12">
              검증된 베스트셀러를 분석해서
              <br />
              내 상황에 딱 맞는 제품을 추천해요
            </p>
          </motion.div>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="w-full max-w-md space-y-3 mb-16"
            suppressHydrationWarning
          >
            <Link href="/chat" className="block">
              <button className="w-full h-14 bg-gray-900 text-white font-medium rounded-2xl hover:bg-gray-800 transition-colors flex items-center justify-center gap-2">
                <ChatCircleDots size={20} weight="bold" />
                <span>맞춤 추천 받기</span>
              </button>
            </Link>

            <button
              onClick={scrollToRanking}
              className="w-full h-14 bg-white border-2 border-gray-200 text-gray-900 font-medium rounded-2xl hover:border-gray-300 transition-colors flex items-center justify-center gap-2"
            >
              <ChartBar size={20} weight="bold" />
              <span>실시간 랭킹 보기</span>
            </button>
          </motion.div>

          {/* Scroll Indicator */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="flex flex-col items-center cursor-pointer"
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
            <p className="text-sm text-gray-600">
              지금 가장 많이 판매되는 제품이에요 <br></br> (네이버 스토어 판매량 많은 순, 2025. 10. 31 update)
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
                    <div className="space-y-1">
                      <div className="text-lg font-bold text-gray-900">
                        {product.price.toLocaleString()}원
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-gray-500">
                        <Star size={14} weight="fill" className="text-yellow-500" />
                        <span>{product.reviewCount.toLocaleString()}</span>
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

          {/* Bottom CTA */}
          <div className="fixed bottom-0 left-0 right-0 px-6 py-4 bg-white/95 backdrop-blur-sm border-t border-gray-200" style={{ maxWidth: '480px', margin: '0 auto' }}>
            <Link href="/chat">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="w-full h-14 bg-gray-900 text-white font-medium rounded-2xl shadow-lg hover:bg-gray-800 transition-colors"
              >
                맞춤 추천 받기
              </motion.button>
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
