'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';

interface DanawaReviewImage {
  thumbnail: string;
  original?: string;
}

interface DanawaReview {
  id: number;
  pcode: string;
  rating: number;
  content: string;
  author: string | null;
  review_date: string | null;
  mall_name: string | null;
  images: DanawaReviewImage[];
  helpful_count: number;
  crawled_at: string;
}

interface DanawaReviewTabProps {
  pcode: string;
  fullHeight?: boolean; // 전체 높이 모드 (상품 리뷰 탭용)
}

export default function DanawaReviewTab({ pcode, fullHeight = false }: DanawaReviewTabProps) {
  const [reviews, setReviews] = useState<DanawaReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewCount, setReviewCount] = useState(0);
  const [averageRating, setAverageRating] = useState<number | null>(null);
  const [expandedReviews, setExpandedReviews] = useState<Set<number>>(new Set());
  const [expandedImages, setExpandedImages] = useState<{reviewId: number; images: DanawaReviewImage[]; currentIndex: number} | null>(null);
  const [visibleCount, setVisibleCount] = useState(5);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sortOrder, setSortOrder] = useState<'high' | 'low'>('high');
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // 무한 스크롤 로직
  const loadMore = useCallback(() => {
    if (loadingMore || visibleCount >= reviews.length) return;
    setLoadingMore(true);
    setTimeout(() => {
      setVisibleCount(prev => Math.min(prev + 5, reviews.length));
      setLoadingMore(false);
    }, 300);
  }, [loadingMore, visibleCount, reviews.length]);

  // Intersection Observer 설정
  useEffect(() => {
    if (!fullHeight) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current);
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [fullHeight, loadMore]);

  useEffect(() => {
    fetchReviews();
  }, [pcode]);

  const fetchReviews = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/danawa-reviews?pcode=${pcode}&limit=50`);
      const data = await response.json();

      if (data.success) {
        setReviews(data.reviews);
        setReviewCount(data.reviewCount);
        setAverageRating(data.averageRating);
      }
    } catch (error) {
      console.error('Failed to fetch reviews:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (reviewId: number) => {
    const newExpanded = new Set(expandedReviews);
    if (newExpanded.has(reviewId)) {
      newExpanded.delete(reviewId);
    } else {
      newExpanded.add(reviewId);
    }
    setExpandedReviews(newExpanded);
  };

  const openImageViewer = (reviewId: number, images: DanawaReviewImage[], index: number) => {
    setExpandedImages({ reviewId, images, currentIndex: index });
  };

  const closeImageViewer = () => {
    setExpandedImages(null);
  };

  const navigateImage = (direction: 'prev' | 'next') => {
    if (!expandedImages) return;
    const { images, currentIndex } = expandedImages;
    let newIndex = direction === 'prev' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0) newIndex = images.length - 1;
    if (newIndex >= images.length) newIndex = 0;
    setExpandedImages({ ...expandedImages, currentIndex: newIndex });
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '';
    // "2024-05-05" 형식을 "24.05.05" 형식으로
    const date = new Date(dateStr);
    const year = date.getFullYear().toString().slice(2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}.${month}.${day}`;
  };

  const renderStars = (rating: number) => {
    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <svg
            key={star}
            className={`w-4 h-4 ${star <= rating ? 'text-yellow-400' : 'text-gray-300'}`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        ))}
        <span className="ml-1 text-sm font-semibold text-gray-900">{rating}</span>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center gap-2 text-gray-500">
          <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin"></div>
          <span>리뷰를 불러오는 중...</span>
        </div>
      </div>
    );
  }

  if (reviews.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="text-4xl mb-3">📝</div>
        <div className="text-gray-500 text-sm">아직 리뷰가 없습니다</div>
      </div>
    );
  }

  // 별점 분포 계산
  const ratingDistribution = reviews.reduce((acc, review) => {
    const rating = Math.round(review.rating);
    if (rating >= 1 && rating <= 5) {
      acc[rating] = (acc[rating] || 0) + 1;
    }
    return acc;
  }, {} as Record<number, number>);

  // 가장 많은 별점 찾기
  const maxCount = Math.max(...Object.values(ratingDistribution), 1);
  const totalReviews = reviews.length || 1;

  // 정렬된 리뷰
  const sortedReviews = [...reviews].sort((a, b) => {
    if (sortOrder === 'high') {
      return b.rating - a.rating;
    }
    return a.rating - b.rating;
  });

  return (
    <div className="pb-4">
      {/* 리뷰 요약 - 새로운 디자인 */}
      <div className="px-4 py-5 border-b border-gray-100">
        {/* 상품리뷰 헤더 */}
        <div className="flex items-center gap-1.5 mb-4">
          <h3 className="text-base font-bold text-gray-900">상품리뷰</h3>
          
        </div>

        {/* 평점 + 분포 차트 */}
        <div className="flex items-center justify-center gap-8">
          {/* 평균 별점 */}
          <div className="text-center">
            <div className="text-4xl font-bold text-gray-900 mb-1">
              {averageRating ? averageRating.toFixed(1) : '0.0'}
            </div>
            <div className="flex items-center justify-center gap-0.5 mb-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <svg
                  key={star}
                  className={`w-4 h-4 ${star <= Math.round(averageRating || 0) ? 'text-orange-400' : 'text-gray-200'}`}
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              ))}
            </div>
            <div className="text-sm text-gray-500">({reviewCount.toLocaleString()}건)</div>
          </div>

          {/* 별점 분포 차트 */}
          <div className="flex items-end justify-center gap-2 h-24">
            {[5, 4, 3, 2, 1].map((rating) => {
              const count = ratingDistribution[rating] || 0;
              const percentage = Math.round((count / totalReviews) * 100);
              const height = maxCount > 0 ? (count / maxCount) * 100 : 0;
              const isHighest = count === maxCount && count > 0;

              return (
                <div key={rating} className="flex flex-col items-center gap-1">
                  {/* 퍼센트 말풍선 (가장 높은 것만) */}
                  <div className="h-5 flex items-end">
                    {isHighest && percentage > 0 && (
                      <div className="relative">
                        <div className="px-1.5 py-0.5 bg-orange-400 text-white text-[10px] font-bold rounded">
                          {percentage}%
                        </div>
                        <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-orange-400" />
                      </div>
                    )}
                  </div>
                  {/* 바 */}
                  <div className="w-6 h-16 bg-gray-100 rounded-sm overflow-hidden flex flex-col justify-end">
                    <div
                      className={`w-full transition-all duration-300 ${isHighest ? 'bg-orange-400' : 'bg-gray-300'}`}
                      style={{ height: `${height}%` }}
                    />
                  </div>
                  {/* 점수 라벨 */}
                  <span className="text-xs text-gray-500">{rating}점</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 리뷰 개수 + 정렬 필터 */}
      <div className="px-4 py-3 flex items-center justify-between border-b border-gray-100">
        {/* 리뷰 개수 */}
        <span className="text-sm text-gray-500">
          리뷰 <span className="font-semibold text-blue-600">{reviewCount.toLocaleString()}건</span>
        </span>
        {/* 정렬 셀렉터 */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setSortOrder('high')}
            className={`px-2.5 py-1 text-sm font-medium rounded-md transition-colors ${
              sortOrder === 'high'
                ? 'bg-gray-900 text-white'
                : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            별점 높은순
          </button>
          <button
            onClick={() => setSortOrder('low')}
            className={`px-2.5 py-1 text-sm font-medium rounded-md transition-colors ${
              sortOrder === 'low'
                ? 'bg-gray-900 text-white'
                : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            별점 낮은순
          </button>
        </div>
      </div>

      {/* 리뷰 목록 */}
      <div className="divide-y divide-gray-100">
        {sortedReviews.slice(0, visibleCount).map((review) => (
          <div key={review.id} className="px-4 py-4">
            {/* 헤더: 별점 + 쇼핑몰 */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {renderStars(review.rating)}
                {review.mall_name && (
                  <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">
                    {review.mall_name}
                  </span>
                )}
              </div>
            </div>

            {/* 작성자 + 작성일 */}
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
              {review.author && <span>{review.author}</span>}
              {review.author && review.review_date && <span>|</span>}
              {review.review_date && <span>{formatDate(review.review_date)}</span>}
            </div>

            {/* 리뷰 내용 */}
            <div className="mb-3">
              <p
                className={`text-sm text-gray-700 leading-relaxed ${
                  !expandedReviews.has(review.id) ? 'line-clamp-3' : ''
                }`}
              >
                {review.content}
              </p>
              {review.content.length > 100 && (
                <button
                  onClick={() => toggleExpand(review.id)}
                  className="text-sm text-blue-600 mt-1 font-medium"
                >
                  {expandedReviews.has(review.id) ? '접기' : '펼쳐보기'}
                </button>
              )}
            </div>

            {/* 이미지 썸네일 */}
            {review.images && review.images.length > 0 && (
              <div className="flex gap-2 overflow-x-auto">
                {review.images.slice(0, 4).map((image, idx) => (
                  <div
                    key={idx}
                    className="relative shrink-0 cursor-pointer"
                    onClick={() => openImageViewer(review.id, review.images, idx)}
                  >
                    <div className="w-20 h-20 rounded-lg overflow-hidden bg-gray-100">
                      <Image
                        src={image.thumbnail}
                        alt={`리뷰 이미지 ${idx + 1}`}
                        width={80}
                        height={80}
                        className="w-full h-full object-cover"
                        unoptimized
                      />
                    </div>
                    {idx === 3 && review.images.length > 4 && (
                      <div className="absolute inset-0 bg-black/50 rounded-lg flex items-center justify-center">
                        <span className="text-white font-semibold">+{review.images.length - 4}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 더보기 / 무한 스크롤 */}
      {visibleCount < reviews.length && (
        fullHeight ? (
          <div ref={loadMoreRef} className="flex items-center justify-center py-4">
            {loadingMore ? (
              <div className="flex items-center gap-2 text-gray-500">
                <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin"></div>
                <span className="text-sm">로딩 중...</span>
              </div>
            ) : (
              <div className="text-sm text-gray-400">스크롤하여 더보기</div>
            )}
          </div>
        ) : (
          <div className="px-4 pt-2">
            <button
              onClick={() => setVisibleCount(prev => prev + 10)}
              className="w-full py-3 text-sm font-medium text-gray-600 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
            >
              더보기 ({visibleCount}/{reviews.length})
            </button>
          </div>
        )
      )}

      {/* 이미지 확대 뷰어 */}
      <AnimatePresence>
        {expandedImages && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/90 flex flex-col"
            onClick={closeImageViewer}
          >
            {/* 닫기 버튼 */}
            <div className="absolute top-4 right-4 z-10">
              <button
                onClick={closeImageViewer}
                className="p-2 bg-white/10 rounded-full text-white hover:bg-white/20 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* 이미지 카운터 */}
            <div className="absolute top-4 left-4 text-white text-sm">
              {expandedImages.currentIndex + 1} / {expandedImages.images.length}
            </div>

            {/* 메인 이미지 */}
            <div
              className="flex-1 flex items-center justify-center p-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="relative w-full max-w-md aspect-square">
                <Image
                  src={expandedImages.images[expandedImages.currentIndex].original || expandedImages.images[expandedImages.currentIndex].thumbnail}
                  alt="확대 이미지"
                  fill
                  className="object-contain"
                  unoptimized
                />
              </div>
            </div>

            {/* 네비게이션 버튼 */}
            {expandedImages.images.length > 1 && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); navigateImage('prev'); }}
                  className="absolute left-4 top-1/2 -translate-y-1/2 p-2 bg-white/10 rounded-full text-white hover:bg-white/20 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); navigateImage('next'); }}
                  className="absolute right-4 top-1/2 -translate-y-1/2 p-2 bg-white/10 rounded-full text-white hover:bg-white/20 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </>
            )}

            {/* 하단 썸네일 */}
            <div className="p-4 bg-black/50">
              <div className="flex justify-center gap-2 overflow-x-auto">
                {expandedImages.images.map((image, idx) => (
                  <button
                    key={idx}
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedImages({ ...expandedImages, currentIndex: idx });
                    }}
                    className={`shrink-0 w-12 h-12 rounded-lg overflow-hidden border-2 transition-colors ${
                      idx === expandedImages.currentIndex ? 'border-white' : 'border-transparent opacity-50'
                    }`}
                  >
                    <Image
                      src={image.thumbnail}
                      alt={`썸네일 ${idx + 1}`}
                      width={48}
                      height={48}
                      className="w-full h-full object-cover"
                      unoptimized
                    />
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
