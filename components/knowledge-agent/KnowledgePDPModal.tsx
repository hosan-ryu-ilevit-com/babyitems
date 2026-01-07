'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Star, ShoppingCart, ArrowRight, CaretDown, CaretUp, Storefront, Truck, SpinnerGap } from '@phosphor-icons/react/dist/ssr';
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

interface ReviewData {
  reviewId: string;
  rating: number;
  content: string;
  author?: string;
  date?: string;
  mallName?: string;
}

interface MallPrice {
  mall: string;
  price: number;
  delivery: string;
  link?: string;
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
    highlights?: string[];
    matchScore?: number;
    reviews?: ReviewData[];
    reviewQuotes?: string[];
    bestFor?: string;
    concerns?: string[];
  };
  categoryKey: string;
  onClose: () => void;
}

export function KnowledgePDPModal({ product, categoryKey, onClose }: KnowledgePDPModalProps) {
  const [isExiting, setIsExiting] = useState(false);
  const [showAllPrices, setShowAllPrices] = useState(false);
  const [priceData, setPriceData] = useState<PriceData>({
    loading: false,
    lowestPrice: null,
    lowestMall: null,
    lowestDelivery: null,
    mallPrices: [],
    mallCount: 0,
  });

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
                      if (pcode && /^\d+$/.test(pcode)) {
                        window.open(`https://prod.danawa.com/info/?pcode=${pcode}`, '_blank');
                      } else {
                        window.open(`https://search.danawa.com/dsearch.php?query=${encodeURIComponent(product.title)}`, '_blank');
                      }
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
                              className={`flex items-center justify-between p-3 rounded-xl ${
                                i === 0 ? 'bg-blue-50 border border-blue-100' : 'bg-gray-50'
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

          {/* AI Reasoning */}
          {product.reasoning && (
            <div className="px-6 pb-8">
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="p-6 rounded-[32px] bg-white border border-gray-100 shadow-sm relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 blur-[50px] rounded-full" />
                <div className="flex items-center gap-2.5 mb-4 relative z-10">
                  <FcMindMap size={24} />
                  <h4 className="text-[15px] font-black text-gray-900 tracking-tight uppercase">
                    AI recommendation logic
                  </h4>
                </div>
                <p className="text-[15px] text-gray-700 font-medium leading-[1.6] relative z-10">
                  {product.reasoning}
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

          {/* 실제 구매자 리뷰 */}
          {product.reviews && product.reviews.length > 0 && (
            <div className="px-6 pb-20">
               <div className="flex items-center justify-between mb-4">
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
              <div className="space-y-3">
                {product.reviews.map((review, i) => (
                  <motion.div
                    key={review.reviewId || i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 + (i * 0.08) }}
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
          <motion.a
            href={`https://prod.danawa.com/info/?pcode=${product.pcode || product.id}`}
            target="_blank"
            rel="noopener noreferrer"
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.98 }}
            className="w-full h-14 flex items-center justify-center gap-3 font-black rounded-[20px] text-[16px] transition-all text-white bg-gray-900 shadow-xl shadow-gray-200 hover:bg-black"
          >
            다나와에서 보기
            <FcSearch size={22} />
          </motion.a>
        </div>
      </motion.div>
    </motion.div>
  );
}
