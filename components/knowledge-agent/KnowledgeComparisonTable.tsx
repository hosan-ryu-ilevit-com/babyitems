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

interface ReviewItem {
  reviewId?: string;
  rating: number;
  content: string;
  author?: string;
  date?: string;
  mallName?: string;
}

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
  oneLiner?: string;
  recommendedFor?: string;
  recommendReason?: string;
  reviews?: ReviewItem[];  // 리뷰 목록 추가
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

  // 스펙 키 통합
  const allSpecKeys = useMemo(() => {
    const keys = new Set<string>();
    selectedProducts.forEach(p => {
      if (p.specs) {
        Object.keys(p.specs).forEach(k => keys.add(k));
      }
    });
    // 불필요한 키 제외
    const excludeKeys = ['브랜드', '모델명', '상품명', '제품명', '제조사', '가격'];
    return Array.from(keys).filter(k => !excludeKeys.includes(k));
  }, [selectedProducts]);

  // 상품 선택 토글
  const toggleSelection = (pcode: string) => {
    setSelectedIds(prev => {
      if (prev.includes(pcode)) {
        if (prev.length <= 1) return prev;
        return prev.filter(id => id !== pcode);
      } else {
        if (prev.length >= 2) {
          return [...prev.slice(1), pcode];
        }
        return [...prev, pcode];
      }
    });
  };

  if (displayProducts.length < 2) return null;

  const isEmpty = (v: any) => v === null || v === undefined || v === '' || v === '-' || v === '정보없음' || String(v).toLowerCase() === 'null';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-0 mb-8"
    >
      {/* 상품 선택 UI */}
      <div className="bg-white py-3 px-0">
        <h3 className="text-[16px] font-medium text-gray-800 mb-4">
          비교하고 싶은 상품 2개를 선택하세요
        </h3>
        <div className={`grid gap-3 ${displayProducts.length >= 4 ? 'grid-cols-4' : 'grid-cols-3'}`}>
          {displayProducts.map((product, index) => {
            const isSelected = selectedIds.includes(product.pcode);
            const rank = index + 1;

            return (
              <button
                key={product.pcode}
                onClick={() => toggleSelection(product.pcode)}
                className={`relative flex flex-col items-center gap-3 p-4 transition-all rounded-[12px] overflow-hidden ${
                  isSelected
                    ? 'bg-blue-50 ring-2 ring-inset ring-blue-200'
                    : 'bg-gray-100'
                }`}
              >
                {/* 랭킹 뱃지 */}
                {showRank && rank <= 3 && (
                  <div 
                    className={`absolute top-0 right-0 w-[34px] h-[26px] flex items-center justify-center z-10 rounded-tr-[12px] rounded-bl-[12px] rounded-tl-[4px] rounded-br-[4px] ${
                      isSelected ? 'bg-blue-500' : 'bg-[#212529]'
                    }`}
                  >
                    <span className="text-white font-bold text-[12px] leading-none">{rank}위</span>
                  </div>
                )}
                
                {/* 썸네일 */}
                <div className="relative w-[44px] h-[44px] rounded-full overflow-hidden bg-white border border-gray-100">
                  {product.thumbnail && (
                    <Image
                      src={product.thumbnail}
                      alt={product.name}
                      width={44}
                      height={44}
                      className="w-full h-full object-cover"
                      quality={85}
                    />
                  )}
                </div>

                {/* 제품명 */}
                <p className={`text-[14px] font-medium text-center line-clamp-2 leading-tight px-1 ${
                  isSelected ? 'text-blue-500' : 'text-gray-600'
                }`}>
                  {product.name}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* 비교표 - 2개 선택 시에만 표시 */}
      {selectedIds.length === 2 && selectedProducts.length === 2 && (
        <div className="mt-[33px] border border-gray-200 rounded-[12px] overflow-hidden">
          <table className="w-full border-collapse table-fixed">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="py-5 px-1.5 text-center" colSpan={3}>
                  <div className="flex items-start justify-between gap-4">
                    {/* 왼쪽 제품 */}
                    <div className="flex-1 flex flex-col items-center gap-2">
                      <div className="relative w-[44px] h-[44px] rounded-full overflow-hidden bg-white border border-gray-100 shadow-sm">
                        {selectedProducts[0]?.thumbnail && (
                          <Image
                            src={selectedProducts[0].thumbnail}
                            alt={selectedProducts[0].name}
                            width={44}
                            height={44}
                            className="w-full h-full object-cover"
                            quality={85}
                          />
                        )}
                      </div>
                      <p className="text-[14px] font-medium text-gray-600 line-clamp-2 max-w-[120px] leading-[1.4]">
                        {selectedProducts[0]?.name}
                      </p>
                    </div>

                    {/* 중앙 여백 */}
                    <div className="w-16 shrink-0 pt-3"></div>

                    {/* 오른쪽 제품 */}
                    <div className="flex-1 flex flex-col items-center gap-2">
                      <div className="relative w-[44px] h-[44px] rounded-full overflow-hidden bg-white border border-gray-100 shadow-sm">
                        {selectedProducts[1]?.thumbnail && (
                          <Image
                            src={selectedProducts[1].thumbnail}
                            alt={selectedProducts[1].name}
                            width={44}
                            height={44}
                            className="w-full h-full object-cover"
                            quality={85}
                          />
                        )}
                      </div>
                      <p className="text-[14px] font-medium text-gray-600 line-clamp-2 max-w-[120px] leading-[1.4]">
                        {selectedProducts[1]?.name}
                      </p>
                    </div>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {/* 브랜드 */}
              <tr className="border-b border-gray-100">
                <td className="py-3 px-2 text-center w-[40%]">
                  <p className={`text-[13px] leading-tight font-medium ${isEmpty(selectedProducts[0]?.brand) ? 'text-gray-400' : 'text-gray-700'}`}>
                    {isEmpty(selectedProducts[0]?.brand) ? '정보없음' : selectedProducts[0]?.brand}
                  </p>
                </td>
                <td className="py-3 px-2 text-center text-xs font-medium text-gray-400 w-[20%]">
                  브랜드
                </td>
                <td className="py-3 px-2 text-center w-[40%]">
                  <p className={`text-[13px] leading-tight font-medium ${isEmpty(selectedProducts[1]?.brand) ? 'text-gray-400' : 'text-gray-700'}`}>
                    {isEmpty(selectedProducts[1]?.brand) ? '정보없음' : selectedProducts[1]?.brand}
                  </p>
                </td>
              </tr>

              {/* 가격 */}
              <tr className="border-b border-gray-100">
                <td className="py-3 px-2 text-center w-[40%]">
                  <p className={`text-[14px] font-bold ${isEmpty(selectedProducts[0]?.price) ? 'text-gray-400' : 'text-gray-900'}`}>
                    {isEmpty(selectedProducts[0]?.price) ? '정보없음' : `${selectedProducts[0]!.price!.toLocaleString()}원`}
                  </p>
                </td>
                <td className="py-3 px-2 text-center text-xs font-medium text-gray-400 w-[20%]">
                  가격
                </td>
                <td className="py-3 px-2 text-center w-[40%]">
                  <p className={`text-[14px] font-bold ${isEmpty(selectedProducts[1]?.price) ? 'text-gray-400' : 'text-gray-900'}`}>
                    {isEmpty(selectedProducts[1]?.price) ? '정보없음' : `${selectedProducts[1]!.price!.toLocaleString()}원`}
                  </p>
                </td>
              </tr>

              {/* 장점 */}
              <tr className="border-b border-gray-100 bg-[#E6FAD2]">
                <td className="py-4 px-3 align-top w-[40%] text-center">
                  <div className="space-y-2 inline-block text-center">
                    {(selectedProducts[0]?.prosFromReviews || []).length > 0 ? (
                      selectedProducts[0]!.prosFromReviews!.slice(0, 3).map((pro, idx) => (
                        <div key={idx} className="text-[12px] leading-snug flex items-start justify-center gap-1.5 text-gray-800">
                          <span className="shrink-0 mt-1.5 w-1 h-1 rounded-full bg-gray-300" />
                          <span className="text-center">{pro}</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-[12px] text-gray-400">정보없음</p>
                    )}
                  </div>
                </td>
                <td className="py-4 px-2 text-center align-middle text-[12px] font-medium text-gray-400 w-[20%]">
                  장점
                </td>
                <td className="py-4 px-3 align-top w-[40%] text-center">
                  <div className="space-y-2 inline-block text-center">
                    {(selectedProducts[1]?.prosFromReviews || []).length > 0 ? (
                      selectedProducts[1]!.prosFromReviews!.slice(0, 3).map((pro, idx) => (
                        <div key={idx} className="text-[12px] leading-snug flex items-start justify-center gap-1.5 text-gray-800">
                          <span className="shrink-0 mt-1.5 w-1 h-1 rounded-full bg-gray-300" />
                          <span className="text-center">{pro}</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-[12px] text-gray-400">정보없음</p>
                    )}
                  </div>
                </td>
              </tr>

              {/* 단점 */}
              <tr className="border-b border-gray-100 bg-[#FFEDEE]">
                <td className="py-4 px-3 align-top w-[40%] text-center">
                  <div className="space-y-2 inline-block text-center">
                    {(selectedProducts[0]?.consFromReviews || []).length > 0 ? (
                      selectedProducts[0]!.consFromReviews!.slice(0, 3).map((con, idx) => (
                        <div key={idx} className="text-[12px] leading-snug flex items-start justify-center gap-1.5 text-gray-800">
                          <span className="shrink-0 mt-1.5 w-1 h-1 rounded-full bg-gray-300" />
                          <span className="text-center">{con}</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-[12px] text-gray-400">정보없음</p>
                    )}
                  </div>
                </td>
                <td className="py-4 px-2 text-center align-middle text-[12px] font-medium text-gray-400 w-[20%]">
                  단점
                </td>
                <td className="py-4 px-3 align-top w-[40%] text-center">
                  <div className="space-y-2 inline-block text-center">
                    {(selectedProducts[1]?.consFromReviews || []).length > 0 ? (
                      selectedProducts[1]!.consFromReviews!.slice(0, 3).map((con, idx) => (
                        <div key={idx} className="text-[12px] leading-snug flex items-start justify-center gap-1.5 text-gray-800">
                          <span className="shrink-0 mt-1.5 w-1 h-1 rounded-full bg-gray-300" />
                          <span className="text-center">{con}</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-[12px] text-gray-400">정보없음</p>
                    )}
                  </div>
                </td>
              </tr>

              {/* 동적 스펙 비교 */}
              {allSpecKeys.map((key) => {
                const val1 = selectedProducts[0]?.specs?.[key];
                const val2 = selectedProducts[1]?.specs?.[key];
                
                return (
                  <tr key={key} className="border-b border-gray-100">
                    <td className={`py-3 px-2 text-center text-[12px] w-[40%] ${isEmpty(val1) ? 'text-gray-400' : 'text-gray-700'}`}>
                      {isEmpty(val1) ? '정보없음' : val1}
                    </td>
                    <td className="py-3 px-2 text-center text-xs font-medium text-gray-400 w-[20%]">
                      {key}
                    </td>
                    <td className={`py-3 px-2 text-center text-[12px] w-[40%] ${isEmpty(val2) ? 'text-gray-400' : 'text-gray-700'}`}>
                      {isEmpty(val2) ? '정보없음' : val2}
                    </td>
                  </tr>
                );
              })}

              {/* 한줄 비교 정리 */}
              {(() => {
                const hasComparison1 = selectedProducts[0]?.oneLiner && selectedProducts[0].oneLiner.trim().length > 0;
                const hasComparison2 = selectedProducts[1]?.oneLiner && selectedProducts[1].oneLiner.trim().length > 0;

                if (!hasComparison1 && !hasComparison2) return null;

                return (
                  <tr className="bg-[#F8F9FA]">
                    <td colSpan={3} className="py-5 px-4 rounded-b-2xl border-t border-gray-100">
                      <h4 className="text-[14px] font-bold text-gray-900 mb-4 flex items-center gap-2">
                        📊 한줄 비교 정리
                      </h4>
                      <div className="space-y-4">
                        {selectedProducts.map((product, index) => {
                          if (!product || !product.oneLiner || product.oneLiner.trim().length === 0) return null;

                          return (
                            <div key={product.pcode} className="flex items-start gap-3">
                              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-800 text-white text-[11px] font-bold shrink-0 mt-0.5">
                                {index + 1}
                              </span>
                              <div className="flex-1">
                                <p className="text-[13px] text-gray-800 leading-relaxed">
                                  <span className="font-bold text-gray-900">{product.brand} {product.name}</span>
                                </p>
                                <p className="text-[13px] text-gray-600 leading-relaxed mt-1">
                                  {product.oneLiner}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                );
              })()}
            </tbody>
          </table>
        </div>
      )}
    </motion.div>
  );
}
