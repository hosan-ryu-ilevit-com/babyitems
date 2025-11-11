'use client';

import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import Image from 'next/image';
import { ChatCircleDots } from '@phosphor-icons/react/dist/ssr';
import { products } from '@/data/products';
import { useEffect, useState } from 'react';
import { logPageView, logButtonClick } from '@/lib/logging/clientLogger';

// Guide Card Component
function GuideCard({ number, title, content }: { number: string; title: string; content: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.3 }}
      className="bg-white rounded-2xl border border-gray-200 overflow-hidden"
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-gray-400">{number}</span>
          <h3 className="text-base font-bold text-gray-900">{title}</h3>
        </div>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="shrink-0"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </motion.div>
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-4 pt-1">
              {content}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function Home() {
  // 페이지 뷰 로깅
  useEffect(() => {
    logPageView('home');
  }, []);

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
              분유포트, 수천개를<br />다 비교해볼 순 없잖아요
            </h1>
            <p className="text-lg text-gray-600 leading-6 px-2">
              지금 가장 <strong className="font-bold">사랑받는 제품들</strong> 중,<br />
              나만의 최고를 찾아드려요
            </p>
          </motion.div>
        </section>

        {/* Guide Section */}
        <section className="bg-gray-50 px-6 py-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="mb-8"
          >
            <h2 className="text-xl font-bold text-gray-900 text-center">
              첫 분유포트- 핵심만 한눈에.
            </h2>
           
          </motion.div>

          {/* Guide Cards */}
          <div className="space-y-4">
            {/* Card 1: 왜 필요한가요? */}
            <GuideCard
              number="01"
              title="왜 필요한가요?"
              content={
                <>
                  <p className="text-sm text-gray-700 leading-relaxed mb-3">
                    6개월 미만 아이는 <strong className="font-semibold">물을 2분 이상 끓여</strong> 사용할 것을 권고합니다.
                    하루 <strong className="font-semibold">8~10번</strong> 분유를 타야 하는데, 매번 끓이고 식히는 건 정말 힘들죠.
                  </p>
                  <div className="bg-white rounded-lg p-3 border border-gray-200">
                    <p className="text-xs font-semibold text-gray-900 mb-2">분유포트가 하는 일</p>
                    <div className="flex items-center gap-2 text-xs text-gray-600">
                      <span className="font-medium">끓이기</span>
                      <span>→</span>
                      <span className="font-medium">식히기</span>
                      <span>→</span>
                      <span className="font-medium">보온</span>
                      <span className="text-gray-400">(자동)</span>
                    </div>
                  </div>
                </>
              }
            />

            {/* Card 2: 작동 원리 */}
            <GuideCard
              number="02"
              title="어떻게 작동하나요?"
              content={
                <>
                  <div className="space-y-3">
                    <div className="flex gap-3">
                      <div className="shrink-0 w-6 h-6 bg-gray-900 text-white rounded-full flex items-center justify-center text-xs font-bold">
                        1
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-gray-900 mb-1">끓이기 (3~5분)</p>
                        <p className="text-xs text-gray-600">100℃ 도달 후에도 계속 끓여 염소와 균을 제거합니다</p>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <div className="shrink-0 w-6 h-6 bg-gray-900 text-white rounded-full flex items-center justify-center text-xs font-bold">
                        2
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-gray-900 mb-1">냉각 (40~60분)</p>
                        <p className="text-xs text-gray-600">쿨링팬으로 40~45℃로 빠르게 식혀줍니다</p>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <div className="shrink-0 w-6 h-6 bg-gray-900 text-white rounded-full flex items-center justify-center text-xs font-bold">
                        3
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-gray-900 mb-1">보온 (12~24시간)</p>
                        <p className="text-xs text-gray-600">언제든 분유를 탈 수 있게 온도를 유지합니다</p>
                      </div>
                    </div>
                  </div>
                </>
              }
            />

            {/* Card 3: 용량과 소재 */}
            <GuideCard
              number="03"
              title="용량과 소재"
              content={
                <>
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900 mb-1">용량: 1.3L 이상</p>
                      <p className="text-xs text-gray-600">하루 필요한 물 1~1.5L를 여유있게 담을 수 있습니다</p>
                    </div>
                    <div className="h-px bg-gray-200"></div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900 mb-1">소재: 내열강화유리 + 스테인리스</p>
                      <p className="text-xs text-gray-600 mb-2">
                        안이 보이는 유리 포트가 일반적이고, 열판과 뚜껑은 스테인리스를 사용합니다
                      </p>
                      <div className="flex gap-2 text-xs">
                        <div className="flex-1 bg-white rounded p-2 border border-gray-200">
                          <p className="font-medium text-gray-900">304 SUS</p>
                          <p className="text-gray-600">일반 주방용</p>
                        </div>
                        <div className="flex-1 bg-white rounded p-2 border border-gray-200">
                          <p className="font-medium text-gray-900">316 SUS</p>
                          <p className="text-gray-600">의료용 고급</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              }
            />

            {/* Card 4: 세척과 사용 */}
            <GuideCard
              number="04"
              title="세척과 사용 편의성"
              content={
                <>
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900 mb-1">세척이 편한 제품</p>
                      <ul className="text-xs text-gray-600 space-y-1">
                        <li className="flex items-center gap-2">
                          <span className="w-1 h-1 bg-gray-400 rounded-full"></span>
                          주입구 직경 10cm 이상 (손이 들어가야 함)
                        </li>
                        <li className="flex items-center gap-2">
                          <span className="w-1 h-1 bg-gray-400 rounded-full"></span>
                          뚜껑 완전 분리형
                        </li>
                        <li className="flex items-center gap-2">
                          <span className="w-1 h-1 bg-gray-400 rounded-full"></span>
                          포트 무게 800g 이하
                        </li>
                        <li className="flex items-center gap-2">
                          <span className="w-1 h-1 bg-gray-400 rounded-full"></span>
                          바닥이 평평함 (구조물 없음)
                        </li>
                      </ul>
                    </div>
                    <div className="h-px bg-gray-200"></div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900 mb-1">유용한 기능</p>
                      <ul className="text-xs text-gray-600 space-y-1">
                        <li className="flex items-center gap-2">
                          <span className="w-1 h-1 bg-gray-400 rounded-full"></span>
                          수유등 (새벽에 편리)
                        </li>
                        <li className="flex items-center gap-2">
                          <span className="w-1 h-1 bg-gray-400 rounded-full"></span>
                          자동 분유모드 (원터치)
                        </li>
                        <li className="flex items-center gap-2">
                          <span className="w-1 h-1 bg-gray-400 rounded-full"></span>
                          차망 (보리차용)
                        </li>
                      </ul>
                    </div>
                  </div>
                </>
              }
            />
          </div>

          {/* CTA */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mt-8 text-center"
          >
           
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
                  <div className="bg-gray-900 text-yellow-400 text-xs font-semibold px-3 py-1.5 rounded-full whitespace-nowrap">
                    이 중에서 골라드려요!
                  </div>
                  {/* Speech bubble tail */}
                  <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-0 h-0 border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent border-r-[6px] border-r-gray-900"></div>
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
              <span>2025년 11월 6일 기준</span>
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
                className="w-full h-14 bg-linear-to-r from-gray-900 to-gray-700 text-white text-base font-semibold rounded-2xl shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2.5"
              >
                <ChatCircleDots size={24} weight="bold" />
                <span>1분만에 추천받기</span>
              </motion.button>
            </Link>
          </motion.div>
        </section>
      </div>
    </div>
  );
}
