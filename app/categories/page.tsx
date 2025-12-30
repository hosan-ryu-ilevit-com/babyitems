'use client';

import { useRouter } from 'next/navigation';
import { motion, Variants, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useRef } from 'react';
import { logPageView, logButtonClick, logAIHelperButtonClicked } from '@/lib/logging/clientLogger';
import { AIHelperBottomSheet } from '@/components/recommend-v2/AIHelperBottomSheet';
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
  emoji: string;
}

interface DisplayGroup {
  id: string;
  name: string;
  emoji: string;
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
];

const CATEGORY_GROUPS: DisplayGroup[] = [
  {
    id: 'mobility', name: '이동수단', emoji: '🚗',
    categories: [
      { id: 'stroller', name: '유모차', emoji: '🛒' },
      { id: 'car_seat', name: '카시트', emoji: '🚘' },
    ],
  },
  {
    id: 'feeding', name: '수유용품', emoji: '🍼',
    categories: [
      { id: 'formula', name: '분유', emoji: '🥛' },
      { id: 'baby_formula_dispenser', name: '분유제조기', emoji: '🤖' },
      { id: 'milk_powder_port', name: '분유포트', emoji: '🫖' },
      { id: 'baby_bottle', name: '젖병', emoji: '🍼' },
      { id: 'pacifier', name: '쪽쪽이/노리개', emoji: '👶' },
    ],
  },
  {
    id: 'diaper', name: '기저귀/위생', emoji: '👶',
    categories: [
      { id: 'diaper', name: '기저귀', emoji: '🚼' },
      { id: 'baby_wipes', name: '아기물티슈', emoji: '🧻' },
    ],
  },
  {
    id: 'health', name: '건강/안전', emoji: '🏥',
    categories: [
      { id: 'thermometer', name: '체온계', emoji: '🌡️' },
      { id: 'nasal_aspirator', name: '코흡입기', emoji: '👃' },
    ],
  },
  {
    id: 'furniture', name: '유아가구', emoji: '🛌',
    categories: [
      { id: 'baby_bed', name: '유아침대', emoji: '🛏️' },
      { id: 'high_chair', name: '유아의자', emoji: '🪑' },
      { id: 'baby_sofa', name: '유아소파', emoji: '🛋️' },
      { id: 'baby_desk', name: '유아책상', emoji: '📝' },
    ],
  },
];

// --- Sub-components ---

// 연령대 탭 (디자인 변경)
function AgeFilterBar({ selectedId, onSelect }: { selectedId: string; onSelect: (id: string) => void }) {
  return (
    <div className="overflow-x-auto scrollbar-hide -mx-5 px-5 mb-6">
      <div className="flex items-center gap-2">
        {AGE_FILTERS.map((filter) => (
          <motion.button
            key={filter.id}
            onClick={() => onSelect(filter.id)}
            whileTap={{ scale: 0.96 }}
            className={`px-4 py-2 rounded-full text-[14px] font-medium whitespace-nowrap border ${
              selectedId === filter.id
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
function CategoryCard({ name, emoji, isSelected, onClick, isLoading }: { name: string; emoji: string; isSelected: boolean; onClick: () => void; isLoading: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <motion.button
        onClick={onClick}
        disabled={isLoading}
        whileTap={isLoading ? undefined : { scale: 0.98 }}
        className={`relative h-[50px] w-full rounded-xl border flex items-center px-4 gap-2.5 ${
          isSelected
            ? 'bg-purple-50 border-purple-200 text-purple-700'
            : 'bg-white border-gray-100 text-gray-600 hover:border-gray-200'
        }`}
      >
        {isLoading ? (
          <div className="w-5 h-5 border-2 border-purple-200 border-t-purple-600 rounded-full animate-spin mx-auto" />
        ) : (
          <>
            <span className="text-[18px]">{emoji}</span>
            <span className="text-[15px] font-medium text-left">{name}</span>
          </>
        )}
      </motion.button>
      {isSelected && !isLoading && (
        <div className="flex px-1">
          <span className="text-[10px] font-bold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded-md">추천완료</span>
        </div>
      )}
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
      const ch = function(...args: any[]) {
        ch.c?.(args);
      };
      ch.q = [] as any[];
      ch.c = function(args: any[]) {
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
          <div className="absolute left-1/2 -translate-x-1/2">
            <h1 className="text-[17px] font-bold text-gray-900 tracking-tight whitespace-nowrap">
              어떤 상품을 찾으시나요?
            </h1>
          </div>
        </header>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="flex-1 flex flex-col pt-4"
        >
          <div className="px-5 pt-0 pb-12">
            {/* 5. AI 도움받기 버튼 (인사형 애니메이션 적용) */}
            <motion.button
              variants={itemVariants}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                logAIHelperButtonClicked('category_selection', 'category_select', '어떤 상품을 찾으시나요?', 'all', '전체');
                setIsAIHelperOpen(true);
              }}
              className="w-full h-[48px] rounded-xl ai-gradient-border flex items-center justify-center gap-2 mt-4 mb-4 bg-white"
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
                    <div key={group.id} className="mb-10">
                      <div className="flex items-center gap-2 mb-4">
                        <h3 className="text-[16px] font-bold text-gray-900">{group.name}</h3>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {group.categories.map((cat) => (
                          <CategoryCard
                            key={cat.id}
                            name={cat.name}
                            emoji={cat.emoji}
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
                        <div key={`${selectedAgeId}-${idx}`} className="mb-10">
                          <div className="flex items-center gap-2 mb-4">
                            <h3 className="text-[16px] font-bold text-gray-900">{ageGroup.name}</h3>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            {categories.map((cat) => (
                              <CategoryCard
                                key={cat.id}
                                name={cat.name}
                                emoji={cat.emoji}
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

