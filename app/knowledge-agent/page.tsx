'use client';

import { useState, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { MagnifyingGlass, X, ArrowRight, CaretLeft } from '@phosphor-icons/react';

// --- Data Configuration ---

const CATEGORIES_DATA: Record<string, any> = {
  "출산/육아용품": {
    "외출용품": {
      "code": "BABY_008",
      "emoji": "🛒",
      "children": [
        "유모차", "카시트", "아기띠", "힙시트"
      ]
    },
    "젖병/수유용품": {
      "code": "BABY_003",
      "emoji": "🍼",
      "children": [
        "젖병", "쪽쪽이", "분유포트", "분유제조기", "보틀워머", "젖병솔", "유축기", "수유패드"
      ]
    },
    "기저귀/위생": {
      "code": "BABY_006",
      "emoji": "👶",
      "children": [
        "기저귀", "아기물티슈", "분유", "이유식", "유아간식"
      ]
    },
    "이유식용품": {
      "code": "BABY_004",
      "emoji": "🥣",
      "children": [
        "빨대컵", "이유식기", "유아수저세트", "턱받이", "치발기", "이유식조리기"
      ]
    },
    "건강/목욕용품": {
      "code": "BABY_005",
      "emoji": "🧼",
      "children": [
        "아기욕조", "콧물흡입기", "체온계", "유아치약", "유아칫솔", "유아변기", "손톱깎이", "유아세제"
      ]
    },
    "유아 가구": {
      "code": "BABY_001",
      "emoji": "🛌",
      "children": [
        "유아침대", "유아의자", "유아소파", "유아책상"
      ]
    },
    "신생아/영유아 완구": {
      "code": "BABY_002",
      "emoji": "🧸",
      "children": [
        "아기체육관", "바운서", "점퍼루", "보행기"
      ]
    },
    "인기 완구/교구": {
      "code": "BABY_007",
      "emoji": "🎨",
      "children": [
        "블록장난감", "로봇장난감", "소꿉놀이", "인형", "킥보드", "놀이방매트"
      ]
    }
  },
  "생활/주방가전": {
    "PC/주변기기": {
      "code": "APP_006",
      "emoji": "🖥️",
      "children": [
        "모니터", "4K모니터", "무선마우스", "기계식키보드", "노트북거치대", "웹캠"
      ]
    },
    "주방가전": {
      "code": "APP_004",
      "emoji": "🍳",
      "children": [
        "에어프라이어", "전기밥솥", "전자레인지", "식기세척기", "음식물처리기", "전기포트"
      ]
    },
    "계절/환경가전": {
      "code": "APP_003",
      "emoji": "🌡️",
      "children": [
        "가습기", "공기청정기", "제습기", "에어컨", "선풍기", "전기히터"
      ]
    },
    "청소가전": {
      "code": "APP_002",
      "emoji": "🧹",
      "children": [
        "로봇청소기", "무선청소기", "물걸레청소기", "침구청소기"
      ]
    },
    "세탁/건조가전": {
      "code": "APP_001",
      "emoji": "👕",
      "children": [
        "세탁기", "건조기", "의류관리기"
      ]
    },
    "이미용/건강가전": {
      "code": "APP_005",
      "emoji": "💇",
      "children": [
        "헤어드라이어", "고데기", "전동칫솔", "체중계"
      ]
    }
  }
};

// --- Confirmation Modal ---
interface ConfirmModalProps {
  isOpen: boolean;
  keyword: string;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

function ConfirmModal({ isOpen, keyword, onConfirm, onCancel, isLoading }: ConfirmModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
        >
          <motion.div 
            className="absolute inset-0 bg-black/50"
            onClick={onCancel}
          />
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 10 }}
            transition={{ type: "spring", duration: 0.3, bounce: 0.15 }}
            className="relative w-full max-w-[320px] bg-white rounded-[24px] overflow-hidden border border-gray-100 shadow-2xl"
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[17px] font-bold text-gray-900">맞춤 추천 시작</h3>
                <button 
                  onClick={onCancel}
                  className="p-1 -mr-1 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X size={20} weight="bold" />
                </button>
              </div>
              
              <p className="text-[14px] text-gray-500 mb-5 leading-relaxed">
                실시간 트렌드와 인기 상품을 분석하여 최적의 추천을 도와드릴게요.
              </p>
              
              <div className="p-4 bg-purple-50 rounded-2xl border border-purple-100 mb-6">
                <p className="text-center text-[18px] font-bold text-purple-600 break-keep">
                  {keyword}
                </p>
              </div>
              
              <div className="flex gap-2">
                <button
                  onClick={onCancel}
                  disabled={isLoading}
                  className="flex-1 px-4 py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold text-[15px] rounded-xl transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={onConfirm}
                  disabled={isLoading}
                  className="flex-1 px-4 py-3.5 bg-purple-600 hover:bg-purple-700 text-white font-bold text-[15px] rounded-xl transition-all flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>분석 시작</>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function KnowledgeAgentLanding() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeSearchItem, setActiveSearchItem] = useState<string | null>(null);
  
  const mainCategories = Object.keys(CATEGORIES_DATA);
  const [selectedMainCategory, setSelectedMainCategory] = useState(mainCategories[0]);
  const subCategories = Object.keys(CATEGORIES_DATA[selectedMainCategory]);
  const [selectedSubCategory, setSelectedSubCategory] = useState<string | null>(null);
  
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [extractedKeyword, setExtractedKeyword] = useState('');

  const displayCategories = useMemo(() => {
    if (selectedSubCategory === null) {
      return Object.entries(CATEGORIES_DATA[selectedMainCategory]);
    }
    const data = CATEGORIES_DATA[selectedMainCategory][selectedSubCategory];
    return data ? [[selectedSubCategory, data]] : [];
  }, [selectedMainCategory, selectedSubCategory]);

  const handleMainCategoryChange = (category: string) => {
    setSelectedMainCategory(category);
    setSelectedSubCategory(null);
  };

  const handleSearchRequest = async (query?: string) => {
    const searchQuery = query || inputValue.trim();
    if (!searchQuery || isProcessing) return;

    // 카테고리 버튼 클릭 시에는 이미 키워드가 명확하므로 별도 추출 없이 바로 모달 오픈
    if (query) {
      setActiveSearchItem(query);
      setExtractedKeyword(query);
      setShowConfirmModal(true);
      return;
    }

    // 입력창 검색 시에만 추출 로직 실행
    setIsProcessing(true);
    try {
      const res = await fetch('/api/knowledge-agent/extract-keyword', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userInput: searchQuery })
      });
      const data = await res.json();
      setExtractedKeyword(data.success && data.keyword ? data.keyword : searchQuery);
      setShowConfirmModal(true);
    } catch (error) {
      console.error('[Landing] Search failed:', error);
      setExtractedKeyword(searchQuery);
      setShowConfirmModal(true);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmSearch = () => {
    if (!extractedKeyword) return;
    setIsProcessing(true);
    router.push(`/knowledge-agent/${encodeURIComponent(extractedKeyword)}`);
  };

  const handleCancelSearch = () => {
    setShowConfirmModal(false);
    setExtractedKeyword('');
    setActiveSearchItem(null);
  };

  return (
    <div className="min-h-screen bg-[#F8F8FA]">
      <ConfirmModal
        isOpen={showConfirmModal}
        keyword={extractedKeyword}
        onConfirm={handleConfirmSearch}
        onCancel={handleCancelSearch}
        isLoading={isProcessing}
      />

      <div className="max-w-[480px] mx-auto min-h-screen bg-[#F8F8FA] flex flex-col">
      
        {/* Hero & Search Section */}
        <div className="px-5 pt-8 pb-6">
          <div className="mb-8">
            <h2 className="text-[24px] font-bold text-gray-900 mb-1 tracking-tight leading-tight">🛍️ 어떤 상품을 구매하시나요?</h2>
            <p className="text-[15px] text-gray-400 font-medium">AI가 제품을 비교분석하고 딱 맞는 제품을 추천해요</p>
          </div>

          {/* Large Smart Gradient Search Bar */}
          <div className="relative group">
            <div className="flex items-center bg-white rounded-2xl border-2 border-transparent ai-gradient-border p-[3px] transition-all overflow-hidden">
              <div className="flex flex-1 items-center bg-white rounded-[13px]">
                <input
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearchRequest()}
                  placeholder="아래에서 고르거나, 여기에 직접 입력..."
                  className="flex-1 bg-transparent py-3 px-3 text-[16px] font-semibold text-gray-800 placeholder:text-gray-400 focus:outline-none"
                  disabled={isProcessing}
                />
                <button
                  onClick={() => handleSearchRequest()}
                  disabled={!inputValue.trim() || isProcessing}
                  className="mr-2 p-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-100 text-white disabled:text-gray-400 rounded-[999px] transition-all active:scale-95 flex items-center justify-center"
                >
                  {isProcessing ? (
                    <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <MagnifyingGlass size={16} weight="bold" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Main Tabs */}
        <div className="flex px-5 mb-4 border-b border-gray-100">
          {mainCategories.map((category) => (
            <button
              key={category}
              onClick={() => handleMainCategoryChange(category)}
              className={`relative pb-3 px-4 text-[14px] font-bold transition-colors whitespace-nowrap first:pl-0 ${
                selectedMainCategory === category ? 'text-purple-600' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {category}
              {selectedMainCategory === category && (
                <motion.div layoutId="mainTab" className="absolute bottom-0 left-0 right-0 h-[2px] bg-purple-600 rounded-full" />
              )}
            </button>
          ))}
        </div>

        {/* Sub Tabs - Natural Wrapping */}
        <div className="flex flex-wrap px-5 py-2 gap-2 mb-4">
          <button
            onClick={() => setSelectedSubCategory(null)}
            className={`shrink-0 px-4 py-2 rounded-full text-[13px] font-bold transition-all border ${
              selectedSubCategory === null 
                ? 'bg-gray-900 text-white border-gray-900' 
                : 'bg-white text-gray-500 border-gray-100 hover:bg-gray-50'
            }`}
          >
            모두보기
          </button>
          {subCategories.map((sub) => (
            <button
              key={sub}
              onClick={() => setSelectedSubCategory(sub)}
              className={`shrink-0 px-4 py-2 rounded-full text-[13px] font-bold transition-all border whitespace-nowrap ${
                selectedSubCategory === sub 
                  ? 'bg-gray-900 text-white border-gray-900' 
                  : 'bg-white text-gray-500 border-gray-100 hover:bg-gray-50'
              }`}
            >
              {sub}
            </button>
          ))}
        </div>

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto px-4 py-4">
          <AnimatePresence mode="wait">
            <motion.div
              key={`${selectedMainCategory}-${selectedSubCategory}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="space-y-10"
            >
              {(displayCategories as [string, any][]).map(([subTitle, data], categoryIdx) => {
                return (
                  <div key={subTitle} className="mb-8">
                    <div className="mb-4 px-1 flex items-center gap-3">
                      <div className="w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center shrink-0 text-[20px]">
                        {data.emoji || "📦"}
                      </div>
                      <h3 className="text-[17px] font-semibold text-gray-900 flex items-center gap-2 flex-1">
                        {subTitle}
                        <div className="h-px flex-1 bg-gray-100 ml-2" />
                      </h3>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {data.children.map((child: string, idx: number) => {
                        const isLoading = activeSearchItem === child && !showConfirmModal;
                        return (
                          <motion.button
                            key={child}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => handleSearchRequest(child)}
                            disabled={isLoading || isProcessing}
                            className="rounded-2xl p-4 transition-all duration-200 text-left bg-white hover:bg-gray-50 border border-gray-100 flex items-center justify-between"
                          >
                            <span className="text-[15px] font-medium text-gray-900 break-keep leading-snug">
                              {child}
                            </span>
                            {isLoading && (
                              <div className="w-4 h-4 border-2 border-purple-200 border-t-purple-600 rounded-full animate-spin shrink-0 ml-2" />
                            )}
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
