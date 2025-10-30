'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';

export default function Home() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100">
      {/* 모바일 최적화 컨테이너 */}
      <div className="relative w-full max-w-[480px] min-h-screen bg-white shadow-lg">
        {/* Header */}
        <header className="absolute top-0 left-0 right-0 flex items-center justify-between p-4 z-10">
          <motion.div
            initial={mounted ? { opacity: 0, x: -20 } : false}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
            className="text-lg font-bold text-gray-800"
          >
            아기용품 비서
          </motion.div>
          <motion.div
            initial={mounted ? { opacity: 0, x: 20 } : false}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
          >
            <Link
              href="/ranking"
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-full hover:bg-gray-50 transition-colors"
            >
              실시간 랭킹
            </Link>
          </motion.div>
        </header>

        {/* Main Content */}
        <main className="flex flex-col items-center justify-center min-h-screen px-6">
          <motion.div
            initial={mounted ? { opacity: 0, y: 20 } : false}
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
            initial={mounted ? { opacity: 0, scale: 0.9 } : false}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="w-full max-w-sm"
          >
            <div className="aspect-square bg-gradient-to-br from-blue-50 to-purple-50 rounded-3xl flex items-center justify-center mb-8">
              <div className="text-6xl">🍼</div>
            </div>
          </motion.div>
        </main>

        {/* Floating Button */}
        <motion.div
          initial={mounted ? { opacity: 0, y: 50 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.6 }}
          className="absolute bottom-8 left-0 right-0 px-6"
        >
          <Link href="/chat">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="w-full h-14 bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold rounded-full shadow-lg hover:shadow-xl transition-shadow"
            >
              고르러 가기
            </motion.button>
          </Link>
        </motion.div>
      </div>
    </div>
  );
}
