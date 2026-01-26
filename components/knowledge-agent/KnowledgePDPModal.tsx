'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Star, ShoppingCart, ArrowRight, CaretDown, CaretUp, Storefront, Truck, SpinnerGap } from '@phosphor-icons/react/dist/ssr';
import { logKAExternalLinkClicked, logKnowledgeAgentProductPurchaseClick, logKAPhotoReviewFilterToggle, logKABlogReviewClick, logKAReviewSortChange } from '@/lib/logging/clientLogger';
import {
  FcIdea,
  FcApproval,
  FcSearch,
  FcLike,
  FcMindMap,
  FcPodiumWithSpeaker,
  FcCurrencyExchange,
  FcRating,
  FcSpeaker,
  FcHighPriority,
  FcBusinessman
} from "react-icons/fc";
import ProductVariantsComparison from '@/components/ProductVariantsComparison';

interface ReviewData {
  reviewId: string;
  rating: number;
  content: string;
  author?: string;
  date?: string;
  mallName?: string;
  imageUrls?: string[] | null;
}

interface MallPrice {
  mall: string;
  price: number;
  delivery: string;
  link?: string;
}

interface ProductVariant {
  pcode: string;
  quantity: string;
  price: number | null;
  unitPrice: string | null;
  mallCount: number | null;
  rank?: string | null;
  isActive: boolean;
  productUrl: string;
}

interface PriceData {
  loading: boolean;
  lowestPrice: number | null;
  lowestMall: string | null;
  lowestDelivery: string | null;
  mallPrices: MallPrice[];
  mallCount: number;
  error?: string;
}

interface KnowledgePDPModalProps {
  product: {
    id: string;
    pcode?: string;  // 다나와 pcode
    title: string;
    brand?: string;
    price: number;
    thumbnail?: string;
    reviewCount?: number;
    rating?: number;
    reasoning?: string;
    oneLiner?: string;
    personalReason?: string;
    highlights?: string[];
    matchScore?: number;
    reviews?: ReviewData[];
    reviewQuotes?: string[];
    bestFor?: string;
    concerns?: string[];
    variants?: ProductVariant[];  // 다른 구성 옵션
    specSummary?: string;  // 스펙 요약
  };
  categoryKey: string;
  categoryName?: string;
  onClose: () => void;
}

/**
 * reasoning을 "한줄 평"과 "추천 이유"로 분리
 * 첫 번째 문장: 이모지로 시작하는 제품 강점 (한줄 평)
 * 두 번째 문장: 사용자 맞춤형 추천 이유
 */
function splitReasoning(reasoning: string | undefined): { oneLiner: string; personalReason: string } {
  if (!reasoning) return { oneLiner: '', personalReason: '' };
  
  const trimmed = reasoning.trim();
  
  // 마침표, 느낌표, 물음표 + 공백으로 문장 분리 시도
  // 예: "🧼 **핵심 강점** 설명이에요. 맞춤형 이유입니다."
  const sentenceEndPattern = /([.!?])\s+(?=[🎯💰🧼🤫🛡️✨💪🔥⭐🏆👶🍼]|[가-힣a-zA-Z])/;
  const match = trimmed.match(sentenceEndPattern);
  
  if (match && match.index !== undefined) {
    const splitIndex = match.index + 1; // 마침표 포함
    const oneLiner = trimmed.slice(0, splitIndex).trim();
    const personalReason = trimmed.slice(splitIndex).trim();
    
    // 두 번째 문장이 충분히 길면 분리
    if (personalReason.length >= 15) {
      return { oneLiner, personalReason };
    }
  }
  
  // 분리 실패 시 전체를 한줄 평으로
  return { oneLiner: trimmed, personalReason: '' };
}

export function KnowledgePDPModal({ product, categoryKey, categoryName, onClose }: KnowledgePDPModalProps) {
  const [isExiting, setIsExiting] = useState(false);
  const [showAllPrices, setShowAllPrices] = useState(false);
  const [expandedImages, setExpandedImages] = useState<{reviewId: string; images: string[]; currentIndex: number} | null>(null);
  const [reviewSortBy, setReviewSortBy] = useState<'newest' | 'rating_high' | 'rating_low'>('newest');
  const [showPhotoOnly, setShowPhotoOnly] = useState(false); // 포토리뷰만 보기
  const [displayedReviewsCount, setDisplayedReviewsCount] = useState(30); // 리뷰 lazy loading
  const [showBlogReview, setShowBlogReview] = useState(false); // 블로그 후기 바텀시트
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const [priceData, setPriceData] = useState<PriceData>({
    loading: false,
    lowestPrice: null,
    lowestMall: null,
    lowestDelivery: null,
    mallPrices: [],
    mallCount: 0,
  });
  
  // reasoning을 두 부분으로 분리
  const { oneLiner: splitOneLiner, personalReason: splitPersonalReason } = splitReasoning(product.reasoning);
  const oneLiner = product.oneLiner || splitOneLiner;
  const personalReason = product.personalReason || splitPersonalReason;

  // 날짜 파싱 함수 (최신순 정렬용)
  const parseReviewDate = (dateStr: string | undefined): number => {
    if (!dateStr) return 0;
    const nums = dateStr.match(/\d+/g);
    if (!nums || nums.length < 3) return 0;
    const [rawY, m, d] = nums.map(Number);
    const y = rawY < 100 ? rawY + 2000 : rawY;
    return new Date(y, m - 1, d).getTime();
  };

  // 리뷰 정렬 + 필터 함수
  const filteredAndSortedReviews = (product.reviews || [])
    .filter(r => !showPhotoOnly || (r.imageUrls && r.imageUrls.length > 0))
    .slice()
    .sort((a, b) => {
      switch (reviewSortBy) {
        case 'newest':
          return parseReviewDate(b.date) - parseReviewDate(a.date);
        case 'rating_high':
          return b.rating - a.rating;
        case 'rating_low':
          return a.rating - b.rating;
        default:
          return 0;
      }
    });

  // 포토리뷰 개수 계산
  const photoReviewCount = (product.reviews || []).filter(r => r.imageUrls && r.imageUrls.length > 0).length;

  // Intersection Observer로 무한 스크롤
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && displayedReviewsCount < filteredAndSortedReviews.length) {
          setDisplayedReviewsCount(prev => Math.min(prev + 20, filteredAndSortedReviews.length));
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    return () => observer.disconnect();
  }, [displayedReviewsCount, filteredAndSortedReviews.length]);

  // Fetch prices from Danawa
  const fetchPrices = useCallback(async (pcode: string) => {
    setPriceData(prev => ({ ...prev, loading: true, error: undefined }));

    try {
      const res = await fetch(`/api/knowledge-agent/prices?pcode=${pcode}`);
      const data = await res.json();

      if (data.success) {
        setPriceData({
          loading: false,
          lowestPrice: data.lowestPrice,
          lowestMall: data.lowestMall,
          lowestDelivery: data.lowestDelivery,
          mallPrices: data.mallPrices || [],
          mallCount: data.mallCount || 0,
        });
      } else {
        setPriceData(prev => ({
          ...prev,
          loading: false,
          error: data.error || 'Failed to fetch prices',
        }));
      }
    } catch (error) {
      setPriceData(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Network error',
      }));
    }
  }, []);

  // Fetch prices on mount if pcode exists
  useEffect(() => {
    const pcode = product.pcode || product.id;
    if (pcode && /^\d+$/.test(pcode)) {
      fetchPrices(pcode);
    }
  }, [product.pcode, product.id, fetchPrices]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(() => {
      onClose();
    }, 300);
  };

  return (
    <motion.div
      initial={{ backgroundColor: 'rgba(0, 0, 0, 0)' }}
      animate={{
        backgroundColor: isExiting ? 'rgba(0, 0, 0, 0)' : 'rgba(0, 0, 0, 0.5)'
      }}
      transition={{ duration: 0.3 }}
      className="fixed inset-0 z-[120] flex justify-center backdrop-blur-[1px]"
      onClick={handleClose}
    >
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: isExiting ? '100%' : 0 }}
        transition={{ type: 'spring', stiffness: 280, damping: 28 }}
        className="relative w-full max-w-[480px] h-[100dvh] flex flex-col bg-white overflow-hidden shadow-2xl"
        style={{ boxShadow: '-4px 0 16px rgba(0, 0, 0, 0.1)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="shrink-0 bg-white/80 backdrop-blur-xl border-b border-gray-50/50 px-4 h-16 flex items-center justify-between z-20">
          <motion.button
            whileHover={{ scale: 1.1, rotate: 90 }}
            whileTap={{ scale: 0.9 }}
            onClick={handleClose}
            className="p-2 -ml-2 hover:bg-gray-50 rounded-full transition-colors"
          >
            <X size={20} weight="bold" className="text-gray-400" />
          </motion.button>
          <span className="text-[15px] font-black text-gray-900 tracking-tight">AI 심층 리포트</span>
          <div className="w-9" />
        </header>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto bg-[#FBFBFD]">
          {/* Thumbnail */}
          <div className="px-5 pt-6">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="relative w-full aspect-square bg-white rounded-[32px] overflow-hidden shadow-xl shadow-gray-200/50 border border-gray-100"
            >
              {product.thumbnail ? (
                <Image
                  src={product.thumbnail}
                  alt={product.title}
                  fill
                  className="object-contain p-4"
                  priority
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400">
                  <ShoppingCart size={48} />
                </div>
              )}

              {/* Match Score Badge */}
              {product.matchScore && (
                <motion.div 
                  initial={{ x: -20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="absolute top-4 left-4 flex items-center gap-2 px-3.5 py-2 bg-gray-900/90 backdrop-blur-md text-white rounded-2xl shadow-lg border border-white/10"
                >
                  <FcApproval size={16} />
                  <span className="text-[13px] font-black tracking-tighter uppercase">{product.matchScore}% Perfect Match</span>
                </motion.div>
              )}
            </motion.div>
          </div>

          {/* Product Info */}
          <div className="px-6 pt-8 pb-8">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <FcPodiumWithSpeaker size={18} />
                <span className="text-[14px] font-black text-gray-400 uppercase tracking-widest">
                  {product.brand || 'Brand Info'}
                </span>
              </div>

              {(product.rating || product.reviewCount) && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white border border-gray-100 rounded-xl shadow-sm">
                  <FcRating size={14} />
                  <span className="text-[13px] font-black text-gray-900">
                    {product.rating?.toFixed(1) || '—'}
                  </span>
                  {product.reviewCount && (
                    <span className="text-[11px] font-bold text-gray-300">
                      /{product.reviewCount.toLocaleString()}
                    </span>
                  )}
                </div>
              )}
            </div>

            <h2 className="text-[20px] font-black text-gray-900 mb-6 leading-[1.3] tracking-tight">
              {product.title}
            </h2>

            {/* 다른 구성 옵션 */}
            {product.variants && product.variants.length > 0 && (
              <div className="mb-6">
                <ProductVariantsComparison variants={product.variants} />
              </div>
            )}

            {/* 실시간 가격 비교 */}
            <div className="bg-white rounded-[24px] border border-gray-100 shadow-sm overflow-hidden">
              {/* 최저가 헤더 */}
              <div className="p-5 border-b border-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-black text-gray-400 uppercase tracking-widest">
                        실시간 최저가
                      </span>
                      {priceData.loading && (
                        <SpinnerGap size={12} className="animate-spin text-blue-500" />
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <FcCurrencyExchange size={18} />
                      {priceData.loading ? (
                        <span className="text-[22px] font-black text-gray-300">...</span>
                      ) : priceData.lowestPrice ? (
                        <>
                          <span className="text-[22px] font-black text-blue-600">
                            {priceData.lowestPrice.toLocaleString()}
                          </span>
                          <span className="text-[15px] font-bold text-blue-600">원</span>
                        </>
                      ) : (
                        <>
                          <span className="text-[22px] font-black text-gray-600">
                            {product.price.toLocaleString()}
                          </span>
                          <span className="text-[15px] font-bold text-gray-600">원</span>
                        </>
                      )}
                    </div>
                    {priceData.lowestMall && !priceData.loading && (
                      <div className="flex items-center gap-1.5 mt-1">
                        <Storefront size={12} className="text-gray-400" />
                        <span className="text-[12px] font-medium text-gray-500">
                          {priceData.lowestMall}
                        </span>
                        {priceData.lowestDelivery && (
                          <span className="text-[11px] text-gray-400">
                            {priceData.lowestDelivery}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => {
                      const pcode = product.pcode || product.id;
                      const url = pcode && /^\d+$/.test(pcode) 
                        ? `https://prod.danawa.com/info/?pcode=${pcode}`
                        : `https://search.danawa.com/dsearch.php?query=${encodeURIComponent(product.title)}`;
                      
                      logKAExternalLinkClicked(categoryKey, pcode || '', product.title, '다나와', url);
                      window.open(url, '_blank');
                    }}
                    className="w-12 h-12 bg-gray-900 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-gray-200"
                  >
                    <FcSearch size={22} />
                  </motion.button>
                </div>
              </div>

              {/* 쇼핑몰 가격 목록 */}
              {priceData.mallPrices.length > 0 && (
                <div className="px-5 pb-4">
                  <button
                    onClick={() => setShowAllPrices(!showAllPrices)}
                    className="w-full flex items-center justify-between py-3 text-[13px] font-bold text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    <span className="flex items-center gap-1.5">
                      <Storefront size={14} />
                      {priceData.mallCount}개 쇼핑몰 비교
                    </span>
                    {showAllPrices ? <CaretUp size={14} /> : <CaretDown size={14} />}
                  </button>

                  <AnimatePresence>
                    {showAllPrices && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="space-y-2 pt-2">
                          {priceData.mallPrices.slice(0, 10).map((mp, i) => (
                            <motion.div
                              key={`${mp.mall}-${mp.price}-${i}`}
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: i * 0.03 }}
                              onClick={() => {
                                if (mp.link) {
                                  logKAExternalLinkClicked(categoryKey, product.pcode || '', product.title, mp.mall, mp.link);
                                  
                                  // 상세 구매 로깅 추가
                                  logKnowledgeAgentProductPurchaseClick(
                                    categoryKey,
                                    product.pcode || product.id,
                                    product.title,
                                    mp.mall,
                                    mp.link
                                  );

                                  window.open(mp.link, '_blank');
                                }
                              }}
                              className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors ${
                                i === 0 ? 'bg-blue-50 border border-blue-100 hover:bg-blue-100' : 'bg-gray-50 hover:bg-gray-100'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                {i === 0 && (
                                  <span className="px-1.5 py-0.5 bg-blue-500 text-white text-[9px] font-black rounded">
                                    최저
                                  </span>
                                )}
                                <span className={`text-[13px] font-bold ${
                                  i === 0 ? 'text-blue-700' : 'text-gray-700'
                                }`}>
                                  {mp.mall}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className={`text-[14px] font-black ${
                                  i === 0 ? 'text-blue-600' : 'text-gray-800'
                                }`}>
                                  {mp.price.toLocaleString()}원
                                </span>
                                {mp.delivery && (
                                  <span className="flex items-center gap-0.5 text-[10px] text-gray-400">
                                    <Truck size={10} />
                                    {mp.delivery.replace(/[()]/g, '')}
                                  </span>
                                )}
                              </div>
                            </motion.div>
                          ))}
                          {priceData.mallPrices.length > 10 && (
                            <button
                              onClick={() => {
                                const pcode = product.pcode || product.id;
                                if (pcode) {
                                  window.open(`https://prod.danawa.com/info/?pcode=${pcode}`, '_blank');
                                }
                              }}
                              className="w-full py-2 text-[12px] font-bold text-blue-500 hover:text-blue-700"
                            >
                              +{priceData.mallPrices.length - 10}개 더보기
                            </button>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* 에러 메시지 */}
              {priceData.error && !priceData.loading && (
                <div className="px-5 pb-4">
                  <p className="text-[12px] text-gray-400 text-center py-2">
                    가격 정보를 불러올 수 없습니다
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* 한줄 평 (One-liner) */}
          {oneLiner && (
            <div className="px-6 pb-4">
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="p-6 rounded-[32px] bg-white border border-gray-100 shadow-sm relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 blur-[50px] rounded-full" />
                <div className="flex items-center gap-2.5 mb-4 relative z-10">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/icons/ic-ai.svg" alt="" width={20} height={20} style={{ filter: 'sepia(1) saturate(3) hue-rotate(-10deg) brightness(1.1)' }} />
                  <h4 className="text-[15px] font-black tracking-tight uppercase bg-gradient-to-r from-amber-500 to-orange-500 bg-clip-text text-transparent">
                    한줄 평
                  </h4>
                </div>
                <p className="text-[15px] text-gray-700 font-medium leading-[1.6] relative z-10">
                  {oneLiner}
                </p>
              </motion.div>
            </div>
          )}

          {/* 추천 이유 (Personalized Reason) */}
          {personalReason && (
            <div className="px-6 pb-8">
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
                className="p-6 rounded-[32px] bg-white border border-gray-100 shadow-sm relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 blur-[50px] rounded-full" />
                <div className="flex items-center gap-2.5 mb-4 relative z-10">
                  <FcMindMap size={24} />
                  <h4 className="text-[15px] font-black text-gray-900 tracking-tight uppercase">
                    추천 이유
                  </h4>
                </div>
                <p className="text-[15px] text-gray-700 font-medium leading-[1.6] relative z-10">
                  {personalReason}
                </p>
              </motion.div>
            </div>
          )}

          {/* Highlights */}
          {product.highlights && product.highlights.length > 0 && (
            <div className="px-6 pb-8">
               <div className="flex items-center gap-2 mb-4">
                  <FcIdea size={18} />
                  <h4 className="text-[14px] font-black text-gray-900 uppercase tracking-widest">
                    Key Highlights
                  </h4>
               </div>
              <div className="grid grid-cols-1 gap-3">
                {product.highlights.map((highlight, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 + (i * 0.1) }}
                    className="flex items-center gap-3 bg-white p-4 rounded-[20px] border border-gray-100"
                  >
                    <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                      <FcLike size={16} />
                    </div>
                    <span className="text-[14px] font-bold text-gray-700 leading-snug">{highlight}</span>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {/* 이런 분께 추천 */}
          {product.bestFor && (
            <div className="px-6 pb-8">
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 }}
                className="p-5 rounded-[24px] bg-gradient-to-br from-blue-50 to-purple-50 border border-blue-100/50"
              >
                <div className="flex items-center gap-2 mb-2">
                  <FcBusinessman size={18} />
                  <h4 className="text-[13px] font-black text-gray-600 uppercase tracking-wider">
                    이런 분께 추천
                  </h4>
                </div>
                <p className="text-[15px] font-bold text-gray-800 leading-relaxed">
                  {product.bestFor}
                </p>
              </motion.div>
            </div>
          )}

          {/* 주의점 */}
          {product.concerns && product.concerns.length > 0 && (
            <div className="px-6 pb-8">
               <div className="flex items-center gap-2 mb-4">
                  <FcHighPriority size={18} />
                  <h4 className="text-[14px] font-black text-gray-900 uppercase tracking-widest">
                    구매 전 참고하세요
                  </h4>
               </div>
              <div className="space-y-2">
                {product.concerns.map((concern, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4 + (i * 0.1) }}
                    className="flex items-start gap-2 px-4 py-3 bg-amber-50 rounded-xl border border-amber-100"
                  >
                    <span className="text-amber-500 mt-0.5">⚠️</span>
                    <span className="text-[13px] font-medium text-amber-800 leading-snug">{concern}</span>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {/* 블로그 후기 버튼 (리뷰 유무와 상관없이 항상 표시) */}
          <div className="px-6 mb-4">
            <button
              onClick={() => {
                setShowBlogReview(true);
                // 로깅
                logKABlogReviewClick(
                  categoryKey,
                  categoryName || '',
                  product.pcode || product.id,
                  product.title,
                  'pdp_modal'
                );
              }}
              className="w-full py-3 text-[13px] font-bold rounded-xl transition-colors flex items-center justify-center gap-2 bg-green-50 text-green-700 hover:bg-green-100 border border-green-200"
            >
              📝 네이버 블로그 후기 보기
            </button>
          </div>

          {/* 실제 구매자 리뷰 */}
          {product.reviews && product.reviews.length > 0 && (
            <div className="px-6 pb-20">
               <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <FcSpeaker size={18} />
                    <h4 className="text-[14px] font-black text-gray-900 uppercase tracking-widest">
                      실제 구매자 리뷰
                    </h4>
                  </div>
                  <span className="text-[12px] font-bold text-gray-400">
                    {(product.reviewCount || product.reviews.length).toLocaleString()}개
                  </span>
               </div>

               {/* 리뷰 필터 (정렬 + 포토리뷰) */}
               <div className="flex flex-wrap gap-2 mb-4">
                 {[
                   { key: 'newest' as const, label: '최신순' },
                   { key: 'rating_high' as const, label: '별점 높은순' },
                   { key: 'rating_low' as const, label: '별점 낮은순' },
                 ].map(({ key, label }) => (
                   <button
                     key={key}
                     onClick={() => {
                       setReviewSortBy(key);
                       setDisplayedReviewsCount(30);
                       // 로깅
                       logKAReviewSortChange(
                         categoryKey,
                         categoryName || '',
                         product.pcode || product.id,
                         product.title,
                         key,
                         'pdp_modal'
                       );
                     }}
                     className={`px-3 py-1.5 text-[12px] font-bold rounded-full transition-colors ${
                       reviewSortBy === key
                         ? 'bg-gray-900 text-white'
                         : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                     }`}
                   >
                     {label}
                   </button>
                 ))}
                 {/* 포토리뷰 필터 */}
                 {photoReviewCount > 0 && (
                   <button
                     onClick={() => {
                       const newValue = !showPhotoOnly;
                       setShowPhotoOnly(newValue);
                       setDisplayedReviewsCount(30);
                       // 로깅
                       logKAPhotoReviewFilterToggle(
                         categoryKey,
                         categoryName || '',
                         product.pcode || product.id,
                         product.title,
                         newValue,
                         photoReviewCount,
                         'pdp_modal'
                       );
                     }}
                     className={`px-3 py-1.5 text-[12px] font-bold rounded-full transition-colors flex items-center gap-1 ${
                       showPhotoOnly
                         ? 'bg-blue-500 text-white'
                         : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                     }`}
                   >
                     📷 포토리뷰 ({photoReviewCount})
                   </button>
                 )}
               </div>

              <div className="space-y-3">
                {filteredAndSortedReviews.slice(0, displayedReviewsCount).map((review, i) => (
                  <motion.div
                    key={review.reviewId || i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(0.4 + (i * 0.03), 1.2) }}
                    className="p-4 bg-white rounded-[20px] border border-gray-100 shadow-sm"
                  >
                    {/* 리뷰 헤더 */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        {/* 별점 */}
                        <div className="flex items-center gap-0.5">
                          {[...Array(5)].map((_, idx) => (
                            <Star
                              key={idx}
                              size={12}
                              weight="fill"
                              className={idx < review.rating ? 'text-yellow-400' : 'text-gray-200'}
                            />
                          ))}
                        </div>
                        <span className="text-[12px] font-bold text-gray-600 ml-1">
                          {review.rating}점
                        </span>
                      </div>
                      {review.mallName && (
                        <span className="text-[11px] font-medium text-gray-400 px-2 py-0.5 bg-gray-50 rounded-full">
                          {review.mallName}
                        </span>
                      )}
                    </div>

                    {/* 리뷰 내용 */}
                    <p className="text-[14px] text-gray-700 font-medium leading-relaxed line-clamp-4">
                      {review.content}
                    </p>

                    {/* 리뷰 이미지 썸네일 */}
                    {review.imageUrls && review.imageUrls.length > 0 && (
                      <div className="flex gap-2 mt-3 overflow-x-auto">
                        {review.imageUrls.slice(0, 4).map((imageUrl, idx) => (
                          <div
                            key={idx}
                            className="relative shrink-0 cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedImages({
                                reviewId: review.reviewId || String(i),
                                images: review.imageUrls!,
                                currentIndex: idx
                              });
                            }}
                          >
                            <div className="w-16 h-16 rounded-lg overflow-hidden bg-gray-100">
                              <Image
                                src={imageUrl}
                                alt={`리뷰 이미지 ${idx + 1}`}
                                width={64}
                                height={64}
                                className="w-full h-full object-cover"
                                unoptimized
                              />
                            </div>
                            {idx === 3 && review.imageUrls!.length > 4 && (
                              <div className="absolute inset-0 bg-black/50 rounded-lg flex items-center justify-center">
                                <span className="text-white text-xs font-semibold">+{review.imageUrls!.length - 4}</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* 작성자/날짜 */}
                    <div className="flex items-center gap-2 mt-3 pt-2 border-t border-gray-50">
                      {review.author && (
                        <span className="text-[11px] font-medium text-gray-400">
                          {review.author}
                        </span>
                      )}
                      {review.date && (
                        <span className="text-[11px] text-gray-300">
                          {review.date}
                        </span>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* 무한 스크롤 트리거 */}
              {filteredAndSortedReviews.length > displayedReviewsCount && (
                <div ref={loadMoreRef} className="py-4 text-center">
                  <span className="text-[12px] text-gray-400">
                    스크롤하여 더 보기 ({displayedReviewsCount}/{filteredAndSortedReviews.length})
                  </span>
                </div>
              )}
            </div>
          )}

          {/* 리뷰가 없을 때 reviewQuotes 표시 */}
          {(!product.reviews || product.reviews.length === 0) && product.reviewQuotes && product.reviewQuotes.length > 0 && (
            <div className="px-6 pb-20">
               <div className="flex items-center gap-2 mb-4">
                  <FcSpeaker size={18} />
                  <h4 className="text-[14px] font-black text-gray-900 uppercase tracking-widest">
                    주요 리뷰 요약
                  </h4>
               </div>
              <div className="space-y-2">
                {product.reviewQuotes.map((quote, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4 + (i * 0.1) }}
                    className="flex items-start gap-2 px-4 py-3 bg-gray-50 rounded-xl border border-gray-100"
                  >
                    <span className="text-gray-400 mt-0.5">"</span>
                    <span className="text-[13px] font-medium text-gray-700 leading-snug italic">{quote}</span>
                    <span className="text-gray-400 mt-0.5">"</span>
                  </motion.div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Bottom CTA */}
        <div className="shrink-0 w-full bg-white/80 backdrop-blur-xl border-t border-gray-50/50 px-5 pt-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] z-30">
          <motion.button
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              const pcode = product.pcode || product.id;
              // 가격 정보 업데이트 여부와 상관없이 pcode 기반 다나와 URL로 이동
              const url = `https://prod.danawa.com/info/?pcode=${pcode}`;
              logKAExternalLinkClicked(categoryKey, pcode || '', product.title, '다나와', url);
              
              // 상세 구매 로깅 추가
              logKnowledgeAgentProductPurchaseClick(
                categoryKey,
                pcode || '',
                product.title,
                priceData.lowestMall || '다나와',
                url
              );

              window.open(url, '_blank');
            }}
            className="w-full h-14 flex items-center justify-center gap-3 font-black rounded-[20px] text-[16px] transition-all text-white bg-gray-900 shadow-xl shadow-gray-200 hover:bg-black"
          >
            <ShoppingCart size={20} weight="fill" />
            최저가로 구매하기
            <ArrowRight size={18} weight="bold" />
          </motion.button>
        </div>
      </motion.div>

      {/* 이미지 확대 뷰어 */}
      <AnimatePresence>
        {expandedImages && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[130] bg-black/90 flex flex-col"
            onClick={() => setExpandedImages(null)}
          >
            {/* 닫기 버튼 */}
            <div className="absolute top-4 right-4 z-10">
              <button
                onClick={() => setExpandedImages(null)}
                className="p-2 bg-white/10 rounded-full text-white hover:bg-white/20 transition-colors"
              >
                <X size={24} weight="bold" />
              </button>
            </div>

            {/* 이미지 카운터 */}
            <div className="absolute top-4 left-4 text-white text-sm font-medium">
              {expandedImages.currentIndex + 1} / {expandedImages.images.length}
            </div>

            {/* 메인 이미지 */}
            <div
              className="flex-1 flex items-center justify-center p-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="relative w-full max-w-md aspect-square">
                <Image
                  src={expandedImages.images[expandedImages.currentIndex]}
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
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpandedImages(prev => prev ? {
                      ...prev,
                      currentIndex: prev.currentIndex === 0 ? prev.images.length - 1 : prev.currentIndex - 1
                    } : null);
                  }}
                  className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-white/10 rounded-full text-white hover:bg-white/20 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpandedImages(prev => prev ? {
                      ...prev,
                      currentIndex: prev.currentIndex === prev.images.length - 1 ? 0 : prev.currentIndex + 1
                    } : null);
                  }}
                  className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-white/10 rounded-full text-white hover:bg-white/20 transition-colors"
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
                      setExpandedImages(prev => prev ? { ...prev, currentIndex: idx } : null);
                    }}
                    className={`shrink-0 w-12 h-12 rounded-lg overflow-hidden border-2 transition-colors ${
                      idx === expandedImages.currentIndex ? 'border-white' : 'border-transparent opacity-50'
                    }`}
                  >
                    <Image
                      src={image}
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
        {showBlogReview && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-60 bg-black/50"
            onClick={() => setShowBlogReview(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 200 }}
              className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] h-[85vh] bg-white rounded-t-3xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* 핸들 */}
              <div className="flex justify-center py-2">
                <div className="w-10 h-1 bg-gray-300 rounded-full" />
              </div>

              {/* 헤더 */}
              <div className="flex items-center justify-between px-4 py-2 border-b">
                <div className="flex items-center gap-2">
                  <span className="text-lg">📝</span>
                  <h2 className="font-bold text-gray-900">블로그 리뷰</h2>
                </div>
                <button
                  onClick={() => setShowBlogReview(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
                >
                  <X size={20} className="text-gray-500" />
                </button>
              </div>

              {/* 검색어 안내 */}
              <div className="px-4 py-2 bg-gray-50 border-b">
                <p className="text-[12px] text-gray-500">
                  &quot;{product.title}&quot; 검색 결과
                </p>
              </div>

              {/* iframe */}
              <iframe
                src={`https://m.blog.naver.com/SectionPostSearch.naver?orderType=sim&searchValue=${encodeURIComponent(product.title)}`}
                className="w-full h-[calc(85vh-100px)]"
                sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
