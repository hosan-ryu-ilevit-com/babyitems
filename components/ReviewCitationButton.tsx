'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ReviewCitationButtonProps {
  citationCount: number;
  onClick: () => void;
}

/**
 * 참고 리뷰 버튼 컴포넌트
 * 클릭하면 참고한 리뷰들을 모달로 표시
 */
export function ReviewCitationButton({ citationCount, onClick }: ReviewCitationButtonProps) {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  };

  return (
    <button
      onClick={handleClick}
      className="inline-flex items-center gap-1 px-2 py-1 ml-2 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded transition-colors"
      title={`참고한 리뷰 ${citationCount}개 보기`}
      type="button"
    >
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <span>참고 {citationCount}개</span>
    </button>
  );
}

interface ReviewCitationModalProps {
  reviews: Array<{ index: number; text: string; rating: number }>;
  onClose: () => void;
}

/**
 * 참고 리뷰 리스트 모달
 */
export function ReviewCitationModal({ reviews, onClose }: ReviewCitationModalProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="text-sm font-bold text-gray-900">참고한 리뷰 {reviews.length}개</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Review List */}
        <div className="overflow-y-auto flex-1">
          {reviews.map((review) => (
            <ReviewItem key={review.index} review={review} />
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 shrink-0">
          <p className="text-xs text-gray-500">
            이 분석은 위 리뷰들을 종합하여 작성되었습니다
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}

/**
 * 개별 리뷰 아이템 (접기/펼치기 가능)
 */
function ReviewItem({ review }: { review: { index: number; text: string; rating: number } }) {
  const [isExpanded, setIsExpanded] = useState(false);

  // 리뷰가 긴지 판단 (200자 이상)
  const isLongReview = review.text.length > 200;
  const displayText = isExpanded || !isLongReview ? review.text : review.text.slice(0, 200) + '...';

  return (
    <div className="border-b border-gray-100 px-5 py-4">
      {/* 헤더: 리뷰 번호, 별점 */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-500">리뷰 {review.index}</span>
          <div className="flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map((star) => (
              <svg
                key={star}
                className={`w-3.5 h-3.5 ${star <= review.rating ? 'text-yellow-400' : 'text-gray-300'}`}
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            ))}
          </div>
          <span className="text-xs font-semibold text-gray-700">{review.rating}</span>
        </div>
      </div>

      {/* 리뷰 내용 */}
      <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
        {displayText}
      </div>

      {/* 더보기 버튼 */}
      {isLongReview && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="mt-2 text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
        >
          {isExpanded ? (
            <>
              접기
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
            </>
          ) : (
            <>
              더보기
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </>
          )}
        </button>
      )}
    </div>
  );
}

interface TextWithCitationsProps {
  text: string;
  citations?: number[];
  citedReviews: Array<{ index: number; text: string; rating: number }>;
  onCitationClick: (reviews: Array<{ index: number; text: string; rating: number }>) => void;
}

/**
 * 마크다운 볼드 처리 텍스트 렌더링
 * Note: Citation 기능은 LLM 종합 분석과 개별 리뷰 매칭 불일치로 인해 제거됨
 */
export function TextWithCitations({ text, citations = [], citedReviews, onCitationClick }: TextWithCitationsProps) {
  // Parse markdown bold
  const parseBold = (str: string) => {
    const parts = str.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        const boldText = part.slice(2, -2);
        return <strong key={`bold-${index}`} className="font-bold">{boldText}</strong>;
      }
      return <span key={`text-${index}`}>{part}</span>;
    });
  };

  return (
    <span className="inline">
      {parseBold(text)}
    </span>
  );
}
