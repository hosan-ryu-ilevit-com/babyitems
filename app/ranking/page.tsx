'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { products } from '@/data/products';

export default function RankingPage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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
                initial={mounted ? { opacity: 0, y: 20 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
                className="bg-white border border-gray-200 rounded-2xl overflow-hidden hover:shadow-md transition-shadow relative"
              >
                {/* Ranking Badge */}
                <div className="absolute top-2 left-2 w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-500 rounded-lg flex items-center justify-center z-10 shadow-md">
                  <span className="text-white font-bold text-sm">
                    {product.ranking}
                  </span>
                </div>

                <div className="flex gap-4 p-4">
                  {/* Thumbnail */}
                  <div className="flex-shrink-0 w-24 h-24 rounded-xl overflow-hidden bg-gray-100">
                    <img
                      src={product.thumbnail}
                      alt={product.title}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  {/* Product Info */}
                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <h3 className="text-sm font-semibold text-gray-900 line-clamp-2 leading-snug">
                      {product.title}
                    </h3>
                    <div className="space-y-1">
                      <div className="text-lg font-bold text-gray-900">
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
                <div className="px-4 pb-4">
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
          initial={mounted ? { opacity: 0, y: 50 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="fixed bottom-0 left-0 right-0 px-4 py-4 bg-white border-t border-gray-200"
          style={{ maxWidth: '480px', margin: '0 auto' }}
        >
          <Link href="/chat">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="w-full h-12 bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold rounded-full shadow-lg"
            >
              나에게 맞는 제품 찾기
            </motion.button>
          </Link>
        </motion.div>
      </div>
    </div>
  );
}
