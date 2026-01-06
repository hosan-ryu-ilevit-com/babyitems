'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Sparkle } from '@phosphor-icons/react/dist/ssr';
import { FcIdea } from "react-icons/fc";

export default function KnowledgeAgentLanding() {
  const router = useRouter();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [clarificationMessage, setClarificationMessage] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);

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
      const res = await fetch('/api/knowledge-agent/extract-keyword', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userInput: searchQuery })
      });
      const data = await res.json();

      if (data.success && data.keyword && data.confidence !== 'low') {
        const categoryKey = encodeURIComponent(data.keyword);
        router.push(`/knowledge-agent/${categoryKey}`);
      } else if (data.clarificationNeeded) {
        setClarificationMessage(data.clarificationQuestion || '어떤 제품을 찾고 계신가요?');
        if (data.suggestions?.length > 0) {
          setSuggestions(data.suggestions);
        }
        setIsProcessing(false);
      } else {
        setClarificationMessage('죄송합니다. 다시 한 번 말씀해 주시겠어요?');
        setIsProcessing(false);
      }
    } catch (error) {
      console.error('[Landing] Search failed:', error);
      setClarificationMessage('네트워크 오류가 발생했습니다. 다시 시도해 주세요.');
      setIsProcessing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSearch();
    }
  };

  return (
    <div className="min-h-screen bg-[#FDFDFF] text-gray-900 font-sans selection:bg-indigo-100 selection:text-indigo-900">
        {/* Abstract Background Shapes */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
            <motion.div 
                animate={{ 
                    y: [0, -40, 0],
                    rotate: [0, 5, 0],
                    scale: [1, 1.05, 1]
                }}
                transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
                className="absolute top-[-10%] right-[-5%] w-[600px] h-[600px] bg-indigo-200/20 rounded-full blur-3xl mix-blend-multiply" 
            />
            <motion.div 
                animate={{ 
                    y: [0, 50, 0],
                    x: [0, 30, 0],
                    scale: [1, 1.1, 1]
                }}
                transition={{ duration: 20, repeat: Infinity, ease: "easeInOut", delay: 2 }}
                className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-purple-200/20 rounded-full blur-3xl mix-blend-multiply" 
            />
        </div>

      <div className="max-w-[480px] mx-auto w-full min-h-screen flex flex-col relative z-10 border-x border-gray-100/50 bg-white/40 backdrop-blur-sm shadow-2xl shadow-indigo-100/40">
        
        {/* Header */}
        <header className="px-6 py-8 flex justify-between items-center">
            <motion.button 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                onClick={() => router.push('/categories')}
                className="group flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-gray-900 transition-colors"
            >
                <div className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center group-hover:border-gray-900 transition-colors">
                    <ArrowRight size={14} className="rotate-180" />
                </div>
                <span className="opacity-0 group-hover:opacity-100 transition-opacity -translate-x-2 group-hover:translate-x-0 duration-300">이전으로</span>
            </motion.button>
            <motion.div 
                 initial={{ opacity: 0, scale: 0.8 }}
                 animate={{ opacity: 1, scale: 1 }}
                 className="px-3 py-1 bg-gray-900 text-white text-[10px] font-black tracking-widest uppercase rounded-full"
            >
                Beta
            </motion.div>
        </header>

        {/* Main Content */}
        <main className="flex-1 flex flex-col px-6 pb-12 pt-10">
            
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                className="mb-10"
            >
                <div className="flex items-center gap-2 mb-4 text-indigo-600 font-bold text-sm tracking-wide">
                    <Sparkle weight="fill" />
                    <span>AI SHOPPING ASSISTANT</span>
                </div>
                <h1 className="text-[40px] font-black text-gray-900 leading-[1.15] tracking-tight mb-5">
                    복잡한 비교 검색,<br/>
                    <span className="relative inline-block">
                        <span className="relative z-10">대신 해드릴게요</span>
                        <span className="absolute bottom-2 left-0 w-full h-3 bg-indigo-200/60 -z-0 transform -rotate-1"></span>
                    </span>
                </h1>
                <p className="text-gray-500 text-[17px] font-medium leading-relaxed max-w-[90%]">
                    찾으시는 육아용품을 알려주시면<br/>
                    리뷰와 스펙을 분석해 추천해드려요.
                </p>
            </motion.div>

            <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="relative group"
            >
                <div className="absolute -inset-1 bg-gradient-to-r from-blue-500 to-purple-500 rounded-[32px] opacity-20 group-focus-within:opacity-40 blur transition-opacity duration-500" />
                
                <div className="relative bg-white rounded-[28px] p-2 shadow-xl shadow-indigo-100/50 border border-gray-100 transition-transform duration-300 group-focus-within:-translate-y-1">
                    <div className="relative flex flex-col">
                        <textarea
                            ref={inputRef}
                            value={inputValue}
                            onChange={(e) => {
                                setInputValue(e.target.value);
                                setClarificationMessage(null);
                                e.target.style.height = 'auto';
                                e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
                            }}
                            onKeyDown={handleKeyDown}
                            placeholder="예: 튼튼하고 안전한 카시트 추천해줘"
                            className="w-full bg-transparent p-4 text-lg font-medium text-gray-900 placeholder:text-gray-300 focus:outline-none resize-none min-h-[60px] max-h-[120px]"
                            disabled={isProcessing}
                            rows={1}
                        />
                        
                        <div className="flex justify-between items-center px-2 pb-2 mt-2">
                             <div className="flex gap-2">
                                {/* Optional: Add quick chips here later if needed */}
                             </div>
                             <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => handleSearch()}
                                disabled={!inputValue.trim() || isProcessing}
                                className={`h-12 w-12 rounded-full flex items-center justify-center transition-all duration-300 ${
                                    inputValue.trim() 
                                    ? 'bg-gray-900 text-white shadow-lg shadow-gray-900/20' 
                                    : 'bg-gray-100 text-gray-400'
                                }`}
                             >
                                {isProcessing ? (
                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : (
                                    <ArrowRight size={20} weight="bold" />
                                )}
                             </motion.button>
                        </div>
                    </div>
                </div>
            </motion.div>

            {/* Clarification & Suggestions */}
            <AnimatePresence mode="wait">
                {clarificationMessage && (
                    <motion.div
                        initial={{ opacity: 0, y: 20, height: 0 }}
                        animate={{ opacity: 1, y: 0, height: "auto" }}
                        exit={{ opacity: 0, y: 20, height: 0 }}
                        className="mt-8"
                    >
                         <div className="flex items-start gap-4">
                            <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
                                <FcIdea size={24} />
                            </div>
                            <div className="space-y-4 pt-1">
                                <p className="text-gray-800 font-bold leading-relaxed text-lg">
                                    {clarificationMessage}
                                </p>
                                {suggestions.length > 0 && (
                                    <div className="flex flex-wrap gap-2">
                                        {suggestions.map((suggestion, i) => (
                                            <motion.button
                                                key={i}
                                                whileHover={{ scale: 1.05, backgroundColor: "#EEF2FF" }} // indigo-50
                                                whileTap={{ scale: 0.95 }}
                                                onClick={() => {
                                                    setInputValue(suggestion);
                                                    handleSearch(suggestion);
                                                }}
                                                className="px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 shadow-sm transition-colors hover:border-indigo-200 hover:text-indigo-700"
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
        </main>
      </div>
    </div>
  );
}