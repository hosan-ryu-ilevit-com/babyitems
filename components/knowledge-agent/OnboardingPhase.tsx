'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, CaretRight, Plus } from '@phosphor-icons/react/dist/ssr';
import type { OnboardingData, BabyInfo } from '@/lib/knowledge-agent/types';

interface OnboardingPhaseProps {
  categoryName: string;
  parentCategory: 'baby' | 'living';
  onComplete: (data: OnboardingData) => void;
  onBack?: () => void; // 이전 버튼 (baby: 아기 정보로, living: 카테고리 선택으로)
  babyInfo?: BabyInfo | null; // 아기 정보 (상황 옵션 생성에 사용)
}

// 카테고리별 기본 불편사항 옵션 (AI 생성 전 fallback)
const DEFAULT_REPLACE_REASONS: Record<string, string[]> = {
  default: [
    '성능이 기대에 못 미쳐서',
    '고장/파손되어서',
    '사용하기 불편해서',
    '디자인이 마음에 안 들어서',
    '더 좋은 제품을 발견해서',
  ],
};

export function OnboardingPhase({ categoryName, parentCategory, onComplete, onBack, babyInfo }: OnboardingPhaseProps) {
  const [step, setStep] = useState<'situation' | 'replace_reasons' | 'first_situations'>('situation');
  const [purchaseSituation, setPurchaseSituation] = useState<'first' | 'replace' | 'gift' | null>(null);
  const [replaceReasons, setReplaceReasons] = useState<string[]>([]);
  const [replaceOther, setReplaceOther] = useState('');
  const [showOtherInput, setShowOtherInput] = useState(false);
  const [isLoadingOptions, setIsLoadingOptions] = useState(false);
  const [replaceOptions, setReplaceOptions] = useState<string[]>(DEFAULT_REPLACE_REASONS.default);

  // 첫구매/둘러보기 상황 옵션 (복수선택)
  const [situationOptions, setSituationOptions] = useState<string[]>([]);
  const [selectedSituations, setSelectedSituations] = useState<string[]>([]);
  const [situationOther, setSituationOther] = useState('');
  const [showSituationOtherInput, setShowSituationOtherInput] = useState(false);

  // 교체 선택 시 불편사항 옵션 로드
  useEffect(() => {
    if (purchaseSituation === 'replace' && step === 'replace_reasons') {
      loadReplaceOptions();
    }
  }, [purchaseSituation, step, categoryName]);

  // 첫구매/둘러보기 선택 시 상황 옵션 로드
  useEffect(() => {
    if ((purchaseSituation === 'first' || purchaseSituation === 'gift') && step === 'first_situations') {
      loadSituationOptions();
    }
  }, [purchaseSituation, step, categoryName]);

  const loadReplaceOptions = async () => {
    setIsLoadingOptions(true);
    try {
      const res = await fetch('/api/knowledge-agent/generate-onboarding-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryName, type: 'replace_reasons' }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.options && data.options.length > 0) {
          setReplaceOptions(data.options);
        }
      }
    } catch (error) {
      console.error('Failed to load replace options:', error);
    } finally {
      setIsLoadingOptions(false);
    }
  };

  const loadSituationOptions = async () => {
    setIsLoadingOptions(true);
    try {
      const res = await fetch('/api/knowledge-agent/generate-onboarding-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryName,
          type: purchaseSituation === 'first' ? 'first_situations' : 'browse_situations',
          babyInfo,
          purchaseSituation,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.options && data.options.length > 0) {
          setSituationOptions(data.options);
        }
      }
    } catch (error) {
      console.error('Failed to load situation options:', error);
    } finally {
      setIsLoadingOptions(false);
    }
  };

  const handleSituationSelect = (situation: 'first' | 'replace' | 'gift') => {
    setPurchaseSituation(situation);

    if (situation === 'replace') {
      // 교체 선택 시 불편사항 수집 단계로
      setStep('replace_reasons');
    } else {
      // 첫구매/둘러보기는 상황 선택 단계로
      setStep('first_situations');
    }
  };

  const handleFirstSituationComplete = () => {
    const finalSituations = [...selectedSituations];
    const finalOther = situationOther.trim();

    onComplete({
      purchaseSituation: purchaseSituation!,
      firstSituations: finalSituations.length > 0 ? finalSituations : undefined,
      firstSituationOther: finalOther || undefined,
    });
  };

  const toggleSituation = (situation: string) => {
    setSelectedSituations(prev =>
      prev.includes(situation)
        ? prev.filter(s => s !== situation)
        : [...prev, situation]
    );
  };

  const handleReplaceComplete = () => {
    const finalReasons = [...replaceReasons];
    const finalOther = replaceOther.trim();

    onComplete({
      purchaseSituation: 'replace',
      replaceReasons: finalReasons.length > 0 ? finalReasons : undefined,
      replaceOther: finalOther || undefined,
    });
  };

  const toggleReason = (reason: string) => {
    setReplaceReasons(prev =>
      prev.includes(reason)
        ? prev.filter(r => r !== reason)
        : [...prev, reason]
    );
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] px-4 py-8">
      <AnimatePresence mode="wait">
        {step === 'situation' && (
          <motion.div
            key="situation"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full max-w-sm"
          >
            {/* 질문 */}
            <div className="text-center mb-8">
              <h2 className="text-xl font-bold text-gray-900">
                {categoryName}을 <br></br>무슨 이유로 추천받으시나요?
              </h2>
            </div>

            {/* 선택 옵션 */}
            <div className="space-y-3">
              <SituationButton
                label="첫 구매에요"
                description="이 제품을 처음 구매하시는 분"
                onClick={() => handleSituationSelect('first')}
              />
              <SituationButton
                label="교체/업그레이드해요"
                description="기존 쓰던게 있지만 바꾸고 싶으신 분"
                onClick={() => handleSituationSelect('replace')}
              />
              <SituationButton
                label="그냥 둘러보러 왔어요"
                description="당장 구매 계획이 없으신 분"
                onClick={() => handleSituationSelect('gift')}
              />
            </div>

            {/* 이전 버튼 */}
            {onBack && (
              <button
                onClick={onBack}
                className="w-full mt-4 py-3 rounded-xl border border-gray-200 text-gray-600 font-medium hover:bg-gray-50 transition-colors"
              >
                이전
              </button>
            )}
          </motion.div>
        )}

        {step === 'replace_reasons' && (
          <motion.div
            key="replace_reasons"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full max-w-sm"
          >
            {/* 질문 */}
            <div className="text-center mb-6">
              <h2 className="text-lg font-bold text-gray-900 mb-2">
                기존 제품의 불편했던 점이 있나요?
              </h2>
              <p className="text-gray-500 text-sm">
                선택하신 내용을 바탕으로 더 나은 제품을 추천해드릴게요
              </p>
            </div>

            {/* 옵션 목록 */}
            <div className="space-y-2 mb-4">
              {isLoadingOptions ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                </div>
              ) : (
                replaceOptions.map((reason) => (
                  <ReasonCheckbox
                    key={reason}
                    label={reason}
                    checked={replaceReasons.includes(reason)}
                    onChange={() => toggleReason(reason)}
                  />
                ))
              )}

              {/* 기타 입력 */}
              {!showOtherInput ? (
                <button
                  onClick={() => setShowOtherInput(true)}
                  className="w-full flex items-center gap-2 px-4 py-3 rounded-xl border border-dashed border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-600 transition-colors"
                >
                  <Plus size={18} />
                  <span className="text-sm">기타 (직접 입력)</span>
                </button>
              ) : (
                <div className="relative">
                  <input
                    type="text"
                    value={replaceOther}
                    onChange={(e) => setReplaceOther(e.target.value)}
                    placeholder="불편했던 점을 입력해주세요"
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-gray-400 focus:outline-none text-sm"
                    autoFocus
                  />
                </div>
              )}
            </div>

            {/* 버튼 */}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setStep('situation');
                  setPurchaseSituation(null);
                  setReplaceReasons([]);
                  setReplaceOther('');
                }}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 font-medium hover:bg-gray-50 transition-colors"
              >
                이전
              </button>
              <button
                onClick={handleReplaceComplete}
                className="flex-1 py-3 rounded-xl bg-gray-900 text-white font-medium hover:bg-gray-800 transition-colors flex items-center justify-center gap-2"
              >
                다음
                <CaretRight size={18} weight="bold" />
              </button>
            </div>

            {/* 스킵 옵션 */}
            <button
              onClick={() => onComplete({ purchaseSituation: 'replace' })}
              className="w-full mt-3 py-2 text-sm text-gray-400 hover:text-gray-600 transition-colors"
            >
              건너뛰기
            </button>
          </motion.div>
        )}

        {/* 첫구매/둘러보기 상황 선택 */}
        {step === 'first_situations' && (
          <motion.div
            key="first_situations"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full max-w-sm"
          >
            {/* 질문 */}
            <div className="text-center mb-6">
              <h2 className="text-lg font-bold text-gray-900 mb-2">
                {purchaseSituation === 'first'
                  ? '어떤 상황에서 구매하시나요?'
                  : '어떤 이유로 둘러보고 계신가요?'}
              </h2>
              <p className="text-gray-500 text-sm">
                상황을 알려주시면 더 구체적인 질문을 드릴 수 있어요.
              </p>
            </div>

            {/* 옵션 목록 */}
            <div className="space-y-2 mb-4">
              {isLoadingOptions ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                </div>
              ) : (
                situationOptions.map((situation) => (
                  <ReasonCheckbox
                    key={situation}
                    label={situation}
                    checked={selectedSituations.includes(situation)}
                    onChange={() => toggleSituation(situation)}
                  />
                ))
              )}

              {/* 기타 입력 */}
              {!showSituationOtherInput ? (
                <button
                  onClick={() => setShowSituationOtherInput(true)}
                  className="w-full flex items-center gap-2 px-4 py-3 rounded-xl border border-dashed border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-600 transition-colors"
                >
                  <Plus size={18} />
                  <span className="text-sm">기타 (직접 입력)</span>
                </button>
              ) : (
                <div className="relative">
                  <input
                    type="text"
                    value={situationOther}
                    onChange={(e) => setSituationOther(e.target.value)}
                    placeholder="상황을 입력해주세요"
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-gray-400 focus:outline-none text-sm"
                    autoFocus
                  />
                </div>
              )}
            </div>

            {/* 버튼 */}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setStep('situation');
                  setPurchaseSituation(null);
                  setSelectedSituations([]);
                  setSituationOther('');
                  setShowSituationOtherInput(false);
                }}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 font-medium hover:bg-gray-50 transition-colors"
              >
                이전
              </button>
              <button
                onClick={handleFirstSituationComplete}
                className="flex-1 py-3 rounded-xl bg-gray-900 text-white font-medium hover:bg-gray-800 transition-colors flex items-center justify-center gap-2"
              >
                다음
                <CaretRight size={18} weight="bold" />
              </button>
            </div>

            {/* 스킵 옵션 */}
            <button
              onClick={() => onComplete({ purchaseSituation: purchaseSituation! })}
              className="w-full mt-3 py-2 text-sm text-gray-400 hover:text-gray-600 transition-colors"
            >
              건너뛰기
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// 상황 선택 버튼
function SituationButton({ label, description, onClick }: { label: string; description: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full p-4 rounded-2xl border border-gray-200 hover:border-gray-400 hover:bg-gray-50 transition-all text-left group"
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold text-gray-900">{label}</p>
          <p className="text-sm text-gray-500 mt-0.5">{description}</p>
        </div>
        <CaretRight size={20} className="text-gray-400 group-hover:text-gray-600 transition-colors" />
      </div>
    </button>
  );
}

// 불편사항 체크박스
function ReasonCheckbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
        checked
          ? 'border-gray-900 bg-gray-50'
          : 'border-gray-200 hover:border-gray-300'
      }`}
    >
      <div
        className={`w-5 h-5 rounded-md flex items-center justify-center transition-colors ${
          checked ? 'bg-gray-900' : 'border border-gray-300'
        }`}
      >
        {checked && <Check size={14} className="text-white" weight="bold" />}
      </div>
      <span className={`text-sm ${checked ? 'text-gray-900 font-medium' : 'text-gray-600'}`}>
        {label}
      </span>
    </button>
  );
}

export default OnboardingPhase;
