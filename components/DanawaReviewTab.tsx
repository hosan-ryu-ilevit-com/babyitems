'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { CaretDown } from '@phosphor-icons/react/dist/ssr';

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
  productTitle?: string; // 블로그 검색용 상품명
}

export default function DanawaReviewTab({ pcode, fullHeight = false, productTitle }: DanawaReviewTabProps) {
  const [reviews, setReviews] = useState<DanawaReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewCount, setReviewCount] = useState(0);
  const [averageRating, setAverageRating] = useState<number | null>(null);
  const [expandedReviews, setExpandedReviews] = useState<Set<number>>(new Set());
  const [expandedImages, setExpandedImages] = useState<{reviewId: number; images: DanawaReviewImage[]; currentIndex: number} | null>(null);
  const [visibleCount, setVisibleCount] = useState(5);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sortOrder, setSortOrder] = useState<'newest' | 'high' | 'low'>('newest');
  const [isSortBottomSheetOpen, setIsSortBottomSheetOpen] = useState(false);
  const [showPhotoOnly, setShowPhotoOnly] = useState(false);
  const [showBlogReview, setShowBlogReview] = useState(false);

  const sortLabels = {
    newest: '최신순',
    high: '별점 높은순',
    low: '별점 낮은순'
  };
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
    const nums = dateStr.match(/\d+/g);
    if (!nums || nums.length < 3) return dateStr;
    let [y, m, d] = nums;
    const yy = y.length === 4 ? y.slice(2) : y;
    const mm = m.padStart(2, '0');
    const dd = d.padStart(2, '0');
    return `${yy}.${mm}.${dd}`;
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

  // 포토 리뷰 개수 계산
  const photoReviewCount = reviews.filter(r => r.images && r.images.length > 0).length;
  const hasPhotoReviews = photoReviewCount > 0;

  // 정렬 및 필터링된 리뷰
  const sortedReviews = [...reviews]
    .filter(r => !showPhotoOnly || (r.images && r.images.length > 0))
    .sort((a, b) => {
      if (sortOrder === 'newest') {
        const dateA = a.review_date ? new Date(a.review_date).getTime() : 0;
        const dateB = b.review_date ? new Date(b.review_date).getTime() : 0;
        return dateB - dateA;
      }
      if (sortOrder === 'high') {
        return b.rating - a.rating;
      }
      return a.rating - b.rating;
    });

  return (
    <div className="pb-4 relative">
      {/* 리뷰 요약 - 새 디자인 */}
      <div className="px-4 pt-5 pb-0 flex items-center justify-between">
        <h3 className="text-[18px] font-semibold text-gray-900">상품 리뷰</h3>
        <div className="flex items-center gap-1">
          <Image src="/icons/ic-star.png" alt="" width={18} height={18} />
          <span className="text-[16px] font-semibold text-gray-800">{averageRating ? averageRating.toFixed(1) : '—'}</span>
          <span className="text-[16px] font-semibold text-gray-800 ml-0.5">({reviewCount})</span>
        </div>
      </div>

      {/* 필터 뱃지 */}
      <div className="px-4 pt-5 pb-3 flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setIsSortBottomSheetOpen(true)}
          className="flex items-center gap-1 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-sm text-gray-700 hover:bg-gray-50 transition-colors"
        >
          {sortLabels[sortOrder]}
          <CaretDown size={14} />
        </button>

        {/* 포토 리뷰 토글 - 포토 리뷰가 있을 때만 표시 */}
        {hasPhotoReviews && (
          <button
            onClick={() => setShowPhotoOnly(prev => !prev)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-colors ${
              showPhotoOnly
                ? 'bg-gray-800 text-white'
                : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
            포토 리뷰만 보기
          </button>
        )}

        {/* 블로그 후기 버튼 */}
        {productTitle && (
          <button
            onClick={() => setShowBlogReview(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-full text-[13px] font-semibold bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 transition-colors"
          >
            <Image
              src="/icons/malls/name=naver.png"
              alt="네이버"
              width={16}
              height={16}
              className="rounded-full object-cover"
            />
            블로그 리뷰
          </button>
        )}
      </div>

      {/* 리뷰 목록 */}
      <div className="px-4 divide-y divide-gray-200">
        {sortedReviews.slice(0, visibleCount).map((review) => (
          <div key={review.id} className="py-4">
            {/* Row 1: Profile, Nickname, Mall */}
            <div className="flex items-center gap-2 mb-2">
              <div className="w-[22px] h-[22px] rounded-full bg-gray-100 flex items-center justify-center overflow-hidden shrink-0">
                <Image src="/icons/ic-user.png" alt="" width={22} height={22} className="object-contain" />
              </div>
              <span className="text-[14px] font-semibold text-gray-800 truncate">
                {review.author || '*'.repeat(3 + (review.id % 6))}
              </span>
              {review.mall_name && (
                <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-[12px] font-medium rounded-[6px] shrink-0">
                  {review.mall_name}
                </span>
              )}
            </div>

            {/* Row 2: Stars, Date */}
            <div className="flex items-center gap-2 mb-3">
              <div className="flex gap-0">
                {[1, 2, 3, 4, 5].map(star => (
                  <Image 
                    key={star} 
                    src={star <= review.rating ? "/icons/ic-star.png" : "/icons/ic-star-gray.svg"} 
                    alt="" 
                    width={18} 
                    height={18} 
                    className="object-contain" 
                  />
                ))}
              </div>
              {review.review_date && <span className="text-[12px] font-medium text-gray-400">{formatDate(review.review_date)}</span>}
            </div>

            {/* Row 3: Photos */}
            {review.images && review.images.length > 0 && (
              <div className="flex gap-2 mb-3 overflow-x-auto pb-1 scrollbar-hide">
                {review.images.map((image, idx) => (
                  <div
                    key={idx}
                    className="relative shrink-0 cursor-pointer"
                    onClick={() => openImageViewer(review.id, review.images, idx)}
                  >
                    <div className="w-20 h-20 rounded-lg overflow-hidden bg-gray-100 border border-gray-100">
                      <Image
                        src={image.thumbnail}
                        alt={`리뷰 이미지 ${idx + 1}`}
                        width={80}
                        height={80}
                        className="w-full h-full object-cover"
                        unoptimized
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Row 4: Content */}
            <div className="relative">
              <p className={`text-[14px] font-medium text-gray-800 leading-[1.4] ${!expandedReviews.has(review.id) ? 'line-clamp-3' : ''}`}>
                {review.content}
              </p>
              {review.content.length > 120 && (
                <button 
                  onClick={() => toggleExpand(review.id)}
                  className="mt-2 text-[14px] font-medium text-blue-500 hover:text-blue-600 transition-colors"
                >
                  {expandedReviews.has(review.id) ? '접기' : '더보기'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* 정렬 바텀시트 */}
      <AnimatePresence>
        {isSortBottomSheetOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSortBottomSheetOpen(false)}
              className="fixed inset-0 bg-black/40 z-[100]"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed bottom-0 left-0 right-0 max-w-[480px] mx-auto bg-white rounded-t-[12px] z-[101] px-4 pt-[34px] pb-8 h-[285px]"
            >
              <div className="flex flex-col gap-6">
                {(['newest', 'high', 'low'] as const).map((order) => (
                  <button
                    key={order}
                    onClick={() => {
                      setSortOrder(order);
                      setIsSortBottomSheetOpen(false);
                    }}
                    className="w-full flex items-center justify-between px-2 text-[16px] transition-colors"
                  >
                    <span className={sortOrder === order ? 'text-gray-800 font-semibold' : 'text-gray-400 font-medium'}>
                      {sortLabels[order]}
                    </span>
                    {sortOrder === order && (
                      <svg className="w-5 h-5 text-gray-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

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

      {/* 블로그 후기 바텀시트 */}
      <AnimatePresence>
        {showBlogReview && productTitle && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/50"
            onClick={() => setShowBlogReview(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="absolute bottom-0 left-0 right-0 h-[85vh] bg-white rounded-t-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* 핸들 */}
              <div className="flex justify-center py-2">
                <div className="w-10 h-1 bg-gray-300 rounded-full" />
              </div>

              {/* 헤더 */}
              <div className="flex items-center justify-between px-4 py-2">
                <div className="flex items-center gap-2">
                  <h2 className="font-bold text-gray-900">블로그 리뷰</h2>
                </div>
                <button
                  onClick={() => setShowBlogReview(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
                >
                  <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              

              {/* iframe */}
              <iframe
                src={`https://m.blog.naver.com/SectionPostSearch.naver?orderType=sim&searchValue=${encodeURIComponent(productTitle)}`}
                className="w-full h-[calc(85vh-100px)]"
                sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
