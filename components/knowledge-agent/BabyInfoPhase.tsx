'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CaretRight, Baby, Calendar, Check } from '@phosphor-icons/react/dist/ssr';
import type { BabyInfo } from '@/lib/knowledge-agent/types';

interface BabyInfoPhaseProps {
  onComplete: (data: BabyInfo | null) => void;
  onBack?: () => void; // 이전 버튼 (카테고리 선택으로 돌아가기)
  categoryName: string; // 카테고리 이름 (인사 문구에 사용)
}

const STORAGE_KEY = 'babyitem_baby_info';

// 개월수 계산 함수
function calculateMonths(birthDate: string): number {
  const birth = new Date(birthDate);
  const now = new Date();
  const months = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
  return Math.max(0, months);
}

// 만 나이 계산 함수
function calculateYears(months: number): number {
  return Math.floor(months / 12);
}

// 개월수 + 만 나이 표시 텍스트
function getAgeDisplayText(months: number): string {
  const years = calculateYears(months);
  if (years === 0) {
    return `${months}개월`;
  }
  return `${months}개월 (만 ${years}세)`;
}

// D-day 계산 함수 (출산예정일까지 남은 일수)
function calculateDDay(expectedDate: string): number {
  const expected = new Date(expectedDate);
  const now = new Date();
  // 시간 제거하고 날짜만 비교
  expected.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  const diffTime = expected.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

// D-day 표시 텍스트
function getDDayDisplayText(expectedDate: string): string {
  const dDay = calculateDDay(expectedDate);
  if (dDay === 0) {
    return 'D-Day';
  } else if (dDay > 0) {
    return `D-${dDay}`;
  } else {
    return `D+${Math.abs(dDay)}`;
  }
}

// 저장된 정보 불러오기
function loadSavedBabyInfo(): BabyInfo | null {
  if (typeof window === 'undefined') return null;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const data = JSON.parse(saved) as BabyInfo;
      // 개월수 재계산 (시간이 지났을 수 있으므로)
      if (data.birthDate) {
        data.calculatedMonths = calculateMonths(data.birthDate);
      }
      return data;
    }
  } catch (e) {
    console.error('Failed to load baby info:', e);
  }
  return null;
}

// 정보 저장
function saveBabyInfo(data: BabyInfo) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('Failed to save baby info:', e);
  }
}

export function BabyInfoPhase({ onComplete, onBack, categoryName }: BabyInfoPhaseProps) {
  // 새 플로우: check_saved → born_yet → date (미출산) or date_gender (출산)
  const [step, setStep] = useState<'loading' | 'check_saved' | 'born_yet' | 'date' | 'date_gender'>('loading');
  const [savedInfo, setSavedInfo] = useState<BabyInfo | null>(null);

  // 수집 데이터
  const [gender, setGender] = useState<'male' | 'female' | 'unknown' | null>(null);
  const [isBornYet, setIsBornYet] = useState<boolean | null>(null);
  const [birthDate, setBirthDate] = useState('');
  const [expectedDate, setExpectedDate] = useState('');

  // 저장된 정보 확인
  useEffect(() => {
    const saved = loadSavedBabyInfo();
    if (saved) {
      setSavedInfo(saved);
      setStep('check_saved');
    } else {
      // 없으면 바로 born_yet 단계로 (새 플로우: 태어났는지 먼저 물어봄)
      setStep('born_yet');
    }
  }, []);

  // 저장된 정보 사용
  const handleUseSavedInfo = () => {
    if (savedInfo) {
      onComplete(savedInfo);
    }
  };

  // 새로 입력
  const handleNewInput = () => {
    setStep('born_yet');
  };

  // 태어났는지 선택
  const handleBornYetSelect = (born: boolean) => {
    setIsBornYet(born);
    if (born) {
      // 태어났으면 → 생년월일 + 성별 같은 페이지에서 입력
      setStep('date_gender');
    } else {
      // 아직 안 태어났으면 → 출산예정일만 (성별 스킵)
      setStep('date');
    }
  };

  // 출산예정일 입력 완료 (미출산)
  const handleExpectedDateComplete = () => {
    const data: BabyInfo = {
      isBornYet: false,
      expectedDate: expectedDate,
    };

    // 저장
    saveBabyInfo(data);
    onComplete(data);
  };

  // 생년월일 + 성별 입력 완료 (출산)
  const handleBirthDateGenderComplete = () => {
    const data: BabyInfo = {
      gender: gender || undefined,
      isBornYet: true,
      birthDate: birthDate,
      calculatedMonths: birthDate ? calculateMonths(birthDate) : undefined,
    };

    // 저장
    saveBabyInfo(data);
    onComplete(data);
  };

  // 건너뛰기
  const handleSkip = () => {
    onComplete(null);
  };

  // 저장된 정보 표시 텍스트
  const getSavedInfoText = (info: BabyInfo) => {
    const parts: string[] = [];
    if (info.gender === 'male') parts.push('남아');
    else if (info.gender === 'female') parts.push('여아');

    if (info.calculatedMonths !== undefined) {
      parts.push(getAgeDisplayText(info.calculatedMonths));
    } else if (info.expectedDate) {
      parts.push(`출산예정 (${getDDayDisplayText(info.expectedDate)})`);
    }

    return parts.join(' · ') || '저장된 정보';
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] px-4 py-8">
      <AnimatePresence mode="wait">
        {/* 로딩 상태 */}
        {step === 'loading' && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center justify-center"
          >
            <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
          </motion.div>
        )}

        {/* 저장된 정보 확인 */}
        {step === 'check_saved' && savedInfo && (
          <motion.div
            key="check_saved"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full max-w-sm"
          >
            {/* 인사 메시지 */}
            <div className="text-center mb-6">
              <h2 className="text-xl font-bold text-gray-900 mb-2">
                반가워요! 👋
              </h2>
              <p className="text-gray-600">
                <span className="font-semibold text-gray-900">{categoryName}</span> 추천을 도와드릴게요.
              </p>
            </div>

            {/* 저장된 정보 카드 */}
            <div className="text-center mb-8 p-4 bg-blue-50 rounded-2xl">
              <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mx-auto mb-3 shadow-sm">
                <Baby size={24} className="text-blue-500" />
              </div>
              <p className="text-sm text-gray-500 mb-1">저장된 아기 정보가 있어요</p>
              <p className="text-gray-900 font-medium">
                {getSavedInfoText(savedInfo)}
              </p>
            </div>

            <div className="space-y-3">
              <button
                onClick={handleUseSavedInfo}
                className="w-full p-4 rounded-2xl bg-gray-900 text-white font-semibold hover:bg-gray-800 transition-colors flex items-center justify-center gap-2"
              >
                <Check size={20} weight="bold" />
                이 정보로 계속하기
              </button>
              <button
                onClick={handleNewInput}
                className="w-full p-4 rounded-2xl border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 transition-colors"
              >
                새로 입력하기
              </button>
            </div>

            {onBack && (
              <button
                onClick={onBack}
                className="w-full mt-4 py-3 rounded-xl border border-gray-200 text-gray-600 font-medium hover:bg-gray-50 transition-colors"
              >
                이전
              </button>
            )}

            <button
              onClick={handleSkip}
              className="w-full mt-3 py-2 text-sm text-gray-400 hover:text-gray-600 transition-colors"
            >
              건너뛰기
            </button>
          </motion.div>
        )}

        {/* 태어났는지 확인 (새 플로우: 첫 번째 질문) */}
        {step === 'born_yet' && (
          <motion.div
            key="born_yet"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full max-w-sm flex flex-col min-h-[400px]"
          >
            <div className="flex-1">
              <div className="text-center mb-8">
                <h2 className="text-xl font-bold text-gray-900 mb-2">
                  반가워요! 👋
                </h2>
                <p className="text-gray-600">
                  <span className="font-semibold text-gray-900">{categoryName}</span> 추천을 도와드릴게요.
                </p>
                <p className="text-gray-500 mt-3 text-sm">
                  아기가 태어났나요?
                </p>
              </div>

              <div className="space-y-3">
                <button
                  onClick={() => setIsBornYet(true)}
                  className={`w-full py-4 px-5 rounded-[12px] border text-left transition-all ${
                    isBornYet === true
                      ? 'bg-blue-50 border-blue-100'
                      : 'bg-white border-gray-100 text-gray-600 hover:border-blue-200 hover:bg-blue-50/30'
                  }`}
                >
                  <div className="flex flex-col gap-0.5">
                    <span className={`text-[16px] font-medium leading-[1.4] ${isBornYet === true ? 'text-blue-500' : 'text-gray-600'}`}>네, 태어났어요</span>
                    <span className={`text-[12px] font-medium ${isBornYet === true ? 'text-blue-400' : 'text-gray-400'}`}>생년월일과 성별을 입력할게요</span>
                  </div>
                </button>
                <button
                  onClick={() => setIsBornYet(false)}
                  className={`w-full py-4 px-5 rounded-[12px] border text-left transition-all ${
                    isBornYet === false
                      ? 'bg-blue-50 border-blue-100'
                      : 'bg-white border-gray-100 text-gray-600 hover:border-blue-200 hover:bg-blue-50/30'
                  }`}
                >
                  <div className="flex flex-col gap-0.5">
                    <span className={`text-[16px] font-medium leading-[1.4] ${isBornYet === false ? 'text-blue-500' : 'text-gray-600'}`}>아직이에요</span>
                    <span className={`text-[12px] font-medium ${isBornYet === false ? 'text-blue-400' : 'text-gray-400'}`}>출산예정일을 입력할게요</span>
                  </div>
                </button>
              </div>
            </div>

            {/* 하단 플로팅 바 */}
            <div className="bg-white border-t border-gray-100 p-4 -mx-4 -mb-6 mt-8">
              <div className="flex gap-3 justify-between">
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
                <motion.button
                  onClick={() => {
                    if (isBornYet === true) {
                      setStep('date_gender');
                    } else if (isBornYet === false) {
                      setStep('date');
                    }
                  }}
                  disabled={isBornYet === null}
                  whileHover={isBornYet !== null ? { scale: 1.02 } : {}}
                  whileTap={isBornYet !== null ? { scale: 0.98 } : {}}
                  className={`w-[100px] shrink-0 py-4 rounded-[12px] text-[16px] font-semibold transition-all flex items-center justify-center
                    ${isBornYet !== null
                      ? 'bg-gray-900 text-white hover:bg-gray-800'
                      : 'bg-gray-100 text-gray-300 opacity-50 cursor-not-allowed'}`}
                >
                  다음
                </motion.button>
              </div>

              <button
                onClick={handleSkip}
                className="w-full mt-3 py-2 text-sm text-gray-400 hover:text-gray-600 transition-colors"
              >
                건너뛰기
              </button>
            </div>
          </motion.div>
        )}

        {/* 출산예정일만 입력 (미출산 - 성별 스킵) */}
        {step === 'date' && (
          <motion.div
            key="date"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full max-w-sm flex flex-col min-h-[400px]"
          >
            <div className="flex-1">
              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-purple-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Calendar size={32} className="text-purple-500" />
                </div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">
                  출산예정일을 알려주세요
                </h2>
                <p className="text-gray-500 text-sm">
                  예정일에 맞는 제품을 추천해드릴게요
                </p>
              </div>

              <div className="space-y-4">
                <input
                  type="date"
                  value={expectedDate}
                  onChange={(e) => setExpectedDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full px-4 py-4 rounded-2xl border border-gray-200 focus:border-gray-400 focus:outline-none text-center text-lg font-medium"
                />
                {expectedDate && (
                  <div className="text-center mt-2">
                    <span className="inline-flex items-center gap-2 px-4 py-2 bg-pink-50 text-pink-600 rounded-full text-sm font-medium">
                      <Calendar size={16} />
                      출산까지 {getDDayDisplayText(expectedDate)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* 하단 플로팅 바 */}
            <div className="bg-white border-t border-gray-100 p-4 -mx-4 -mb-6 mt-8">
              <div className="flex gap-3 justify-between">
                <motion.button
                  onClick={() => setStep('born_yet')}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-[100px] shrink-0 py-4 rounded-[12px] text-[16px] font-semibold transition-all flex items-center justify-center bg-gray-100 text-gray-700 hover:bg-gray-200"
                >
                  이전
                </motion.button>
                <motion.button
                  onClick={handleExpectedDateComplete}
                  disabled={!expectedDate}
                  whileHover={expectedDate ? { scale: 1.02 } : {}}
                  whileTap={expectedDate ? { scale: 0.98 } : {}}
                  className={`w-[100px] shrink-0 py-4 rounded-[12px] text-[16px] font-semibold transition-all flex items-center justify-center
                    ${expectedDate
                      ? 'bg-gray-900 text-white hover:bg-gray-800'
                      : 'bg-gray-100 text-gray-300 opacity-50 cursor-not-allowed'}`}
                >
                  다음
                </motion.button>
              </div>

              <button
                onClick={handleSkip}
                className="w-full mt-3 py-2 text-sm text-gray-400 hover:text-gray-600 transition-colors"
              >
                건너뛰기
              </button>
            </div>
          </motion.div>
        )}

        {/* 생년월일 + 성별 같은 페이지에서 입력 (출산) */}
        {step === 'date_gender' && (
          <motion.div
            key="date_gender"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full max-w-sm flex flex-col min-h-[400px]"
          >
            <div className="flex-1">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-pink-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Baby size={32} className="text-pink-500" />
                </div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">
                  아기 정보를 알려주세요
                </h2>
                <p className="text-gray-500 text-sm">
                  개월수와 성별에 맞는 제품을 추천해드릴게요
                </p>
              </div>

              {/* 성별 */}
              <div className="mb-5">
                <label className="block text-sm font-semibold text-gray-700 mb-2">성별</label>
                <div className="grid grid-cols-2 gap-2">
                  <GenderButton
                    label="남아"
                    emoji="👶🏻"
                    selected={gender === 'male'}
                    onClick={() => setGender('male')}
                    compact
                  />
                  <GenderButton
                    label="여아"
                    emoji="👶🏻"
                    selected={gender === 'female'}
                    onClick={() => setGender('female')}
                    compact
                  />
                </div>
              </div>

              {/* 생년월일 */}
              <div className="mb-4">
                <label className="block text-sm font-semibold text-gray-700 mb-2">생년월일</label>
                <input
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  max={new Date().toISOString().split('T')[0]}
                  className="w-full px-4 py-4 rounded-2xl border border-gray-200 focus:border-gray-400 focus:outline-none text-center text-lg font-medium"
                />
                {birthDate && (
                  <div className="text-center mt-2">
                    <span className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-full text-sm font-medium">
                      <Baby size={16} />
                      {getAgeDisplayText(calculateMonths(birthDate))}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* 하단 플로팅 바 */}
            <div className="bg-white border-t border-gray-100 p-4 -mx-4 -mb-6 mt-8">
              <div className="flex gap-3 justify-between">
                <motion.button
                  onClick={() => setStep('born_yet')}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-[100px] shrink-0 py-4 rounded-[12px] text-[16px] font-semibold transition-all flex items-center justify-center bg-gray-100 text-gray-700 hover:bg-gray-200"
                >
                  이전
                </motion.button>
                <motion.button
                  onClick={handleBirthDateGenderComplete}
                  disabled={!birthDate}
                  whileHover={birthDate ? { scale: 1.02 } : {}}
                  whileTap={birthDate ? { scale: 0.98 } : {}}
                  className={`w-[100px] shrink-0 py-4 rounded-[12px] text-[16px] font-semibold transition-all flex items-center justify-center
                    ${birthDate
                      ? 'bg-gray-900 text-white hover:bg-gray-800'
                      : 'bg-gray-100 text-gray-300 opacity-50 cursor-not-allowed'}`}
                >
                  다음
                </motion.button>
              </div>

              <button
                onClick={handleSkip}
                className="w-full mt-3 py-2 text-sm text-gray-400 hover:text-gray-600 transition-colors"
              >
                건너뛰기
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// 성별 선택 버튼
function GenderButton({
  label,
  emoji,
  selected,
  onClick,
  compact = false
}: {
  label: string;
  emoji: string;
  selected: boolean;
  onClick: () => void;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <button
        onClick={onClick}
        className={`p-3 rounded-xl border transition-all text-center
          ${selected
            ? 'border-gray-900 bg-gray-900 text-white'
            : 'border-gray-200 hover:border-gray-400 hover:bg-gray-50 text-gray-700'}`}
      >
        <span className="text-lg mb-1 block">{emoji}</span>
        <span className="text-sm font-medium">{label}</span>
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className={`w-full p-4 rounded-2xl border transition-all text-left group flex items-center gap-4
        ${selected
          ? 'border-gray-900 bg-gray-50'
          : 'border-gray-200 hover:border-gray-400 hover:bg-gray-50'}`}
    >
      <span className="text-2xl">{emoji}</span>
      <div className="flex-1">
        <p className={`font-semibold ${selected ? 'text-gray-900' : 'text-gray-700'}`}>{label}</p>
      </div>
      <CaretRight
        size={20}
        className={`transition-colors ${selected ? 'text-gray-900' : 'text-gray-400 group-hover:text-gray-600'}`}
      />
    </button>
  );
}

export default BabyInfoPhase;
