'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ReviewCardProps {
  text: string;
  rating: number;
  nickname?: string;
  date?: string;
}

// 별점 표시 컴포넌트
function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <svg
          key={star}
          className={`w-4 h-4 ${
            star <= rating ? 'text-yellow-400' : 'text-gray-300'
          }`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
}

export default function ReviewCard({ text, rating, nickname, date }: ReviewCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // 리뷰가 긴지 판단 (200자 이상)
  const isLongReview = text.length > 200;
  const displayText = isExpanded || !isLongReview ? text : text.slice(0, 200) + '...';

  // 익명 닉네임 생성 (첫 2자만 표시)
  const displayNickname = nickname
    ? `${nickname.slice(0, 2)}${'*'.repeat(Math.min(nickname.length - 2, 4))}`
    : 'os****';

  return (
    <div className="bg-white border-b border-gray-100 px-4 py-4">
      {/* 헤더: 별점, 닉네임, 날짜 */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <StarRating rating={rating} />
          <span className="text-sm font-semibold text-gray-900">{rating}</span>
        </div>
      </div>

      {/* 닉네임 + 날짜 */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm text-gray-600">{displayNickname}</span>
        {date && (
          <>
            <span className="text-gray-300">·</span>
            <span className="text-sm text-gray-400">{date}</span>
          </>
        )}
      </div>

      {/* 리뷰 내용 */}
      <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
        {displayText}
      </div>

      {/* 더보기 버튼 */}
      {isLongReview && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="mt-2 text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
        >
          {isExpanded ? (
            <>
              접기
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
            </>
          ) : (
            <>
              더보기
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </>
          )}
        </button>
      )}
    </div>
  );
}
