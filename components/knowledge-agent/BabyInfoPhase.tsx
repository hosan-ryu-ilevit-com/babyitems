'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence, Variants } from 'framer-motion';
import { Baby, Calendar, Check, Smiley } from '@phosphor-icons/react/dist/ssr';
import type { BabyInfo } from '@/lib/knowledge-agent/types';
import { logKABabyInfoCompleted } from '@/lib/logging/clientLogger';

interface BabyInfoPhaseProps {
  onComplete: (data: BabyInfo | null) => void;
  onBack?: () => void;
  categoryName: string;
  categoryKey?: string;
}

const STORAGE_KEY = 'babyitem_baby_info';

// --- Utility Functions ---

function calculateMonths(birthDate: string): number {
  const birth = new Date(birthDate);
  const now = new Date();
  const months = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
  return Math.max(0, months);
}

function calculateYears(months: number): number {
  return Math.floor(months / 12);
}

function getAgeDisplayText(months: number): string {
  const years = calculateYears(months);
  if (years === 0) return `${months}개월`;
  return `${months}개월 (만 ${years}세)`;
}

function calculateDDay(expectedDate: string): number {
  const expected = new Date(expectedDate);
  const now = new Date();
  expected.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  const diffTime = expected.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function getDDayDisplayText(expectedDate: string): string {
  const dDay = calculateDDay(expectedDate);
  if (dDay === 0) return 'D-Day';
  if (dDay > 0) return `D-${dDay}`;
  return `D+${Math.abs(dDay)}`;
}

function loadSavedBabyInfo(): BabyInfo | null {
  if (typeof window === 'undefined') return null;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const data = JSON.parse(saved) as BabyInfo;
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

function saveBabyInfo(data: BabyInfo) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('Failed to save baby info:', e);
  }
}

// --- Animation Variants ---

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.1,
    },
  },
  exit: { opacity: 0, y: -10, transition: { duration: 0.2 } },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } },
};

// --- Main Component ---

export function BabyInfoPhase({ onComplete, onBack, categoryName, categoryKey }: BabyInfoPhaseProps) {
  const [step, setStep] = useState<'loading' | 'check_saved' | 'born_yet' | 'date' | 'date_gender'>('loading');
  const [savedInfo, setSavedInfo] = useState<BabyInfo | null>(null);

  // Data State
  const [gender, setGender] = useState<'male' | 'female' | 'unknown' | null>(null);
  const [isBornYet, setIsBornYet] = useState<boolean | null>(null);
  const [birthDate, setBirthDate] = useState('');
  const [expectedDate, setExpectedDate] = useState('');

  useEffect(() => {
    const saved = loadSavedBabyInfo();
    if (saved) {
      setSavedInfo(saved);
      setStep('check_saved');
    } else {
      setStep('born_yet');
    }
  }, []);

  const handleUseSavedInfo = () => {
    if (savedInfo) {
      if (categoryKey) {
        logKABabyInfoCompleted(categoryKey, savedInfo, true);
      }
      onComplete(savedInfo);
    }
  };

  const handleNewInput = () => {
    setStep('born_yet');
  };

  const handleExpectedDateComplete = () => {
    const data: BabyInfo = { isBornYet: false, expectedDate };
    saveBabyInfo(data);
    if (categoryKey) {
      logKABabyInfoCompleted(categoryKey, data, false);
    }
    onComplete(data);
  };

  const handleBirthDateGenderComplete = () => {
    const data: BabyInfo = {
      gender: gender || undefined,
      isBornYet: true,
      birthDate,
      calculatedMonths: birthDate ? calculateMonths(birthDate) : undefined,
    };
    saveBabyInfo(data);
    if (categoryKey) {
      logKABabyInfoCompleted(categoryKey, data, false);
    }
    onComplete(data);
  };

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
    <div className="flex flex-col items-center justify-center min-h-[500px] px-2 pb-[140px] bg-white relative overflow-hidden">
      {/* Background Decoration Removed */}


      <AnimatePresence mode="wait">
        {step === 'loading' && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center justify-center"
          >
            <div className="w-10 h-10 border-4 border-orange-100 border-t-orange-400 rounded-full animate-spin" />
          </motion.div>
        )}

        {step === 'check_saved' && savedInfo && (
          <>
            <motion.div
              key="check_saved"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="w-full max-w-sm relative z-10"
            >
              <motion.div variants={itemVariants} className="text-center mb-8">
              
                <p className="text-gray-500 text-m leading-6 font-semibold">
                  <span className="font-bold text-gray-700">{categoryName}</span> 추천을 위해<br/>
                  기존 아이 정보를 사용할까요?
                </p>
              </motion.div>

              <motion.div variants={itemVariants} className="mb-10">
                <motion.button
                  type="button"
                  onClick={handleNewInput}
                  whileTap={{ scale: 0.98 }}
                  className="w-full flex flex-col items-center justify-center gap-2 p-8 rounded-[18px] border-2 border-stone-100 bg-gradient-to-br from-orange-50/30 to-white hover:border-stone-200 hover:bg-orange-50/40 transition-all"
                >
                  <div className="text-orange-300">
                    <Baby size={30} weight="fill" />
                  </div>
                  <p className="text-base font-semibold text-gray-800">
                    {getSavedInfoText(savedInfo)}
                  </p>
                  <span className="text-sm font-semibold text-gray-400 mt-2 -mb-1 underline">
                    변경하기
                  </span>
                </motion.button>
              </motion.div>
            </motion.div>

            {/* 하단 고정 바 */}
            <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] px-4 pb-6 pt-4 z-[60]">
              <div className="relative flex gap-3 justify-between bg-white rounded-[12px] p-2">
                {onBack && (
                  <motion.button
                    onClick={onBack}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="w-[100px] shrink-0 py-4 rounded-[12px] text-[16px] font-semibold transition-all flex items-center justify-center bg-gray-100 text-gray-700 hover:bg-gray-200"
                  >
                    이전
                  </motion.button>
                )}
                <motion.button
                  onClick={handleUseSavedInfo}
                  whileTap={{ scale: 0.98 }}
                  className="flex-1 py-4 rounded-[12px] bg-stone-900 text-white text-[16px] font-semibold hover:bg-stone-800 transition-all"
                >
                  네, 이 정보로 시작하기
                </motion.button>
              </div>
            </div>
          </>
        )}

        {step === 'born_yet' && (
          <>
            <motion.div
              key="born_yet"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="w-full max-w-sm relative z-10"
            >
              <motion.div variants={itemVariants} className="text-center mb-10">
                <h2 className="text-xl font-bold text-gray-800 mb-1 tracking-tight">
                  아이 정보를 등록해주세요
                </h2>
                <p className="text-gray-400 text-s font-semibold">
                  한 번만 등록하면 자동으로 저장돼요
                </p>
              </motion.div>

              <motion.div variants={itemVariants} className="flex flex-col gap-3">
                <SelectionCard
                  onClick={() => {
                    setIsBornYet(true);
                    setStep('date_gender');
                  }}
                  icon={<Smiley size={24} weight="fill" />}
                  label="태어났어요"
                  color="orange"
                />
                <SelectionCard
                  onClick={() => {
                    setIsBornYet(false);
                    setStep('date');
                  }}
                  icon={<Calendar size={24} weight="fill" />}
                  label="아직 뱃속에 있어요"
                  color="blue"
                />
              </motion.div>

              <motion.div variants={itemVariants} className="mt-6 text-center">
                <button
                  onClick={() => onComplete(null)}
                  className="text-s font-semibold text-gray-500 hover:text-gray-600 transition-colors"
                >
                  건너뛰기
                </button>
              </motion.div>
            </motion.div>

            {/* 하단 고정 바 */}
            <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] px-4 pb-6 pt-4 z-50">
              {/* Gradient Overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-white via-white/95 to-transparent z-0" />

              <div className="relative z-10 flex gap-3 justify-between bg-white rounded-[12px] p-2">
                <motion.button
                  onClick={() => {
                    if (savedInfo) {
                      setStep('check_saved');
                    } else if (onBack) {
                      onBack();
                    }
                  }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-[100px] shrink-0 py-4 rounded-[12px] text-[16px] font-semibold transition-all flex items-center justify-center bg-gray-100 text-gray-700 hover:bg-gray-200"
                >
                  이전
                </motion.button>
                <div />
              </div>
            </div>
          </>
        )}

        {step === 'date' && (
          <motion.div
            key="date"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="w-full max-w-sm relative z-10"
          >
            <motion.div variants={itemVariants} className="text-center mb-10">
              
              <h2 className="text-xl font-bold text-gray-800 mb-1">
                출산예정일을 알려주세요
              </h2>
              <p className="text-gray-500">
                더 정확한 추천을 해드릴 수 있어요
              </p>
            </motion.div>

            <motion.div variants={itemVariants} className="space-y-6">
              <div className="relative">
                <input
                  type="date"
                  value={expectedDate}
                  onChange={(e) => setExpectedDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className={`w-full px-6 py-5 rounded-[20px] bg-white border-2 border-stone-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 text-center text-[16px] font-bold text-gray-800 outline-none transition-all ${!expectedDate ? 'date-empty' : ''}`}
                />
                {!expectedDate && (
                  <span className="date-placeholder pointer-events-none absolute inset-0 flex items-center justify-center text-[16px] font-bold text-gray-400">
                    연도. 월. 일
                  </span>
                )}
                {expectedDate && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="absolute -bottom-10 left-0 right-0 text-center"
                  >
                    <span className="inline-flex items-center gap-2 px-4 py-1.5 bg-black/70 text-white rounded-full text-sm font-semibold">
                      출산까지 {getDDayDisplayText(expectedDate)}
                    </span>
                  </motion.div>
                )}
              </div>
            </motion.div>

            <NextButton
              onClick={handleExpectedDateComplete}
              disabled={!expectedDate}
              onBack={() => setStep('born_yet')}
            />
          </motion.div>
        )}

        {step === 'date_gender' && (
          <motion.div
            key="date_gender"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="w-full max-w-sm relative z-10"
          >
            <motion.div variants={itemVariants} className="text-center mb-8">
              <h2 className="text-xl font-bold text-gray-800 mb-1">
                출생일과 성별을 입력해주세요
              </h2>
              <p className="text-gray-500">
                더 정확한 추천을 해드릴 수 있어요
              </p>
            </motion.div>

            <motion.div variants={itemVariants} className="space-y-8">
              {/* Gender Section */}
              <div className="space-y-3">
                <label className="block text-sm font-semibold text-gray-400 ml-1">성별</label>
                <div className="grid grid-cols-2 gap-3">
                  <GenderButton
                    label="남자"
                    selected={gender === 'male'}
                    onClick={() => setGender('male')}
                    color="blue"
                  />
                  <GenderButton
                    label="여자"
                    selected={gender === 'female'}
                    onClick={() => setGender('female')}
                    color="blue"
                  />
                </div>
              </div>

              {/* Date Section */}
              <div className="space-y-3">
                <label className="block text-sm font-semibold text-gray-400 ml-1">생년월일</label>
                <div className="relative">
                  <input
                    type="date"
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    max={new Date().toISOString().split('T')[0]}
                    className={`w-full px-6 py-5 rounded-[20px] bg-white border-2 border-gray-200 focus:border-orange-500 focus:ring-4 focus:ring-orange-100 text-center text-[16px] font-bold text-gray-800 outline-none transition-all ${!birthDate ? 'date-empty' : ''}`}
                  />
                  {!birthDate && (
                    <span className="date-placeholder pointer-events-none absolute inset-0 flex items-center justify-center text-[16px] font-bold text-gray-400">
                      연도. 월. 일
                    </span>
                  )}
                  {birthDate && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="absolute -bottom-10 left-0 right-0 text-center"
                    >
                      <span className="inline-flex items-center gap-2 px-4 py-1.5 bg-black/80 text-white rounded-full text-sm font-semibold mt-2">
                        {getAgeDisplayText(calculateMonths(birthDate))}
                      </span>
                    </motion.div>
                  )}
                </div>
              </div>
            </motion.div>

            <NextButton
              onClick={handleBirthDateGenderComplete}
              disabled={!birthDate}
              onBack={() => setStep('born_yet')}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Sub Components ---

interface SelectionCardProps {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  color: 'orange' | 'blue';
}

function SelectionCard({ onClick, icon, label, color }: SelectionCardProps) {
  const isOrange = color === 'orange';

  const defaultGradient = isOrange
    ? 'bg-gradient-to-br from-orange-50/30 to-white'
    : 'bg-gradient-to-br from-blue-50/30 to-white';
  const defaultIconColor = isOrange ? 'text-orange-300' : 'text-blue-300';
  const defaultIconHoverColor = isOrange ? 'group-hover:text-orange-400' : 'group-hover:text-blue-400';

  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
      className={`relative flex flex-col items-center justify-center gap-2 p-4 rounded-[18px] border-2 border-stone-100 hover:border-stone-200 transition-all duration-300 group overflow-hidden ${defaultGradient}`}
    >
      <div className="relative z-10">
        {React.cloneElement(icon as React.ReactElement<{ className?: string }>, {
          className: `transition-colors duration-300 ${defaultIconColor} ${defaultIconHoverColor}`
        })}
      </div>

      <div className="text-center relative z-10">
        <span className="block text-base font-semibold leading-tight text-gray-800">
          {label}
        </span>
      </div>
    </motion.button>
  );
}

function GenderButton({ label, selected, onClick, color }: any) {
  const isPink = color === 'pink';
  const activeClass = isPink
    ? 'bg-pink-50 ring-2 ring-pink-400 text-pink-900'
    : 'bg-blue-50 ring-2 ring-blue-400 text-blue-900';

  return (
    <button
      onClick={onClick}
      className={`py-4 px-6 rounded-[16px] font-bold text-lg transition-all duration-200
        ${selected
          ? activeClass
          : 'bg-[#FDFBF7] text-stone-500 border border-stone-100 hover:bg-[#F7F5F0]'
        }`}
    >
      {label}
    </button>
  );
}

function NextButton({ onClick, disabled, onBack }: any) {
  return (
    <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] px-4 pb-6 pt-4 z-50">
      {/* Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-white via-white/95 to-transparent z-0" />

      <div className="relative z-10 flex gap-3 justify-between bg-white rounded-[12px] p-2">
        {onBack && (
          <motion.button
            onClick={onBack}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="w-[100px] shrink-0 py-4 rounded-[12px] text-[16px] font-semibold transition-all flex items-center justify-center bg-gray-100 text-gray-700 hover:bg-gray-200"
          >
            이전
          </motion.button>
        )}

        <motion.button
          onClick={onClick}
          disabled={disabled}
          whileHover={!disabled ? { scale: 1.02 } : {}}
          whileTap={!disabled ? { scale: 0.98 } : {}}
          className={`w-[100px] shrink-0 py-4 rounded-[12px] text-[16px] font-semibold transition-all flex items-center justify-center
            ${!disabled
              ? 'bg-gray-900 text-white hover:bg-gray-800'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
        >
          다음
        </motion.button>
      </div>
    </div>
  );
}

export default BabyInfoPhase;
