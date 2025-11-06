'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { CaretLeft, Question, ChatCircleDots, Lightning } from '@phosphor-icons/react/dist/ssr';
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
  const [prioritySettings, setPrioritySettings] = useState<PrioritySettings>({
    temperatureControl: 'medium',
    hygiene: 'medium',
    material: 'medium',
    usability: 'medium',
    portability: 'medium',
    additionalFeatures: 'medium',
  });
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
            <h1 className="text-lg font-bold text-gray-900">기본 정보 입력</h1>
            <div className="w-6"></div>
          </div>
          <p className="text-sm text-gray-700 leading-5 mb-3 mt-8">
            AI와 채팅하기 전, 가장 중요하게 생각하는 구매 기준을 골라주세요! [중요함]은 3개까지 선택하실 수 있어요.
          </p>
          
        </header>

        {/* Scrollable Content */}
        <main className="flex-1 px-6 py-6 pb-44 overflow-y-auto">
          {/* 6가지 속성 */}
          <div className="space-y-4 mb-12">
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
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md font-bold bg-orange-100 text-orange-700 whitespace-nowrap shrink-0">
                          87%가 중요함 선택
                        </span>
                      )}
                      {attribute.key === 'hygiene' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md font-bold bg-orange-100 text-orange-700 whitespace-nowrap shrink-0">
                          74%가 중요함 선택
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => openBottomSheet(attribute)}
                    className="w-7 h-7 rounded-full bg-white hover:bg-gray-100 transition-colors flex items-center justify-center shrink-0"
                  >
                    <Question size={16} weight="bold" className="text-gray-600" />
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

          {/* 예산 선택 섹션 */}
          <div className="border-t border-gray-200 pt-8">
            <div className="bg-gray-50 rounded-2xl p-4 mb-8">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">💰</span>
                <h3 className="text-sm font-bold text-gray-900">예산</h3>
              </div>
              <p className="text-xs text-gray-600 mb-4">
                 보통 가격대별로 기능 차이가 있어요.
              </p>

              {/* 2x2 Grid for budget buttons */}
              <div className="grid grid-cols-2 gap-2 mb-3">
              <button
                onClick={() => handleBudgetSelect('0-50000')}
                className={`
                  p-3 rounded-xl text-left transition-all border
                  ${budget === '0-50000'
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-900 border-gray-300 hover:border-gray-400'
                  }
                `}
              >
                <div className="font-semibold text-sm mb-0.5">5만원 이하</div>
                <div className={`text-xs ${budget === '0-50000' ? 'text-gray-300' : 'text-gray-500'}`}>
                  기본 기능
                </div>
              </button>

              <button
                onClick={() => handleBudgetSelect('50000-100000')}
                className={`
                  p-3 rounded-xl text-left transition-all border relative
                  ${budget === '50000-100000'
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-900 border-gray-300 hover:border-gray-400'
                  }
                `}
              >
                <div className="flex items-center gap-1 mb-0.5">
                  <span className="font-semibold text-sm">5~10만원</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold ${budget === '50000-100000' ? 'bg-white text-gray-900' : 'bg-blue-100 text-blue-700'}`}>
                    인기
                  </span>
                </div>
                <div className={`text-xs ${budget === '50000-100000' ? 'text-gray-300' : 'text-gray-500'}`}>
                  더 좋은 소재+편의 기능
                </div>
              </button>

              <button
                onClick={() => handleBudgetSelect('100000-150000')}
                className={`
                  p-3 rounded-xl text-left transition-all border
                  ${budget === '100000-150000'
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-900 border-gray-300 hover:border-gray-400'
                  }
                `}
              >
                <div className="font-semibold text-sm mb-0.5">10~15만원</div>
                <div className={`text-xs ${budget === '100000-150000' ? 'text-gray-300' : 'text-gray-500'}`}>
                  프리미엄 기능
                </div>
              </button>

              <button
                onClick={() => handleBudgetSelect('150000+')}
                className={`
                  p-3 rounded-xl text-left transition-all border
                  ${budget === '150000+'
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-900 border-gray-300 hover:border-gray-400'
                  }
                `}
              >
                <div className="font-semibold text-sm mb-0.5">15만원 이상</div>
                <div className={`text-xs ${budget === '150000+' ? 'text-gray-300' : 'text-gray-500'}`}>
                  최고급
                </div>
              </button>
            </div>

            {/* 주관식 입력 - 더 컴팩트하게 */}
            {!isCustomBudgetMode && budget && !['0-50000', '50000-100000', '100000-150000', '150000+'].includes(budget) ? (
              // 커스텀 예산이 선택된 상태 (선택된 것처럼 표시)
              <button
                onClick={handleCustomBudgetClick}
                className="w-full p-3 rounded-xl text-left transition-all border-2 border-gray-900 bg-gray-900 text-white"
              >
                <div className="font-semibold text-sm mb-0.5">직접 입력</div>
                <div className="text-xs text-gray-300">{budget}</div>
              </button>
            ) : !isCustomBudgetMode ? (
              // 아무것도 선택 안 됐거나 고정 버튼 선택된 상태
              <button
                onClick={handleCustomBudgetClick}
                className="w-full p-3 rounded-xl text-left transition-all border border-dashed border-gray-300 hover:border-gray-500 bg-white text-gray-700"
              >
                <div className="font-semibold text-sm">직접 입력하기</div>
              </button>
            ) : (
              // 입력 모드
              <div className="w-full p-3 rounded-xl border border-gray-900 bg-white">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customBudget}
                    onChange={(e) => setCustomBudget(e.target.value)}
                    placeholder="직접 입력 (예: 4만원~6만원)"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 text-sm text-gray-900"
                    autoFocus
                  />
                  <button
                    onClick={handleCustomBudgetSubmit}
                    className="px-4 py-2 bg-gray-900 text-white rounded-lg font-semibold text-sm hover:bg-gray-800 transition-colors"
                  >
                    확인
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-2">
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
                w-full h-14 rounded-2xl font-semibold text-base transition-all flex items-center justify-center gap-2.5
                ${
                  isValidSelection
                    ? 'bg-linear-to-r from-gray-900 to-gray-700 text-white shadow-lg hover:shadow-xl'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }
              `}
            >
              <ChatCircleDots size={24} weight="bold" />
              <span>채팅하고 1분만에 추천받기</span>
            </motion.button>

            <motion.button
              whileHover={isValidSelection ? { scale: 1.02 } : {}}
              whileTap={isValidSelection ? { scale: 0.98 } : {}}
              onClick={handleQuickRecommendation}
              disabled={!isValidSelection}
              className={`
                w-full h-14 rounded-2xl font-semibold text-base transition-all border-2 flex items-center justify-center gap-2.5
                ${
                  isValidSelection
                    ? 'bg-white text-gray-900 border-gray-300 hover:bg-gray-50'
                    : 'bg-white text-gray-400 border-gray-200 cursor-not-allowed'
                }
              `}
            >
              <Lightning size={24} weight="bold" />
              <span>바로 추천받기</span>
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
