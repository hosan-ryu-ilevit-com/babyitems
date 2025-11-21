import { UserContextSummary, ImportanceLevel } from '@/types';
import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { logButtonClick } from '@/lib/logging/clientLogger';

interface UserContextSummaryProps {
  summary: UserContextSummary;
}

// 중요도 레벨에 따른 스타일 (흰색 배경 통일)
const getLevelStyle = (level: ImportanceLevel) => {
  switch (level) {
    case '중요함':
      return 'bg-white text-gray-900';
    case '보통':
      return 'bg-white text-gray-900';
    case '중요하지 않음':
      return 'bg-white text-gray-700';
  }
};

const getLevelLabel = (level: ImportanceLevel) => {
  switch (level) {
    case '중요함':
      return '중요';
    case '보통':
      return '보통';
    case '중요하지 않음':
      return '낮음';
  }
};

export default function UserContextSummaryComponent({ summary }: UserContextSummaryProps) {
  const [isMainExpanded, setIsMainExpanded] = useState(false);

  // 중요도 순서로 정렬 (중요함 > 보통 > 중요하지 않음)
  const sortedAttributes = [...summary.priorityAttributes].sort((a, b) => {
    const levelOrder: Record<ImportanceLevel, number> = {
      '중요함': 0,
      '보통': 1,
      '중요하지 않음': 2,
    };
    return levelOrder[a.level] - levelOrder[b.level];
  });

  const toggleMainExpanded = () => {
    const newState = !isMainExpanded;
    setIsMainExpanded(newState);

    // 로깅 - 내 구매 기준 토글
    logButtonClick(
      newState ? '내 구매 기준 열기' : '내 구매 기준 닫기',
      'result'
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      layout
      className="bg-white rounded-2xl p-4"
    >
      {/* 헤더 - 클릭 가능 */}
      <button
        onClick={toggleMainExpanded}
        className="w-full flex items-center justify-between"
      >
        <h3 className="text-base font-semibold text-gray-900">내 구매 기준</h3>
        <span className="text-xs font-medium px-2.5 py-2 rounded-full bg-gray-100 text-gray-600">
          {isMainExpanded ? '접기' : '펼치기'}
        </span>
      </button>

      {/* 펼쳐진 내용 */}
      <AnimatePresence initial={false}>
        {isMainExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="overflow-hidden will-change-auto"
            style={{ willChange: 'height' }}
          >
            {/* 우선순위 속성들 - 2열 그리드 */}
            {summary.priorityAttributes.length > 0 && (
              <div className="grid grid-cols-2 gap-3 mb-4 mt-2">
                {sortedAttributes.map((attr, index) => {
                  // 중요도에 따른 배경색 (더 연한 톤)
                  const bgColor = attr.level === '중요함'
                    ? 'bg-blue-100'
                    : attr.level === '보통'
                    ? 'bg-blue-50'
                    : 'bg-gray-50';

                  return (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: index * 0.05 }}
                      className={`${bgColor} rounded-xl p-3 flex flex-col`}
                    >
                      {/* 상단 고정 영역 */}
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <span
                            className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full border mb-1.5 ${getLevelStyle(
                              attr.level
                            )}`}
                          >
                            {getLevelLabel(attr.level)}
                          </span>
                          <div className="text-sm font-semibold text-gray-900 leading-tight break-keep mb-2" style={{ wordBreak: 'keep-all' }}>
                            {attr.name}
                          </div>
                        </div>
                      </div>

                      <div className="pt-1 border-white/50">
                        <p className="text-xs text-gray-600 leading-relaxed">{attr.reason}</p>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}

            {/* 추가 맥락 */}
            {summary.additionalContext.length > 0 && (
              <div className="mb-3">
                <h4 className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  원하는 기준
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {summary.additionalContext.map((context, index) => (
                    <motion.span
                      key={index}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.2, delay: 0.3 + index * 0.05 }}
                      className="text-xs bg-white text-gray-700 px-2.5 py-1 rounded-full"
                    >
                      {context}
                    </motion.span>
                  ))}
                </div>
              </div>
            )}

            {/* 예산 */}
            {summary.budget && (
              <div className="pt-3 border-t border-gray-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" />
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd" />
                    </svg>
                    예산
                  </span>
                  <span className="text-sm font-bold text-gray-900">{summary.budget}</span>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
