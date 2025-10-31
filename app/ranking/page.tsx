'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import Image from 'next/image';
import { CaretLeft, Star } from '@phosphor-icons/react/dist/ssr';
import { products } from '@/data/products';

export default function RankingPage() {

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100">
      <div className="relative w-full max-w-[480px] min-h-screen bg-white shadow-lg">
        {/* Header */}
        <header className="sticky top-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-b border-gray-200 px-6 py-4 z-10">
          <div className="flex items-center justify-between">
            <Link href="/" className="text-gray-600 hover:text-gray-900 transition-colors">
              <CaretLeft size={24} weight="bold" />
            </Link>
            <h1 className="text-lg font-bold text-gray-900">실시간 인기 랭킹</h1>
            <div className="w-6"></div>
          </div>
        </header>

        {/* Product List */}
        <main className="px-6 py-6 pb-24 bg-gray-50">
          <div className="space-y-4">
            {products.map((product, index) => (
              <motion.div
                key={product.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
                className="bg-white border border-gray-200 rounded-2xl overflow-hidden hover:border-gray-300 transition-all"
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
        </main>

        {/* Floating Button */}
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="fixed bottom-0 left-0 right-0 px-6 py-4 bg-white/95 backdrop-blur-sm border-t border-gray-200"
          style={{ maxWidth: '480px', margin: '0 auto' }}
        >
          <Link href="/chat">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="w-full h-14 bg-gray-900 text-white font-medium rounded-2xl shadow-lg hover:bg-gray-800 transition-colors"
            >
              맞춤 추천 받기
            </motion.button>
          </Link>
        </motion.div>
      </div>
    </div>
  );
}
