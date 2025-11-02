import { UserContextSummary, ImportanceLevel } from '@/types';
import { motion } from 'framer-motion';

interface UserContextSummaryProps {
  summary: UserContextSummary;
}

// 중요도 레벨에 따른 스타일
const getLevelStyle = (level: ImportanceLevel) => {
  switch (level) {
    case '중요함':
      return 'bg-blue-100 text-blue-700 border-blue-200';
    case '보통':
      return 'bg-gray-100 text-gray-700 border-gray-200';
    case '중요하지 않음':
      return 'bg-gray-50 text-gray-500 border-gray-200';
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
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-white rounded-2xl p-5 mb-6 border border-white"
    >
      {/* 헤더 */}
      <div className="mb-4">
        <h3 className="text-base font-bold text-gray-900">✅ 내 선택 기준</h3>
      </div>

      {/* 우선순위 속성들 - 2열 그리드 */}
      {summary.priorityAttributes.length > 0 && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          {summary.priorityAttributes.map((attr, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
              className="bg-gray-50 rounded-xl p-3 border border-white"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <span className="text-sm font-semibold text-gray-900 leading-tight">{attr.name}</span>
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full border shrink-0 ${getLevelStyle(
                    attr.level
                  )}`}
                >
                  {getLevelLabel(attr.level)}
                </span>
              </div>
              <p className="text-xs text-gray-600 leading-relaxed">{attr.reason}</p>
            </motion.div>
          ))}
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
        <div className="pt-3 border-t border-blue-100">
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
  );
}
