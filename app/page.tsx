'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import Image from 'next/image';
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
        {/* Header */}
        <header className="absolute top-0 left-0 right-0 flex items-center justify-center p-4 z-10">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-lg font-bold text-gray-800"
          >
            아기용품 비서
          </motion.div>
        </header>

        {/* Hero Section */}
        <section className="flex flex-col items-center justify-center min-h-screen px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-center mb-12"
          >
            <h1 className="text-3xl font-bold text-gray-900 mb-4">
              딱 맞는 분유포트
              <br />
              골라드림
            </h1>
            <p className="text-base text-gray-600 leading-relaxed">
              실시간 가장 많이 판매되는 제품들 중에서
              <br />
              내 상황에 딱 맞는걸 찾아드려요
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="w-full max-w-sm mb-12"
          >
            <div className="aspect-square bg-linear-to-br from-blue-50 to-purple-50 rounded-3xl flex items-center justify-center">
              <div className="text-6xl">🍼</div>
            </div>
          </motion.div>

          {/* Scroll Indicator */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.6 }}
            className="flex flex-col items-center cursor-pointer mb-8"
            onClick={scrollToRanking}
          >
            <p className="text-sm text-gray-600 mb-2">스크롤해서 실시간 랭킹보기</p>
            <motion.div
              animate={{ y: [0, 8, 0] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
            >
              <svg
                className="w-6 h-6 text-gray-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </motion.div>
             <motion.div
              animate={{ y: [0, 8, 0] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
            >
              <svg
                className="w-6 h-6 text-gray-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </motion.div>
          </motion.div>

          {/* Floating Button */}
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.8 }}
            className="w-full px-6 mb-8"
          >
            
          </motion.div>
        </section>

        {/* Ranking Section */}
        <section id="ranking-section" className="min-h-screen bg-gray-50 px-4 py-8">
          {/* Section Header */}
          <div className="mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              지금 사람들이 가장 많이 구매하고 있는 분유포트
            </h2>
            <p className="text-sm text-gray-600">
              실시간 인기 랭킹 TOP {products.length}
            </p>
          </div>

          {/* Product List */}
          <div className="space-y-3 pb-24">
            {products.map((product, index) => (
              <motion.div
                key={product.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.1 + index * 0.03 }}
                className="bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex gap-3 p-3">
                  {/* Ranking Badge */}
                  <div className="shrink-0 w-8 flex flex-col items-center justify-start pt-1">
                    <div className="w-7 h-7 bg-linear-to-br from-blue-500 to-purple-500 rounded-lg flex items-center justify-center shadow-sm">
                      <span className="text-white font-bold text-sm">
                        {product.ranking}
                      </span>
                    </div>
                  </div>

                  {/* Thumbnail */}
                  <div className="shrink-0 w-20 h-20 rounded-lg overflow-hidden bg-gray-100">
                    <Image
                      src={product.thumbnail}
                      alt={product.title}
                      width={80}
                      height={80}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  {/* Product Info */}
                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <h3 className="text-xs font-medium text-gray-900 line-clamp-2 leading-tight mb-1">
                      {product.title}
                    </h3>
                    <div className="space-y-0.5">
                      <div className="text-base font-bold text-gray-900">
                        {product.price.toLocaleString()}원
                      </div>
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <span className="text-yellow-500">⭐</span>
                        <span>리뷰 {product.reviewCount.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Action Button */}
                <div className="px-3 pb-3">
                  <a
                    href={`https://search.danawa.com/dsearch.php?query=${encodeURIComponent(product.title)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full py-2 text-center text-sm font-medium text-white bg-linear-to-r from-green-500 to-green-600 rounded-lg hover:from-green-600 hover:to-green-700 transition-all shadow-sm"
                  >
                    최저가 구매하기
                  </a>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Bottom CTA */}
          <div className="fixed bottom-0 left-0 right-0 px-4 py-4 bg-white border-t border-gray-200" style={{ maxWidth: '480px', margin: '0 auto' }}>
            <Link href="/chat">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="w-full h-12 bg-linear-to-r from-blue-500 to-purple-500 text-white font-semibold rounded-full shadow-lg"
              >
                나에게 맞는 제품 찾기
              </motion.button>
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
