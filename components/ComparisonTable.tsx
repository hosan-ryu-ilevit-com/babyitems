'use client';

import { Recommendation } from '@/types';
import { motion } from 'framer-motion';
import Image from 'next/image';

interface ComparisonTableProps {
  recommendations: Recommendation[];
}

// 마크다운 볼드 처리 함수
function parseMarkdownBold(text: string) {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      const boldText = part.slice(2, -2);
      return <strong key={index} className="font-bold">{boldText}</strong>;
    }
    return <span key={index}>{part}</span>;
  });
}

export default function ComparisonTable({ recommendations }: ComparisonTableProps) {
  // 상위 3개만 사용
  const top3 = recommendations.slice(0, 3);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.6 }}
      className="bg-white rounded-2xl p-5 border border-white mb-6"
    >
      <h3 className="text-lg font-bold text-gray-900 mb-4">🔎 한 눈에 비교</h3>

      {/* 모바일 가로 스크롤 테이블 */}
      <div className="overflow-x-auto -mx-5 px-5 scrollbar-hide">
        <table className="w-full min-w-[600px]">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-3 px-2 text-xs font-semibold text-gray-500 w-24"></th>
              {top3.map((rec) => (
                <th key={rec.product.id} className="py-3 px-2 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-gray-100 border border-gray-100">
                      {rec.product.thumbnail && (
                        <Image
                          src={rec.product.thumbnail}
                          alt={rec.product.title}
                          width={48}
                          height={48}
                          className="w-full h-full object-cover"
                          quality={85}
                          sizes="48px"
                        />
                      )}
                      {/* 랭킹 배지 - 좌측 상단 */}
                      <div className="absolute top-0 left-0 w-4 h-4 bg-gray-900 rounded-tl-lg rounded-tr-none rounded-bl-none rounded-br-sm flex items-center justify-center">
                        <span className="text-white font-bold text-[10px]">
                          {rec.rank}
                        </span>
                      </div>
                    </div>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* 제품명 */}
            <tr className="border-b border-gray-100">
              <td className="py-3 px-2 text-xs font-semibold text-gray-700">제품명</td>
              {top3.map((rec) => (
                <td key={rec.product.id} className="py-3 px-2">
                  <p className="text-xs text-gray-900 leading-tight font-semibold line-clamp-2">
                    {rec.product.title}
                  </p>
                </td>
              ))}
            </tr>

            {/* 가격 */}
            <tr className="border-b border-gray-100">
              <td className="py-3 px-2 text-xs font-semibold text-gray-700">가격</td>
              {top3.map((rec) => (
                <td key={rec.product.id} className="py-3 px-2">
                  <p className="text-sm font-bold text-gray-900">
                    {rec.product.price.toLocaleString()}원
                  </p>
                </td>
              ))}
            </tr>

            {/* 적합도 */}
            <tr className="border-b border-gray-100">
              <td className="py-3 px-2 text-xs font-semibold text-gray-700">적합도</td>
              {top3.map((rec) => (
                <td key={rec.product.id} className="py-3 px-2">
                  <p className="text-sm font-bold" style={{ color: '#009896' }}>{rec.finalScore}%</p>
                </td>
              ))}
            </tr>

            

            {/* 비교 분석 */}
            {top3.some((rec) => rec.comparison) && (
              <tr>
                <td className="py-3 px-2 text-xs font-semibold text-gray-700 align-top">비교 분석</td>
                {top3.map((rec) => (
                  <td key={rec.product.id} className="py-3 px-2 align-top">
                    {rec.comparison && rec.comparison.length > 0 ? (
                      <div className="text-xs text-gray-600 leading-relaxed space-y-1">
                        {rec.comparison.map((item, idx) => (
                          <p key={idx}>{parseMarkdownBold(item)}</p>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400">-</p>
                    )}
                  </td>
                ))}
              </tr>
            )}

            {/* 쿠팡에서 보기 + 최저가 보기 버튼 */}
            <tr>
              <td className="py-3 px-2"></td>
              {top3.map((rec) => (
                <td key={rec.product.id} className="py-3 px-2">
                  <div className="space-y-1.5">
                    <button
                      onClick={() => window.open(rec.product.reviewUrl, '_blank')}
                      className="w-full py-2 text-xs font-semibold rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
                    >
                      쿠팡에서 보기
                    </button>
                    <button
                      onClick={() => window.open(`https://search.danawa.com/mobile/dsearch.php?keyword=${encodeURIComponent(rec.product.title)}&sort=priceASC`, '_blank')}
                      className="w-full py-2 text-xs font-semibold rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
                    >
                      최저가 보기
                    </button>
                  </div>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* 가로 스크롤 힌트 */}
      <p className="text-xs text-gray-400 text-center mt-3">
        ← 좌우로 스크롤해서 확인하세요 →
      </p>
    </motion.div>
  );
}
