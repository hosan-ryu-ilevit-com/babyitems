'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Star, ShoppingCart, ArrowRight } from '@phosphor-icons/react/dist/ssr';

interface KnowledgePDPModalProps {
  product: {
    id: string;
    title: string;
    brand?: string;
    price: number;
    thumbnail?: string;
    reviewCount?: number;
    rating?: number;
    reasoning?: string;
    highlights?: string[];
    matchScore?: number;
  };
  categoryKey: string;
  onClose: () => void;
}

export function KnowledgePDPModal({ product, categoryKey, onClose }: KnowledgePDPModalProps) {
  const [isExiting, setIsExiting] = useState(false);

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
        <header className="shrink-0 bg-white border-b border-gray-200 px-4 py-3 z-20">
          <div className="flex items-center justify-between">
            <button
              onClick={handleClose}
              className="p-1 -ml-1 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X size={24} className="text-gray-700" />
            </button>
            <span className="text-sm font-medium text-gray-500">상품 상세</span>
            <div className="w-6" />
          </div>
        </header>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto">
          {/* Thumbnail */}
          <div className="px-4 pt-4">
            <div className="relative w-full aspect-square bg-gray-100 rounded-xl overflow-hidden">
              {product.thumbnail ? (
                <Image
                  src={product.thumbnail}
                  alt={product.title}
                  fill
                  className="object-cover"
                  priority
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400">
                  <ShoppingCart size={48} />
                </div>
              )}

              {/* Match Score Badge */}
              {product.matchScore && (
                <div className="absolute top-3 left-3 px-3 py-1.5 bg-violet-600 text-white text-sm font-bold rounded-full">
                  {product.matchScore}% 일치
                </div>
              )}
            </div>
          </div>

          {/* Product Info */}
          <div className="px-4 pt-5 pb-6 border-b border-gray-100">
            {/* Brand & Rating Row */}
            <div className="flex items-center justify-between mb-1">
              {product.brand ? (
                <span className="text-base font-medium text-gray-500">
                  {product.brand}
                </span>
              ) : (
                <div />
              )}

              {(product.rating || product.reviewCount) && (
                <div className="flex items-center gap-1">
                  <Star size={14} weight="fill" className="text-yellow-400" />
                  <span className="text-sm font-bold text-gray-900">
                    {product.rating?.toFixed(1) || '—'}
                  </span>
                  {product.reviewCount && (
                    <span className="text-sm text-gray-400">
                      ({product.reviewCount.toLocaleString()})
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Title */}
            <h2 className="text-base font-medium text-gray-800 mb-4 leading-snug">
              {product.title}
            </h2>

            {/* Price */}
            <div className="text-[18px] font-bold text-gray-900">
              {product.price.toLocaleString()}원
            </div>
          </div>

          {/* AI Reasoning */}
          {product.reasoning && (
            <div className="px-4 py-5">
              <div
                className="p-4 rounded-xl"
                style={{
                  background: 'linear-gradient(180deg, #F3F0FF 0%, #FFFFFF 100%)'
                }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <img src="/icons/ic-ai.svg" alt="" width={14} height={14} />
                  <h4 className="text-[15px] font-semibold text-[#6344FF]">
                    왜 추천했나요?
                  </h4>
                </div>
                <p className="text-[14px] text-gray-700 leading-relaxed">
                  {product.reasoning}
                </p>
              </div>
            </div>
          )}

          {/* Highlights */}
          {product.highlights && product.highlights.length > 0 && (
            <div className="px-4 pb-5">
              <h4 className="text-[15px] font-semibold text-gray-900 mb-3">
                주요 특징
              </h4>
              <div className="space-y-2">
                {product.highlights.map((highlight, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-violet-500 shrink-0 mt-0.5">✓</span>
                    <span className="text-[14px] text-gray-700">{highlight}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Bottom CTA */}
        <div className="shrink-0 w-full bg-white border-t border-gray-200 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] z-30">
          <button
            onClick={() => {
              window.open(`https://search.danawa.com/dsearch.php?query=${encodeURIComponent(product.title)}`, '_blank');
            }}
            className="w-full h-14 flex items-center justify-center gap-2 font-semibold rounded-2xl text-base transition-colors text-white bg-black hover:bg-gray-900"
          >
            최저가 검색하기
            <ArrowRight size={18} weight="bold" />
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
