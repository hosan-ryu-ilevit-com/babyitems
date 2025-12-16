'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import type { CheckpointData } from '@/types/recommend-v2';

interface CheckpointVisualProps {
  data: CheckpointData;
  isLoading?: boolean;
}

// 썸네일 그룹 컴포넌트 (로딩 완료 순으로 왼쪽 배치)
function ThumbnailGroup({ thumbnails }: { thumbnails: string[] }) {
  const [loadedUrls, setLoadedUrls] = useState<Set<string>>(new Set());

  const handleLoad = (url: string) => {
    setLoadedUrls(prev => new Set([...prev, url]));
  };

  // 로딩 완료된 것을 앞으로, 아직 로딩 중인 것을 뒤로
  const sortedThumbnails = useMemo(() => {
    const loaded = thumbnails.filter(url => loadedUrls.has(url));
    const loading = thumbnails.filter(url => !loadedUrls.has(url));
    return [...loaded, ...loading];
  }, [thumbnails, loadedUrls]);

  return (
    <div className="flex -space-x-2">
      {sortedThumbnails.map((thumb, i) => {
        const isLoaded = loadedUrls.has(thumb);
        return (
          <motion.div
            key={thumb}
            layout
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ layout: { duration: 0.3 }, opacity: { duration: 0.2 } }}
            className="w-8 h-8 rounded-full border border-gray-200 overflow-hidden relative bg-white"
            style={{ zIndex: 5 - i }}
          >
            {/* 스켈레톤 shimmer */}
            {!isLoaded && (
              <div className="absolute inset-0 bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 animate-shimmer" />
            )}
            <Image
              src={thumb}
              alt=""
              fill
              className={`object-cover transition-opacity duration-300 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
              sizes="32px"
              loading="eager"
              unoptimized
              onLoad={() => handleLoad(thumb)}
            />
          </motion.div>
        );
      })}
    </div>
  );
}

/**
 * 중간 점검 시각화 컴포넌트
 * - GuideCards와 일관된 디자인 언어
 * - 심플한 후보군 수 표시
 * - 썸네일 5개 + "N개 상품 분석 완료" 태그
 */
export function CheckpointVisual({ data, isLoading = false }: CheckpointVisualProps) {
  const { totalProducts, filteredCount, productThumbnails } = data;
  const [isShrinkComplete, setIsShrinkComplete] = useState(false);
  const finalPercent = (filteredCount / totalProducts) * 100;

  // 썸네일 표시 조건 (프로그레스 바와 동시에)
  const showThumbnails = !isLoading && productThumbnails && productThumbnails.length > 0;

  // 프로그레스 바 줄어드는 애니메이션 완료 후 색상 변경 (delay 0.3s + duration 0.8s = 1.1s 후)
  useEffect(() => {
    if (!isLoading) {
      const timer = setTimeout(() => {
        setIsShrinkComplete(true);
      }, 1150); // 애니메이션 완료 직후
      return () => clearTimeout(timer);
    }
  }, [isLoading]);

  // 로딩 중일 때 shimmer 효과
  if (isLoading) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        className="bg-white rounded-2xl border border-blue-100 p-5"
      >
        <p className="text-base font-medium shimmer-text">
          조건을 분석하는 중입니다...
        </p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      {/* 메인 카드 - GuideCards 디자인 언어 */}
      <div className="bg-white rounded-2xl border border-blue-100 p-5">
        {/* 헤더 */}
        <div className="flex items-center gap-3 mb-4">
          <span className="text-green-500 font-bold">✓</span>
          <h3 className="font-medium text-[15px] text-gray-900">
            조건 분석 완료
          </h3>
        </div>

        {/* 후보군 수 표시 - 심플하게 */}
        <div className="flex items-baseline gap-1">
          <span className="text-gray-500 text-sm">전체</span>
          <span className="text-gray-400 text-lg font-medium">{totalProducts}개</span>
          <span className="text-gray-500 text-sm mx-1">중</span>
          <motion.span
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="text-gray-900 text-2xl font-bold"
          >
            {filteredCount}개
          </motion.span>
          <span className="text-gray-700 text-sm">후보</span>
        </div>

        {/* 프로그레스 바 - 100%에서 시작해서 오른쪽에서 왼쪽으로 줄어듦, 완료 후 초록색으로 페이드 */}
        <div className="mt-4 h-2 bg-gray-100 rounded-full overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            initial={{ width: '100%', backgroundColor: '#111827' }}
            animate={{
              width: `${finalPercent}%`,
              backgroundColor: isShrinkComplete ? '#22c55e' : '#111827',
            }}
            transition={{
              width: { delay: 0.3, duration: 0.8, ease: 'easeInOut' },
              backgroundColor: { duration: 0.4, ease: 'easeOut' },
            }}
          />
        </div>

        {/* 썸네일 + N개 상품 분석 완료 태그 - 순차적 애니메이션 */}
        <AnimatePresence>
          {showThumbnails && productThumbnails && productThumbnails.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="flex items-center gap-3 mt-4 pt-4 border-t border-gray-100"
            >
              <ThumbnailGroup thumbnails={productThumbnails.slice(0, 5)} />
              <span className="px-2.5 py-1 bg-gray-100 text-gray-500 text-xs font-semibold rounded-full">
                {filteredCount.toLocaleString()}개 상품 분석 완료
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
