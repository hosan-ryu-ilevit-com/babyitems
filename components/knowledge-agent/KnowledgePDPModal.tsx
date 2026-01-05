'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Star, ShoppingCart, ArrowRight } from '@phosphor-icons/react/dist/ssr';
import { 
  FcIdea, 
  FcApproval, 
  FcSearch, 
  FcLike,
  FcMindMap,
  FcPodiumWithSpeaker,
  FcCurrencyExchange,
  FcRating
} from "react-icons/fc";

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

            <div className="flex items-center justify-between bg-white p-5 rounded-[24px] border border-gray-100 shadow-sm">
               <div className="flex flex-col gap-0.5">
                  <span className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Expected Price</span>
                  <div className="flex items-center gap-1">
                    <FcCurrencyExchange size={18} />
                    <span className="text-[22px] font-black text-blue-600">
                      {product.price.toLocaleString()}
                    </span>
                    <span className="text-[15px] font-bold text-blue-600">원</span>
                  </div>
               </div>
               <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  window.open(`https://search.danawa.com/dsearch.php?query=${encodeURIComponent(product.title)}`, '_blank');
                }}
                className="w-12 h-12 bg-gray-900 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-gray-200"
               >
                 <FcSearch size={22} />
               </motion.button>
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
            <div className="px-6 pb-20">
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
        </div>

        {/* Bottom CTA */}
        <div className="shrink-0 w-full bg-white/80 backdrop-blur-xl border-t border-gray-50/50 px-5 pt-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] z-30">
          <motion.button
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              window.open(`https://search.danawa.com/dsearch.php?query=${encodeURIComponent(product.title)}`, '_blank');
            }}
            className="w-full h-14 flex items-center justify-center gap-3 font-black rounded-[20px] text-[16px] transition-all text-white bg-gray-900 shadow-xl shadow-gray-200 hover:bg-black"
          >
            최저가 바로가기
            <FcSearch size={22} />
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}
