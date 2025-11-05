'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { CaretLeft } from '@phosphor-icons/react/dist/ssr';
import Link from 'next/link';
import { BudgetRange } from '@/types';
import {
  loadSession,
  saveSession,
  saveBudget,
  changePhase
} from '@/lib/utils/session';
import { logPageView, logButtonClick } from '@/lib/logging/clientLogger';

export default function BudgetPage() {
  const router = useRouter();
  const [selectedBudget, setSelectedBudget] = useState<BudgetRange | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    logPageView('budget');

    // Priority 설정이 없으면 priority 페이지로 리다이렉트
    const session = loadSession();
    if (!session.prioritySettings || !session.isQuickRecommendation) {
      router.push('/priority');
    }
  }, [router]);

  const handleBudgetSelect = (budget: BudgetRange) => {
    setSelectedBudget(budget);
  };

  const handleConfirm = () => {
    if (!selectedBudget) return;

    const session = loadSession();
    let updatedSession = saveBudget(session, selectedBudget);
    updatedSession = changePhase(updatedSession, 'result');
    saveSession(updatedSession);

    // 디버깅 로그
    console.log('💰 Budget selected and saved:');
    console.log('  Budget:', selectedBudget);
    console.log('  Priority Settings:', updatedSession.prioritySettings);
    console.log('  isQuickRecommendation:', updatedSession.isQuickRecommendation);
    console.log('  Session state:', {
      budget: updatedSession.budget,
      prioritySettings: updatedSession.prioritySettings,
      isQuickRecommendation: updatedSession.isQuickRecommendation,
    });

    logButtonClick(`예산 확정: ${selectedBudget}`, 'budget');

    // Result 페이지로 이동
    router.push('/result');
  };

  if (!mounted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100">
        <div className="relative w-full max-w-[480px] min-h-screen bg-white shadow-lg" />
      </div>
    );
  }

  const budgetOptions: { value: BudgetRange; label: string; description: string }[] = [
    {
      value: '0-50000',
      label: '5만원 이하',
      description: '가성비를 중시하시는 분'
    },
    {
      value: '50000-100000',
      label: '5~10만원',
      description: '합리적인 가격대'
    },
    {
      value: '100000-150000',
      label: '10~15만원',
      description: '프리미엄 제품 선호'
    },
    {
      value: '150000+',
      label: '15만원 이상',
      description: '최고급 제품 선호'
    }
  ];

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100">
      <div className="relative w-full max-w-[480px] min-h-screen bg-white shadow-lg flex flex-col">
        {/* Header */}
        <header className="sticky top-0 left-0 right-0 bg-white border-b border-gray-200 px-6 py-4 z-10">
          <div className="flex items-center justify-between mb-4">
            <Link href="/priority" className="text-gray-600 hover:text-gray-900 transition-colors">
              <CaretLeft size={24} weight="bold" />
            </Link>
            <h1 className="text-lg font-bold text-gray-900">예산 범위 선택</h1>
            <div className="w-6"></div>
          </div>
          <p className="text-sm text-gray-600 leading-relaxed">
            생각하시는 예산 범위를 선택해주세요. 선택하신 예산 내에서 최적의 제품을 찾아드릴게요.
          </p>
        </header>

        {/* Content */}
        <main className="flex-1 px-6 py-8 pb-40">
          <div className="space-y-4">
            {budgetOptions.map((option, index) => (
              <motion.button
                key={option.value}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
                onClick={() => handleBudgetSelect(option.value)}
                className={`
                  w-full p-6 rounded-2xl border-2 transition-all text-left
                  ${
                    selectedBudget === option.value
                      ? 'border-gray-900 bg-gray-50'
                      : 'border-gray-300 bg-white hover:border-gray-400'
                  }
                `}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xl font-bold text-gray-900">
                    {option.label}
                  </span>
                  {selectedBudget === option.value && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="w-6 h-6 bg-gray-900 rounded-full flex items-center justify-center"
                    >
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </motion.div>
                  )}
                </div>
                <p className="text-sm text-gray-600">{option.description}</p>
              </motion.button>
            ))}
          </div>
        </main>

        {/* Footer */}
        <footer className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-4 z-10"
          style={{ maxWidth: '480px', margin: '0 auto' }}
        >
          <motion.button
            whileHover={selectedBudget ? { scale: 1.02 } : {}}
            whileTap={selectedBudget ? { scale: 0.98 } : {}}
            onClick={handleConfirm}
            disabled={!selectedBudget}
            className={`
              w-full h-14 rounded-2xl font-semibold text-base transition-all
              ${
                selectedBudget
                  ? 'bg-gray-900 text-white hover:bg-gray-800'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }
            `}
          >
            추천 받기
          </motion.button>
        </footer>
      </div>
    </div>
  );
}
