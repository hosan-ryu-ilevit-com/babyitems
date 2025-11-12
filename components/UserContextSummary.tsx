import { UserContextSummary, ImportanceLevel } from '@/types';
import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface UserContextSummaryProps {
  summary: UserContextSummary;
}

// 중요도 레벨에 따른 스타일 (흰색 배경 통일)
const getLevelStyle = (level: ImportanceLevel) => {
  switch (level) {
    case '중요함':
      return 'bg-white text-gray-900 border border-gray-300';
    case '보통':
      return 'bg-white text-gray-900 border border-gray-300';
    case '중요하지 않음':
      return 'bg-white text-gray-700 border border-gray-300';
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
  const router = useRouter();
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [isMainExpanded, setIsMainExpanded] = useState(false);

  const toggleExpand = (index: number) => {
    setExpandedIndex(expandedIndex === index ? null : index);
  };

  const toggleMainExpanded = () => {
    setIsMainExpanded(!isMainExpanded);
  };

  const handleChatRedirect = () => {
    // 세션 스토리지에서 현재 세션 불러오기
    const sessionData = sessionStorage.getItem('babyitem_session');
    if (sessionData) {
      const session = JSON.parse(sessionData);
      // forceRegenerate 플래그 설정 (채팅 후 새로운 추천 받기 위함)
      session.forceRegenerate = true;
      sessionStorage.setItem('babyitem_session', JSON.stringify(session));
    }
    // chat 페이지로 이동
    router.push('/chat');
  };

  // 중요도 순서로 정렬 (중요함 > 보통 > 중요하지 않음)
  const sortedAttributes = [...summary.priorityAttributes].sort((a, b) => {
    const levelOrder: Record<ImportanceLevel, number> = {
      '중요함': 0,
      '보통': 1,
      '중요하지 않음': 2,
    };
    return levelOrder[a.level] - levelOrder[b.level];
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      layout
      className="bg-white rounded-2xl p-5 mb-6 border border-white"
    >
      {/* 헤더 - 클릭 가능 */}
      <button
        onClick={toggleMainExpanded}
        className="w-full flex items-center justify-between mb-2"
      >
        <h3 className="text-lg font-bold text-gray-900">📝 내 구매 기준</h3>
        <svg
          className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${
            isMainExpanded ? 'rotate-180' : ''
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
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
                    <motion.button
                      key={index}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: index * 0.05 }}
                      onClick={() => toggleExpand(index)}
                      className={`${bgColor} rounded-xl p-3 text-left hover:opacity-80 transition-all flex flex-col ${
                        expandedIndex === index ? 'ring-2 ring-blue-300 ring-inset' : ''
                      }`}
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
                        <div className="text-sm font-semibold text-gray-900 leading-tight break-keep" style={{ wordBreak: 'keep-all' }}>
                          {attr.name}
                        </div>
                      </div>
                      <svg
                        className={`w-4 h-4 text-gray-400 transition-transform duration-200 shrink-0 ml-1 mt-0.5 ${
                          expandedIndex === index ? 'rotate-180' : ''
                        }`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>

                    {/* 펼쳐진 디테일 설명 */}
                    <AnimatePresence initial={false}>
                      {expandedIndex === index && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.2, ease: 'easeInOut' }}
                          className="overflow-hidden"
                        >
                          <div className="pt-2">
                            <p className="text-xs text-gray-600 leading-relaxed">{attr.reason}</p>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.button>
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
                  기타 기준
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {summary.additionalContext.map((context, index) => (
                    <motion.span
                      key={index}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.2, delay: 0.3 + index * 0.05 }}
                      className="text-xs bg-white text-gray-700 px-2.5 py-1 rounded-full border border-gray-200"
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

      {/* 채팅으로 더 자세히 추천받기 버튼 (항상 표시) */}
      <div className="mt-3 pt-3 border-t border-gray-200">
        <button
          onClick={handleChatRedirect}
          className="w-full h-14 bg-linear-to-r from-gray-900 to-gray-700 text-white text-base font-semibold rounded-2xl shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2.5"
        >
          <svg
            className="w-5 h-5"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M4.913 2.658c2.075-.27 4.19-.408 6.337-.408 2.147 0 4.262.139 6.337.408 1.922.25 3.291 1.861 3.405 3.727a4.403 4.403 0 00-1.032-.211 50.89 50.89 0 00-8.42 0c-2.358.196-4.04 2.19-4.04 4.434v4.286a4.47 4.47 0 002.433 3.984L7.28 21.53A.75.75 0 016 21v-4.03a48.527 48.527 0 01-1.087-.128C2.905 16.58 1.5 14.833 1.5 12.862V6.638c0-1.97 1.405-3.718 3.413-3.979z" />
            <path d="M15.75 7.5c-1.376 0-2.739.057-4.086.169C10.124 7.797 9 9.103 9 10.609v4.285c0 1.507 1.128 2.814 2.67 2.94 1.243.102 2.5.157 3.768.165l2.782 2.781a.75.75 0 001.28-.53v-2.39l.33-.026c1.542-.125 2.67-1.433 2.67-2.94v-4.286c0-1.505-1.125-2.811-2.664-2.94A49.392 49.392 0 0015.75 7.5z" />
          </svg>
          채팅으로 더 자세히 추천받기
        </button>
      </div>
    </motion.div>
  );
}
