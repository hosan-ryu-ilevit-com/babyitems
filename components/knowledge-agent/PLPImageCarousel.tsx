'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Image from 'next/image';

interface PLPImageCarouselProps {
  productThumbnail: string | null | undefined;
  reviewImages: string[];
  productTitle: string;
  rank: number;
  maxImages?: number;
  autoScrollInterval?: number; // ms
  pauseAfterSwipe?: number; // ms
}

/**
 * PLP 제품 카드용 이미지 캐러셀 (무한 루프)
 * - 제품 썸네일 + 리뷰 이미지 (최대 5장)
 * - 2초마다 자동 스크롤 (무한 루프)
 * - 뷰포트 밖에서는 일시정지
 * - 사용자 스와이프 시 3초간 일시정지 후 재개
 * - 한 방향으로 계속 스와이프 가능 (무한 루프)
 */
export function PLPImageCarousel({
  productThumbnail,
  reviewImages,
  productTitle,
  rank,
  maxImages = 5,
  autoScrollInterval = 1300,
  pauseAfterSwipe = 2000,
}: PLPImageCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isInViewport, setIsInViewport] = useState(false);
  const [isPausedByUser, setIsPausedByUser] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);
  const carouselRef = useRef<HTMLDivElement>(null);
  const autoScrollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const userPauseTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isAutoScrollingRef = useRef(false);

  // 이미지 로딩 실패 핸들러
  const handleImageError = useCallback((imgUrl: string) => {
    setFailedImages(prev => new Set(prev).add(imgUrl));
  }, []);

  // 이미지 배열 생성 (제품 썸네일 + 리뷰 이미지, 최대 maxImages장, 실패한 이미지 제외)
  const images: string[] = [];
  if (productThumbnail && !failedImages.has(productThumbnail)) {
    images.push(productThumbnail);
  }
  for (const img of reviewImages) {
    if (images.length >= maxImages) break;
    if (!images.includes(img) && !failedImages.has(img)) {
      images.push(img);
    }
  }

  const imageCount = images.length;
  const hasMultipleImages = imageCount > 1;

  // 무한 루프용 확장 배열: [마지막] + [원본들] + [첫번째]
  const extendedImages = hasMultipleImages
    ? [images[imageCount - 1], ...images, images[0]]
    : images;

  // IntersectionObserver로 뷰포트 진입/이탈 감지
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          setIsInViewport(entry.isIntersecting);
        });
      },
      { threshold: 0.3 }
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // 특정 인덱스로 스크롤 (애니메이션 옵션)
  const scrollToIndex = useCallback((index: number, smooth = true) => {
    if (!carouselRef.current) return;
    const width = carouselRef.current.offsetWidth;
    // 무한 루프용: 실제 스크롤 위치는 index + 1 (앞에 클론이 있으므로)
    const scrollIndex = hasMultipleImages ? index + 1 : index;
    carouselRef.current.scrollTo({
      left: width * scrollIndex,
      behavior: smooth ? 'smooth' : 'instant',
    });
  }, [hasMultipleImages]);

  // 초기 스크롤 위치 설정 (첫 번째 실제 이미지로)
  useEffect(() => {
    if (hasMultipleImages && carouselRef.current) {
      const width = carouselRef.current.offsetWidth;
      // 클론 때문에 인덱스 1이 실제 첫 번째 이미지
      carouselRef.current.scrollLeft = width;
    }
  }, [hasMultipleImages]);

  // 다음 이미지로 자동 스크롤
  const scrollToNext = useCallback(() => {
    if (!carouselRef.current || !hasMultipleImages || isTransitioning) return;

    isAutoScrollingRef.current = true;
    const nextIndex = (currentIndex + 1) % imageCount;
    setCurrentIndex(nextIndex);
    scrollToIndex(nextIndex, true);

    // 자동 스크롤 플래그 리셋
    setTimeout(() => {
      isAutoScrollingRef.current = false;
    }, 350);
  }, [currentIndex, imageCount, hasMultipleImages, isTransitioning, scrollToIndex]);

  // 자동 스크롤 타이머 관리
  useEffect(() => {
    const shouldAutoScroll = isInViewport && !isPausedByUser && hasMultipleImages && !isTransitioning;

    if (shouldAutoScroll) {
      autoScrollTimerRef.current = setInterval(() => {
        scrollToNext();
      }, autoScrollInterval);
    }

    return () => {
      if (autoScrollTimerRef.current) {
        clearInterval(autoScrollTimerRef.current);
        autoScrollTimerRef.current = null;
      }
    };
  }, [isInViewport, isPausedByUser, hasMultipleImages, isTransitioning, autoScrollInterval, scrollToNext]);

  // 사용자 스와이프 시 일시정지
  const pauseForUser = useCallback(() => {
    setIsPausedByUser(true);

    if (userPauseTimerRef.current) {
      clearTimeout(userPauseTimerRef.current);
    }

    userPauseTimerRef.current = setTimeout(() => {
      setIsPausedByUser(false);
    }, pauseAfterSwipe);
  }, [pauseAfterSwipe]);

  // 스크롤 이벤트 핸들러 (무한 루프 처리)
  const handleScroll = useCallback(() => {
    if (!carouselRef.current || !hasMultipleImages) return;

    const scrollLeft = carouselRef.current.scrollLeft;
    const width = carouselRef.current.offsetWidth;
    const scrollIndex = Math.round(scrollLeft / width);

    // 자동 스크롤 중이면 무시
    if (isAutoScrollingRef.current) return;

    // 사용자 스와이프로 판단하여 일시정지
    pauseForUser();

    // 무한 루프 처리: 클론 위치에 도달하면 실제 위치로 점프
    if (scrollIndex === 0) {
      // 맨 앞 클론(마지막 이미지) → 실제 마지막 이미지로 점프
      setIsTransitioning(true);
      setTimeout(() => {
        if (carouselRef.current) {
          carouselRef.current.scrollTo({
            left: width * imageCount,
            behavior: 'instant',
          });
        }
        setCurrentIndex(imageCount - 1);
        setIsTransitioning(false);
      }, 50);
    } else if (scrollIndex === imageCount + 1) {
      // 맨 뒤 클론(첫 번째 이미지) → 실제 첫 번째 이미지로 점프
      setIsTransitioning(true);
      setTimeout(() => {
        if (carouselRef.current) {
          carouselRef.current.scrollTo({
            left: width,
            behavior: 'instant',
          });
        }
        setCurrentIndex(0);
        setIsTransitioning(false);
      }, 50);
    } else {
      // 일반 스크롤: 실제 인덱스 업데이트
      const realIndex = scrollIndex - 1;
      if (realIndex >= 0 && realIndex < imageCount && realIndex !== currentIndex) {
        setCurrentIndex(realIndex);
      }
    }
  }, [hasMultipleImages, imageCount, currentIndex, pauseForUser]);

  // 스크롤 종료 감지 (scrollend 이벤트)
  useEffect(() => {
    const carousel = carouselRef.current;
    if (!carousel || !hasMultipleImages) return;

    const handleScrollEnd = () => {
      handleScroll();
    };

    carousel.addEventListener('scrollend', handleScrollEnd);
    return () => carousel.removeEventListener('scrollend', handleScrollEnd);
  }, [hasMultipleImages, handleScroll]);

  // cleanup
  useEffect(() => {
    return () => {
      if (userPauseTimerRef.current) {
        clearTimeout(userPauseTimerRef.current);
      }
    };
  }, []);

  // 이미지가 없으면 placeholder
  if (images.length === 0) {
    return (
      <div ref={containerRef} className="relative w-32 h-32 rounded-xl overflow-hidden shrink-0 bg-gray-50 border border-gray-100">
        <div className="w-full h-full flex items-center justify-center bg-gray-100">
          <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <div className="absolute top-0 left-0 w-[32px] h-[26px] bg-gray-900 rounded-br-[12px] flex items-center justify-center">
          <span className="text-white font-bold text-[12px] leading-none">{rank}위</span>
        </div>
      </div>
    );
  }

  // 이미지가 1장이면 캐러셀 없이 단순 표시
  if (!hasMultipleImages) {
    return (
      <div ref={containerRef} className="relative w-32 h-32 rounded-xl overflow-hidden shrink-0 bg-gray-50 border border-gray-100">
        {images.length > 0 ? (
          <Image
            src={images[0]}
            alt={productTitle}
            width={128}
            height={128}
            className="w-full h-full object-cover"
            quality={90}
            priority={rank <= 3}
            onError={() => handleImageError(images[0])}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-100">
            <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}
        <div className="absolute top-0 left-0 w-[32px] h-[26px] bg-gray-900 rounded-br-[12px] flex items-center justify-center">
          <span className="text-white font-bold text-[12px] leading-none">{rank}위</span>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative w-32 h-32 rounded-xl overflow-hidden shrink-0 bg-gray-50 border border-gray-100">
      {/* 캐러셀 컨테이너 */}
      <div
        ref={carouselRef}
        className="flex w-full h-full overflow-x-auto snap-x snap-mandatory scrollbar-hide"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {extendedImages.map((img, idx) => {
          // 실제 이미지 인덱스 계산 (클론 고려)
          const isClone = idx === 0 || idx === extendedImages.length - 1;
          const realIdx = idx === 0 ? imageCount - 1 : idx === extendedImages.length - 1 ? 0 : idx - 1;
          const isFirstReal = realIdx === 0 && !isClone;

          return (
            <div
              key={`${idx}-${img}`}
              className="w-full h-full shrink-0 snap-center bg-gray-100"
              style={{ scrollSnapStop: 'always' }}
            >
              {isFirstReal && productThumbnail ? (
                <Image
                  src={img}
                  alt={productTitle}
                  width={128}
                  height={128}
                  className="w-full h-full object-cover"
                  quality={90}
                  priority={rank <= 3}
                  onError={() => handleImageError(img)}
                />
              ) : (
                <img
                  src={img}
                  alt={`${productTitle} 이미지`}
                  className="w-full h-full object-cover"
                  loading={isClone ? 'eager' : 'lazy'}
                  onError={() => handleImageError(img)}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* 랭킹 배지 */}
      <div className="absolute top-0 left-0 w-[32px] h-[26px] bg-gray-900 rounded-br-[12px] flex items-center justify-center z-10">
        <span className="text-white font-bold text-[12px] leading-none">{rank}위</span>
      </div>
    </div>
  );
}
