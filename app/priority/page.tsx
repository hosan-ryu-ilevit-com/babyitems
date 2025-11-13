'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { CaretLeft, CaretRight, Question } from '@phosphor-icons/react/dist/ssr';
import Link from 'next/link';
import { PRIORITY_ATTRIBUTES, ATTRIBUTE_ICONS, AttributeInfo } from '@/data/attributes';
import { PriorityButton } from '@/components/PriorityButton';
import { AttributeBottomSheet } from '@/components/AttributeBottomSheet';
import { GuideBottomSheet } from '@/components/GuideBottomSheet';
import { PrioritySettings, PriorityLevel, BudgetRange } from '@/types';
import {
  loadSession,
  saveSession,
  savePrioritySettings,
  setQuickRecommendation,
  changePhase,
  isPriorityComplete
} from '@/lib/utils/session';
import { logPageView, logButtonClick } from '@/lib/logging/clientLogger';

// 가장 많이 선택된 조합 (디폴트)
const DEFAULT_PRIORITY: PrioritySettings = {
  temperatureControl: 'high',
  hygiene: 'high',
  material: 'medium',
  usability: 'medium',
  portability: 'low',
  additionalFeatures: 'low',
};

const DEFAULT_BUDGET: BudgetRange = '50000-100000';

// 예시 쿼리들
const EXAMPLE_QUERIES = [
  '쌍둥이라 동시에 분유를 자주 타요',
  '외출이 많아서 휴대성이 중요해요',
  '새벽 수유가 많아서 조용한 제품이 좋아요',
  '좁은 공간에 두려고 해요',
  '세척을 정말 자주 할 거예요',
];

export default function PriorityPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1); // 1, 2, 3
  const [prioritySettings, setPrioritySettings] = useState<PrioritySettings>(DEFAULT_PRIORITY);
  const [bottomSheetOpen, setBottomSheetOpen] = useState(false);
  const [selectedAttribute, setSelectedAttribute] = useState<AttributeInfo | null>(null);
  const [budget, setBudget] = useState<BudgetRange | null>(DEFAULT_BUDGET);
  const [customBudget, setCustomBudget] = useState<string>('');
  const [isCustomBudgetMode, setIsCustomBudgetMode] = useState(false);
  const [additionalRequest, setAdditionalRequest] = useState<string>('');
  const [guideBottomSheetOpen, setGuideBottomSheetOpen] = useState(true);

  // 페이지 뷰 로깅
  useEffect(() => {
    logPageView('priority');
  }, []);

  // 6개 모두 선택되었는지 확인
  const allSelected = isPriorityComplete(prioritySettings);

  // '중요함' 개수 카운트
  const highPriorityCount = Object.values(prioritySettings).filter(v => v === 'high').length;

  // Step 1 유효성 검사
  const isStep1Valid = allSelected && highPriorityCount >= 1 && highPriorityCount <= 3;

  // Step 2 유효성 검사
  const isStep2Valid = budget !== null;

  // 속성 선택 핸들러
  const handleSelect = (attributeKey: string, level: PriorityLevel) => {
    // '중요함'을 선택하려는데 이미 3개가 선택되어 있으면
    if (level === 'high' && highPriorityCount >= 3 && prioritySettings[attributeKey as keyof PrioritySettings] !== 'high') {
      return;
    }

    // 로깅: 우선순위 선택
    const levelText = level === 'high' ? '중요함' : level === 'medium' ? '보통' : '중요하지 않음';
    logButtonClick(`우선순위 선택: ${levelText}`, 'priority', attributeKey);

    setPrioritySettings(prev => ({
      ...prev,
      [attributeKey]: level
    }));
  };

  // 교육 바텀시트 열기
  const openBottomSheet = (attribute: AttributeInfo) => {
    setSelectedAttribute(attribute);
    setBottomSheetOpen(true);
    logButtonClick(`교육 보기: ${attribute.name}`, 'priority');
  };

  // 예산 버튼 클릭
  const handleBudgetSelect = (budgetRange: BudgetRange) => {
    setBudget(budgetRange);
    setIsCustomBudgetMode(false);
    setCustomBudget('');
    logButtonClick(`예산 선택: ${budgetRange}`, 'priority');
  };

  // 주관식 입력 모드 활성화
  const handleCustomBudgetClick = () => {
    setIsCustomBudgetMode(true);
    setBudget(null);
  };

  // 주관식 예산 입력 처리
  const handleCustomBudgetSubmit = () => {
    const trimmed = customBudget.trim();
    if (!trimmed) {
      alert('예산을 입력해주세요.');
      return;
    }

    // 입력한 자연어 예산을 그대로 저장
    setBudget(trimmed);
    setIsCustomBudgetMode(false);
    logButtonClick(`주관식 예산 입력: ${trimmed}`, 'priority');
  };

  // 예시 쿼리 클릭
  const handleExampleClick = (query: string) => {
    setAdditionalRequest(query);
    logButtonClick(`예시 쿼리 선택: ${query}`, 'priority');
  };

  // 다음 단계
  const handleNext = () => {
    if (currentStep === 1 && isStep1Valid) {
      setCurrentStep(2);
      logButtonClick('Step 1 -> Step 2', 'priority');
    } else if (currentStep === 2 && isStep2Valid) {
      setCurrentStep(3);
      logButtonClick('Step 2 -> Step 3', 'priority');
    }
  };

  // 이전 단계
  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
      logButtonClick(`Step ${currentStep} -> Step ${currentStep - 1}`, 'priority');
    }
  };

  // 바로 추천받기 (최종)
  const handleFinalSubmit = () => {
    if (!budget) return;

    const session = loadSession();

    let updatedSession: import('@/types').SessionState = {
      ...session,
      messages: [],
      phase0Context: additionalRequest || undefined,
      currentAttribute: 0,
      attributeAssessments: {
        temperatureControl: null,
        hygiene: null,
        material: null,
        usability: null,
        portability: null,
        priceValue: null,
        durability: null,
        additionalFeatures: null,
      },
      additionalContext: [],
      accuracy: 0,
      chatConversations: undefined,
      budget: budget,
    };

    updatedSession = savePrioritySettings(updatedSession, prioritySettings);
    updatedSession = setQuickRecommendation(updatedSession, true);
    saveSession(updatedSession);

    // Step 3 자연어 입력 로깅
    if (additionalRequest.trim()) {
      logButtonClick('추가 요청사항 입력됨', 'priority', additionalRequest);
    }

    logButtonClick('바로 추천받기 (최종)', 'priority');
    router.push('/result');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100">
      <div className="relative w-full max-w-[480px] min-h-screen bg-white shadow-lg flex flex-col">
        {/* Header - Fixed */}
        <header className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            {currentStep === 1 ? (
              <Link href="/" className="text-gray-600 hover:text-gray-900 transition-colors">
                <CaretLeft size={24} weight="bold" />
              </Link>
            ) : (
              <button
                onClick={handlePrevious}
                className="text-gray-600 hover:text-gray-900 transition-colors"
              >
                <CaretLeft size={24} weight="bold" />
              </button>
            )}
            <h1 className="text-lg font-bold text-gray-900">기본 정보 입력</h1>
            <div className="w-6"></div>
          </div>

          {/* Step Indicator */}
          <div className="flex items-center justify-center gap-2">
            {[1, 2, 3].map((step) => (
              <div
                key={step}
                className={`flex items-center ${step < 3 ? 'gap-2' : ''}`}
              >
                <div
                  className={`
                    w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all
                    ${currentStep === step
                      ? 'text-white'
                      : currentStep > step
                      ? 'bg-gray-300 text-gray-600'
                      : 'bg-gray-100 text-gray-400'
                    }
                  `}
                  style={currentStep === step ? { backgroundColor: '#0084FE' } : {}}
                >
                  {step}
                </div>
                {step < 3 && (
                  <div
                    className={`w-12 h-0.5 ${currentStep > step ? 'bg-gray-300' : 'bg-gray-100'}`}
                  />
                )}
              </div>
            ))}
          </div>
        </header>

        {/* Scrollable Content */}
        <main className="flex-1 px-6 py-6 pb-32 overflow-y-auto">
          {/* Step 1: 중요도 선택 */}
          {currentStep === 1 && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              <div className="text-center mb-6">
                <p className="text-sm text-gray-700 leading-5 mb-1">
                  구매 기준들의 중요도를 골라주세요!
                </p>
                 <p className="text-xs text-gray-500">
                  <span className="inline-flex items-center px-2 py-0.5 bg-gray-600 text-white rounded-md text-xs font-bold mb-4">중요함</span>
                  <span className="ml-1">은 최대 3개까지 선택할 수 있어요.</span>
                </p>
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-full border-2 border-dashed border-gray-300">
                  <span className="text-xs text-gray-600 font-semibold">가장 인기있는 조합이 선택되어 있어요. 자유롭게 변경해주세요!</span>
                </div>
               
              </div>

              {/* 6가지 속성 */}
              <div className="space-y-4">
                {PRIORITY_ATTRIBUTES.map((attribute, index) => (
                  <motion.div
                    key={attribute.key}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: index * 0.05 }}
                    className="bg-gray-50 rounded-2xl p-4"
                  >
                    {/* Attribute Header */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="text-xl shrink-0">{ATTRIBUTE_ICONS[attribute.key]}</span>
                        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                          <h3 className="text-sm font-bold text-gray-900 shrink-0">{attribute.name}</h3>
                          {/* 통계 태그 */}
                          {attribute.key === 'temperatureControl' && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-md font-bold whitespace-nowrap shrink-0" style={{ backgroundColor: '#EAF8F8', color: '#009896' }}>
                              87%가 중요함 선택
                            </span>
                          )}
                          {attribute.key === 'hygiene' && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-md font-bold whitespace-nowrap shrink-0" style={{ backgroundColor: '#EAF8F8', color: '#009896' }}>
                              74%가 중요함 선택
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => openBottomSheet(attribute)}
                        className="w-7 h-7 rounded-full hover:bg-gray-100 transition-colors flex items-center justify-center shrink-0"
                      >
                        <Question size={16} weight="bold" className="text-gray-400" />
                      </button>
                    </div>

                    {/* Button Group - Unified Tab Bar */}
                    <div className="flex bg-white rounded-xl p-1 border border-gray-200 gap-1">
                      <PriorityButton
                        level="low"
                        selected={prioritySettings[attribute.key as keyof PrioritySettings] === 'low'}
                        onClick={() => handleSelect(attribute.key, 'low')}
                      />
                      <PriorityButton
                        level="medium"
                        selected={prioritySettings[attribute.key as keyof PrioritySettings] === 'medium'}
                        onClick={() => handleSelect(attribute.key, 'medium')}
                      />
                      <PriorityButton
                        level="high"
                        selected={prioritySettings[attribute.key as keyof PrioritySettings] === 'high'}
                        onClick={() => handleSelect(attribute.key, 'high')}
                        disabled={highPriorityCount >= 3 && prioritySettings[attribute.key as keyof PrioritySettings] !== 'high'}
                      />
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Step 2: 예산 선택 */}
          {currentStep === 2 && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              <div className="text-center mb-6">
                <p className="text-sm text-gray-700 leading-5 mb-2">
                  예산 범위를 선택해주세요
                </p>
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-full border-2 border-dashed border-gray-300">
                  <span className="text-xs text-gray-600 font-semibold">5~10만원이 가장 인기있는 예산이에요!</span>
                </div>
              </div>

              <div className="bg-gray-50 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-xl">💰</span>
                  <h3 className="text-sm font-bold text-gray-900">예산</h3>
                </div>

                {/* 2x2 Grid for budget buttons */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <button
                    onClick={() => handleBudgetSelect('0-50000')}
                    className={`
                      p-3 rounded-xl text-left transition-all border
                      ${budget === '0-50000'
                        ? ''
                        : 'bg-white text-gray-900 border-gray-200 hover:border-gray-300'
                      }
                    `}
                    style={budget === '0-50000' ? { backgroundColor: '#E5F1FF', color: '#0074F3', borderColor: '#B8DCFF' } : {}}
                  >
                    <div className="font-semibold text-sm mb-0.5">5만원 이하</div>
                    <div className={`text-xs ${budget === '0-50000' ? 'opacity-70' : 'text-gray-500'}`}>
                      기본 기능
                    </div>
                  </button>

                  <button
                    onClick={() => handleBudgetSelect('50000-100000')}
                    className={`
                      p-3 rounded-xl text-left transition-all border relative
                      ${budget === '50000-100000'
                        ? ''
                        : 'bg-white text-gray-900 border-gray-200 hover:border-gray-300'
                      }
                    `}
                    style={budget === '50000-100000' ? { backgroundColor: '#E5F1FF', color: '#0074F3', borderColor: '#B8DCFF' } : {}}
                  >
                    <div className="flex items-center gap-1 mb-0.5">
                      <span className="font-semibold text-sm">5~10만원</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold ${budget === '50000-100000' ? 'bg-white text-gray-900' : ''}`} style={budget !== '50000-100000' ? { backgroundColor: '#EAF8F8', color: '#009896' } : {}}>
                        인기
                      </span>
                    </div>
                    <div className={`text-xs ${budget === '50000-100000' ? 'opacity-70' : 'text-gray-500'}`}>
                      더 좋은 소재+편의 기능
                    </div>
                  </button>

                  <button
                    onClick={() => handleBudgetSelect('100000-150000')}
                    className={`
                      p-3 rounded-xl text-left transition-all border
                      ${budget === '100000-150000'
                        ? ''
                        : 'bg-white text-gray-900 border-gray-200 hover:border-gray-300'
                      }
                    `}
                    style={budget === '100000-150000' ? { backgroundColor: '#E5F1FF', color: '#0074F3', borderColor: '#B8DCFF' } : {}}
                  >
                    <div className="font-semibold text-sm mb-0.5">10~15만원</div>
                    <div className={`text-xs ${budget === '100000-150000' ? 'opacity-70' : 'text-gray-500'}`}>
                      프리미엄 기능
                    </div>
                  </button>

                  <button
                    onClick={() => handleBudgetSelect('150000+')}
                    className={`
                      p-3 rounded-xl text-left transition-all border
                      ${budget === '150000+'
                        ? ''
                        : 'bg-white text-gray-900 border-gray-200 hover:border-gray-300'
                      }
                    `}
                    style={budget === '150000+' ? { backgroundColor: '#E5F1FF', color: '#0074F3', borderColor: '#B8DCFF' } : {}}
                  >
                    <div className="font-semibold text-sm mb-0.5">15만원 이상</div>
                    <div className={`text-xs ${budget === '150000+' ? 'opacity-70' : 'text-gray-500'}`}>
                      최고급
                    </div>
                  </button>
                </div>

                {/* 주관식 입력 */}
                {!isCustomBudgetMode && budget && !['0-50000', '50000-100000', '100000-150000', '150000+'].includes(budget) ? (
                  <button
                    onClick={handleCustomBudgetClick}
                    className="w-full p-3 rounded-xl text-left transition-all border-2 text-white"
                    style={{ borderColor: '#B8DCFF', backgroundColor: '#0084FE' }}
                  >
                    <div className="font-semibold text-sm mb-0.5">직접 입력</div>
                    <div className="text-xs opacity-80">{budget}</div>
                  </button>
                ) : !isCustomBudgetMode ? (
                  <button
                    onClick={handleCustomBudgetClick}
                    className="w-full p-3 rounded-xl text-left transition-all border border-dashed border-gray-200 hover:border-gray-300 bg-white text-gray-700"
                  >
                    <div className="font-semibold text-sm">직접 입력</div>
                  </button>
                ) : (
                  <div className="w-full p-3 rounded-xl border-2 bg-white" style={{ borderColor: '#B8DCFF' }}>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={customBudget}
                        onChange={(e) => setCustomBudget(e.target.value)}
                        placeholder="직접 입력 (예: 4만원~6만원)"
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 text-base text-gray-900"
                        style={{ fontSize: '16px', '--tw-ring-color': '#B8DCFF' } as React.CSSProperties}
                        autoFocus
                      />
                      <button
                        onClick={handleCustomBudgetSubmit}
                        className="px-4 py-2 text-white rounded-lg font-semibold text-sm transition-colors"
                        style={{ backgroundColor: '#0084FE' }}
                      >
                        확인
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* Step 3: 추가 요청 (선택) */}
          {currentStep === 3 && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              {/* Optional Badge */}
              <div className="flex justify-center mb-3">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-full border-2 border-dashed border-gray-300">
                  <span className="text-sm font-semibold text-gray-600">선택사항</span>
                  <span className="text-xs text-gray-500">•</span>
                  <span className="text-xs text-gray-500 font-semibold">없다면, 바로 추천받기를 눌러주세요!</span>
                </div>
              </div>

              <div className="text-center mb-4">
               
                <p className="text-xs text-gray-500">
                  입력하시면 더 정확한 추천이 가능해요!
                </p>
              </div>

              <div className="bg-gray-50 rounded-2xl p-4 mb-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xl">💭</span>
                  <h3 className="text-sm font-bold text-gray-900">추가로 입력할 상황이 있으신가요?</h3>
                  
                </div>

                <textarea
                  value={additionalRequest}
                  onChange={(e) => setAdditionalRequest(e.target.value)}
                  placeholder="예: 쌍둥이라 동시에 분유를 자주 타고, 깔끔하게 세척이 잘 됐으면 좋겠어요. 디자인도 흰색 유광을 좋아해서 예뻤으면 좋겠어요."
                  className="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl focus:outline-none focus:ring-1 text-sm text-gray-900 resize-none"
                  style={{ fontSize: '14px', '--tw-ring-color': '#0084FE' } as React.CSSProperties}
                  rows={4}
                />
              </div>

              {/* 예시 쿼리들 */}
              <div className="mb-4">
                <p className="text-xs text-gray-600 mb-2 font-semibold">💡 이런 내용을 입력하시면 좋아요</p>
                <div className="space-y-2">
                  {EXAMPLE_QUERIES.map((query, index) => (
                    <button
                      key={index}
                      onClick={() => handleExampleClick(query)}
                      className="w-full px-3 py-2 text-left text-sm text-gray-700 bg-white border border-gray-200 rounded-lg hover:border-gray-400 hover:bg-gray-50 transition-all"
                    >
                      {query}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </main>

        {/* Footer - 하단 플로팅 고정 */}
        <footer className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-4 z-10"
          style={{ maxWidth: '480px', margin: '0 auto' }}
        >
          {currentStep < 3 ? (
            <div className="space-y-3">
              <motion.button
                whileHover={(currentStep === 1 && isStep1Valid) || (currentStep === 2 && isStep2Valid) ? { scale: 1.02 } : {}}
                whileTap={(currentStep === 1 && isStep1Valid) || (currentStep === 2 && isStep2Valid) ? { scale: 0.98 } : {}}
                onClick={handleNext}
                disabled={(currentStep === 1 && !isStep1Valid) || (currentStep === 2 && !isStep2Valid)}
                className={`
                  w-full h-14 rounded-2xl font-semibold text-base transition-all flex items-center justify-center gap-2.5
                  ${
                    (currentStep === 1 && isStep1Valid) || (currentStep === 2 && isStep2Valid)
                      ? 'text-white'
                      : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }
                `}
                style={(currentStep === 1 && isStep1Valid) || (currentStep === 2 && isStep2Valid) ? { backgroundColor: '#0084FE' } : {}}
              >
                <span>다음</span>

              </motion.button>

              {/* 유효성 검사 안내 메시지 */}
              {currentStep === 1 && allSelected && highPriorityCount < 1 && (
                <p className="text-sm text-center text-red-500 font-semibold">
                  &lsquo;중요함&rsquo;을 최소 1개 이상 선택해주세요
                </p>
              )}
              {currentStep === 1 && highPriorityCount > 3 && (
                <p className="text-sm text-center text-red-500 font-semibold">
                  &lsquo;중요함&rsquo;은 최대 3개까지 선택할 수 있습니다
                </p>
              )}
              {currentStep === 2 && !budget && (
                <p className="text-sm text-center text-red-500 font-semibold">
                  예산 범위를 선택해주세요
                </p>
              )}
            </div>
          ) : (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleFinalSubmit}
              className="w-full h-14 rounded-2xl font-semibold text-base transition-all flex items-center justify-center gap-2.5 text-white"
              style={{ backgroundColor: '#0084FE' }}
            >
              <span>바로 추천받기</span>
              <span className="px-2 py-0.5 bg-white/20 rounded-md text-xs font-bold flex items-center gap-1">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 22l-.394-1.433a2.25 2.25 0 00-1.423-1.423L13.25 19l1.433-.394a2.25 2.25 0 001.423-1.423L16.5 16l.394 1.433a2.25 2.25 0 001.423 1.423L19.75 19l-1.433.394a2.25 2.25 0 00-1.423 1.423z" />
                </svg>
                <span>AI</span>
              </span>
            </motion.button>
          )}
        </footer>

        {/* Attribute Bottom Sheet */}
        <AttributeBottomSheet
          isOpen={bottomSheetOpen}
          attribute={selectedAttribute}
          onClose={() => setBottomSheetOpen(false)}
        />

        {/* Guide Bottom Sheet */}
        <GuideBottomSheet
          isOpen={guideBottomSheetOpen}
          onClose={() => setGuideBottomSheetOpen(false)}
        />
      </div>
    </div>
  );
}
