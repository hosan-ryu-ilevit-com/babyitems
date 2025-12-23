'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

interface ContextInputProps {
  category: string;
  categoryName: string;
  onComplete: (context: string | null) => void;  // null = 스킵
}

export default function ContextInput({ category, categoryName, onComplete }: ContextInputProps) {
  const [text, setText] = useState('');
  const [examples, setExamples] = useState<string[]>([]);
  const [isLoadingExamples, setIsLoadingExamples] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    loadExamples();
  }, [category, categoryName]);

  const loadExamples = async () => {
    setIsLoadingExamples(true);
    try {
      const response = await fetch('/api/ai-selection-helper/generate-context-examples', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, categoryName }),
      });
      const data = await response.json();
      if (data.examples && data.examples.length > 0) {
        setExamples(data.examples);
      }
    } catch (err) {
      console.error('Failed to load examples:', err);
      setExamples([
        '아이는 3개월이에요',
        '첫째 아이예요',
        '맞벌이 가정이에요',
        '공간이 넓지 않아요',
      ]);
    } finally {
      setIsLoadingExamples(false);
    }
  };

  const handleSubmit = () => {
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
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4"
    >
      {/* 헤더 - 간결하게 */}
      <div className="space-y-1">
        <h3 className="text-base font-bold text-gray-900">
          💬 상황을 알려주세요. 구체적으로 말씀해주실수록 좋아요
        </h3>
        
      </div>

      {/* 예시 버튼들 */}
      <div className="flex flex-wrap gap-2">
        {isLoadingExamples ? (
          // 스켈레톤 로딩
          <>
            {[1, 2, 3, 4].map(i => (
              <div
                key={i}
                className="h-9 rounded-full bg-gray-100 animate-pulse"
                style={{ width: `${80 + i * 20}px` }}
              />
            ))}
          </>
        ) : (
          examples.map((example, idx) => (
            <motion.button
              key={idx}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: idx * 0.05 }}
              onClick={() => handleExampleClick(example)}
              className="px-3 py-2 text-sm rounded-full bg-gray-100 text-gray-700 hover:bg-blue-50 hover:text-blue-600 transition-colors border border-transparent hover:border-blue-200"
            >
              {example}
            </motion.button>
          ))
        )}
      </div>

      {/* Textarea */}
      <div className="space-y-2">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
          placeholder={`아기 월령, 환경 등을 알려주시면 더 정확한 추천이 가능해요`}
          className="w-full p-4 border border-gray-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all"
          rows={3}
          maxLength={500}
        />
      
      </div>

      {/* 버튼들 */}
      <div className="flex gap-3">
        <button
          onClick={handleSubmit}
          className="flex-1 bg-blue-500 text-white py-3 rounded-xl font-semibold text-sm hover:bg-blue-600 transition-colors"
        >
          시작하기 →
        </button>
        <button
          onClick={handleSkip}
          className="text-gray-500 underline px-4 text-sm hover:text-gray-700 transition-colors"
        >
          스킵하고 바로 시작
        </button>
      </div>
    </motion.div>
  );
}
