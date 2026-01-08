'use client';

import { useRouter } from 'next/navigation';
import { motion, Variants, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useRef } from 'react';
import { logPageView, logButtonClick, logAIHelperButtonClicked } from '@/lib/logging/clientLogger';
import { AIHelperBottomSheet } from '@/components/recommend-v2/AIHelperBottomSheet';
import { StepIndicator } from '@/components/StepIndicator';
import FeedbackButton from '@/components/FeedbackButton';
import Image from 'next/image';

// --- Types ---
interface DanawaCategory {
  category_code: string;
  category_name: string;
  group_id: string;
  total_product_count: number;
  crawled_product_count: number;
}

interface UnifiedCategory {
  id: string;
  name: string;
  image: string;
}

interface DisplayGroup {
  id: string;
  name: string;
  categories: UnifiedCategory[];
}

interface AgeFilter {
  id: string;
  label: string;
  emoji: string;
  description: string;
  groups: { name: string; description?: string; categoryIds: string[] }[];
}

// --- Constants ---
const AGE_FILTERS: AgeFilter[] = [
  { id: 'all', label: '전체', emoji: '👶', description: '', groups: [] },
  {
    id: 'prenatal', label: '출산 전', emoji: '🤰', description: '미리 준비 안 해두면 급해져요',
    groups: [
      { name: '이동수단', categoryIds: ['stroller', 'car_seat'] },
      { name: '수유용품', categoryIds: ['baby_bottle', 'milk_powder_port'] },
      { name: '기저귀/위생', categoryIds: ['diaper', 'baby_wipes'] },
      { name: '건강/안전', categoryIds: ['thermometer'] },
      { name: '유아가구', categoryIds: ['baby_bed'] },
    ],
  },
  {
    id: '0-3m', label: '0~3개월', emoji: '👶', description: '육아템이 본격적으로 필요한 시기예요',
    groups: [
      { name: '수유용품', categoryIds: ['formula', 'baby_formula_dispenser', 'pacifier'] },
      { name: '건강/안전', categoryIds: ['nasal_aspirator'] },
      { name: '기저귀/위생', categoryIds: ['diaper', 'baby_wipes'] },
    ],
  },
  {
    id: '4-6m', label: '4~6개월', emoji: '🥣', description: '이유식 시작하면서 많은 게 바뀌어요',
    groups: [
      { name: '유아가구', categoryIds: ['high_chair'] },
      { name: '수유용품', categoryIds: ['baby_bottle'] },
      { name: '기저귀/위생', categoryIds: ['diaper', 'baby_wipes'] },
    ],
  },
  {
    id: '7-12m', label: '7~12개월', emoji: '🏃', description: '움직임이 많아지면서 바꿀 게 생겨요',
    groups: [
      { name: '이동수단', categoryIds: ['stroller', 'car_seat'] },
      { name: '유아가구', categoryIds: ['baby_sofa'] },
      { name: '수유용품', categoryIds: ['formula', 'pacifier'] },
      { name: '기저귀/위생', categoryIds: ['diaper', 'baby_wipes'] },
    ],
  },
  {
    id: '13-24m', label: '13~24개월', emoji: '🐥', description: '혼자 하려고 하고, 젖병도 슬슬 졸업해요',
    groups: [
      { name: '유아가구', categoryIds: ['baby_desk', 'baby_sofa'] },
      { name: '수유용품', categoryIds: ['formula', 'baby_bottle'] },
      { name: '기저귀/위생', categoryIds: ['diaper', 'baby_wipes'] },
    ],
  },
  {
    id: '3-4y', label: '3~4세', emoji: '🎒', description: '기저귀 졸업하고 놀이 학습을 시작해요',
    groups: [
      { name: '이동수단', categoryIds: ['car_seat'] },
      { name: '유아가구', categoryIds: ['baby_desk', 'high_chair'] },
      { name: '기저귀/위생', categoryIds: ['diaper', 'baby_wipes'] },
    ],
  },
  {
    id: '5-7y', label: '5~7세', emoji: '🎨', description: '키가 크면서 가구도 바꿔줄 때예요',
    groups: [
      { name: '유아가구', categoryIds: ['baby_desk', 'high_chair'] },
      { name: '이동수단', categoryIds: ['car_seat'] },
      { name: '건강/안전', categoryIds: ['thermometer'] },
    ],
  },
  {
    id: '7y+', label: '7세이상', emoji: '🏫', description: '유아용품을 거의 졸업하는 시기예요',
    groups: [
      { name: '유아가구', categoryIds: ['baby_desk'] },
    ],
  },
];

const CATEGORY_GROUPS: DisplayGroup[] = [
  {
    id: 'mobility', name: '이동수단',
    categories: [
      { id: 'stroller', name: '유모차', image: '/images/categories/유모차.png' },
      { id: 'car_seat', name: '카시트', image: '/images/categories/카시트.png' },
    ],
  },
  {
    id: 'feeding', name: '수유용품',
    categories: [
      { id: 'formula', name: '분유', image: '/images/categories/분유.png' },
      { id: 'baby_formula_dispenser', name: '분유제조기', image: '/images/categories/분유제조기.png' },
      { id: 'milk_powder_port', name: '분유포트', image: '/images/categories/분유포트.png' },
      { id: 'pacifier', name: '쪽쪽이/노리개', image: '/images/categories/쪽쪽이:노리개.png' },
      { id: 'baby_bottle', name: '젖병', image: '/images/categories/젖병.png' },
    ],
  },
  {
    id: 'diaper', name: '기저귀/위생',
    categories: [
      { id: 'diaper', name: '기저귀', image: '/images/categories/기저귀.png' },
      { id: 'baby_wipes', name: '아기물티슈', image: '/images/categories/아기물티슈.png' },
    ],
  },
  {
    id: 'health', name: '건강/안전',
    categories: [
      { id: 'thermometer', name: '체온계', image: '/images/categories/체온계.png' },
      { id: 'nasal_aspirator', name: '코흡입기', image: '/images/categories/코흡입기.png' },
    ],
  },
  {
    id: 'furniture', name: '유아가구',
    categories: [
      { id: 'baby_bed', name: '유아침대', image: '/images/categories/유아침대.png' },
      { id: 'high_chair', name: '유아의자', image: '/images/categories/유아:식탁의자.png' },
      { id: 'baby_sofa', name: '유아소파', image: '/images/categories/유아소파.png' },
      { id: 'baby_desk', name: '유아책상', image: '/images/categories/유아책상.png' },
    ],
  },
];

// --- Sub-components ---

// 연령대 탭 (디자인 변경)
function AgeFilterBar({ selectedId, onSelect }: { selectedId: string; onSelect: (id: string) => void }) {
  return (
    <div className="overflow-x-auto scrollbar-hide -mx-5 px-5 mb-4">
      <div className="flex items-center gap-2">
        {AGE_FILTERS.map((filter) => (
          <motion.button
            key={filter.id}
            onClick={() => onSelect(filter.id)}
            whileTap={{ scale: 0.96 }}
            className={`px-4 py-2 rounded-full text-[14px] font-medium whitespace-nowrap border ${selectedId === filter.id
                ? 'bg-gray-800 border-gray-800 text-white shadow-sm'
                : 'bg-white border-gray-200 text-gray-500'
              }`}
          >
            {filter.label}
          </motion.button>
        ))}
      </div>
    </div>
  );
}

// 카테고리 카드 (디자인 변경)
function CategoryCard({ name, image, isSelected, onClick, isLoading }: { name: string; image: string; isSelected: boolean; onClick: () => void; isLoading: boolean }) {
  return (
    <div className="flex flex-col items-center w-full min-w-0">
      <motion.button
        onClick={onClick}
        disabled={isLoading}
        whileTap={isLoading ? undefined : { scale: 0.98 }}
        className={`relative w-full aspect-square rounded-2xl border flex flex-col items-center pt-3 pb-2 gap-1 ${isSelected
            ? 'bg-purple-50 border-purple-200 shadow-xs'
            : 'bg-white border-gray-100 hover:border-gray-200 shadow-xs'
          }`}
      >
        {isLoading ? (
          <div className="w-6 h-6 border-2 border-purple-200 border-t-purple-600 rounded-full animate-spin my-auto" />
        ) : (
          <>
            <span className="text-[13px] sm:text-[14px] font-medium text-gray-600 px-1 truncate w-full text-center">{name}</span>
            <div className="relative w-[55%] h-[55%] mt-auto mb-1">
              <Image
                src={image}
                alt={name}
                fill
                className="object-contain"
                sizes="(max-width: 480px) 30vw, 100px"
              />
            </div>
          </>
        )}

        {isSelected && !isLoading && (
          <div className="absolute -top-1.5 -right-1.5 z-10">
            <div className="bg-purple-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full border-2 border-white">
              선택됨
            </div>
          </div>
        )}
      </motion.button>
    </div>
  );
}

// 애니메이션 베리언트
const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 5 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: "easeOut" },
  },
};

// 메인 컴포넌트
export default function CategoriesPage() {
  const router = useRouter();
  const [selectedAgeId, setSelectedAgeId] = useState('all');
  const [loadingCategoryId, setLoadingCategoryId] = useState<string | null>(null);
  const [isAIHelperOpen, setIsAIHelperOpen] = useState(false);
  const [completedCategories, setCompletedCategories] = useState<Set<string>>(new Set());
  const [initialUserInput, setInitialUserInput] = useState<string>('');

  // 뒤로가기 등으로 진입 시 상태가 꼬이지 않도록 마운트 시점에 강제 초기화
  useEffect(() => {
    logPageView('categories');

    // 세션 스토리지에서 완료된 카테고리 체크
    const completed = new Set<string>();
    try {
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key?.startsWith('v2_result_')) {
          const categoryId = key.replace('v2_result_', '');
          const savedStateStr = sessionStorage.getItem(key);
          if (savedStateStr) {
            try {
              const savedState = JSON.parse(savedStateStr);
              // 1시간(3600000ms) 이내의 결과이고 상품이 있는 경우만 완료로 표시
              // app/recommend-v2/[categoryKey]/page.tsx 의 복원 로직과 동일하게 유지
              const isRecent = Date.now() - (savedState.timestamp || 0) < 3600000;
              const hasProducts = savedState.scoredProducts && Array.isArray(savedState.scoredProducts) && savedState.scoredProducts.length > 0;

              if (isRecent && hasProducts) {
                completed.add(categoryId);
              }
            } catch (parseError) {
              console.warn(`[categories] Failed to parse ${key}:`, parseError);
            }
          }
        }
      }
    } catch (e) {
      console.warn('[categories] Failed to access sessionStorage:', e);
    }
    setCompletedCategories(completed);
  }, []);

  // 채널톡 스크립트 초기화
  useEffect(() => {
    if (typeof window !== 'undefined' && !(window as any).ChannelIO) {
      const w = window as any;
      const ch = function (...args: any[]) {
        ch.c?.(args);
      };
      ch.q = [] as any[];
      ch.c = function (args: any[]) {
        ch.q?.push(args);
      };
      w.ChannelIO = ch;

      const loadChannelIO = () => {
        if (w.ChannelIOInitialized) return;
        w.ChannelIOInitialized = true;
        const s = document.createElement('script');
        s.type = 'text/javascript';
        s.async = true;
        s.src = 'https://cdn.channel.io/plugin/ch-plugin-web.js';
        const x = document.getElementsByTagName('script')[0];
        if (x.parentNode) {
          x.parentNode.insertBefore(s, x);
        }
      };

      if (document.readyState === 'complete') {
        loadChannelIO();
      } else {
        window.addEventListener('DOMContentLoaded', loadChannelIO);
        window.addEventListener('load', loadChannelIO);
      }

      // 채널톡 부트
      setTimeout(() => {
        if (w.ChannelIO) {
          w.ChannelIO('boot', {
            pluginKey: '81ef1201-79c7-4b62-b021-c571fe06f935',
            hideChannelButtonOnBoot: true,
          });
        }
      }, 100);
    }
  }, []);

  const handleCategorySelect = (categoryId: string, categoryName: string) => {
    setLoadingCategoryId(categoryId);
    logButtonClick(`카테고리 선택: ${categoryName}`, 'categories');

    // 연령대 태그 정보 저장 (all이 아닌 경우에만)
    if (selectedAgeId !== 'all') {
      try {
        const ageFilter = AGE_FILTERS.find(f => f.id === selectedAgeId);
        if (ageFilter) {
          const ageContext = {
            ageId: ageFilter.id,
            ageLabel: ageFilter.label,
            ageDescription: ageFilter.description,
            timestamp: new Date().toISOString(),
          };
          sessionStorage.setItem(`v2_age_context_${categoryId}`, JSON.stringify(ageContext));
          console.log('✅ [categories] Age context saved:', ageContext);
        }
      } catch (e) {
        console.warn('[categories] Failed to save age context:', e);
      }
    }

    router.push(`/recommend-v2/${categoryId}`);
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-[480px] mx-auto min-h-screen flex flex-col">
        {/* 헤더 바 */}
        <header className="sticky top-0 z-50 bg-[#FBFBFD] h-[54px] flex items-center px-5">
          <button onClick={() => router.push('/')} className="p-2 -ml-2">
            <Image
              src="/icons/back.png"
              alt="뒤로가기"
              width={20}
              height={20}
              priority
            />
          </button>
        </header>

        <StepIndicator currentStep={1} className="sticky top-[54px]" />

        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="flex-1 flex flex-col pt-0"
        >
          <div className="px-4 pt-0 pb-12">
            {/* 질문 헤더 */}
            <motion.div variants={itemVariants} className="mt-[11px] mb-[16px]">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[15px] text-gray-400 font-semibold">
                  카테고리 설정
                </span>
              </div>
              <h3 className="text-[18px] font-bold text-gray-900 leading-snug break-keep">
                찾으시는 상품을 선택하세요
              </h3>
            </motion.div>

            {/* 5. AI 도움받기 버튼 (인사형 애니메이션 적용) */}
            <motion.button
              variants={itemVariants}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                logAIHelperButtonClicked('category_selection', 'category_select', '어떤 상품을 찾으시나요?', 'all', '전체');
                setIsAIHelperOpen(true);
              }}
              className="w-full h-[48px] rounded-xl ai-gradient-border flex items-center justify-center gap-2 mb-4 bg-white"
            >
              <motion.img
                src="/icons/ic-ai.svg"
                alt=""
                width={14}
                height={14}
                animate={{
                  rotate: [0, -15, 15, -15, 0],
                  y: [0, -2.5, 0],
                }}
                transition={{
                  duration: 0.8,
                  repeat: Infinity,
                  repeatDelay: 2,
                  ease: "easeInOut"
                }}
              />
              <span className="text-[16px] font-semibold text-[#6366F1]">뭘 사야 할지 모르겠어요</span>
            </motion.button>

            {/* 6. 연령대 탭 */}
            <motion.div variants={itemVariants}>
              <AgeFilterBar selectedId={selectedAgeId} onSelect={setSelectedAgeId} />
            </motion.div>

            {/* 7. 카테고리 리스트 */}
            <AnimatePresence mode="wait">
              <motion.div
                key={selectedAgeId}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                {selectedAgeId === 'all' ? (
                  CATEGORY_GROUPS.map((group) => (
                    <div key={group.id} className="mb-8">
                      <div className="flex items-center py-[10px]">
                        <h3 className="text-[16px] font-semibold text-gray-800">{group.name}</h3>
                      </div>
                      <div className="grid grid-cols-3 gap-y-4 gap-x-1.5 sm:gap-x-2">
                        {group.categories.map((cat) => (
                          <CategoryCard
                            key={cat.id}
                            name={cat.name}
                            image={cat.image}
                            isSelected={completedCategories.has(cat.id)}
                            isLoading={loadingCategoryId === cat.id}
                            onClick={() => handleCategorySelect(cat.id, cat.name)}
                          />
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  (() => {
                    const ageFilter = AGE_FILTERS.find(f => f.id === selectedAgeId);
                    if (!ageFilter) return null;

                    return ageFilter.groups.map((ageGroup, idx) => {
                      const categories = ageGroup.categoryIds.map(id => {
                        for (const group of CATEGORY_GROUPS) {
                          const found = group.categories.find(c => c.id === id);
                          if (found) return found;
                        }
                        return null;
                      }).filter((c): c is UnifiedCategory => c !== null);

                      if (categories.length === 0) return null;

                      return (
                        <div key={`${selectedAgeId}-${idx}`} className="mb-8">
                          <div className="flex items-center py-[10px]">
                            <h3 className="text-[16px] font-semibold text-gray-800">{ageGroup.name}</h3>
                          </div>
                          <div className="grid grid-cols-3 gap-y-4 gap-x-1.5 sm:gap-x-2">
                            {categories.map((cat) => (
                              <CategoryCard
                                key={cat.id}
                                name={cat.name}
                                image={cat.image}
                                isSelected={completedCategories.has(cat.id)}
                                isLoading={loadingCategoryId === cat.id}
                                onClick={() => handleCategorySelect(cat.id, cat.name)}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    });
                  })()
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>
      </div>

      {/* AI 도움받기 바텀시트 */}
      <AIHelperBottomSheet
        isOpen={isAIHelperOpen}
        onClose={() => setIsAIHelperOpen(false)}
        questionType="category_selection"
        questionId="category_select"
        questionText="어떤 상품을 찾고 계신가요?"
        options={CATEGORY_GROUPS.flatMap(g => g.categories).map(c => ({ value: c.id, label: c.name }))}
        category="all"
        categoryName="전체"
        userSelections={selectedAgeId !== 'all' ? {
          ageContext: (() => {
            const ageFilter = AGE_FILTERS.find(f => f.id === selectedAgeId);
            return ageFilter ? {
              ageId: ageFilter.id,
              ageLabel: ageFilter.label,
              ageDescription: ageFilter.description,
            } : undefined;
          })(),
        } : undefined}
        onNaturalLanguageInput={(stage, input) => {
          setInitialUserInput(input);
        }}
        onSelectOptions={(selectedCategoryIds) => {
          if (selectedCategoryIds.length > 0) {
            const categoryId = selectedCategoryIds[0];

            // 연령대 태그 정보 저장 (all이 아닌 경우에만) - handleCategorySelect와 동일
            if (selectedAgeId !== 'all') {
              try {
                const ageFilter = AGE_FILTERS.find(f => f.id === selectedAgeId);
                if (ageFilter) {
                  const ageContext = {
                    ageId: ageFilter.id,
                    ageLabel: ageFilter.label,
                    ageDescription: ageFilter.description,
                    timestamp: new Date().toISOString(),
                  };
                  sessionStorage.setItem(`v2_age_context_${categoryId}`, JSON.stringify(ageContext));
                  console.log('✅ [categories/AIHelper] Age context saved:', ageContext);
                }
              } catch (e) {
                console.warn('[categories/AIHelper] Failed to save age context:', e);
              }
            }

            if (initialUserInput) {
              try {
                const naturalLanguageInput = {
                  stage: 'category_selection',
                  timestamp: new Date().toISOString(),
                  input: initialUserInput,
                };
                sessionStorage.setItem(`v2_initial_context_${categoryId}`, JSON.stringify(naturalLanguageInput));
              } catch (e) {
                console.warn('[categories] Failed to save initial context:', e);
              }
            }
            router.push(`/recommend-v2/${categoryId}`);
          }
          setIsAIHelperOpen(false);
        }}
      />
    </div>
  );
}

