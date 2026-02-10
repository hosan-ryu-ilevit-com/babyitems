'use client';

/**
 * Final Recommend Loading View
 *
 * 최종 추천 생성 중 로딩 화면 (접힌 토글 + 프로그레스바 + 타이머)
 * - 기본 상태: 현재 진행 중인 단계 아이콘 + 제목 + 타이머 + 프로그레스바
 * - 펼친 상태: 3단계 Accordion (아이콘 + 라벨 + 시간)
 */

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Image from 'next/image';
import type { TimelineStep } from '@/types/recommend-v2';

// ============================================================================
// Types
// ============================================================================

interface FinalRecommendLoadingViewProps {
  steps: TimelineStep[];
  progress: number;           // 0-100
  showBrandPreferencePrompt?: boolean;
  brandPromptMode?: 'exclude' | 'prefer';
  brandOptions?: string[];
  brandOptionCounts?: Record<string, number>;
  excludeBrands?: string[];
  preferredBrands?: string[];
  candidateThumbnails?: Array<string | { id?: string; thumbnail: string; title?: string; brand?: string; preScore?: number }>;
  candidateThumbnailMeta?: Array<{ id?: string; thumbnail: string; title?: string; brand?: string; preScore?: number }>;
  onBrandToggle?: (brand: string) => void;
  onBrandConfirm?: () => void;
  onBrandSkip?: () => void;
}

// ============================================================================
// Sub Components
// ============================================================================

/**
 * 단계 카드 (항상 표시)
 */
function StepCard({ step, index, totalSteps }: { step: TimelineStep; index: number; totalSteps: number }) {
  const isCompleted = step.status === 'completed';

  const getIcon = () => {
    if (isCompleted) {
      return (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          className="relative z-10 bg-white"
        >
          <Image src="/icons/check.png" alt="" width={20} height={20} />
        </motion.div>
      );
    }

    if (step.status === 'in_progress') {
      return (
        <div className="relative z-10 w-4 h-4 rounded-full border-[1.5px] border-blue-500 border-t-transparent animate-spin bg-white" />
      );
    }

    return (
      <div className="relative z-10 w-4 h-4 rounded-full border-[1.5px] border-gray-300 bg-white" />
    );
  };

  // 부가 설명 추출 (details 배열의 첫 번째 항목)
  const subDescription = step.details && step.details.length > 0 ? step.details[0] : '';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: isCompleted ? 0.5 : 1, y: 0 }}
      transition={{
        duration: 0.4,
        delay: index * 0.1,
        ease: [0.4, 0, 0.2, 1]
      }}
      className="relative py-3 flex items-start gap-3"
    >
      {/* 세로 구분선 - 각 단계별로 별도 렌더링 */}
      {index < totalSteps - 1 && (
        <div className="absolute left-[10px] top-8 bottom-0 w-px overflow-hidden">
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: '100%', opacity: 1 }}
            transition={{
              duration: 0.3,
              delay: index * 0.1 + 0.2,
              ease: "easeOut"
            }}
            className="w-full bg-gray-200"
          />
        </div>
      )}

      {/* 아이콘 */}
      <div className="shrink-0 w-5 h-5 flex items-center justify-center">
        {getIcon()}
      </div>

      {/* 제목 + 시간 + 부가설명 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[14px] font-semibold text-gray-600">
            {step.title}
          </span>
        </div>
        {/* 부가 설명 */}
        {subDescription && (
          <div className="text-[13px] text-gray-400 leading-relaxed">
            {subDescription}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function FinalRecommendLoadingView({
  steps,
  progress,
  showBrandPreferencePrompt = false,
  brandPromptMode = 'exclude',
  brandOptions = [],
  brandOptionCounts = {},
  excludeBrands = [],
  preferredBrands = [],
  candidateThumbnails = [],
  candidateThumbnailMeta = [],
  onBrandToggle,
  onBrandConfirm,
  onBrandSkip,
}: FinalRecommendLoadingViewProps) {
  const hashString = (value: string) => {
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
      hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
    }
    return hash;
  };

  // 현재 활성화된 단계 찾기
  const currentStep = steps.find(s => s.status === 'in_progress') || steps[steps.length - 1];

  // 헤더 제목에서 [n/4] 패턴 제거
  const headerTitle = (currentStep?.title || 'AI 추천 생성 중').replace(/\[\d+\/\d+\]\s*/, '');

  const MAX_THUMBNAILS = 80;
  const MIN_VISIBLE_THUMBNAILS = 5;
  const thumbnailPool = useMemo(() => {
    const normalized = (candidateThumbnailMeta.length > 0
      ? candidateThumbnailMeta
      : candidateThumbnails.map((thumb) => {
          if (typeof thumb === 'string') {
            return { id: thumb, thumbnail: thumb, title: '', brand: '', preScore: 0 };
          }
          return {
            id: thumb.id || thumb.thumbnail,
            thumbnail: thumb.thumbnail,
            title: thumb.title || '',
            brand: thumb.brand || '',
            preScore: thumb.preScore || 0,
          };
        }))
      .filter((item) => Boolean(item?.thumbnail))
      .slice(0, MAX_THUMBNAILS);
    if (normalized.length > 0) return normalized;
    return Array.from({ length: MAX_THUMBNAILS }).map((_, i) => ({ id: `placeholder-${i}`, thumbnail: '', title: '', brand: '', preScore: 0 }));
  }, [candidateThumbnails, candidateThumbnailMeta]);

  const maxVisible = Math.max(MIN_VISIBLE_THUMBNAILS, Math.min(MAX_THUMBNAILS, thumbnailPool.length));
  const isBrandPromptActive = showBrandPreferencePrompt && brandOptions.length > 0;
  const [frozenProgress, setFrozenProgress] = useState<number | null>(null);

  useEffect(() => {
    if (isBrandPromptActive && frozenProgress === null) {
      setFrozenProgress(progress);
      return;
    }
    if (!isBrandPromptActive && frozenProgress !== null) {
      setFrozenProgress(null);
    }
  }, [isBrandPromptActive, frozenProgress, progress]);

  const effectiveProgress = frozenProgress ?? progress;

  const targetVisibleCount = useMemo(() => {
    const ratio = Math.max(0, Math.min(1, effectiveProgress / 100));
    return Math.max(
      MIN_VISIBLE_THUMBNAILS,
      Math.round(maxVisible - (maxVisible - MIN_VISIBLE_THUMBNAILS) * ratio)
    );
  }, [maxVisible, effectiveProgress]);

  const [visibleThumbCount, setVisibleThumbCount] = useState(maxVisible);

  useEffect(() => {
    setVisibleThumbCount(maxVisible);
  }, [maxVisible]);

  useEffect(() => {
    if (visibleThumbCount === targetVisibleCount) return;
    const direction = targetVisibleCount > visibleThumbCount ? 1 : -1;
    const timer = setInterval(() => {
      setVisibleThumbCount((prev) => {
        if (prev === targetVisibleCount) return prev;
        const next = prev + direction;
        if (direction > 0) return Math.min(next, targetVisibleCount);
        return Math.max(next, targetVisibleCount);
      });
    }, 42);

    return () => clearInterval(timer);
  }, [targetVisibleCount, visibleThumbCount]);

  useEffect(() => {
    if (effectiveProgress >= 99 && visibleThumbCount !== MIN_VISIBLE_THUMBNAILS) {
      setVisibleThumbCount(MIN_VISIBLE_THUMBNAILS);
    }
  }, [effectiveProgress, visibleThumbCount]);

  const visibleByScore = useMemo(
    () => [...thumbnailPool].sort((a, b) => (b.preScore || 0) - (a.preScore || 0)).slice(0, visibleThumbCount),
    [thumbnailPool, visibleThumbCount]
  );
  const [finalFiveLock, setFinalFiveLock] = useState<string[]>([]);
  useEffect(() => {
    if (effectiveProgress >= 99 && finalFiveLock.length === 0 && visibleByScore.length >= 5) {
      setFinalFiveLock(visibleByScore.slice(0, 5).map((thumb) => String(thumb.id || thumb.thumbnail)));
      return;
    }
    if (effectiveProgress < 99 && finalFiveLock.length > 0) {
      setFinalFiveLock([]);
    }
  }, [effectiveProgress, finalFiveLock.length, visibleByScore]);

  const lockedVisibleByScore = useMemo(() => {
    if (finalFiveLock.length !== 5) return visibleByScore;
    const lookup = new Map(
      thumbnailPool.map((thumb) => [String(thumb.id || thumb.thumbnail), thumb])
    );
    return finalFiveLock
      .map((id) => lookup.get(id))
      .filter(Boolean) as typeof visibleByScore;
  }, [finalFiveLock, thumbnailPool, visibleByScore]);

  const visibleThumbs = useMemo(
    () =>
      [...lockedVisibleByScore].sort(
        (a, b) =>
          (hashString(String(a.id || a.thumbnail)) % 1009) -
          (hashString(String(b.id || b.thumbnail)) % 1009)
      ),
    [lockedVisibleByScore]
  );
  const getColumnCount = (count: number) => {
    if (count <= 5) return 5;
    if (count <= 12) return 6;
    if (count <= 24) return 7;
    return 8;
  };
  const columnCount = getColumnCount(visibleThumbs.length);
  const showFinalFiveMeta = lockedVisibleByScore.length <= 5;
  return (
    <div className="w-full">
     

      {/* 헤더 (현재 진행 중인 단계) */}
      <div className="w-full py-4 px-1 flex items-center gap-3">
        {/* AI 아이콘 with wiggle animation */}
        <motion.img
          src="/icons/ic-ai.svg"
          alt="AI"
          className="shrink-0 w-5 h-5"
          animate={{
            rotate: [0, -15, 15, -15, 0],
            y: [0, -2.5, 0],
          }}
          transition={{
            duration: 0.8,
            repeat: Infinity,
            repeatDelay: 2,
            ease: "easeInOut"
          }}
        />

        {/* 현재 단계 제목 with shimmer effect */}
        <motion.span
          className="text-[16px] font-medium flex-1 text-left"
          style={{
            background: 'linear-gradient(90deg, rgba(96, 165, 250, 0.7) 0%, rgba(147, 51, 234, 1) 25%, rgba(255, 255, 255, 0.9) 50%, rgba(147, 51, 234, 1) 75%, rgba(96, 165, 250, 0.7) 100%)',
            backgroundSize: '200% 100%',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            color: 'transparent',
          }}
          animate={{
            backgroundPosition: ['200% 0%', '0% 0%'],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: 'linear',
          }}
        >
          {headerTitle}...
        </motion.span>
      </div>

      {/* 현재 단계 1개만 표시 (그리드 위) */}
      <div className="px-1 space-y-0 border-t border-gray-100 pt-2 mb-3">
        {currentStep && (
          <StepCard
            key={currentStep.id}
            step={currentStep}
            index={0}
            totalSteps={1}
          />
        )}
      </div>

      {isBrandPromptActive && (
        <div className="mt-0 mb-6 p-4 rounded-2xl border border-gray-200 bg-white">
          <p className="text-[16px] font-semibold text-gray-700 mb-1">
            {brandPromptMode === 'exclude' ? '선호하지 않는 브랜드가 있나요?' : '선호하는 브랜드가 있나요?'}
          </p>
          <p className="text-[14px] text-gray-500 mb-4">
            {brandPromptMode === 'exclude'
              ? '추천 결과에서 제외해드릴게요'
              : '최종 Top 추천에서 가중치를 반영할게요'}
          </p>
          <div className="flex flex-wrap gap-2">
            {brandOptions.map((brand) => {
              const isActive = brandPromptMode === 'exclude'
                ? excludeBrands.includes(brand)
                : preferredBrands.includes(brand);
              const count = brandOptionCounts[brand] || 1;
              return (
                <button
                  key={brand}
                  type="button"
                  onClick={() => onBrandToggle?.(brand)}
                  className={`px-3 py-2 rounded-xl text-[13px] font-semibold transition-colors border ${
                    isActive
                      ? (brandPromptMode === 'exclude'
                          ? 'bg-red-50 text-red-700 border-red-200'
                          : 'bg-blue-50 text-blue-700 border-blue-200')
                      : 'bg-white text-gray-700 border-gray-200'
                  }`}
                >
                  <span>{brand}</span>
                  <span className={`${
                    isActive
                      ? (brandPromptMode === 'exclude' ? 'text-red-400' : 'text-blue-400')
                      : 'text-gray-400'
                  } ml-1 text-[12px] font-normal`}>
                    ({count})
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-5">
            <button
              type="button"
              onClick={
                (brandPromptMode === 'exclude' ? excludeBrands.length : preferredBrands.length) > 0
                  ? onBrandConfirm
                  : onBrandSkip
              }
              className="w-full py-3.5 bg-gray-900 text-white font-bold rounded-2xl flex items-center justify-center"
            >
              {(brandPromptMode === 'exclude' ? excludeBrands.length : preferredBrands.length) > 0
                ? (brandPromptMode === 'exclude'
                    ? `선택한 ${excludeBrands.length}개 브랜드 제외할게요`
                    : `선택한 ${preferredBrands.length}개 브랜드를 더 우선 추천할게요`)
                : '상관없어요'}
            </button>
          </div>
        </div>
      )}

      {/* 후보 썸네일 그리드 (Top5 직전까지 축소 + 확대) */}
      <div className="mt-2 mb-4">
        <div
          className="grid gap-1 w-full"
          style={{
            gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
          }}
        >
          <AnimatePresence mode="popLayout">
            {visibleThumbs.map((thumb) => (
              <motion.div
                key={String(thumb.id || thumb.thumbnail || 'placeholder')}
                layout
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.86 }}
                transition={{ type: 'spring', stiffness: 190, damping: 26, mass: 0.9 }}
                className="overflow-hidden bg-gray-100 border border-gray-100 rounded-[8px] w-full aspect-square"
              >
                {thumb.thumbnail ? (
                  <img
                    src={thumb.thumbnail}
                    alt=""
                    className="w-full h-full object-cover transition-opacity duration-300"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="w-full h-full bg-gray-100" />
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
        {showFinalFiveMeta && (
          <div className="grid gap-1 mt-1.5 w-full" style={{ gridTemplateColumns: `repeat(5, minmax(0, 1fr))` }}>
            {lockedVisibleByScore.slice(0, 5).map((thumb, idx) => (
              <div key={`meta-${idx}-${thumb.id || thumb.thumbnail}`} className="text-center min-w-0">
                <p className="text-[10px] text-gray-500 truncate">{thumb.brand || '-'}</p>
                <p className="text-[10px] text-gray-400 truncate">{thumb.title || '추천 후보'}</p>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
