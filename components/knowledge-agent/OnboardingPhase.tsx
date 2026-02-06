'use client';

import { useState, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
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
  const [addedReplaceOther, setAddedReplaceOther] = useState<string | null>(null);
  const [isLoadingOptions, setIsLoadingOptions] = useState(false);
  const [replaceOptions, setReplaceOptions] = useState<string[]>(DEFAULT_REPLACE_REASONS.default);

  // 첫구매/둘러보기 상황 옵션 (복수선택)
  const [situationOptions, setSituationOptions] = useState<string[]>([]);
  const [selectedSituations, setSelectedSituations] = useState<string[]>([]);
  const [situationOther, setSituationOther] = useState('');
  const [showSituationOtherInput, setShowSituationOtherInput] = useState(false);
  const [addedSituationOther, setAddedSituationOther] = useState<string | null>(null);

  // Input refs for manual focus
  const replaceOtherInputRef = useRef<HTMLInputElement>(null);
  const situationOtherInputRef = useRef<HTMLInputElement>(null);

  const activateReplaceOtherInput = () => {
    if (showOtherInput) return;
    // Keep focus within the user gesture on mobile.
    flushSync(() => setShowOtherInput(true));
    const inputEl = replaceOtherInputRef.current;
    if (inputEl) {
      inputEl.focus();
      inputEl.click();
    }
  };

  const activateSituationOtherInput = () => {
    if (showSituationOtherInput) return;
    // Keep focus within the user gesture on mobile.
    flushSync(() => setShowSituationOtherInput(true));
    const inputEl = situationOtherInputRef.current;
    if (inputEl) {
      inputEl.focus();
      inputEl.click();
    }
  };

  useEffect(() => {
    if (!showOtherInput) return;
    const inputEl = replaceOtherInputRef.current;
    if (!inputEl) return;
    const rafId = requestAnimationFrame(() => inputEl.focus());
    return () => cancelAnimationFrame(rafId);
  }, [showOtherInput]);

  useEffect(() => {
    if (!showSituationOtherInput) return;
    const inputEl = situationOtherInputRef.current;
    if (!inputEl) return;
    const rafId = requestAnimationFrame(() => inputEl.focus());
    return () => cancelAnimationFrame(rafId);
  }, [showSituationOtherInput]);

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
    onComplete({
      purchaseSituation: purchaseSituation!,
      firstSituations: selectedSituations.length > 0 ? selectedSituations : undefined,
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
    onComplete({
      purchaseSituation: 'replace',
      replaceReasons: replaceReasons.length > 0 ? replaceReasons : undefined,
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
    <div className="flex flex-col items-center justify-start min-h-[400px] pt-4">
      <AnimatePresence mode="wait">
        {step === 'situation' && (
          <>
            <motion.div
              key="situation"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-sm"
            >
              {/* 질문 */}
              <div className="mb-8">
                <h2 className="text-[18px] font-semibold text-gray-900 leading-snug break-keep mb-2">
                  {categoryName} 추천받기, <br></br>지금 어떤 상황이신가요? <span className="text-blue-500">*</span>
                </h2>
                <span className='text-gray-500'>더 정확한 추천을 위해 필요해요</span>
              </div>

              {/* 선택 옵션 */}
              <div className="space-y-3">
                <SituationButton
                  label="처음으로 구매해요 🌱  "
                  description="첫 구매라 잘 모르시는 분"
                  onClick={() => handleSituationSelect('first')}
                />
                <SituationButton
                  label=" 다른 걸로 바꿔보려고요 🛍️  "
                  description=" 쓰던 것보다 나은 상품을 찾고 싶으신 분"
                  onClick={() => handleSituationSelect('replace')}
                />
                <SituationButton
                  label="그냥 둘러보려구요 👀  "
                  description="당장 구매 계획이 없으신 분"
                  onClick={() => handleSituationSelect('gift')}
                />
              </div>
            </motion.div>

            {/* 하단 고정 바 */}
            <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] px-4 pb-6 pt-4 z-50">
              {/* 그라데이션 배경 - 뒤쪽 */}
              <div className="absolute inset-0 bg-gradient-to-t from-white via-white/95 to-transparent -z-10" />

              {/* 버튼 컨테이너 - 앞쪽 */}
              <div className="relative flex gap-3 justify-between bg-white rounded-[12px] p-2">
                {onBack ? (
                  <motion.button
                    onClick={onBack}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="w-[100px] shrink-0 py-4 rounded-[12px] text-[16px] font-semibold transition-all flex items-center justify-center bg-gray-100 text-gray-700 hover:bg-gray-200"
                  >
                    이전
                  </motion.button>
                ) : (
                  <div />
                )}
                <div /> {/* 다음 버튼 자리 (선택 시 자동 이동) */}
              </div>
            </div>
          </>
        )}

        {step === 'replace_reasons' && (
          <>
            <motion.div
              key="replace_reasons"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-sm"
            >
              {/* 질문 */}
              <div className="mb-4">
                <h2 className="text-[18px] font-semibold text-gray-900 leading-snug break-keep mb-1 mt-4">
                  쓰시던 상품의 단점을 알려주세요 <span className="text-blue-500">*</span>
                </h2>
                <p className="text-[16px] font-medium text-gray-500 leading-[1.4]">
                  더 나은 제품을 추천해드릴게요
                </p>
              </div>

              {/* 복수 선택 가능 안내 텍스트 */}
              <div className="mb-4">
                <span className="text-[14px] text-gray-400 font-medium">복수 선택 가능</span>
              </div>

              {/* 옵션 목록 */}
              <AnimatePresence mode="wait">
                {isLoadingOptions ? (
                  <motion.div
                    key="replace-loading"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center justify-center py-8"
                  >
                    <div className="flex gap-1">
                      <motion.div
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                        className="w-1.5 h-1.5 rounded-full bg-gray-400"
                      />
                      <motion.div
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut", delay: 0.2 }}
                        className="w-1.5 h-1.5 rounded-full bg-gray-400"
                      />
                      <motion.div
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
                        className="w-1.5 h-1.5 rounded-full bg-gray-400"
                      />
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="replace-options"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="space-y-2 mb-4"
                  >
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

                    {/* 기타 입력 */}
                    {addedReplaceOther ? (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="w-full py-4 px-5 bg-blue-50 border border-blue-100 rounded-[12px] flex items-center justify-between"
                      >
                        <span className="text-[16px] font-medium text-blue-500">{addedReplaceOther}</span>
                        <button
                          onClick={() => {
                            toggleReason(addedReplaceOther);
                            setAddedReplaceOther(null);
                          }}
                          className="ml-2 p-1 hover:bg-blue-100 rounded-full transition-colors"
                        >
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-blue-400">
                            <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                          </svg>
                        </button>
                      </motion.div>
                    ) : (
                      <div
                        className="w-full py-4 px-5 relative transition-all cursor-pointer hover:bg-gray-50"
                        style={{
                          backgroundImage: `url("data:image/svg+xml,%3csvg width='100%25' height='100%25' xmlns='http://www.w3.org/2000/svg'%3e%3crect width='100%25' height='100%25' fill='none' rx='12' ry='12' stroke='%23D1D5DB' stroke-width='2' stroke-dasharray='6%2c 6' stroke-dashoffset='0' stroke-linecap='round'/%3e%3c/svg%3e")`,
                          borderRadius: '12px'
                        }}
                        onPointerDown={activateReplaceOtherInput}
                        onClick={activateReplaceOtherInput}
                      >
                        <div className="relative" onClick={(e) => e.stopPropagation()}>
                          <input
                            ref={replaceOtherInputRef}
                            type="text"
                            value={replaceOther}
                            onChange={(e) => setReplaceOther(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && replaceOther.trim()) {
                                e.preventDefault();
                                const value = replaceOther.trim();
                                toggleReason(value);
                                setAddedReplaceOther(value);
                                setReplaceOther('');
                                setShowOtherInput(false);
                              } else if (e.key === 'Escape') {
                                setShowOtherInput(false);
                                setReplaceOther('');
                              }
                            }}
                            placeholder="자유롭게 입력하세요"
                            className={`w-full bg-transparent text-[16px] text-gray-700 focus:outline-none pr-[120px] transition-opacity duration-150
                              ${showOtherInput ? 'opacity-100' : 'opacity-0'}`}
                            style={{ pointerEvents: showOtherInput ? 'auto' : 'none' }}
                            autoFocus={showOtherInput}
                          />
                          {/* 버튼 오버레이 */}
                          {!showOtherInput && (
                            <div className="absolute inset-0 flex items-center">
                              <span className="text-[16px] font-medium text-blue-400">기타 - 직접 입력</span>
                            </div>
                          )}

                          {/* 입력 액션 버튼 */}
                          {showOtherInput && (
                            <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                              <button
                                onClick={() => {
                                  setShowOtherInput(false);
                                  setReplaceOther('');
                                }}
                                className="px-3 py-2 rounded-[10px] text-[14px] font-medium text-gray-500 hover:bg-gray-100 transition-all"
                              >
                                취소
                              </button>
                              <motion.button
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => {
                                  if (replaceOther.trim()) {
                                    const value = replaceOther.trim();
                                    toggleReason(value);
                                    setAddedReplaceOther(value);
                                    setReplaceOther('');
                                    setShowOtherInput(false);
                                  }
                                }}
                                disabled={!replaceOther.trim()}
                                className={`px-4 py-2 rounded-[10px] text-[14px] font-semibold transition-all
                                  ${replaceOther.trim()
                                    ? 'bg-gray-900 text-white'
                                    : 'bg-gray-100 text-gray-400'}`}
                              >
                                추가
                              </motion.button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {/* 하단 고정 바 */}
            <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] px-4 pb-6 pt-4 z-50">
              {/* 그라데이션 배경 - 뒤쪽 */}
              <div className="absolute inset-0 bg-gradient-to-t from-white via-white/95 to-transparent -z-10" />

              {/* 버튼 컨테이너 - 앞쪽 */}
              <div className="relative flex gap-3 justify-between bg-white rounded-[12px] p-2">
                <motion.button
                  onClick={() => {
                    setStep('situation');
                    setPurchaseSituation(null);
                    setReplaceReasons([]);
                    setReplaceOther('');
                    setAddedReplaceOther(null);
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
          </>
        )}

        {/* 첫구매/둘러보기 상황 선택 */}
        {step === 'first_situations' && (
          <>
            <motion.div
              key="first_situations"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-sm"
            >
              {/* 질문 */}
              <div className="mb-4 mt-4">
                <h2 className="text-[18px] font-semibold text-gray-900 leading-snug break-keep mb-1">
                  {purchaseSituation === 'first'
                    ? '어떤 상황에서 구매하시나요?'
                    : '어떤 이유로 둘러보고 계신가요?'} <span className="text-blue-500">*</span>
                </h2>
                <p className="text-[16px] font-medium text-gray-600 leading-[1.4]">
                  알려주시면 더 구체적인 질문을 드릴 수 있어요.
                </p>
              </div>

              {/* 복수 선택 가능 안내 텍스트 */}
              <div className="mb-4">
                <span className="text-[14px] text-gray-400 font-medium">복수 선택 가능</span>
              </div>

              {/* 옵션 목록 */}
              <AnimatePresence mode="wait">
                {isLoadingOptions ? (
                  <motion.div
                    key="situation-loading"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center justify-center py-8"
                  >
                    <div className="flex gap-1">
                      <motion.div
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                        className="w-1.5 h-1.5 rounded-full bg-gray-400"
                      />
                      <motion.div
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut", delay: 0.2 }}
                        className="w-1.5 h-1.5 rounded-full bg-gray-400"
                      />
                      <motion.div
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
                        className="w-1.5 h-1.5 rounded-full bg-gray-400"
                      />
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="situation-options"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="space-y-2 mb-4"
                  >
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

                    {/* 기타 입력 */}
                    {addedSituationOther ? (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="w-full py-4 px-5 bg-blue-50 border border-blue-100 rounded-[12px] flex items-center justify-between"
                      >
                        <span className="text-[16px] font-medium text-blue-500">{addedSituationOther}</span>
                        <button
                          onClick={() => {
                            toggleSituation(addedSituationOther);
                            setAddedSituationOther(null);
                          }}
                          className="ml-2 p-1 hover:bg-blue-100 rounded-full transition-colors"
                        >
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-blue-400">
                            <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                          </svg>
                        </button>
                      </motion.div>
                    ) : (
                      <div
                        className="w-full py-4 px-5 relative transition-all cursor-pointer hover:bg-gray-50"
                        style={{
                          backgroundImage: `url("data:image/svg+xml,%3csvg width='100%25' height='100%25' xmlns='http://www.w3.org/2000/svg'%3e%3crect width='100%25' height='100%25' fill='none' rx='12' ry='12' stroke='%23D1D5DB' stroke-width='2' stroke-dasharray='6%2c 6' stroke-dashoffset='0' stroke-linecap='round'/%3e%3c/svg%3e")`,
                          borderRadius: '12px'
                        }}
                        onPointerDown={activateSituationOtherInput}
                        onClick={activateSituationOtherInput}
                      >
                        <div className="relative" onClick={(e) => e.stopPropagation()}>
                          <input
                            ref={situationOtherInputRef}
                            type="text"
                            value={situationOther}
                            onChange={(e) => setSituationOther(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && situationOther.trim()) {
                                e.preventDefault();
                                const value = situationOther.trim();
                                toggleSituation(value);
                                setAddedSituationOther(value);
                                setSituationOther('');
                                setShowSituationOtherInput(false);
                              } else if (e.key === 'Escape') {
                                setShowSituationOtherInput(false);
                                setSituationOther('');
                              }
                            }}
                            placeholder="자유롭게 입력하세요"
                            className={`w-full bg-transparent text-[16px] text-gray-700 focus:outline-none pr-[120px] transition-opacity duration-150
                              ${showSituationOtherInput ? 'opacity-100' : 'opacity-0'}`}
                            style={{ pointerEvents: showSituationOtherInput ? 'auto' : 'none' }}
                            autoFocus={showSituationOtherInput}
                          />
                          {/* 버튼 오버레이 */}
                          {!showSituationOtherInput && (
                            <div className="absolute inset-0 flex items-center">
                              <span className="text-[16px] font-medium text-blue-400">기타 - 직접 입력</span>
                            </div>
                          )}

                          {/* 입력 액션 버튼 */}
                          {showSituationOtherInput && (
                            <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                              <button
                                onClick={() => {
                                  setShowSituationOtherInput(false);
                                  setSituationOther('');
                                }}
                                className="px-3 py-2 rounded-[10px] text-[14px] font-medium text-gray-500 hover:bg-gray-100 transition-all"
                              >
                                취소
                              </button>
                              <motion.button
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => {
                                  if (situationOther.trim()) {
                                    const value = situationOther.trim();
                                    toggleSituation(value);
                                    setAddedSituationOther(value);
                                    setSituationOther('');
                                    setShowSituationOtherInput(false);
                                  }
                                }}
                                disabled={!situationOther.trim()}
                                className={`px-4 py-2 rounded-[10px] text-[14px] font-semibold transition-all
                                  ${situationOther.trim()
                                    ? 'bg-gray-900 text-white'
                                    : 'bg-gray-100 text-gray-400'}`}
                              >
                                추가
                              </motion.button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {/* 하단 고정 바 */}
            <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] px-4 pb-6 pt-4 z-50">
              {/* 그라데이션 배경 - 뒤쪽 */}
              <div className="absolute inset-0 bg-gradient-to-t from-white via-white/95 to-transparent -z-10" />

              {/* 버튼 컨테이너 - 앞쪽 */}
              <div className="relative flex gap-3 justify-between bg-white rounded-[12px] p-2">
                <motion.button
                  onClick={() => {
                    setStep('situation');
                    setPurchaseSituation(null);
                    setSelectedSituations([]);
                    setSituationOther('');
                    setShowSituationOtherInput(false);
                    setAddedSituationOther(null);
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
          </>
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
        <span className="text-[18px] font-bold leading-[1.4] text-gray-600">{label}</span>
        <span className="text-[16px] font-medium text-gray-400 mt-1">{description}</span>
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
