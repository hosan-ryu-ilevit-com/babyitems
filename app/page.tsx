'use client';

import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';
import { logPageView, logButtonClick, logAgeBadgeSelection, logAIHelperButtonClicked } from '@/lib/logging/clientLogger';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { AIHelperBottomSheet } from '@/components/recommend-v2/AIHelperBottomSheet';

// --- Types ---
interface DanawaCategory {
  category_code: string;
  category_name: string;
  group_id: string;
  total_product_count: number;
  crawled_product_count: number;
}

interface CategoriesResponse {
  groups: { categories?: DanawaCategory[] }[];
  uncategorized: DanawaCategory[];
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
      { id: 'stroller', name: '유모차', emoji: '🚼' },
      { id: 'car_seat', name: '카시트', emoji: '🚗' },
    ],
  },
  {
    id: 'feeding', name: '수유용품', emoji: '🍼',
    categories: [
      { id: 'formula', name: '분유', emoji: '🥛' },
      { id: 'baby_formula_dispenser', name: '분유제조기', emoji: '⚙️' },
      { id: 'milk_powder_port', name: '분유포트', emoji: '🫖' },
      { id: 'baby_bottle', name: '젖병', emoji: '🍼' },
      { id: 'pacifier', name: '쪽쪽이/노리개', emoji: '😊' },
    ],
  },
  {
    id: 'diaper', name: '기저귀/위생', emoji: '👶',
    categories: [
      { id: 'diaper', name: '기저귀', emoji: '🧒' },
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
      { id: 'high_chair', name: '유아의자/식탁의자', emoji: '🪑' },
      { id: 'baby_sofa', name: '유아소파', emoji: '🛋️' },
      { id: 'baby_desk', name: '유아책상', emoji: '📝' },
    ],
  },
];

// --- Sub-components ---

// 상단 단계 표시 바
function StepIndicator({ currentStep = 1 }: { currentStep?: number }) {
  const steps = [1, 2, 3, 4];
  return (
    <div className="sticky top-14 left-0 right-0 z-40 flex justify-center pointer-events-none">
      <div className="mt-2 flex items-center gap-2 bg-white/70 border border-gray-200 rounded-[42px] px-4 py-[6px] backdrop-blur-[12px] pointer-events-auto">
        {steps.map((step, idx) => (
          <div key={step} className="flex items-center">
            <div className={`w-[28px] h-[28px] rounded-full flex items-center justify-center text-[13px] font-bold border transition-all ${
              step === currentStep 
                ? 'bg-gray-800 border-gray-800 text-white' 
                : 'bg-white border-gray-200 text-gray-300'
            }`}>
              {step}
            </div>
            {idx < steps.length - 1 && (
              <div className="w-6 h-[1px] bg-gray-200 mx-1" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// 스트리밍 타이틀
function StreamingTitle() {
  const text = "안녕하세요!\n고객님께 필요한 최적의 육아용품을 찾아드릴게요.";
  const [displayedText, setDisplayedText] = useState("");
  const [isTyping, setIsTyping] = useState(true);

  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      setDisplayedText(text.slice(0, i));
      i++;
      if (i > text.length) {
        clearInterval(interval);
        setIsTyping(false);
      }
    }, 40);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="px-5 pt-0 pb-0">
      <h2 className="text-[16px] font-medium text-gray-900 leading-[1.6] whitespace-pre-wrap">
        {displayedText}
        {isTyping && (
          <motion.span
            animate={{ opacity: [1, 0] }}
            transition={{ duration: 0.8, repeat: Infinity }}
            className="inline-block w-[2px] h-[16px] bg-gray-400 ml-1 translate-y-[2px]"
          />
        )}
      </h2>
    </div>
  );
}

// 연령대 탭 (디자인 변경)
function AgeFilterBar({ selectedId, onSelect }: { selectedId: string; onSelect: (id: string) => void }) {
  return (
    <div className="overflow-x-auto scrollbar-hide -mx-5 px-5 mb-6">
      <div className="flex items-center gap-2">
        {AGE_FILTERS.map((filter) => (
          <button
            key={filter.id}
            onClick={() => onSelect(filter.id)}
            className={`px-4 py-2 rounded-full text-[14px] font-medium whitespace-nowrap border transition-all ${
              selectedId === filter.id
                ? 'bg-gray-800 border-gray-800 text-white shadow-sm'
                : 'bg-white border-gray-200 text-gray-500'
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// 카테고리 카드 (디자인 변경)
function CategoryCard({ name, isSelected, onClick, isLoading }: { name: string; isSelected: boolean; onClick: () => void; isLoading: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={isLoading}
      className={`relative h-[50px] rounded-xl border flex items-center px-4 transition-all active:scale-[0.98] ${
        isSelected
          ? 'bg-purple-50 border-purple-200 text-purple-700'
          : 'bg-white border-gray-100 text-gray-600'
      }`}
    >
      {isLoading ? (
        <div className="w-5 h-5 border-2 border-purple-200 border-t-purple-600 rounded-full animate-spin mx-auto" />
      ) : (
        <span className="text-[15px] font-medium text-left">{name}</span>
      )}
    </button>
  );
}

// 메인 컴포넌트
export default function Home() {
  const router = useRouter();
  const [selectedAgeId, setSelectedAgeId] = useState('all');
  const [loadingCategoryId, setLoadingCategoryId] = useState<string | null>(null);
  const [isAIHelperOpen, setIsAIHelperOpen] = useState(false);
  const [completedCategories, setCompletedCategories] = useState<Set<string>>(new Set());
  const [initialUserInput, setInitialUserInput] = useState<string>('');

  useEffect(() => {
    logPageView('home');
    // 디자인 통합을 위해 초기 완료 상태 체크는 하지 않음 (필요 시 복구 가능)
    setCompletedCategories(new Set());
  }, []);

  const handleCategorySelect = (categoryId: string, categoryName: string) => {
    setLoadingCategoryId(categoryId);
    logButtonClick(`카테고리 선택: ${categoryName}`, 'home');
    router.push(`/recommend-v2/${categoryId}`);
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-[480px] mx-auto min-h-screen flex flex-col">
        {/* 헤더 바 */}
        <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-50 h-14 flex items-center px-5 gap-1.5">
          <span className="text-[17px] font-semibold text-gray-800 tracking-tight">아기용품</span>
          <span className="text-[17px] font-bold ai-gradient-text tracking-tight">AI</span>
        </header>

        {/* 1. 상단 스텝 바 */}
        <StepIndicator currentStep={1} />

        {/* 2. 스트리밍 타이틀 */}
        <StreamingTitle />

        {/* 3. 디바이더 */}
        <div className="h-[1px] bg-gray-100 mx-5 mt-[20px] mb-[20px]" />

        <div className="px-5 pt-0 pb-24">
          {/* 4. 카테고리 설정 섹션 */}
          <div className="mb-0">
            <span className="text-[16px] text-gray-400 font-semibold mb-1 block">카테고리 설정</span>
            <h1 className="text-[18px] font-bold text-gray-900">
              찾으시는 상품을 선택하세요 <span className="text-blue-500 font-bold">*</span>
            </h1>
          </div>

          {/* 5. AI 도움받기 버튼 */}
          <button
            onClick={() => {
              logAIHelperButtonClicked('category_selection', 'category_select', '어떤 상품을 찾으시나요?', 'all', '전체');
              setIsAIHelperOpen(true);
            }}
            className="w-full h-[48px] rounded-xl ai-gradient-border flex items-center justify-center gap-2 mt-4 mb-4 transition-all active:scale-[0.98]"
          >
            <span className="ai-gradient-text text-[16px] font-bold">✦</span>
            <span className="text-[16px] font-semibold text-[#5549F5]">뭘 골라야 할지 모르겠어요</span>
          </button>

          {/* 6. 연령대 탭 */}
          <AgeFilterBar selectedId={selectedAgeId} onSelect={setSelectedAgeId} />

          {/* 7. 카테고리 리스트 */}
          {selectedAgeId === 'all' ? (
            CATEGORY_GROUPS.map((group) => (
              <div key={group.id} className="mb-10">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-[18px]">{group.emoji}</span>
                  <h3 className="text-[16px] font-semibold text-gray-800">{group.name}</h3>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {group.categories.map((cat) => (
                    <CategoryCard
                      key={cat.id}
                      name={cat.name}
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
                // Find matching categories from CATEGORY_GROUPS
                const categories = ageGroup.categoryIds.map(id => {
                  for (const group of CATEGORY_GROUPS) {
                    const found = group.categories.find(c => c.id === id);
                    if (found) return found;
                  }
                  return null;
                }).filter((c): c is UnifiedCategory => c !== null);

                if (categories.length === 0) return null;

                // Find emoji for the group name if possible, or use a default
                const groupEmoji = CATEGORY_GROUPS.find(g => g.name === ageGroup.name)?.emoji || '✨';

                return (
                  <div key={`${selectedAgeId}-${idx}`} className="mb-10">
                    <div className="flex items-center gap-2 mb-4">
                      <span className="text-[18px]">{groupEmoji}</span>
                      <h3 className="text-[16px] font-semibold text-gray-800">{ageGroup.name}</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {categories.map((cat) => (
                        <CategoryCard
                          key={cat.id}
                          name={cat.name}
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
        </div>
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
        onNaturalLanguageInput={(stage, input) => {
          setInitialUserInput(input);
        }}
        onSelectOptions={(selectedCategoryIds) => {
          if (selectedCategoryIds.length > 0) {
            const categoryId = selectedCategoryIds[0];
            if (initialUserInput) {
              try {
                const naturalLanguageInput = {
                  stage: 'category_selection',
                  timestamp: new Date().toISOString(),
                  input: initialUserInput,
                };
                sessionStorage.setItem(`v2_initial_context_${categoryId}`, JSON.stringify(naturalLanguageInput));
              } catch (e) {
                console.warn('[home] Failed to save initial context:', e);
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
