'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Checks } from '@phosphor-icons/react/dist/ssr';
import type { BabyInfo, OnboardingData } from '@/lib/knowledge-agent/types';

interface BasicInfoSummaryCardProps {
  babyInfo?: BabyInfo | null;
  onboardingData?: OnboardingData | null;
  parentCategory?: 'baby' | 'living';
}

export function BasicInfoSummaryCard({
  babyInfo,
  onboardingData,
  parentCategory,
}: BasicInfoSummaryCardProps) {
  const infoChips = useMemo(() => {
    const chips: string[] = [];

    // Baby info (baby 카테고리만)
    if (parentCategory === 'baby' && babyInfo) {
      if (babyInfo.isBornYet && babyInfo.calculatedMonths !== undefined) {
        chips.push(`${babyInfo.calculatedMonths}개월`);
      } else if (!babyInfo.isBornYet && babyInfo.expectedDate) {
        const today = new Date();
        const expected = new Date(babyInfo.expectedDate);
        const diffDays = Math.ceil((expected.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        chips.push(diffDays > 0 ? `D-${diffDays}` : `D+${Math.abs(diffDays)}`);
      }
      if (babyInfo.gender && babyInfo.gender !== 'unknown') {
        chips.push(babyInfo.gender === 'male' ? '남아' : '여아');
      }
    }

    // 구매맥락
    if (onboardingData) {
      const situationMap: Record<string, string> = {
        first: '첫구매',
        replace: '교체',
        gift: '둘러보기',
      };
      chips.push(situationMap[onboardingData.purchaseSituation] || onboardingData.purchaseSituation);

      // 온보딩 상세 (교체 사유 / 구매 상황)
      if (onboardingData.replaceReasons && onboardingData.replaceReasons.length > 0) {
        chips.push(...onboardingData.replaceReasons);
      }
      if (onboardingData.replaceOther) {
        chips.push(onboardingData.replaceOther);
      }
      if (onboardingData.firstSituations && onboardingData.firstSituations.length > 0) {
        chips.push(...onboardingData.firstSituations);
      }
      if (onboardingData.firstSituationOther) {
        chips.push(onboardingData.firstSituationOther);
      }
    }

    return chips;
  }, [babyInfo, onboardingData, parentCategory]);

  if (infoChips.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.15 }}
      className="bg-gray-50 rounded-[16px] px-5 py-4 mt-3"
    >
      <div className="flex items-center gap-1.5 justify-center mb-1.5">
        <Checks size={20} weight="bold" className="text-blue-500 shrink-0" />
        <span className="text-[15px] font-bold text-blue-500">기본 정보 반영 완료</span>
      </div>
      <p className="text-[14px] text-gray-500 font-medium leading-[1.6] text-center">
        {infoChips.join(', ')}
      </p>
    </motion.div>
  );
}
