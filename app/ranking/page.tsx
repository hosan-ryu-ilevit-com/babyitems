'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { products } from '@/data/products';

export default function RankingPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100">
      <div className="relative w-full max-w-[480px] min-h-screen bg-white shadow-lg">
        {/* Header */}
        <header className="sticky top-0 left-0 right-0 bg-white border-b border-gray-200 px-4 py-4 z-10">
          <div className="flex items-center justify-between">
            <Link href="/" className="text-gray-600 hover:text-gray-900">
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </Link>
            <h1 className="text-lg font-bold text-gray-900">실시간 랭킹</h1>
            <div className="w-6"></div>
          </div>
        </header>

        {/* Product List */}
        <main className="px-4 py-6 pb-24">
          <div className="space-y-4">
            {products.map((product, index) => (
              <motion.div
                key={product.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
                className="bg-white border border-gray-200 rounded-2xl p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex gap-4">
                  {/* Ranking Badge */}
                  <div className="flex-shrink-0 w-12 h-12 bg-linear-to-br from-blue-500 to-purple-500 rounded-xl flex items-center justify-center">
                    <span className="text-white font-bold text-lg">
                      {product.ranking}
                    </span>
                  </div>

                  {/* Product Info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-gray-900 mb-2 line-clamp-2">
                      {product.title}
                    </h3>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg font-bold text-gray-900">
                        {product.price.toLocaleString()}원
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span>⭐ 리뷰 {product.reviewCount.toLocaleString()}개</span>
                    </div>
                  </div>
                </div>

                {/* Core Values Preview (optional) */}
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <div className="flex gap-2 flex-wrap">
                    {product.coreValues.temperatureControl >= 8 && (
                      <span className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-full">
                        🌡️ 온도조절 우수
                      </span>
                    )}
                    {product.coreValues.hygiene >= 8 && (
                      <span className="px-2 py-1 bg-green-50 text-green-700 text-xs rounded-full">
                        ✨ 위생 우수
                      </span>
                    )}
                    {product.coreValues.priceValue >= 8 && (
                      <span className="px-2 py-1 bg-purple-50 text-purple-700 text-xs rounded-full">
                        💰 가성비
                      </span>
                    )}
                    {product.coreValues.portability >= 8 && (
                      <span className="px-2 py-1 bg-orange-50 text-orange-700 text-xs rounded-full">
                        🎒 휴대성
                      </span>
                    )}
                  </div>
                </div>

                {/* Action Button */}
                <div className="mt-3">
                  <a
                    href={product.reviewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full py-2 text-center text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                  >
                    리뷰 보기
                  </a>
                </div>
              </motion.div>
            ))}
          </div>
        </main>

        {/* Floating Button */}
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="fixed bottom-0 left-0 right-0 px-4 py-4 bg-white border-t border-gray-200"
          style={{ maxWidth: '480px', margin: '0 auto' }}
        >
          <Link href="/chat">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="w-full h-12 bg-linear-to-r from-blue-500 to-purple-500 text-white font-semibold rounded-full shadow-lg"
            >
              나에게 맞는 제품 찾기
            </motion.button>
          </Link>
        </motion.div>
      </div>
    </div>
  );
}
