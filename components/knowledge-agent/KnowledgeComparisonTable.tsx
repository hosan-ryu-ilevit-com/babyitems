'use client';

/**
 * Knowledge Agent 비교표 컴포넌트
 *
 * knowledge-agent 결과 상품들을 비교표로 표시
 * - 스펙 비교 (장기기억에서 가져온 스펙)
 * - 장단점 비교 (리뷰 요약 기반)
 */

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { 
  FcLineChart, 
  FcLike, 
  FcDislike, 
  FcApproval, 
  FcCurrencyExchange, 
  FcAbout,
  FcRating,
  FcPodiumWithSpeaker,
  FcFlashOn
} from "react-icons/fc";

interface KnowledgeProduct {
  pcode: string;
  name: string;
  brand: string | null;
  price: number | null;
  thumbnail: string | null;
  rating?: number | null;
  reviewCount?: number | null;
  specs?: Record<string, string>;
  specSummary?: string;
  prosFromReviews?: string[];
  consFromReviews?: string[];
  recommendedFor?: string;
  recommendReason?: string;
}

interface KnowledgeComparisonTableProps {
  products: KnowledgeProduct[];
  showRank?: boolean;
}

export function KnowledgeComparisonTable({
  products,
  showRank = true,
}: KnowledgeComparisonTableProps) {
  // 최대 4개 상품까지만 표시
  const displayProducts = useMemo(() => products.slice(0, 4), [products]);

  // 선택된 상품 ID (기본: 처음 2개)
  const [selectedIds, setSelectedIds] = useState<string[]>(() => {
    if (displayProducts.length >= 2) {
      return [displayProducts[0].pcode, displayProducts[1].pcode];
    }
    return displayProducts.map(p => p.pcode);
  });

  // 선택된 상품들
  const selectedProducts = useMemo(() =>
    displayProducts.filter(p => selectedIds.includes(p.pcode)),
    [displayProducts, selectedIds]
  );

  // 상품 선택 토글
  const toggleSelection = (pcode: string) => {
    setSelectedIds(prev => {
      if (prev.includes(pcode)) {
        // 최소 1개는 유지
        if (prev.length <= 1) return prev;
        return prev.filter(id => id !== pcode);
      } else {
        // 최대 2개까지만 선택
        if (prev.length >= 2) {
          return [...prev.slice(1), pcode];
        }
        return [...prev, pcode];
      }
    });
  };

  // 스펙 키 통합
  const allSpecKeys = useMemo(() => {
    const keys = new Set<string>();
    selectedProducts.forEach(p => {
      if (p.specs) {
        Object.keys(p.specs).forEach(k => keys.add(k));
      }
    });
    // 불필요한 키 제외
    const excludeKeys = ['브랜드', '모델명', '상품명'];
    return Array.from(keys).filter(k => !excludeKeys.includes(k));
  }, [selectedProducts]);

  if (displayProducts.length < 2) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="space-y-6"
    >
      {/* 상품 선택 UI */}
      <div className="bg-white px-1">
        <div className="flex items-center gap-2 mb-4">
          <FcAbout size={20} />
          <h3 className="text-[15px] font-black text-gray-900 tracking-tight">
            비교 대상 선택 <span className="text-[12px] font-bold text-gray-400 ml-1">(최대 2개)</span>
          </h3>
        </div>
        
        <div className={`grid gap-3 ${displayProducts.length >= 4 ? 'grid-cols-4' : 'grid-cols-3'}`}>
          {displayProducts.map((product, index) => {
            const isSelected = selectedIds.includes(product.pcode);

            return (
              <motion.button
                key={product.pcode}
                whileHover={{ y: -4 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => toggleSelection(product.pcode)}
                className={`relative flex flex-col items-center gap-2.5 p-3.5 transition-all duration-300 rounded-[24px] border-2 ${
                  isSelected
                    ? 'bg-blue-50/50 border-blue-600 shadow-lg shadow-blue-50'
                    : 'bg-white border-gray-100 hover:border-gray-200 shadow-sm'
                }`}
              >
                {/* 순위 뱃지 */}
                {showRank && index < 3 && (
                  <div
                    className={`absolute -top-1.5 -right-1.5 w-[24px] h-[24px] flex items-center justify-center rounded-xl text-[10px] font-black text-white shadow-sm ${
                      index === 0 ? 'bg-amber-400' : index === 1 ? 'bg-gray-300' : 'bg-orange-300'
                    }`}
                  >
                    {index + 1}
                  </div>
                )}

                {/* 썸네일 */}
                <div className={`relative w-[48px] h-[48px] rounded-2xl overflow-hidden bg-white border-2 transition-transform duration-300 ${isSelected ? 'border-blue-200 scale-110' : 'border-gray-50'}`}>
                  {product.thumbnail && (
                    <Image
                      src={product.thumbnail}
                      alt={product.name}
                      width={48}
                      height={48}
                      className="w-full h-full object-cover"
                      quality={80}
                    />
                  )}
                </div>

                {/* 제품명 */}
                <p className={`text-[11px] font-bold text-center line-clamp-2 leading-tight ${
                  isSelected ? 'text-blue-700' : 'text-gray-400'
                }`}>
                  {product.brand || product.name}
                </p>

                {isSelected && (
                  <motion.div 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -bottom-1.5 bg-blue-600 rounded-full p-1 border-2 border-white shadow-sm"
                  >
                    <FcApproval size={10} />
                  </motion.div>
                )}
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* 비교표 */}
      {selectedProducts.length === 2 && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="border border-gray-100 rounded-[28px] overflow-hidden bg-white shadow-xl shadow-gray-200/40"
        >
          <table className="w-full border-collapse table-fixed">
            <thead>
              <tr className="bg-gray-50/50 border-b border-gray-100">
                <th className="py-6 px-4" colSpan={3}>
                  <div className="flex items-center justify-between gap-2">
                    {selectedProducts.map((product, i) => (
                      <div key={product.pcode} className={`flex-1 flex flex-col items-center gap-3 ${i === 0 ? 'pr-2' : 'pl-2'}`}>
                        <div className="relative w-[56px] h-[56px] rounded-2xl overflow-hidden bg-white shadow-md border border-gray-100">
                          {product.thumbnail && (
                            <Image
                              src={product.thumbnail}
                              alt={product.name}
                              width={56}
                              height={56}
                              className="w-full h-full object-cover"
                              quality={90}
                            />
                          )}
                        </div>
                        <p className="text-[13px] font-black text-gray-900 line-clamp-2 leading-tight text-center">
                          {product.name}
                        </p>
                      </div>
                    ))}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {/* 브랜드 */}
              <tr>
                <td className="py-4 px-3 text-center w-[42%]">
                  <p className="text-[13px] text-gray-800 font-bold">{selectedProducts[0]?.brand || '-'}</p>
                </td>
                <td className="py-4 px-1 text-center w-[16%]">
                  <div className="flex flex-col items-center gap-1 opacity-40">
                    <FcPodiumWithSpeaker size={14} />
                    <span className="text-[9px] font-black text-gray-900 uppercase tracking-tighter">Brand</span>
                  </div>
                </td>
                <td className="py-4 px-3 text-center w-[42%]">
                  <p className="text-[13px] text-gray-800 font-bold">{selectedProducts[1]?.brand || '-'}</p>
                </td>
              </tr>

              {/* 가격 */}
              <tr>
                <td className="py-4 px-3 text-center">
                  <p className="text-[15px] font-black text-blue-600">
                    {selectedProducts[0]?.price?.toLocaleString() || '-'}원
                  </p>
                </td>
                <td className="py-4 px-1 text-center">
                  <div className="flex flex-col items-center gap-1 opacity-40">
                    <FcCurrencyExchange size={14} />
                    <span className="text-[9px] font-black text-gray-900 uppercase tracking-tighter">Price</span>
                  </div>
                </td>
                <td className="py-4 px-3 text-center">
                  <p className="text-[15px] font-black text-blue-600">
                    {selectedProducts[1]?.price?.toLocaleString() || '-'}원
                  </p>
                </td>
              </tr>

              {/* 평점 */}
              {(selectedProducts[0]?.rating || selectedProducts[1]?.rating) && (
                <tr>
                  <td className="py-4 px-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <span className="text-[14px] font-bold text-gray-800">{selectedProducts[0]?.rating?.toFixed(1) || '-'}</span>
                      {selectedProducts[0]?.reviewCount && (
                        <span className="text-gray-300 text-[10px] font-bold">({selectedProducts[0].reviewCount})</span>
                      )}
                    </div>
                  </td>
                  <td className="py-4 px-1 text-center">
                    <div className="flex flex-col items-center gap-1 opacity-40">
                      <FcRating size={14} />
                      <span className="text-[9px] font-black text-gray-900 uppercase tracking-tighter">Rating</span>
                    </div>
                  </td>
                  <td className="py-4 px-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <span className="text-[14px] font-bold text-gray-800">{selectedProducts[1]?.rating?.toFixed(1) || '-'}</span>
                      {selectedProducts[1]?.reviewCount && (
                        <span className="text-gray-300 text-[10px] font-bold">({selectedProducts[1].reviewCount})</span>
                      )}
                    </div>
                  </td>
                </tr>
              )}

              {/* 장점 */}
              <tr>
                <td className="py-5 px-4 align-top bg-green-50/30">
                  <div className="space-y-2">
                    {(selectedProducts[0]?.prosFromReviews || []).slice(0, 3).map((pro, idx) => (
                      <div key={idx} className="text-[11px] font-bold text-green-800 flex items-start gap-1.5 leading-tight">
                        <FcLike size={10} className="mt-0.5 shrink-0" />
                        <span>{pro}</span>
                      </div>
                    ))}
                  </div>
                </td>
                <td className="py-5 px-1 text-center align-middle">
                  <div className="flex flex-col items-center gap-1 opacity-40">
                    <FcLike size={14} />
                    <span className="text-[9px] font-black text-green-900 uppercase tracking-tighter">Pros</span>
                  </div>
                </td>
                <td className="py-5 px-4 align-top bg-green-50/30">
                  <div className="space-y-2">
                    {(selectedProducts[1]?.prosFromReviews || []).slice(0, 3).map((pro, idx) => (
                      <div key={idx} className="text-[11px] font-bold text-green-800 flex items-start gap-1.5 leading-tight">
                        <FcLike size={10} className="mt-0.5 shrink-0" />
                        <span>{pro}</span>
                      </div>
                    ))}
                  </div>
                </td>
              </tr>

              {/* 단점 */}
              <tr>
                <td className="py-5 px-4 align-top bg-rose-50/30">
                  <div className="space-y-2">
                    {(selectedProducts[0]?.consFromReviews || []).slice(0, 3).map((con, idx) => (
                      <div key={idx} className="text-[11px] font-bold text-rose-800 flex items-start gap-1.5 leading-tight">
                        <FcDislike size={10} className="mt-0.5 shrink-0" />
                        <span>{con}</span>
                      </div>
                    ))}
                  </div>
                </td>
                <td className="py-5 px-1 text-center align-middle">
                  <div className="flex flex-col items-center gap-1 opacity-40">
                    <FcDislike size={14} />
                    <span className="text-[9px] font-black text-rose-900 uppercase tracking-tighter">Cons</span>
                  </div>
                </td>
                <td className="py-5 px-4 align-top bg-rose-50/30">
                  <div className="space-y-2">
                    {(selectedProducts[1]?.consFromReviews || []).slice(0, 3).map((con, idx) => (
                      <div key={idx} className="text-[11px] font-bold text-rose-800 flex items-start gap-1.5 leading-tight">
                        <FcDislike size={10} className="mt-0.5 shrink-0" />
                        <span>{con}</span>
                      </div>
                    ))}
                  </div>
                </td>
              </tr>

              {/* 추천 대상 */}
              <tr>
                <td className="py-5 px-4 text-center bg-blue-50/30">
                  <p className="text-[12px] font-black text-blue-900 leading-snug">
                    {selectedProducts[0]?.recommendedFor || '-'}
                  </p>
                </td>
                <td className="py-5 px-1 text-center">
                  <div className="flex flex-col items-center gap-1 opacity-40">
                    <FcFlashOn size={14} />
                    <span className="text-[9px] font-black text-blue-900 uppercase tracking-tighter">Target</span>
                  </div>
                </td>
                <td className="py-5 px-4 text-center bg-blue-50/30">
                  <p className="text-[12px] font-black text-blue-900 leading-snug">
                    {selectedProducts[1]?.recommendedFor || '-'}
                  </p>
                </td>
              </tr>
            </tbody>
          </table>
        </motion.div>
      )}
    </motion.div>
  );
}
