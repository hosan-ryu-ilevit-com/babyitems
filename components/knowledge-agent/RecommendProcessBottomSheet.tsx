'use client';

import { useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { FilterTag, RecommendProcessMeta, RecommendProcessMetaItem } from '@/lib/knowledge-agent/types';

interface RecommendProcessBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  processMeta: RecommendProcessMeta | null;
  finalRecommendations?: Array<{
    pcode?: string;
    id?: string;
    name?: string;
    title?: string;
    brand?: string | null;
    thumbnail?: string | null;
    score?: number;
    rank?: number;
    price?: number;
    danawaRank?: number | string | null;
    rating?: number;
    reviewCount?: number;
    specSummary?: string;
    reasoning?: string;
    reviewProof?: string;
    highlights?: string[];
    concerns?: string[];
    bestFor?: string[];
    prosFromReviews?: string[];
    consFromReviews?: string[];
    tagScores?: Record<string, { score: 'full' | 'partial' | null; reason?: string; evidence?: string }>;
    oneLiner?: string;
    recommendationReason?: string;
  }>;
  filterTags?: FilterTag[];
  preferredBrands?: string[];
}

function SectionSummary({
  title,
  passedItems,
  failedItems,
  subtitle,
}: {
  title: string;
  passedItems: RecommendProcessMetaItem[];
  failedItems: RecommendProcessMetaItem[];
  subtitle: string;
}) {
  const passed = passedItems.length;
  const failed = failedItems.length;

  const renderPreview = (items: RecommendProcessMetaItem[], tone: 'blue' | 'red') => {
    const preview = items.slice(0, 3);
    const remains = Math.max(0, items.length - preview.length);
    return (
      <div className="mt-2 flex items-center">
        <div className="flex items-center gap-1">
          {preview.map((item, idx) => (
            <div
              key={`${tone}-${item.pcode}-${idx}`}
              className="w-8 h-8 rounded-[6px] overflow-hidden bg-gray-100 shrink-0"
            >
              {item.thumbnail ? (
                <img src={item.thumbnail} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gray-200" />
              )}
            </div>
          ))}
        </div>
        {remains > 0 && (
          <div
            className={`ml-1 w-8 h-8 rounded-[6px] shrink-0 flex items-center justify-center text-[10px] font-semibold ${
              tone === 'blue' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-600'
            }`}
          >
            +{remains}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src="/icons/ic-ai.svg" alt="" className="w-5 h-5" />
          <h4 className="text-[18px] font-bold text-gray-900">{title}</h4>
        </div>
        <span className="text-[15px] font-semibold text-[#6366F1]">{passed}개</span>
      </div>
      <p className="text-[12px] text-gray-500">{subtitle}</p>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-[12px] bg-blue-50 px-2.5 py-2">
          <p className="text-[11px] font-semibold text-blue-700 flex items-center gap-1">
            <span className="text-blue-500 font-bold text-[16px] leading-none">✓</span>
            통과한 제품
          </p>
          <p className="text-[14px] font-bold text-indigo-700 mt-0.5">{passed}개</p>
          {renderPreview(passedItems, 'blue')}
        </div>
        <div className="rounded-[12px] bg-red-50 px-2.5 py-2">
          <p className="text-[11px] font-semibold text-red-600 flex items-center gap-1">
            <span className="text-red-400 font-bold text-[16px] leading-none">✗</span>
            탈락한 제품
          </p>
          <p className="text-[14px] font-bold text-red-600 mt-0.5">{failed}개</p>
          {renderPreview(failedItems, 'red')}
        </div>
      </div>
    </div>
  );
}

function StageList({
  title,
  items,
  scoreLabel,
}: {
  title: string;
  items: RecommendProcessMetaItem[];
  scoreLabel: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h5 className="text-[14px] font-semibold text-gray-800">{title}</h5>
        <span className="text-[11px] text-gray-500">{items.length}개</span>
      </div>
      <div className="max-h-[220px] overflow-y-auto pr-1 space-y-1.5">
        {items.map((item, idx) => (
          <div key={`${title}-${item.pcode}-${idx}`} className="flex items-center gap-2.5 rounded-[14px] bg-gray-50 p-2.5">
            <div className="w-11 h-11 rounded-[10px] overflow-hidden bg-gray-100 border border-gray-100 shrink-0">
              {item.thumbnail ? (
                <img src={item.thumbnail} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gray-100" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-gray-400 font-medium truncate">{item.brand || '브랜드 미상'}</p>
              <p className="text-[13px] font-semibold text-gray-800 truncate">{item.name}</p>
              <p className="text-[11px] text-gray-500 mt-0.5">
                {scoreLabel} {item.stage1Score}
                {item.stage2Rank ? ` · Top10 ${item.stage2Rank}위` : ''}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RecommendProcessBottomSheet({
  isOpen,
  onClose,
  processMeta,
  finalRecommendations = [],
  filterTags = [],
  preferredBrands = [],
}: RecommendProcessBottomSheetProps) {
  const sortedItems = useMemo(() => {
    if (!processMeta?.items) return [];
    return [...processMeta.items].sort((a, b) => {
      if (a.stage3Passed !== b.stage3Passed) return a.stage3Passed ? -1 : 1;
      if (a.stage2Passed !== b.stage2Passed) return a.stage2Passed ? -1 : 1;
      if (a.stage1Passed !== b.stage1Passed) return a.stage1Passed ? -1 : 1;
      return b.stage1Score - a.stage1Score;
    });
  }, [processMeta]);

  const stage1Items = sortedItems;
  const stage2PassedItems = sortedItems.filter((item) => item.stage2Passed);

  const top5Items = useMemo(() => {
    if (!processMeta) return [];
    const processMap = new Map(processMeta.items.map((item) => [item.pcode, item]));
    return finalRecommendations
      .slice(0, 5)
      .map((rec, idx) => {
        const pcode = String(rec.pcode || rec.id || '');
        const meta = processMap.get(pcode);
        return {
          rank: idx + 1,
          pcode,
          name: rec.name || rec.title || meta?.name || '',
          brand: rec.brand || meta?.brand || null,
          thumbnail: rec.thumbnail || meta?.thumbnail || null,
          score: rec.score ?? meta?.stage1Score ?? 0,
          rank: rec.rank ?? idx + 1,
          price: rec.price,
          danawaRank: rec.danawaRank,
          rating: rec.rating,
          reviewCount: rec.reviewCount,
          specSummary: rec.specSummary,
          reasoning: rec.reasoning || rec.recommendationReason || rec.oneLiner || '',
          reviewProof: rec.reviewProof,
          highlights: rec.highlights || [],
          concerns: rec.concerns || [],
          bestFor: rec.bestFor || [],
          prosFromReviews: rec.prosFromReviews || [],
          consFromReviews: rec.consFromReviews || [],
          tagScores: rec.tagScores || {},
        };
      })
      .filter((item) => item.pcode);
  }, [finalRecommendations, processMeta]);

  const top5ItemsWithTags = useMemo(() => {
    return top5Items.map((item) => {
      const tagScores = item.tagScores || {};
      const fullTags = filterTags
        .filter((tag) => tagScores[tag.id]?.score === 'full')
        .map((tag) => tag.label);
      const partialTags = filterTags
        .filter((tag) => tagScores[tag.id]?.score === 'partial')
        .map((tag) => tag.label);
      const unmetTags = filterTags
        .filter((tag) => tagScores[tag.id]?.score === null)
        .map((tag) => tag.label);

      const preferredBrandMatched =
        preferredBrands.length > 0 &&
        !!item.brand &&
        preferredBrands.some((b) => b.toLowerCase().trim() === String(item.brand).toLowerCase().trim());

      return {
        ...item,
        fullTags,
        partialTags,
        unmetTags,
        preferredBrandMatched,
      };
    });
  }, [filterTags, preferredBrands, top5Items]);

  const stage1PassedItems = sortedItems.filter((item) => item.stage1Passed);
  const stage1FailedItems = sortedItems.filter((item) => !item.stage1Passed);
  const stage2PassedSummaryItems = sortedItems.filter((item) => item.stage2Passed);
  const stage2FailedSummaryItems = sortedItems.filter((item) => item.stage1Passed && !item.stage2Passed);
  const stage3PassedSummaryItems = sortedItems.filter((item) => item.stage3Passed);
  const stage3FailedSummaryItems = sortedItems.filter((item) => item.stage2Passed && !item.stage3Passed);

  return (
    <AnimatePresence>
      {isOpen && processMeta && (
        <div className="fixed inset-0 z-[220] flex items-end justify-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 220 }}
            className="relative w-full max-w-[480px] bg-white rounded-t-[24px] overflow-hidden max-h-[88vh] flex flex-col shadow-2xl"
          >
            <div className="sticky top-0 z-10 bg-white px-4 pt-3 pb-2 border-b border-gray-100">
              <div className="w-10 h-1 rounded-full bg-gray-200 mx-auto mb-3" />
              <div className="flex items-center justify-between">
                <h3 className="text-[18px] font-bold text-gray-900">추천 과정 상세</h3>
                <button
                  onClick={onClose}
                  className="h-[34px] px-3 rounded-[10px] bg-gray-100 text-gray-600 text-[13px] font-semibold hover:bg-gray-200 transition-colors"
                >
                  닫기
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-5">
              <div className="pt-3 mt-0.5 border-t border-gray-200">
                <SectionSummary
                  title="1단계 맞춤질문 적합도 판단"
                  passedItems={stage1PassedItems}
                  failedItems={stage1FailedItems}
                  subtitle={processMeta.rules.stage1}
                />
              </div>
              <StageList
                title={`1단계 후보 리스트 (${stage1Items.length}개)`}
                items={stage1Items}
                scoreLabel="적합도 점수"
              />

              <div className="pt-3 mt-0.5 border-t border-gray-200">
                <SectionSummary
                  title="2단계 심층 분석 Top10"
                  passedItems={stage2PassedSummaryItems}
                  failedItems={stage2FailedSummaryItems}
                  subtitle={processMeta.rules.stage2}
                />
              </div>
              <StageList
                title="2단계 통과 리스트 (Top10)"
                items={stage2PassedItems}
                scoreLabel="적합도 점수"
              />

              <div className="pt-3 mt-0.5 border-t border-gray-200">
                <SectionSummary
                  title="3단계 최종 TOP5 선정"
                  passedItems={stage3PassedSummaryItems}
                  failedItems={stage3FailedSummaryItems}
                  subtitle={processMeta.rules.stage3}
                />
              </div>
              <div className="space-y-2">
                <div className="space-y-2">
                  {top5ItemsWithTags.map((item) => (
                    <div key={`top5-${item.pcode}`} className="rounded-[14px] bg-gray-50 p-2.5">
                      <div className="flex items-center gap-3">
                        <div className="w-6 h-6 rounded-full bg-[#6366F1] text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                          {item.rank || '-'}
                        </div>
                        <div className="w-11 h-11 rounded-[10px] overflow-hidden bg-gray-100 border border-gray-100 shrink-0">
                          {item.thumbnail ? (
                            <img src={item.thumbnail} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-gray-100" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] text-gray-500 font-medium truncate">{item.brand || '브랜드 미상'}</p>
                          <p className="text-[13px] font-semibold text-gray-900 truncate">{item.name}</p>
                        </div>
                      </div>

                      <div className="mt-2.5 flex flex-wrap gap-1">
                        {preferredBrands.length > 0 && (
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              item.preferredBrandMatched
                                ? 'bg-blue-50 text-blue-600'
                                : 'bg-gray-100 text-gray-500'
                            }`}
                          >
                            선호브랜드 {item.preferredBrandMatched ? '일치' : '불일치'}
                          </span>
                        )}
                        {item.fullTags.slice(0, 4).map((tag) => (
                          <span
                            key={`${item.pcode}-full-${tag}`}
                            className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-indigo-50 text-indigo-600"
                          >
                            {tag}
                          </span>
                        ))}
                        {item.partialTags.slice(0, 3).map((tag) => (
                          <span
                            key={`${item.pcode}-partial-${tag}`}
                            className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-sky-50 text-sky-600"
                          >
                            {tag} (부분일치)
                          </span>
                        ))}
                      </div>

                      {item.unmetTags.length > 0 && (
                        <p className="mt-1.5 text-[10px] text-gray-500">
                          불일치 조건: {item.unmetTags.slice(0, 3).join(', ')}
                          {item.unmetTags.length > 3 ? ` 외 ${item.unmetTags.length - 3}개` : ''}
                        </p>
                      )}
                      {item.reasoning && (
                        <p className="mt-2 text-[11px] text-gray-700 leading-relaxed">
                          {item.reasoning.split(/(\*\*.*?\*\*)/g).map((part: string, index: number) => {
                            if (part.startsWith('**') && part.endsWith('**')) {
                              return (
                                <strong key={index} className="font-bold text-gray-900">
                                  {part.slice(2, -2)}
                                </strong>
                              );
                            }
                            return <span key={index}>{part}</span>;
                          })}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

