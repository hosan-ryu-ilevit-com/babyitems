'use client';

import { useState, useRef, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Warning, Sparkle, ArrowRight } from '@phosphor-icons/react';
import { 
  logKnowledgeAgentSearchRequest,
  logKnowledgeAgentSearchConfirm,
  logKnowledgeAgentSearchCancel,
  logKnowledgeAgentCategorySelect,
  logKnowledgeAgentSubCategorySelect,
  logKAPageView
} from '@/lib/logging/clientLogger';

// --- Data Configuration ---

export const CATEGORIES_DATA: Record<string, any> = {
  "출산/육아용품": {
    "외출용품": {
      "code": "BABY_008",
      "emoji": "🛒",
      "children": [
        "휴대용 유모차", "디럭스 유모차", "절충형 유모차", "트라이크 유모차", 
        "신생아용 카시트", "유아용 카시트", "주니어용 카시트", 
        "아기띠", "힙시트"
      ]
    },
    "젖병/수유용품": {
      "code": "BABY_003",
      "emoji": "🍼",
      "children": [
        "젖병", "젖병소독기", "쪽쪽이", "분유포트", "분유제조기", "보틀워머", "젖병솔", "유축기", "수유패드"
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
        "빨대컵", "이유식기", "유아수저세트", "턱받이", "치발기", "이유식조리기", "하이체어"
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
        "아기체육관", "바운서", "점퍼루", "보행기", "모빌"
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
        "에어프라이어", "전기밥솥", "전자레인지", "식기세척기", "음식물처리기", "전기포트", "커피머신", "믹서기"
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
        "세탁기", "건조기", "올인원 세탁건조기", "의류관리기", "스팀다리미"
      ]
    },
    "미용/건강가전": {
      "code": "APP_005",
      "emoji": "💇",
      "children": [
        "헤어드라이어", "고데기", "전동칫솔", "체중계", "전기면도기", "안마의자"
      ]
    }
  }
};

// URL path와 카테고리 매핑
export const TAB_PATH_MAP: Record<string, string> = {
  'baby': '출산/육아용품',
  'living': '생활/주방가전'
};

export const CATEGORY_PATH_MAP: Record<string, string> = {
  '출산/육아용품': 'baby',
  '생활/주방가전': 'living'
};

// --- Not Ready Modal (캐시되지 않은 카테고리) ---
interface NotReadyModalProps {
  isOpen: boolean;
  keyword: string;
  onClose: () => void;
}

function NotReadyModal({ isOpen, keyword, onClose }: NotReadyModalProps) {
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
            onClick={onClose}
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
                <h3 className="text-[17px] font-bold text-gray-900">준비 중이에요</h3>
                <button
                  onClick={onClose}
                  className="p-1 -mr-1 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X size={20} weight="bold" />
                </button>
              </div>

              <div className="flex items-center justify-center mb-5">
                <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center">
                  <Warning size={32} weight="fill" className="text-amber-500" />
                </div>
              </div>

              <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 mb-4">
                <p className="text-center text-[16px] font-bold text-gray-700 break-keep">
                  {keyword}
                </p>
              </div>

              <p className="text-[14px] text-gray-500 mb-5 leading-relaxed text-center">
                해당 카테고리는 아직 데이터 준비 중이에요.<br/>
                빠른 시일 내에 지원 예정입니다!
              </p>

              <button
                onClick={onClose}
                className="w-full px-4 py-3.5 bg-gray-900 hover:bg-gray-800 text-white font-bold text-[15px] rounded-xl transition-colors"
              >
                확인
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

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

interface KnowledgeAgentLandingProps {
  defaultTab: 'baby' | 'living';
}

export default function KnowledgeAgentLanding({ defaultTab }: KnowledgeAgentLandingProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeSearchItem, setActiveSearchItem] = useState<string | null>(null);
  
  // 해당 탭의 카테고리만 사용
  const selectedMainCategory = TAB_PATH_MAP[defaultTab];
  const subCategories = Object.keys(CATEGORIES_DATA[selectedMainCategory]);
  const [selectedSubCategory, setSelectedSubCategory] = useState<string | null>(null);
  
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [extractedKeyword, setExtractedKeyword] = useState('');

  // 캐시된 쿼리 목록 (준비된 카테고리)
  const [cachedQueries, setCachedQueries] = useState<Set<string>>(new Set());
  const [isCacheLoading, setIsCacheLoading] = useState(true);
  const [showNotReadyModal, setShowNotReadyModal] = useState(false);
  const [notReadyKeyword, setNotReadyKeyword] = useState('');

  // Theme Colors
  const isBaby = defaultTab === 'baby';
  const accentColor = isBaby ? 'text-rose-500' : 'text-teal-600';
  const accentBg = isBaby ? 'bg-rose-500' : 'bg-teal-600';
  const subTabActiveBg = isBaby ? 'bg-rose-500' : 'bg-teal-600';
  const subTabActiveBorder = isBaby ? 'border-rose-500' : 'border-teal-600';

  useEffect(() => {
    logKAPageView();

    // 캐시된 쿼리 목록 가져오기
    fetch('/api/knowledge-agent/cached-queries')
      .then(res => res.json())
      .then(data => {
        if (data.success && Array.isArray(data.queries)) {
          setCachedQueries(new Set(data.queries));
        }
      })
      .catch(err => console.error('[Landing] Failed to fetch cached queries:', err))
      .finally(() => setIsCacheLoading(false));
  }, []);

  const displayCategories = useMemo(() => {
    if (selectedSubCategory === null) {
      return Object.entries(CATEGORIES_DATA[selectedMainCategory]);
    }
    const data = CATEGORIES_DATA[selectedMainCategory][selectedSubCategory];
    return data ? [[selectedSubCategory, data]] : [];
  }, [selectedMainCategory, selectedSubCategory]);

  const handleSearchRequest = async (query?: string) => {
    const searchQuery = query || inputValue.trim();
    if (!searchQuery || isProcessing) return;

    // 카테고리 버튼 클릭 시에는 이미 키워드가 명확하므로 별도 추출 없이 바로 모달 오픈
    if (query) {
      // 캐시 여부 확인 (캐시 로딩 중이면 통과)
      if (!isCacheLoading && !cachedQueries.has(query)) {
        // 캐시되지 않은 카테고리 - "준비 중" 모달 표시
        setNotReadyKeyword(query);
        setShowNotReadyModal(true);
        return;
      }

      logKnowledgeAgentSearchRequest(query, 'button_click', selectedMainCategory, selectedSubCategory || undefined);
      setActiveSearchItem(query);
      setExtractedKeyword(query);
      setShowConfirmModal(true);
      return;
    }

    // 입력창 검색 시에만 추출 로직 실행
    setIsProcessing(true);
    logKnowledgeAgentSearchRequest(searchQuery, 'search_input');
    try {
      const res = await fetch('/api/knowledge-agent/extract-keyword', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userInput: searchQuery })
      });
      const data = await res.json();
      const finalKeyword = data.success && data.keyword ? data.keyword : searchQuery;
      // 키워드 추출 성공 시에는 confirm 로깅을 따로 하므로 여기서는 skip하거나 보조 정보로 남김
      setExtractedKeyword(finalKeyword);
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
    logKnowledgeAgentSearchConfirm(extractedKeyword, inputValue);
    setIsProcessing(true);
    router.push(`/knowledge-agent/${encodeURIComponent(extractedKeyword)}`);
  };

  const handleCancelSearch = () => {
    logKnowledgeAgentSearchCancel(extractedKeyword);
    setShowConfirmModal(false);
    setExtractedKeyword('');
    setActiveSearchItem(null);
  };

  return (
    <div className="min-h-screen bg-[#FDFBF9] relative overflow-hidden">
      {/* Ambient Background */}
      <div className="fixed inset-0 w-full h-full pointer-events-none">
         <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-[size:24px_24px]" />
         <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-white/0 via-white/80 to-[#FDFBF9]" />
         
         {isBaby ? (
             <div className="absolute -top-[20%] -right-[10%] w-[600px] h-[600px] bg-rose-100/40 rounded-full blur-[100px] mix-blend-multiply opacity-60" />
         ) : (
             <div className="absolute top-[20%] -left-[10%] w-[500px] h-[500px] bg-teal-100/40 rounded-full blur-[80px] mix-blend-multiply opacity-60" />
         )}
      </div>

      <ConfirmModal
        isOpen={showConfirmModal}
        keyword={extractedKeyword}
        onConfirm={handleConfirmSearch}
        onCancel={handleCancelSearch}
        isLoading={isProcessing}
      />

      <NotReadyModal
        isOpen={showNotReadyModal}
        keyword={notReadyKeyword}
        onClose={() => setShowNotReadyModal(false)}
      />

      <div className="max-w-[480px] mx-auto min-h-screen relative z-10 flex flex-col">
      
        {/* Header Section */}
        <div className="px-6 pt-10 pb-6">
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/60 border border-gray-200/60 backdrop-blur-md"
          >
             <Sparkle weight="fill" className={isBaby ? "text-rose-400" : "text-teal-400"} />
             <span className="text-[11px] font-bold text-gray-500 tracking-wider uppercase">
               AI 비서 추천
             </span>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <h2 className="text-[28px] font-bold text-gray-900 mb-2 tracking-tight leading-tight">
              {defaultTab === 'baby' ? '출산 · 육아용품' : '생활 · 주방가전'}
            </h2>
            <p className="text-[15px] text-gray-500 font-medium leading-relaxed">
              찾으시는 상품의 카테고리를 선택해주세요.<br/>
              AI가 꼼꼼하게 비교해드릴게요.
            </p>
          </motion.div>
        </div>

        {/* Sub Tabs */}
        <div className="flex flex-wrap px-6 py-2 gap-2 mb-4">
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              logKnowledgeAgentSubCategorySelect(selectedMainCategory, null);
              setSelectedSubCategory(null);
            }}
            className={`shrink-0 px-4 py-2 rounded-full text-[13px] font-bold transition-all border ${
              selectedSubCategory === null 
                ? `${subTabActiveBg} text-white ${subTabActiveBorder}` 
                : 'bg-white text-gray-500 border-gray-100 hover:bg-gray-50 hover:border-gray-200'
            }`}
          >
            모두보기
          </motion.button>
          {subCategories.map((sub) => (
            <motion.button
              key={sub}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                logKnowledgeAgentSubCategorySelect(selectedMainCategory, sub);
                setSelectedSubCategory(sub);
              }}
              className={`shrink-0 px-4 py-2 rounded-full text-[13px] font-bold transition-all border whitespace-nowrap ${
                selectedSubCategory === sub 
                  ? `${subTabActiveBg} text-white ${subTabActiveBorder}` 
                  : 'bg-white text-gray-500 border-gray-100 hover:bg-gray-50 hover:border-gray-200'
              }`}
            >
              {sub}
            </motion.button>
          ))}
        </div>

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto px-6 py-4 pb-20">
          <AnimatePresence mode="wait">
            <motion.div
              key={`${selectedMainCategory}-${selectedSubCategory}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              className="space-y-10"
            >
              {(displayCategories as [string, any][]).map(([subTitle, data], categoryIdx) => {
                return (
                  <div key={subTitle} className="mb-6">
                    <div className="mb-4 px-1 flex items-center gap-3">
                      <div className={`w-8 h-8 ${isBaby ? 'bg-rose-50 text-rose-500' : 'bg-teal-50 text-teal-600'} rounded-xl flex items-center justify-center shrink-0 text-[18px]`}>
                        {data.emoji || "📦"}
                      </div>
                      <h3 className="text-[17px] font-bold text-gray-900 flex items-center gap-2 flex-1">
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
                            whileHover={{ y: -2 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => handleSearchRequest(child)}
                            disabled={isLoading || isProcessing}
                            className={`
                              group relative w-full text-left px-5 py-4 rounded-2xl bg-white
                              border border-gray-100 transition-all duration-300
                              ${isBaby ? 'hover:border-rose-100 hover:bg-rose-50/30' : 'hover:border-teal-100 hover:bg-teal-50/30'}
                              flex items-center justify-between
                            `}
                          >
                            <span className={`text-[16px] font-semibold text-gray-700 tracking-tight break-keep leading-snug transition-colors pr-2 ${isBaby ? 'group-hover:text-rose-600' : 'group-hover:text-teal-600'}`}>
                              {child}
                            </span>
                            
                            {isLoading ? (
                              <div className={`w-4 h-4 border-2 ${isBaby ? 'border-rose-200 border-t-rose-500' : 'border-teal-200 border-t-teal-600'} rounded-full animate-spin shrink-0`} />
                            ) : (
                              <div className={`
                                opacity-0 -translate-x-2 
                                group-hover:opacity-100 group-hover:translate-x-0 
                                transition-all duration-300
                              `}>
                                <ArrowRight size={14} weight="bold" className={isBaby ? "text-rose-400" : "text-teal-500"} />
                              </div>
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
