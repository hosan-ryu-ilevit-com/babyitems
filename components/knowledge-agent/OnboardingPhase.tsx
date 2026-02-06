'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
            className="w-full max-w-sm flex flex-col min-h-[400px]"
          >
            <div className="flex-1">
              {/* 질문 */}
              <div className="mb-6">
                <h2 className="text-[18px] font-semibold text-gray-900 leading-snug break-keep mb-2">
                  기존 제품의 불편했던 점이 있나요? <span className="text-blue-500">*</span>
                </h2>
                <p className="text-[16px] font-medium text-gray-600 leading-[1.4]">
                  선택하신 내용을 바탕으로 더 나은 제품을 추천해드릴게요
                </p>
              </div>

              {/* 복수 선택 가능 안내 텍스트 */}
              <div className="mb-4">
                <span className="text-[14px] text-gray-400 font-medium">복수 선택 가능</span>
              </div>

              {/* 옵션 목록 */}
              <div className="space-y-2 mb-4">
                {isLoadingOptions ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                  </div>
                ) : (
                  <>
                    {replaceOptions.map((reason) => {
                      // "상관없어요"가 선택되었는지 확인
                      const hasNotCareSelected = replaceReasons.includes('상관없어요');
                      // 다른 옵션이 선택되었는지 확인
                      const hasOtherSelected = replaceReasons.some(r => r !== '상관없어요');

                      return (
                        <ReasonCheckbox
                          key={reason}
                          label={reason}
                          checked={replaceReasons.includes(reason)}
                          onChange={() => toggleReason(reason)}
                          disabled={hasNotCareSelected}
                        />
                      );
                    })}

                    {/* 상관없어요 버튼 */}
                    <ReasonCheckbox
                      label="상관없어요"
                      checked={replaceReasons.includes('상관없어요')}
                      onChange={() => toggleReason('상관없어요')}
                      disabled={replaceReasons.some(r => r !== '상관없어요')}
                    />
                  </>
                )}

                {/* 기타 입력 */}
                {!showOtherInput ? (
                  <div
                    className="w-full py-4 px-5 relative transition-all cursor-pointer hover:bg-gray-50"
                    style={{
                      backgroundImage: `url("data:image/svg+xml,%3csvg width='100%25' height='100%25' xmlns='http://www.w3.org/2000/svg'%3e%3crect width='100%25' height='100%25' fill='none' rx='12' ry='12' stroke='%23D1D5DB' stroke-width='2' stroke-dasharray='6%2c 6' stroke-dashoffset='0' stroke-linecap='round'/%3e%3c/svg%3e")`,
                      borderRadius: '12px'
                    }}
                    onClick={() => setShowOtherInput(true)}
                  >
                    <span className="text-[16px] font-medium text-gray-500">기타 (직접 입력)</span>
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      type="text"
                      value={replaceOther}
                      onChange={(e) => setReplaceOther(e.target.value)}
                      placeholder="불편했던 점을 입력해주세요"
                      className="w-full px-5 py-4 rounded-[12px] border border-gray-200 focus:border-gray-400 focus:outline-none text-[16px]"
                      autoFocus
                    />
                  </div>
                )}
              </div>
            </div>

            {/* 하단 플로팅 바 */}
            <div className="bg-white border-t border-gray-100 p-4 -mx-4 -mb-6 mt-8">
              <div className="flex gap-3 justify-between">
                <motion.button
                  onClick={() => {
                    setStep('situation');
                    setPurchaseSituation(null);
                    setReplaceReasons([]);
                    setReplaceOther('');
                  }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-[100px] shrink-0 py-4 rounded-[12px] text-[16px] font-semibold transition-all flex items-center justify-center bg-gray-100 text-gray-700 hover:bg-gray-200"
                >
                  이전
                </motion.button>
                <motion.button
                  onClick={handleReplaceComplete}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-[100px] shrink-0 py-4 rounded-[12px] text-[16px] font-semibold transition-all flex items-center justify-center bg-gray-900 text-white hover:bg-gray-800"
                >
                  다음
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}

        {/* 첫구매/둘러보기 상황 선택 */}
        {step === 'first_situations' && (
          <motion.div
            key="first_situations"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full max-w-sm flex flex-col min-h-[400px]"
          >
            <div className="flex-1">
              {/* 질문 */}
              <div className="mb-6">
                <h2 className="text-[18px] font-semibold text-gray-900 leading-snug break-keep mb-2">
                  {purchaseSituation === 'first'
                    ? '어떤 상황에서 구매하시나요?'
                    : '어떤 이유로 둘러보고 계신가요?'} <span className="text-blue-500">*</span>
                </h2>
                <p className="text-[16px] font-medium text-gray-600 leading-[1.4]">
                  상황을 알려주시면 더 구체적인 질문을 드릴 수 있어요.
                </p>
              </div>

              {/* 복수 선택 가능 안내 텍스트 */}
              <div className="mb-4">
                <span className="text-[14px] text-gray-400 font-medium">복수 선택 가능</span>
              </div>

              {/* 옵션 목록 */}
              <div className="space-y-2 mb-4">
                {isLoadingOptions ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                  </div>
                ) : (
                  <>
                    {situationOptions.map((situation) => {
                      // "상관없어요"가 선택되었는지 확인
                      const hasNotCareSelected = selectedSituations.includes('상관없어요');

                      return (
                        <ReasonCheckbox
                          key={situation}
                          label={situation}
                          checked={selectedSituations.includes(situation)}
                          onChange={() => toggleSituation(situation)}
                          disabled={hasNotCareSelected}
                        />
                      );
                    })}

                    {/* 상관없어요 버튼 */}
                    <ReasonCheckbox
                      label="상관없어요"
                      checked={selectedSituations.includes('상관없어요')}
                      onChange={() => toggleSituation('상관없어요')}
                      disabled={selectedSituations.some(s => s !== '상관없어요')}
                    />
                  </>
                )}

                {/* 기타 입력 */}
                {!showSituationOtherInput ? (
                  <div
                    className="w-full py-4 px-5 relative transition-all cursor-pointer hover:bg-gray-50"
                    style={{
                      backgroundImage: `url("data:image/svg+xml,%3csvg width='100%25' height='100%25' xmlns='http://www.w3.org/2000/svg'%3e%3crect width='100%25' height='100%25' fill='none' rx='12' ry='12' stroke='%23D1D5DB' stroke-width='2' stroke-dasharray='6%2c 6' stroke-dashoffset='0' stroke-linecap='round'/%3e%3c/svg%3e")`,
                      borderRadius: '12px'
                    }}
                    onClick={() => setShowSituationOtherInput(true)}
                  >
                    <span className="text-[16px] font-medium text-gray-500">기타 (직접 입력)</span>
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      type="text"
                      value={situationOther}
                      onChange={(e) => setSituationOther(e.target.value)}
                      placeholder="상황을 입력해주세요"
                      className="w-full px-5 py-4 rounded-[12px] border border-gray-200 focus:border-gray-400 focus:outline-none text-[16px]"
                      autoFocus
                    />
                  </div>
                )}
              </div>
            </div>

            {/* 하단 플로팅 바 */}
            <div className="bg-white border-t border-gray-100 p-4 -mx-4 -mb-6 mt-8">
              <div className="flex gap-3 justify-between">
                <motion.button
                  onClick={() => {
                    setStep('situation');
                    setPurchaseSituation(null);
                    setSelectedSituations([]);
                    setSituationOther('');
                    setShowSituationOtherInput(false);
                  }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-[100px] shrink-0 py-4 rounded-[12px] text-[16px] font-semibold transition-all flex items-center justify-center bg-gray-100 text-gray-700 hover:bg-gray-200"
                >
                  이전
                </motion.button>
                <motion.button
                  onClick={handleFirstSituationComplete}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-[100px] shrink-0 py-4 rounded-[12px] text-[16px] font-semibold transition-all flex items-center justify-center bg-gray-900 text-white hover:bg-gray-800"
                >
                  다음
                </motion.button>
              </div>
            </div>
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
      className="w-full py-4 px-5 rounded-[12px] border border-gray-100 text-gray-600 hover:border-blue-200 hover:bg-blue-50/30 transition-all text-left bg-white"
    >
      <div className="flex flex-col gap-0.5">
        <span className="text-[16px] font-medium leading-[1.4] text-gray-600">{label}</span>
        <span className="text-[12px] font-medium text-gray-400">{description}</span>
      </div>
    </button>
  );
}

// 불편사항 체크박스
function ReasonCheckbox({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      className={`w-full py-4 px-5 rounded-[12px] border text-left transition-all ${
        disabled
          ? 'bg-gray-50 border-gray-100 opacity-70 cursor-not-allowed'
          : checked
          ? 'bg-blue-50 border-blue-100'
          : 'bg-white border-gray-100 text-gray-600 hover:border-blue-200 hover:bg-blue-50/30'
      }`}
    >
      <span className={`text-[16px] font-medium leading-[1.4] ${disabled ? 'text-gray-400' : checked ? 'text-blue-500' : 'text-gray-600'}`}>
        {label}
      </span>
    </button>
  );
}

export default OnboardingPhase;
