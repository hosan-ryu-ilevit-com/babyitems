'use client';

import { useState, useRef, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkle, ArrowRight, TrendUp, MagnifyingGlass, ChatTeardropText, Question, CaretRight } from '@phosphor-icons/react';
import {
  logKnowledgeAgentSearchRequest,
  logKnowledgeAgentSearchConfirm,
  logKnowledgeAgentSearchCancel,
  logKnowledgeAgentCategorySelect,
  logKnowledgeAgentSubCategorySelect,
  logKAPageView
} from '@/lib/logging/clientLogger';
import { KnowledgeAgentStepIndicator } from '@/components/knowledge-agent/KnowledgeAgentStepIndicator';


// --- Data Configuration ---

const BABY_CATEGORY_ICONS: Record<string, string> = {
  '기저귀': '/images/카테고리 아이콘/기저귀.png',
  '아기물티슈': '/images/카테고리 아이콘/아기물티슈.png',
  '분유': '/images/카테고리 아이콘/분유.png',
  '이유식': '/images/카테고리 아이콘/이유식.png',
  '유아간식': '/images/카테고리 아이콘/유아간식.png',
  '젖병': '/images/카테고리 아이콘/젖병.png',
  '젖병소독기': '/images/카테고리 아이콘/젖병 소독기.png',
  '쪽쪽이': '/images/카테고리 아이콘/쪽쪽이노리개.png',
  '분유포트': '/images/카테고리 아이콘/분유포트.png',
  '분유제조기': '/images/카테고리 아이콘/분유제조기.png',
  '보틀워머': '/images/카테고리 아이콘/보틀워머.png',
  '젖병솔': '/images/카테고리 아이콘/젖병솔.png',
  '유축기': '/images/카테고리 아이콘/유축기.png',
  '수유패드': '/images/카테고리 아이콘/수유패드.png',
  '휴대용 유모차': '/images/카테고리 아이콘/휴대용 유모차.png',
  '디럭스 유모차': '/images/카테고리 아이콘/디럭스 유모차.png',
  '절충형 유모차': '/images/카테고리 아이콘/절충형 유모차.png',
  '트라이크 유모차': '/images/카테고리 아이콘/트라이크 유모차.png',
  '신생아용 카시트': '/images/카테고리 아이콘/신생아용 카시트.png',
  '유아용 카시트': '/images/카테고리 아이콘/유아용 카시트.png',
  '주니어용 카시트': '/images/카테고리 아이콘/주니어용 카시트.png',
  '아기띠': '/images/카테고리 아이콘/아기띠.png',
  '힙시트': '/images/카테고리 아이콘/힙시트.png',
  '유아침대': '/images/카테고리 아이콘/유아침대.png',
  '유아의자': '/images/카테고리 아이콘/유아의자.png',
  '유아소파': '/images/카테고리 아이콘/유아소파.png',
  '유아책상': '/images/카테고리 아이콘/유아책상.png',
  '빨대컵': '/images/카테고리 아이콘/빨대컵.png',
  '이유식기': '/images/카테고리 아이콘/이유식기.png',
  '유아수저세트': '/images/카테고리 아이콘/유아수저세트.png',
  '턱받이': '/images/카테고리 아이콘/턱받이.png',
  '치발기': '/images/카테고리 아이콘/치발기.png',
  '이유식조리기': '/images/카테고리 아이콘/이유식조리기.png',
  '하이체어': '/images/카테고리 아이콘/하이체어.png',
  '아기욕조': '/images/카테고리 아이콘/아기욕조.png',
  '콧물흡입기': '/images/카테고리 아이콘/콧물흡입기.png',
  '체온계': '/images/카테고리 아이콘/체온계.png',
  '유아치약': '/images/카테고리 아이콘/유아치약.png',
  '유아칫솔': '/images/카테고리 아이콘/유아칫솔.png',
  '유아변기': '/images/카테고리 아이콘/유아변기.png',
  '손톱깎이': '/images/카테고리 아이콘/손톱깎이.png',
  '유아세제': '/images/카테고리 아이콘/유아세제.png',
  '아기체육관': '/images/카테고리 아이콘/아기체육관.png',
  '바운서': '/images/카테고리 아이콘/바운서.png',
  '점퍼루': '/images/카테고리 아이콘/점퍼루.png',
  '보행기': '/images/카테고리 아이콘/보행기.png',
  '모빌': '/images/카테고리 아이콘/모빌.png',
  '블록장난감': '/images/카테고리 아이콘/블록장난감.png',
  '로봇장난감': '/images/카테고리 아이콘/로봇장난감.png',
  '소꿉놀이': '/images/카테고리 아이콘/소꿉놀이.png',
  '인형': '/images/카테고리 아이콘/인형.png',
  '킥보드': '/images/카테고리 아이콘/킥보드.png',
  '놀이방매트': '/images/카테고리 아이콘/놀이방매트.png',
};

const LIVING_CATEGORY_ICONS: Record<string, string> = {
  '모니터': '/images/카테고리 아이콘/모니터.png',
  '4K모니터': '/images/카테고리 아이콘/4K모니터.png',
  '무선마우스': '/images/카테고리 아이콘/무선마우스.png',
  '기계식키보드': '/images/카테고리 아이콘/기계식키보드.png',
  '노트북거치대': '/images/카테고리 아이콘/노트북거치대.png',
  '웹캠': '/images/카테고리 아이콘/웹캠.png',
  '에어프라이어': '/images/카테고리 아이콘/에어프라이어.png',
  '전기밥솥': '/images/카테고리 아이콘/전기밥솥.png',
  '전자레인지': '/images/카테고리 아이콘/전자레인지.png',
  '식기세척기': '/images/카테고리 아이콘/식기세척기.png',
  '음식물처리기': '/images/카테고리 아이콘/음식물처리기.png',
  '전기포트': '/images/카테고리 아이콘/전기포트.png',
  '커피머신': '/images/카테고리 아이콘/커피머신.png',
  '믹서기': '/images/카테고리 아이콘/믹서기.png',
  '가습기': '/images/카테고리 아이콘/가습기.png',
  '공기청정기': '/images/카테고리 아이콘/공기청정기.png',
  '제습기': '/images/카테고리 아이콘/제습기.png',
  '에어컨': '/images/카테고리 아이콘/에어컨.png',
  '선풍기': '/images/카테고리 아이콘/선풍기.png',
  '전기히터': '/images/카테고리 아이콘/전기히터.png',
  '로봇청소기': '/images/카테고리 아이콘/로봇청소기.png',
  '무선청소기': '/images/카테고리 아이콘/무선청소기.png',
  '물걸레청소기': '/images/카테고리 아이콘/물걸레청소기.png',
  '침구청소기': '/images/카테고리 아이콘/침구청소기.png',
  '세탁기': '/images/카테고리 아이콘/세탁기.png',
  '건조기': '/images/카테고리 아이콘/건조기.png',
  '올인원 세탁건조기': '/images/카테고리 아이콘/올인원세탁건조기.png',
  '의류관리기': '/images/카테고리 아이콘/의류관리기.png',
  '스팀다리미': '/images/카테고리 아이콘/스팀다리미.png',
  '헤어드라이어': '/images/카테고리 아이콘/헤어드라이어.png',
  '고데기': '/images/카테고리 아이콘/고데기.png',
  '전동칫솔': '/images/카테고리 아이콘/전동칫솔.png',
  '체중계': '/images/카테고리 아이콘/체중계.png',
  '전기면도기': '/images/카테고리 아이콘/전기면도기.png',
  '안마의자': '/images/카테고리 아이콘/안마의자.png',
};

// --- Data Configuration ---

export const CATEGORIES_DATA: Record<string, any> = {
  "출산/육아용품": {
    "기저귀/위생": {
      "code": "BABY_006",
      "emoji": "👶",
      "children": [
        "기저귀", "아기물티슈", "분유", "이유식", "유아간식"
      ]
    },
    "젖병/수유용품": {
      "code": "BABY_003",
      "emoji": "🍼",
      "children": [
        "젖병", "젖병소독기", "쪽쪽이", "분유포트", "분유제조기", "보틀워머", "젖병솔", "유축기", "수유패드"
      ]
    },
    "외출용품": {
      "code": "BABY_008",
      "emoji": "🛒",
      "children": [
        "휴대용 유모차", "디럭스 유모차", "절충형 유모차", "트라이크 유모차",
        "신생아용 카시트", "유아용 카시트", "주니어용 카시트",
        "아기띠", "힙시트"
      ]
    },
    "유아 가구": {
      "code": "BABY_001",
      "emoji": "🛌",
      "children": [
        "유아침대", "유아의자", "유아소파", "유아책상"
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

// --- Confirmation Modal ---
interface ConfirmModalProps {
  isOpen: boolean;
  keyword: string;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
  isBaby: boolean;
}

function ConfirmModal({ isOpen, keyword, onConfirm, onCancel, isLoading, isBaby }: ConfirmModalProps) {
  const steps = [
    { icon: '/icons/modal/1.png', label: '실시간 인기상품 분석' },
    { icon: '/icons/modal/2.png', label: '웹 트렌드 검색' },
    { icon: '/icons/modal/3.png', label: '실사용 리뷰 정밀 분석' },
    { icon: '/icons/modal/4.png', label: '맞춤 구매 질문 생성' },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60"
            onClick={onCancel}
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="relative w-full max-w-[480px] bg-white rounded-t-[32px] overflow-hidden shadow-2xl"
          >
            <div className="p-6 pt-8 pb-12">
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-2">
                   <img src="/icons/ic-ai.svg" alt="AI" className="w-[20px] h-[20px]" />
                   <h3 className="text-[20px] font-bold text-[#6366F1] leading-tight">
                     맞춤 추천 시작
                   </h3>
                </div>
                <button 
                  onClick={onCancel} 
                  className="p-2 -mr-2 -mt-2 text-gray-300 hover:text-gray-500 transition-colors rounded-full hover:bg-gray-50"
                >
                  <X size={24} weight="bold" />
                </button>
              </div>

              <p className="text-[17px] text-gray-700 mb-8 leading-[1.4] font-medium">
                 <span className="font-bold text-gray-900">{keyword}</span>에 대해 상세히 분석하고 <br/>
                 추천에 필요한 맞춤 질문을 드릴게요
              </p>

              {/* Steps Visualization */}
              <div className="flex flex-col gap-[10px] mb-12">
                 {steps.map((step, idx) => (
                    <div key={idx} className="flex items-center gap-3 bg-gray-50 rounded-2xl px-4 h-[52px]">
                       <div className="w-5 h-5 rounded-full bg-gray-800 text-white flex items-center justify-center text-[12px] font-bold shrink-0">
                          {idx + 1}
                       </div>
                       
                       <span className="flex-1 text-[16px] font-medium text-gray-700 leading-[1.4]">
                          {step.label}
                       </span>

                       <div className="w-8 h-8 rounded-lg bg-[#F0F2FF] flex items-center justify-center shrink-0">
                          <img src={step.icon} alt="" className="w-6 h-6 object-contain" />
                       </div>
                    </div>
                 ))}
              </div>

              {/* Action Button */}
              <button
                  onClick={onConfirm}
                  disabled={isLoading}
                  className={`
                    w-full h-[56px] rounded-[12px] font-semibold text-[16px] text-white
                    transform active:scale-[0.98] transition-all duration-300
                    flex items-center justify-center gap-2
                    bg-[#1A1C1E] hover:bg-black
                    ${isLoading ? 'opacity-80 cursor-wait' : ''}
                  `}
                >
                  {isLoading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <span>분석 시작하기</span>
                    </>
                  )}
                </button>
            </div>
          </motion.div>
        </div>
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

  // Theme Colors
  const isBaby = defaultTab === 'baby';

  useEffect(() => {
    logKAPageView();
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
    <div className="min-h-screen bg-white">

      <ConfirmModal
        isOpen={showConfirmModal}
        keyword={extractedKeyword}
        onConfirm={handleConfirmSearch}
        onCancel={handleCancelSearch}
        isLoading={isProcessing}
        isBaby={isBaby}
      />

      <div className="max-w-[480px] mx-auto min-h-screen flex flex-col">
        {/* Header Bar */}
        <header className="sticky top-0 z-50 bg-[#FBFBFD] h-[54px] flex items-center px-5">
          <button onClick={() => router.push('/knowledge-agent')} className="p-2 -ml-2">
            <img src="/icons/back.png" alt="뒤로가기" className="w-5 h-5" />
          </button>
        </header>

        <KnowledgeAgentStepIndicator currentStep={1} className="top-[54px]" />

        <motion.div
          initial="hidden"
          animate="visible"
          className="flex-1 flex flex-col pt-0"
        >
          <div className="px-4 pt-0 pb-12">
            {/* Title */}
            <motion.div className="mt-[11px] mb-[16px]">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[15px] text-gray-400 font-semibold">
                  카테고리 설정
                </span>
              </div>
              <h3 className="text-[18px] font-semibold text-gray-900 leading-snug break-keep">
                찾으시는 상품을 선택하세요
                <span className="text-blue-500"> *</span>
              </h3>
            </motion.div>

            {/* Sub Tabs */}
            <div className="-mx-4 px-4 mb-4">
              <div className="flex flex-wrap items-center gap-2">
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  onClick={() => {
                    logKnowledgeAgentSubCategorySelect(selectedMainCategory, null);
                    setSelectedSubCategory(null);
                  }}
                  className={`px-4 py-1.5 rounded-full text-[14px] font-medium border ${selectedSubCategory === null
                    ? 'bg-gray-800 border-gray-800 text-white shadow-sm'
                    : 'bg-white border-gray-200 text-gray-500'
                    }`}
                >
                  모두보기
                </motion.button>
                {subCategories.map((sub) => (
                  <motion.button
                    key={sub}
                    whileTap={{ scale: 0.96 }}
                    onClick={() => {
                      logKnowledgeAgentSubCategorySelect(selectedMainCategory, sub);
                      setSelectedSubCategory(sub);
                    }}
                    className={`px-4 py-1.5 rounded-full text-[14px] font-medium border ${selectedSubCategory === sub
                      ? 'bg-gray-800 border-gray-800 text-white shadow-sm'
                      : 'bg-white border-gray-200 text-gray-500'
                      }`}
                  >
                    {sub}
                  </motion.button>
                ))}
              </div>
            </div>

            {/* Category List */}
            <AnimatePresence mode="wait">
              <motion.div
                key={`${selectedMainCategory}-${selectedSubCategory}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                {(displayCategories as [string, any][]).map(([subTitle, data]) => {
                  return (
                    <div key={subTitle} className="mb-8">
                      <div className="flex items-center py-[10px]">
                        <h3 className="text-[16px] font-semibold text-gray-800">{subTitle}</h3>
                      </div>
                      <div className="grid grid-cols-3 gap-y-4 gap-x-1.5 sm:gap-x-2">
                        {data.children.map((child: string) => {
                          const isLoading = activeSearchItem === child && !showConfirmModal;
                          const imageUrl = isBaby ? BABY_CATEGORY_ICONS[child] : LIVING_CATEGORY_ICONS[child];
                          const imageSrc = imageUrl ? encodeURI(imageUrl) : undefined;

                          return (
                            <div key={child} className="flex flex-col items-center w-full min-w-0">
                              <motion.button
                                onClick={() => handleSearchRequest(child)}
                                disabled={isLoading || isProcessing}
                                whileTap={isLoading ? undefined : { scale: 0.98 }}
                                className={`relative w-full aspect-square rounded-2xl border flex flex-col items-center pt-3 pb-2 gap-1 bg-white border-gray-100 hover:border-gray-200`}
                              >
                                {isLoading ? (
                                  <div className="w-6 h-6 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin my-auto" />
                                ) : (
                                  <>
                                    <span className={`font-medium text-gray-600 px-1 truncate w-full text-center ${isBaby ? 'text-[14px]' : 'text-[13px] sm:text-[14px]'}`}>
                                      {child}
                                    </span>
                                    <div className={`relative mt-auto mb-1 flex items-center justify-center ${isBaby ? 'w-[62%] h-[62%]' : 'w-[55%] h-[55%]'}`}>
                                      {imageSrc ? (
                                        <img
                                          src={imageSrc}
                                          alt={child}
                                          className="w-full h-full object-contain"
                                        />
                                      ) : (
                                        <span className="text-2xl opacity-40">{data.emoji || '📦'}</span>
                                      )}
                                    </div>
                                  </>
                                )}
                              </motion.button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
