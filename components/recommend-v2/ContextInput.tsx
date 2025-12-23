'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface ContextInputProps {
  category: string;
  categoryName: string;
  onComplete: (context: string | null) => void;  // null = 스킵
}

export default function ContextInput({ category, categoryName, onComplete }: ContextInputProps) {
  const [text, setText] = useState('');
  const [examples, setExamples] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadExamples();
  }, [category]);

  const loadExamples = async () => {
    try {
      // JSON 파일에서 예시 쿼리 로드
      const response = await fetch('/data/context-examples.json');
      const data = await response.json();
      setExamples(data[category] || []);
    } catch (err) {
      console.error('Failed to load examples:', err);
      // 예시 로드 실패해도 진행 가능
      setExamples([]);
    }
  };

  const handleSubmit = () => {
    // 500자 제한
    if (text.trim().length > 500) {
      setError('500자 이내로 입력해주세요');
      return;
    }

    setError(null);
    onComplete(text.trim() || null);
  };

  const handleSkip = () => {
    onComplete(null);
  };

  const handleExampleClick = (example: string) => {
    setText(example);
    // 포커스
    const textarea = document.querySelector('textarea');
    textarea?.focus();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="bg-purple-50 border border-purple-200 rounded-2xl p-6 space-y-4"
    >
      {/* 헤더 */}
      <div className="text-sm text-gray-700 font-medium">
        💬 상황을 한 줄로 알려주세요
      </div>

      {/* 예시 쿼리 버튼들 */}
      {examples.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {examples.map((ex, i) => (
            <motion.button
              key={i}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.05, duration: 0.2 }}
              onClick={() => handleExampleClick(ex)}
              className="text-sm px-3 py-2 bg-white border border-gray-300 rounded-lg hover:border-purple-400 hover:bg-purple-50 transition-colors"
            >
              {ex}
            </motion.button>
          ))}
        </div>
      )}

      {/* Textarea */}
      <div className="space-y-2">
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
          placeholder={`예: 아이는 6개월이고, ${categoryName.includes('분유') ? '밤수유가 많아요' : '외출이 잦아요'}`}
          className="w-full h-24 border border-gray-300 rounded-xl p-3 text-sm focus:ring-2 focus:ring-purple-400 focus:border-transparent resize-none transition-all"
          maxLength={500}
        />
        {/* 글자 수 카운터 */}
        <div className="flex justify-between text-xs text-gray-500">
          <span>{text.length} / 500자</span>
          {error && <span className="text-red-500">{error}</span>}
        </div>
      </div>

      {/* 버튼들 */}
      <div className="flex gap-3 pt-2">
        <button
          onClick={handleSubmit}
          disabled={isLoading}
          className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white py-3 rounded-xl font-medium disabled:opacity-50 hover:shadow-lg transition-shadow"
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              분석 중...
            </span>
          ) : (
            '시작하기 →'
          )}
        </button>
        <button
          onClick={handleSkip}
          disabled={isLoading}
          className="text-gray-500 underline px-4 hover:text-gray-700 transition-colors disabled:opacity-50"
        >
          스킵하고 바로 시작
        </button>
      </div>
    </motion.div>
  );
}
