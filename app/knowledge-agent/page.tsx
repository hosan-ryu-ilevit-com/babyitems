'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { MagnifyingGlass, Sparkle, Lightning, ArrowRight, CaretRight, CaretLeft, PaperPlaneRight } from '@phosphor-icons/react/dist/ssr';
import { 
  FcSearch, 
  FcMindMap, 
  FcElectricity, 
  FcPrevious, 
  FcIdea, 
  FcDataConfiguration,
  FcAssistant
} from "react-icons/fc";


export default function KnowledgeAgentLanding() {
  const router = useRouter();
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [clarificationMessage, setClarificationMessage] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  // 자동 포커스
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSearch = async (query?: string) => {
    const searchQuery = query || inputValue.trim();
    if (!searchQuery || isProcessing) return;

    setIsProcessing(true);
    setClarificationMessage(null);
    setSuggestions([]);

    try {
      // 키워드 추출 API 호출
      const res = await fetch('/api/knowledge-agent/extract-keyword', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userInput: searchQuery })
      });
      const data = await res.json();

      if (data.success && data.keyword && data.confidence !== 'low') {
        // 키워드 추출 성공 → 해당 카테고리 페이지로 이동
        // URL 인코딩된 키워드를 categoryKey로 사용
        const categoryKey = encodeURIComponent(data.keyword);
        router.push(`/knowledge-agent/${categoryKey}`);
      } else if (data.clarificationNeeded) {
        // 명확화 필요
        setClarificationMessage(data.clarificationQuestion || '어떤 제품을 찾고 계신가요?');
        if (data.suggestions?.length > 0) {
          setSuggestions(data.suggestions);
        }
        setIsProcessing(false);
      } else {
        // 알 수 없는 에러
        setClarificationMessage('죄송합니다. 다시 한 번 말씀해 주시겠어요?');
        setIsProcessing(false);
      }
    } catch (error) {
      console.error('[Landing] Search failed:', error);
      setClarificationMessage('네트워크 오류가 발생했습니다. 다시 시도해 주세요.');
      setIsProcessing(false);
    }
  };

  const handleKeywordClick = (keyword: string) => {
    setInputValue(keyword);
    handleSearch(keyword);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSearch();
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FB] flex flex-col font-sans">
      <div className="max-w-[480px] mx-auto w-full flex-1 flex flex-col relative border-x border-gray-100 bg-white shadow-2xl shadow-gray-200/50">
        {/* Header */}
        <header className="sticky top-0 z-[100] bg-white/80 backdrop-blur-2xl border-b border-gray-50/50 px-4 h-16 flex items-center justify-between">
          <motion.button 
            whileHover={{ x: -2 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => router.push('/categories')} 
            className="p-2.5 -ml-2.5 rounded-full hover:bg-gray-50 transition-colors"
          >
            <FcPrevious size={20} />
          </motion.button>
          
          <div className="flex flex-col items-center gap-0.5">
            <h1 className="font-black text-[15px] text-gray-900 tracking-tight uppercase">
              가전/아기용품 구매 도우미
            </h1>
          </div>

          <div className="w-9" />
        </header>

        {/* Main Content */}
        <main className="flex-1 flex flex-col items-center justify-center px-6 pb-40">
          {/* Logo & Title */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center mb-12"
          >
            
            
            <h1 className="text-[26px] font-black text-gray-900 mb-3 tracking-tight leading-tight">
              어떤 상품을<br />찾고 계신가요?
            </h1>
            <p className="text-[14px] font-bold text-gray-400">
              광고 없는 AI 분석으로 고민을 줄여보세요
            </p>
          </motion.div>

          {/* Search Box */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, type: "spring" }}
            className="w-full relative"
          >
            <div className="relative group">
              {/* 스마트 에이전트 느낌의 글로우 효과 */}
              <div 
                className="absolute -inset-8 -z-10 blur-[50px] opacity-40 pointer-events-none group-focus-within:opacity-80 transition-opacity duration-700"
                style={{
                  background: 'radial-gradient(circle at 50% 50%, rgba(59, 130, 246, 0.4) 0%, rgba(147, 51, 234, 0.2) 50%, transparent 100%)',
                }}
              />

              {/* Input container */}
              <div className="relative bg-white rounded-[28px] border-2 border-gray-100 focus-within:border-blue-500/50 overflow-hidden shadow-[0_15px_45px_rgba(0,0,0,0.04)] focus-within:shadow-[0_20px_60px_rgba(59,130,246,0.1)] transition-all duration-500">
                <div className="flex items-start p-5">
                  <FcSearch
                    size={24}
                    className={`mt-1 mr-4 shrink-0 transition-all duration-300 ${
                      isProcessing ? 'scale-125' : ''
                    }`}
                  />
                  <textarea
                    ref={inputRef}
                    value={inputValue}
                    onChange={(e) => {
                      setInputValue(e.target.value);
                      setClarificationMessage(null);
                      e.target.style.height = 'auto';
                      e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder={`구매하고 싶은 상품을 입력하세요\n(예: 분유포트, 기저귀, 가습기...)`}
                    className="flex-1 bg-transparent text-[16px] font-semibold text-gray-800 placeholder:text-gray-300 focus:outline-none resize-none min-h-[54px] max-h-[140px] leading-relaxed py-0.5"
                    disabled={isProcessing}
                    rows={2}
                  />
                </div>

                {/* Submit button */}
                <div className="px-5 pb-5 flex justify-end">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleSearch()}
                    disabled={!inputValue.trim() || isProcessing}
                    className={`h-12 px-6 rounded-2xl font-black text-[14px] flex items-center gap-2.5 transition-all ${
                      inputValue.trim() ? 'bg-gray-900 text-white shadow-xl shadow-gray-200' : 'bg-gray-50 text-gray-300'
                    } disabled:opacity-50`}
                  >
                    {isProcessing ? (
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>분석 중...</span>
                      </div>
                    ) : (
                      <>
                        시작하기
                        <PaperPlaneRight size={18} weight="fill" />
                      </>
                    )}
                  </motion.button>
                </div>
              </div>
            </div>

            {/* Clarification Message */}
            <AnimatePresence>
              {clarificationMessage && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 10 }}
                  className="mt-6 p-5 bg-white border border-gray-100 rounded-[24px] shadow-lg relative overflow-hidden"
                >
                  <div className="flex items-start gap-3 relative z-10">
                    <FcIdea size={20} className="shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[14px] text-gray-800 font-bold leading-relaxed mb-4">
                        {clarificationMessage}
                      </p>
                      {suggestions.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {suggestions.map((suggestion, i) => (
                            <motion.button
                              key={i}
                              whileHover={{ y: -2 }}
                              whileTap={{ scale: 0.98 }}
                              onClick={() => handleKeywordClick(suggestion)}
                              className="px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl text-[13px] font-bold text-gray-600 hover:bg-gray-100 transition-colors"
                            >
                              {suggestion}
                            </motion.button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

       
        
        </main>

   
      </div>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="bg-gray-50 rounded-xl p-3 text-center">
      <div className="w-10 h-10 mx-auto mb-2 bg-white rounded-lg flex items-center justify-center">
        {icon}
      </div>
      <p className="text-xs font-semibold text-gray-800">{title}</p>
      <p className="text-[10px] text-gray-500">{description}</p>
    </div>
  );
}
