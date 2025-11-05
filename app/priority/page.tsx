'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { CaretLeft, Question } from '@phosphor-icons/react/dist/ssr';
import Link from 'next/link';
import { PRIORITY_ATTRIBUTES, ATTRIBUTE_ICONS, AttributeInfo } from '@/data/attributes';
import { PriorityButton } from '@/components/PriorityButton';
import { AttributeBottomSheet } from '@/components/AttributeBottomSheet';
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

export default function PriorityPage() {
  const router = useRouter();
  const [prioritySettings, setPrioritySettings] = useState<PrioritySettings>({});
  const [bottomSheetOpen, setBottomSheetOpen] = useState(false);
  const [selectedAttribute, setSelectedAttribute] = useState<AttributeInfo | null>(null);
  const [budget, setBudget] = useState<BudgetRange | null>(null);
  const [customBudget, setCustomBudget] = useState<string>('');
  const [isCustomBudgetMode, setIsCustomBudgetMode] = useState(false);

  // 페이지 뷰 로깅
  useEffect(() => {
    logPageView('priority');
  }, []);

  // 6개 모두 선택되었는지 확인
  const allSelected = isPriorityComplete(prioritySettings);

  // '중요함' 개수 카운트
  const highPriorityCount = Object.values(prioritySettings).filter(v => v === 'high').length;

  // 유효성 검사: '중요함'이 1~3개 선택 + 예산 선택 필수
  const isValidSelection = allSelected && highPriorityCount >= 1 && highPriorityCount <= 3 && budget !== null;

  // 속성 선택 핸들러
  const handleSelect = (attributeKey: string, level: PriorityLevel) => {
    // '중요함'을 선택하려는데 이미 3개가 선택되어 있으면
    if (level === 'high' && highPriorityCount >= 3 && prioritySettings[attributeKey as keyof PrioritySettings] !== 'high') {
      return;
    }

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
    const amount = parseInt(customBudget.replace(/[^0-9]/g, ''));
    if (isNaN(amount) || amount <= 0) {
      alert('올바른 금액을 입력해주세요.');
      return;
    }

    // 입력한 금액에 맞는 범위로 자동 매핑
    let mappedBudget: BudgetRange;
    if (amount <= 50000) {
      mappedBudget = '0-50000';
    } else if (amount <= 100000) {
      mappedBudget = '50000-100000';
    } else if (amount <= 150000) {
      mappedBudget = '100000-150000';
    } else {
      mappedBudget = '150000+';
    }

    setBudget(mappedBudget);
    setIsCustomBudgetMode(false);
    logButtonClick(`주관식 예산 입력: ${amount}원 (매핑: ${mappedBudget})`, 'priority');
  };

  // 채팅으로 더 자세히 추천받기
  const handleDetailedRecommendation = () => {
    if (!budget) return;

    const session = loadSession();

    let updatedSession: import('@/types').SessionState = {
      ...session,
      messages: [],
      phase0Context: undefined,
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
    updatedSession = setQuickRecommendation(updatedSession, false);
    updatedSession = changePhase(updatedSession, 'chat1');
    saveSession(updatedSession);

    logButtonClick('채팅으로 더 자세히 추천받기', 'priority');
    router.push('/chat');
  };

  // 바로 추천받기
  const handleQuickRecommendation = () => {
    if (!budget) return;

    const session = loadSession();

    let updatedSession: import('@/types').SessionState = {
      ...session,
      messages: [],
      phase0Context: undefined,
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

    logButtonClick('바로 추천받기', 'priority');
    router.push('/result');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100">
      <div className="relative w-full max-w-[480px] min-h-screen bg-white shadow-lg flex flex-col">
        {/* Header - 상단 고정 */}
        <header className="sticky top-0 left-0 right-0 bg-white border-b border-gray-200 px-6 py-4 z-10">
          <div className="flex items-center justify-between mb-4">
            <Link href="/" className="text-gray-600 hover:text-gray-900 transition-colors">
              <CaretLeft size={24} weight="bold" />
            </Link>
            <h1 className="text-lg font-bold text-gray-900">중요 기준 설정</h1>
            <div className="w-6"></div>
          </div>
          <p className="text-sm text-gray-600 leading-relaxed mb-3">
            분유포트를 고를 때 꼭 확인해야 할 6가지 기준과 예산을 선택해주시면, 딱 맞는 제품을 찾아드릴게요.
          </p>
          {/* 중요함 카운터 */}
          <div className={`
            flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all
            ${highPriorityCount === 3
              ? 'bg-gray-900 text-white'
              : 'bg-gray-100 text-gray-600'
            }
          `}>
            <span className="text-base">⭐</span>
            <span>
              중요함: <strong className="font-bold">{highPriorityCount}/3</strong>
            </span>
            {highPriorityCount === 3 && <span className="ml-auto text-xs">✓ 최대 선택</span>}
          </div>
        </header>

        {/* Scrollable Content */}
        <main className="flex-1 px-6 py-6 pb-56 overflow-y-auto">
          {/* 6가지 속성 */}
          <div className="space-y-8 mb-12">
            {PRIORITY_ATTRIBUTES.map((attribute, index) => (
              <motion.div
                key={attribute.key}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
              >
                {/* Attribute Header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{ATTRIBUTE_ICONS[attribute.key]}</span>
                    <h3 className="text-base font-bold text-gray-900">{attribute.name}</h3>
                  </div>
                  <button
                    onClick={() => openBottomSheet(attribute)}
                    className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors flex items-center justify-center"
                  >
                    <Question size={20} weight="bold" className="text-gray-600" />
                  </button>
                </div>

                {/* Button Group */}
                <div className="flex gap-2">
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

          {/* 예산 선택 섹션 */}
          <div className="border-t border-gray-200 pt-8">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-2xl">💰</span>
              <h3 className="text-base font-bold text-gray-900">예산 범위</h3>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              예산에 맞는 제품을 추천해드릴게요. 가격대별로 기능 차이가 있어요.
            </p>

            <div className="space-y-3">
              {/* 예산 버튼들 */}
              <button
                onClick={() => handleBudgetSelect('0-50000')}
                className={`
                  w-full p-4 rounded-2xl text-left transition-all border-2
                  ${budget === '0-50000'
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-900 border-gray-200 hover:border-gray-400'
                  }
                `}
              >
                <div className="font-semibold mb-1">5만원 이하</div>
                <div className={`text-sm ${budget === '0-50000' ? 'text-gray-300' : 'text-gray-500'}`}>
                  기본 보온 기능 중심
                </div>
              </button>

              <button
                onClick={() => handleBudgetSelect('50000-100000')}
                className={`
                  w-full p-4 rounded-2xl text-left transition-all border-2
                  ${budget === '50000-100000'
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-900 border-gray-200 hover:border-gray-400'
                  }
                `}
              >
                <div className="font-semibold mb-1">5~10만원</div>
                <div className={`text-sm ${budget === '50000-100000' ? 'text-gray-300' : 'text-gray-500'}`}>
                  좋은 소재와 편의 기능 포함
                </div>
              </button>

              <button
                onClick={() => handleBudgetSelect('100000-150000')}
                className={`
                  w-full p-4 rounded-2xl text-left transition-all border-2
                  ${budget === '100000-150000'
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-900 border-gray-200 hover:border-gray-400'
                  }
                `}
              >
                <div className="font-semibold mb-1">10~15만원</div>
                <div className={`text-sm ${budget === '100000-150000' ? 'text-gray-300' : 'text-gray-500'}`}>
                  프리미엄 기능 및 구성품
                </div>
              </button>

              <button
                onClick={() => handleBudgetSelect('150000+')}
                className={`
                  w-full p-4 rounded-2xl text-left transition-all border-2
                  ${budget === '150000+'
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-900 border-gray-200 hover:border-gray-400'
                  }
                `}
              >
                <div className="font-semibold mb-1">15만원 이상</div>
                <div className={`text-sm ${budget === '150000+' ? 'text-gray-300' : 'text-gray-500'}`}>
                  최고급 제품
                </div>
              </button>

              {/* 주관식 입력 */}
              {!isCustomBudgetMode ? (
                <button
                  onClick={handleCustomBudgetClick}
                  className="w-full p-4 rounded-2xl text-left transition-all border-2 border-dashed border-gray-300 hover:border-gray-500 bg-white text-gray-700"
                >
                  <div className="font-semibold mb-1">직접 입력</div>
                  <div className="text-sm text-gray-500">
                    원하는 금액을 입력해주세요
                  </div>
                </button>
              ) : (
                <div className="w-full p-4 rounded-2xl border-2 border-gray-900 bg-white">
                  <div className="font-semibold mb-3 text-gray-900">예산을 입력해주세요</div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={customBudget}
                      onChange={(e) => setCustomBudget(e.target.value)}
                      placeholder="예: 80000"
                      className="flex-1 px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 text-gray-900"
                      autoFocus
                    />
                    <button
                      onClick={handleCustomBudgetSubmit}
                      className="px-6 py-3 bg-gray-900 text-white rounded-xl font-semibold hover:bg-gray-800 transition-colors"
                    >
                      확인
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    * 입력한 금액에 맞는 범위로 자동 분류됩니다
                  </p>
                </div>
              )}
            </div>
          </div>
        </main>

        {/* Footer - 하단 플로팅 고정 */}
        <footer className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-4 z-10"
          style={{ maxWidth: '480px', margin: '0 auto' }}
        >
          <div className="space-y-3">
            <motion.button
              whileHover={isValidSelection ? { scale: 1.02 } : {}}
              whileTap={isValidSelection ? { scale: 0.98 } : {}}
              onClick={handleDetailedRecommendation}
              disabled={!isValidSelection}
              className={`
                w-full h-14 rounded-2xl font-semibold text-base transition-all
                ${
                  isValidSelection
                    ? 'bg-gray-900 text-white hover:bg-gray-800'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }
              `}
            >
              채팅으로 더 자세히 추천받기
            </motion.button>

            <motion.button
              whileHover={isValidSelection ? { scale: 1.02 } : {}}
              whileTap={isValidSelection ? { scale: 0.98 } : {}}
              onClick={handleQuickRecommendation}
              disabled={!isValidSelection}
              className={`
                w-full h-14 rounded-2xl font-semibold text-base transition-all border-2
                ${
                  isValidSelection
                    ? 'bg-white text-gray-900 border-gray-900 hover:bg-gray-50'
                    : 'bg-white text-gray-400 border-gray-200 cursor-not-allowed'
                }
              `}
            >
              바로 추천받기
            </motion.button>

            {/* 유효성 검사 안내 메시지 */}
            {allSelected && highPriorityCount < 1 && (
              <p className="text-sm text-center text-red-500 mt-2">
                &lsquo;중요함&rsquo;을 최소 1개 이상 선택해주세요
              </p>
            )}
            {highPriorityCount > 3 && (
              <p className="text-sm text-center text-red-500 mt-2">
                &lsquo;중요함&rsquo;은 최대 3개까지 선택할 수 있습니다
              </p>
            )}
            {allSelected && highPriorityCount >= 1 && highPriorityCount <= 3 && !budget && (
              <p className="text-sm text-center text-red-500 mt-2">
                예산 범위를 선택해주세요
              </p>
            )}
          </div>
        </footer>

        {/* Bottom Sheet */}
        <AttributeBottomSheet
          isOpen={bottomSheetOpen}
          attribute={selectedAttribute}
          onClose={() => setBottomSheetOpen(false)}
        />
      </div>
    </div>
  );
}
