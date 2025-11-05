'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { CaretLeft, Question } from '@phosphor-icons/react/dist/ssr';
import Link from 'next/link';
import { PRIORITY_ATTRIBUTES, ATTRIBUTE_ICONS, AttributeInfo } from '@/data/attributes';
import { PriorityButton } from '@/components/PriorityButton';
import { AttributeBottomSheet } from '@/components/AttributeBottomSheet';
import { PrioritySettings, PriorityLevel } from '@/types';
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

  // 페이지 뷰 로깅
  useEffect(() => {
    logPageView('priority');
  }, []);

  // 6개 모두 선택되었는지 확인
  const allSelected = isPriorityComplete(prioritySettings);

  // '중요함' 개수 카운트
  const highPriorityCount = Object.values(prioritySettings).filter(v => v === 'high').length;

  // 속성 선택 핸들러
  const handleSelect = (attributeKey: string, level: PriorityLevel) => {
    // '중요함'을 선택하려는데 이미 3개가 선택되어 있으면
    if (level === 'high' && highPriorityCount >= 3 && prioritySettings[attributeKey as keyof PrioritySettings] !== 'high') {
      // 알림 메시지 표시 (선택 차단)
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

  // 채팅으로 더 자세히 추천받기
  const handleDetailedRecommendation = () => {
    const session = loadSession();

    // 메시지와 대화 관련 상태 초기화 (Priority 설정은 유지)
    let updatedSession = {
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
      budget: undefined,
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
    const session = loadSession();

    // 메시지와 대화 관련 상태 초기화 (Priority 설정은 유지)
    let updatedSession = {
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
      budget: undefined,
    };

    updatedSession = savePrioritySettings(updatedSession, prioritySettings);
    updatedSession = setQuickRecommendation(updatedSession, true);
    saveSession(updatedSession);

    logButtonClick('바로 추천받기', 'priority');
    router.push('/budget');
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
            분유포트를 고를 때 꼭 확인해야 할 6가지 기준이에요. 더 중요한 기준을 알려주시면, 딱 맞는 제품을 찾아드릴게요.
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
              '중요함' 선택: <strong className="font-bold">{highPriorityCount}/3</strong>
            </span>
            {highPriorityCount === 3 && <span className="ml-auto text-xs">✓ 최대 선택</span>}
          </div>
        </header>

        {/* Scrollable Content */}
        <main className="flex-1 px-6 py-6 pb-40 overflow-y-auto">
          <div className="space-y-8">
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
        </main>

        {/* Footer - 하단 플로팅 고정 */}
        <footer className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-4 z-10"
          style={{ maxWidth: '480px', margin: '0 auto' }}
        >
          <div className="space-y-3">
            <motion.button
              whileHover={allSelected ? { scale: 1.02 } : {}}
              whileTap={allSelected ? { scale: 0.98 } : {}}
              onClick={handleDetailedRecommendation}
              disabled={!allSelected}
              className={`
                w-full h-14 rounded-2xl font-semibold text-base transition-all
                ${
                  allSelected
                    ? 'bg-gray-900 text-white hover:bg-gray-800'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }
              `}
            >
              채팅으로 더 자세히 추천받기
            </motion.button>

            <motion.button
              whileHover={allSelected ? { scale: 1.02 } : {}}
              whileTap={allSelected ? { scale: 0.98 } : {}}
              onClick={handleQuickRecommendation}
              disabled={!allSelected}
              className={`
                w-full h-14 rounded-2xl font-semibold text-base transition-all border-2
                ${
                  allSelected
                    ? 'bg-white text-gray-900 border-gray-900 hover:bg-gray-50'
                    : 'bg-white text-gray-400 border-gray-200 cursor-not-allowed'
                }
              `}
            >
              바로 추천받기
            </motion.button>
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
