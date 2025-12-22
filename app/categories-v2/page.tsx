'use client';

import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { CaretLeft } from '@phosphor-icons/react/dist/ssr';
import { logPageView, logButtonClick, logAgeBadgeSelection } from '@/lib/logging/clientLogger';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { AIHelperButton } from '@/components/recommend-v2/AIHelperButton';
import { AIHelperBottomSheet } from '@/components/recommend-v2/AIHelperBottomSheet';

// API Response Types
interface DanawaCategory {
  category_code: string;
  category_name: string;
  group_id: string;
  total_product_count: number;
  crawled_product_count: number;
}

interface CategoryGroup {
  categories?: DanawaCategory[];
}

interface CategoriesResponse {
  groups: CategoryGroup[];
  uncategorized: DanawaCategory[];
  totalGroups: number;
  totalCategories: number;
  allCategories?: DanawaCategory[];
}

// 통합 카테고리 정의 (하위 카테고리는 필터로 처리)
interface UnifiedCategory {
  id: string;
  name: string;
  emoji: string;
  subCategoryCodes: string[]; // 포함될 다나와 카테고리 코드들
}

// 프론트엔드 그룹 정의
interface DisplayGroup {
  id: string;
  name: string;
  categories: UnifiedCategory[];
}

// 연령대 필터 정의
interface AgeFilter {
  id: string;
  label: string;
  emoji: string;
  description: string;
  categoryIds: string[]; // 해당 연령대에 표시할 카테고리 ID들
  groups: {
    name: string;
    description?: string;
    categoryIds: string[];
  }[];
}

const AGE_FILTERS: AgeFilter[] = [
  {
    id: 'all',
    label: '모두',
    emoji: '👶',
    description: '',
    categoryIds: [],
    groups: [],
  },
  {
    id: 'prenatal',
    label: '출산전',
    emoji: '🤰',
    description: '미리 준비 안 해두면 급해져요',
    categoryIds: ['stroller', 'car_seat', 'baby_bottle', 'milk_powder_port', 'diaper', 'baby_wipes', 'thermometer', 'baby_bed'],
    groups: [
      { name: '이동수단', description: '유모차랑 카시트는 미리 준비해두세요', categoryIds: ['stroller', 'car_seat'] },
      { name: '수유용품', description: '젖병이랑 분유포트는 필수예요', categoryIds: ['baby_bottle', 'milk_powder_port'] },
      { name: '기저귀/위생', description: '신생아용 기저귀랑 물티슈 챙기세요', categoryIds: ['diaper', 'baby_wipes'] },
      { name: '건강/안전', description: '체온계는 꼭 챙기세요', categoryIds: ['thermometer'] },
      { name: '유아가구', description: '아기 침대 미리 봐두세요', categoryIds: ['baby_bed'] },
    ],
  },
  {
    id: '0-3m',
    label: '0~3개월',
    emoji: '👶',
    description: '육아템이 본격적으로 필요한 시기예요',
    categoryIds: ['formula', 'baby_formula_dispenser', 'pacifier', 'nasal_aspirator', 'diaper', 'baby_wipes'],
    groups: [
      { name: '수유용품', description: '분유랑 분유제조기 있으면 편해요. 쪽쪽이도 수면에 도움돼요', categoryIds: ['formula', 'baby_formula_dispenser', 'pacifier'] },
      { name: '건강/안전', description: '코막힘 있을 때 코흡입기가 유용해요', categoryIds: ['nasal_aspirator'] },
      { name: '기저귀/위생', description: '기저귀가 2단계로 올라가요', categoryIds: ['diaper', 'baby_wipes'] },
    ],
  },
  {
    id: '4-6m',
    label: '4~6개월',
    emoji: '🥣',
    description: '이유식 시작하면서 많은 게 바뀌어요',
    categoryIds: ['high_chair', 'baby_bottle', 'diaper', 'baby_wipes'],
    groups: [
      { name: '유아가구', description: '이유식 시작하면 식탁의자가 필수예요', categoryIds: ['high_chair'] },
      { name: '수유용품', description: '젖꼭지 단계를 올려줄 때예요', categoryIds: ['baby_bottle'] },
      { name: '기저귀/위생', description: '뒤집기 시작하면 팬티형도 고려해보세요', categoryIds: ['diaper', 'baby_wipes'] },
    ],
  },
  {
    id: '7-12m',
    label: '7~12개월',
    emoji: '🏃',
    description: '움직임이 많아지면서 바꿀 게 생겨요',
    categoryIds: ['stroller', 'car_seat', 'baby_sofa', 'formula', 'pacifier', 'diaper', 'baby_wipes'],
    groups: [
      { name: '이동수단', description: '휴대용 유모차가 필요해지는 시기예요. 카시트도 토들러용으로 바꿔요', categoryIds: ['stroller', 'car_seat'] },
      { name: '유아가구', description: '서고 앉기 시작하면 유아소파가 좋아요', categoryIds: ['baby_sofa'] },
      { name: '수유용품', description: '분유 단계를 올리고, 이앓이 대비 쪽쪽이도 교체해요', categoryIds: ['formula', 'pacifier'] },
      { name: '기저귀/위생', description: '팬티형 기저귀로 정착하는 시기예요', categoryIds: ['diaper', 'baby_wipes'] },
    ],
  },
  {
    id: '13-24m',
    label: '13~24개월',
    emoji: '🐥',
    description: '혼자 하려고 하고, 젖병도 슬슬 졸업해요',
    categoryIds: ['baby_desk', 'baby_sofa', 'formula', 'baby_bottle', 'diaper', 'baby_wipes'],
    groups: [
      { name: '유아가구', description: '그림 그리기 시작하면 책상이랑 소파가 있으면 좋아요', categoryIds: ['baby_desk', 'baby_sofa'] },
      { name: '수유용품', description: '생우유로 바꾸는 시기고, 빨대컵으로 넘어가요', categoryIds: ['formula', 'baby_bottle'] },
      { name: '기저귀/위생', description: '기저귀 사이즈가 대형/특대형으로 올라가요', categoryIds: ['diaper', 'baby_wipes'] },
    ],
  },
  {
    id: '3-4y',
    label: '3~4세',
    emoji: '🎒',
    description: '기저귀 졸업하고 놀이 학습을 시작해요',
    categoryIds: ['car_seat', 'baby_desk', 'high_chair', 'diaper', 'baby_wipes'],
    groups: [
      { name: '이동수단', description: '주니어용 카시트로 바꿀 때예요', categoryIds: ['car_seat'] },
      { name: '유아가구', description: '미술놀이 시작하면 책상이랑 의자가 필요해요', categoryIds: ['baby_desk', 'high_chair'] },
      { name: '기저귀/위생', description: '밤기저귀만 남거나 배변훈련 팬티를 사용해요', categoryIds: ['diaper', 'baby_wipes'] },
    ],
  },
  {
    id: '5-7y',
    label: '5~7세',
    emoji: '🎨',
    description: '키가 크면서 가구도 바꿔줄 때예요',
    categoryIds: ['baby_desk', 'high_chair', 'car_seat', 'thermometer'],
    groups: [
      { name: '유아가구', description: '높이 조절되는 책상이랑 바른 자세 의자가 좋아요', categoryIds: ['baby_desk', 'high_chair'] },
      { name: '이동수단', description: '주니어 카시트는 아직 필수예요', categoryIds: ['car_seat'] },
      { name: '건강/안전', description: '체온계는 계속 필요해요', categoryIds: ['thermometer'] },
    ],
  },
  {
    id: '7y+',
    label: '7세이상',
    emoji: '🏫',
    description: '유아용품을 거의 졸업하는 시기예요',
    categoryIds: ['baby_desk'],
    groups: [
      { name: '유아가구', description: '초등 입학 전에 책상을 마지막으로 바꿔주세요', categoryIds: ['baby_desk'] },
    ],
  },
];

// 카테고리 그룹핑 설정 (id는 logic_map의 category_key와 일치해야 함)
const CATEGORY_GROUPS: DisplayGroup[] = [
  {
    id: 'mobility',
    name: '이동수단',
    categories: [
      {
        id: 'stroller',
        name: '유모차',
        emoji: '🚼',
        subCategoryCodes: ['16349368', '16349193', '16349195', '16349196'],
      },
      {
        id: 'car_seat',
        name: '카시트',
        emoji: '🚗',
        subCategoryCodes: ['16349200', '16349201', '16349202', '16353763'],
      },
    ],
  },
  {
    id: 'feeding',
    name: '수유용품',
    categories: [
      { id: 'formula', name: '분유', emoji: '🥛', subCategoryCodes: ['16249091'] },
      { id: 'baby_formula_dispenser', name: '분유제조기', emoji: '⚙️', subCategoryCodes: ['16349381'] },
      { id: 'milk_powder_port', name: '분유포트', emoji: '🫖', subCategoryCodes: ['16330960'] },
      { id: 'baby_bottle', name: '젖병', emoji: '🍼', subCategoryCodes: ['16349219'] },
      { id: 'pacifier', name: '쪽쪽이/노리개', emoji: '😊', subCategoryCodes: ['16349351'] },
    ],
  },
  {
    id: 'diaper',
    name: '기저귀/위생',
    categories: [
      {
        id: 'diaper',
        name: '기저귀',
        emoji: '🧒',
        subCategoryCodes: ['16349108', '16349109', '16356038', '16349110', '16356040', '16356042'],
      },
      { id: 'baby_wipes', name: '아기물티슈', emoji: '🧻', subCategoryCodes: ['16349119'] },
    ],
  },
  {
    id: 'health',
    name: '건강/안전',
    categories: [
      { id: 'thermometer', name: '체온계', emoji: '🌡️', subCategoryCodes: ['17325941'] },
      { id: 'nasal_aspirator', name: '코흡입기', emoji: '👃', subCategoryCodes: ['16349248'] },
      // ip_camera 숨김 (리뷰 크롤링 불가 - 다나와 페이지 구조 상이)
    ],
  },
  {
    id: 'furniture',
    name: '유아가구',
    categories: [
      { id: 'baby_bed', name: '유아침대', emoji: '🛏️', subCategoryCodes: ['16338152'] },
      { id: 'high_chair', name: '유아의자/식탁의자', emoji: '🪑', subCategoryCodes: ['16338153', '16338154'] },
      { id: 'baby_sofa', name: '유아소파', emoji: '🛋️', subCategoryCodes: ['16338155'] },
      { id: 'baby_desk', name: '유아책상', emoji: '📝', subCategoryCodes: ['16338156'] },
    ],
  },
];

// Age Filter Bar Component - 선택된 것만 pill, 나머지는 텍스트만
function AgeFilterBar({
  selectedAgeId,
  onSelect,
}: {
  selectedAgeId: string;
  onSelect: (ageId: string) => void;
}) {
  return (
    <div className="overflow-x-auto scrollbar-hide -mx-4 px-4">
      <div className="flex items-center gap-1 pb-2" style={{ minWidth: 'max-content' }}>
        {AGE_FILTERS.map((filter) => {
          const isSelected = selectedAgeId === filter.id;
          return (
            <motion.button
              key={filter.id}
              whileTap={{ scale: 0.95 }}
              onClick={() => onSelect(filter.id)}
              className={`py-2 px-4 text-sm font-bold whitespace-nowrap transition-all ${
                isSelected
                  ? 'bg-blue-50 text-blue-600 rounded-full'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {filter.label}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

// Category Card Component - v2 스타일 (그림자 없음, 보더 스타일)
function CategoryCard({
  category,
  isSelected,
  onSelect,
  isLoading,
  hasCompletedRecommendation,
}: {
  category: UnifiedCategory;
  isSelected: boolean;
  onSelect: (category: UnifiedCategory) => void;
  isLoading: boolean;
  hasCompletedRecommendation?: boolean;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={() => onSelect(category)}
      disabled={isLoading}
      className={`rounded-2xl p-4 transition-all duration-200 text-left border ${
        isLoading
          ? 'bg-blue-100 border-blue-200 animate-pulse'
          : isSelected
            ? 'bg-blue-50 border-transparent'
            : 'bg-gray-50 border-transparent hover:bg-gray-100 active:bg-gray-200 active:opacity-70'
      }`}
    >
      {/* Emoji/Spinner + Category Name */}
      <div className="flex items-center gap-2">
        <span className="text-base w-5 h-5 flex items-center justify-center">
          {isLoading ? (
            <svg className="w-4 h-4 animate-spin text-blue-500" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          ) : (
            category.emoji
          )}
        </span>
        <span className={`text-sm font-semibold ${isLoading ? 'text-blue-600' : 'text-gray-900'}`}>
          {category.name}
        </span>
      </div>
      {/* 추천 완료 태그 - 텍스트 아래 배치 */}
      {hasCompletedRecommendation && !isLoading && (
        <div className="mt-1 ml-7">
          <span className="px-2 py-0.5 bg-white text-gray-500 text-[10px] font-medium rounded-full border border-gray-200">
            추천 완료
          </span>
        </div>
      )}
    </motion.button>
  );
}

// Group Section Component (for "모두" filter)
function GroupSection({
  group,
  selectedCategory,
  onCategorySelect,
  loadingCategoryId,
  completedCategories,
}: {
  group: DisplayGroup;
  selectedCategory: UnifiedCategory | null;
  onCategorySelect: (category: UnifiedCategory) => void;
  loadingCategoryId: string | null;
  completedCategories: Set<string>;
}) {
  if (group.categories.length === 0) return null;

  return (
    <div className="mb-6 mt-2">
      {/* 그룹 타이틀 */}
      <div className="mb-3">
        <span className="inline-block px-3 py-1.5 bg-green-50 text-green-600 text-sm font-semibold rounded-full">
          {group.name}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {group.categories.map((category) => (
          <CategoryCard
            key={category.id}
            category={category}
            isSelected={selectedCategory?.id === category.id}
            onSelect={onCategorySelect}
            isLoading={loadingCategoryId === category.id}
            hasCompletedRecommendation={completedCategories.has(category.id)}
          />
        ))}
      </div>
    </div>
  );
}

// Age Group Section Component (for age-specific filters)
function AgeGroupSection({
  groupName,
  description,
  categoryIds,
  selectedCategory,
  onCategorySelect,
  loadingCategoryId,
  completedCategories,
}: {
  groupName: string;
  description?: string;
  categoryIds: string[];
  selectedCategory: UnifiedCategory | null;
  onCategorySelect: (category: UnifiedCategory) => void;
  loadingCategoryId: string | null;
  completedCategories: Set<string>;
}) {
  // Find matching UnifiedCategories from CATEGORY_GROUPS
  const categories = categoryIds
    .map((id) => {
      for (const group of CATEGORY_GROUPS) {
        const found = group.categories.find((c) => c.id === id);
        if (found) return found;
      }
      return null;
    })
    .filter((c): c is UnifiedCategory => c !== null);

  if (categories.length === 0) return null;

  return (
    <div className="mb-6 mt-8">
      {/* 그룹 타이틀 */}
      <div className="mb-3">
        <span className="inline-block px-3 py-1.5 bg-green-50 text-green-600 text-sm font-semibold rounded-full">
          {groupName}
        </span>
        {description && (
          <p className="text-xs text-gray-500 mt-2 ml-1">{description}</p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {categories.map((category) => (
          <CategoryCard
            key={category.id}
            category={category}
            isSelected={selectedCategory?.id === category.id}
            onSelect={onCategorySelect}
            isLoading={loadingCategoryId === category.id}
            hasCompletedRecommendation={completedCategories.has(category.id)}
          />
        ))}
      </div>
    </div>
  );
}

export default function CategoriesV2Page() {
  const router = useRouter();
  const [selectedCategory, setSelectedCategory] = useState<UnifiedCategory | null>(null);
  const [allCategories, setAllCategories] = useState<DanawaCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAgeId, setSelectedAgeId] = useState<string>('all');
  const [loadingCategoryId, setLoadingCategoryId] = useState<string | null>(null);
  const [completedCategories, setCompletedCategories] = useState<Set<string>>(new Set());
  const [isCategoryGuideOpen, setIsCategoryGuideOpen] = useState(false);
  const [initialUserInput, setInitialUserInput] = useState<string>('');

  // 현재 선택된 연령대 필터
  const selectedAgeFilter = AGE_FILTERS.find((f) => f.id === selectedAgeId) || AGE_FILTERS[0];

  // 페이지뷰 로깅
  useEffect(() => {
    logPageView('categories-v2');
  }, []);

  // 세션 스토리지에서 추천 완료된 카테고리 확인
  useEffect(() => {
    const completed = new Set<string>();

    // 모든 카테고리 ID를 순회하며 세션 스토리지에 결과가 있는지 확인
    CATEGORY_GROUPS.forEach((group) => {
      group.categories.forEach((category) => {
        const resultKey = `v2_result_${category.id}`;
        const hasResult = sessionStorage.getItem(resultKey);
        if (hasResult) {
          completed.add(category.id);
        }
      });
    });

    setCompletedCategories(completed);
  }, []);

  // Supabase 카테고리 데이터 로드
  useEffect(() => {
    async function fetchCategories() {
      try {
        const res = await fetch('/api/categories-v2');
        if (!res.ok) {
          throw new Error('카테고리를 불러오는데 실패했습니다.');
        }
        const json: CategoriesResponse = await res.json();
        
        // 모든 카테고리를 하나의 배열로 합침
        const categories: DanawaCategory[] = [];
        if (json.groups) {
          json.groups.forEach((group) => {
            if (group.categories) {
              categories.push(...group.categories);
            }
          });
        }
        if (json.uncategorized) {
          categories.push(...json.uncategorized);
        }
        
        setAllCategories(categories);
      } catch (err) {
        console.error('Failed to fetch categories:', err);
        setError(err instanceof Error ? err.message : '알 수 없는 오류');
      } finally {
        setLoading(false);
      }
    }

    fetchCategories();
  }, []);

  const handleCategorySelect = (category: UnifiedCategory) => {
    setSelectedCategory(category);
    setLoadingCategoryId(category.id);

    // 카테고리 선택 로깅
    logButtonClick(`카테고리 v2 선택: ${category.name}`, 'categories-v2');

    // 페이지 이동
    router.push(`/recommend-v2/${category.id}`);
  };

  // 로딩 상태
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="max-w-[480px] w-full">
          <LoadingSpinner size="lg" message="카테고리 불러오는 중..." />
        </div>
      </div>
    );
  }

  // 에러 상태
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="max-w-[480px] w-full px-6 text-center">
          <div className="text-red-500 mb-4">⚠️</div>
          <p className="text-gray-700 font-medium">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm"
          >
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-[480px] mx-auto min-h-screen">
        {/* Top Header with Back Button */}
        <header className="sticky top-0 bg-white z-50 border-b border-gray-100">
          <div className="px-5 py-4">
            <div className="flex items-center justify-between">
              <button
                onClick={() => router.push('/')}
                className="text-gray-600 hover:text-gray-900 transition-colors"
              >
                <CaretLeft size={20} weight="bold" />
              </button>
              <div className="absolute left-1/2 -translate-x-1/2">
                <h1 className="text-base font-semibold text-gray-900">
                  전체 카테고리
                </h1>
              </div>
              <div className="w-6" />
            </div>
          </div>
        </header>

        <motion.div
          className="px-4 py-6 pb-24"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          {/* 연령대 필터 */}
          <div className="mb-1">
            <AgeFilterBar
              selectedAgeId={selectedAgeId}
              onSelect={(ageId) => {
                setSelectedAgeId(ageId);
                // 연령대 필터 선택 로깅
                const ageFilter = AGE_FILTERS.find(f => f.id === ageId);
                if (ageFilter) {
                  logAgeBadgeSelection(ageFilter.label, ageId);
                }
              }}
            />
          </div>

          {/* 연령대별 설명 카드 */}
          {selectedAgeFilter.id !== 'all' && selectedAgeFilter.description && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="mb-4 bg-blue-50 rounded-2xl p-5"
            >
              <div className="flex items-center gap-3 mb-2">
                <span className="text-2xl">{selectedAgeFilter.emoji}</span>
                <h3 className="font-bold text-gray-900 text-[15px]">{selectedAgeFilter.label}</h3>
              </div>
              <p className="text-[15px] text-gray-600 leading-relaxed">{selectedAgeFilter.description}</p>
            </motion.div>
          )}

          {/* 디바이더 */}
          <div className="border-b border-gray-100 mb-6 -mx-4" />

          {/* 그룹별 카테고리 표시 */}
          {selectedAgeFilter.id === 'all' ? (
            // "모두" 선택 시 기존 그룹핑
            CATEGORY_GROUPS.map((group) => (
              <GroupSection
                key={group.id}
                group={group}
                selectedCategory={selectedCategory}
                onCategorySelect={handleCategorySelect}
                loadingCategoryId={loadingCategoryId}
                completedCategories={completedCategories}
              />
            ))
          ) : (
            // 연령대 선택 시 해당 연령대의 그룹핑
            selectedAgeFilter.groups.map((group, idx) => (
              <AgeGroupSection
                key={`${selectedAgeFilter.id}-${idx}`}
                groupName={group.name}
                description={group.description}
                categoryIds={group.categoryIds}
                selectedCategory={selectedCategory}
                onCategorySelect={handleCategorySelect}
                loadingCategoryId={loadingCategoryId}
                completedCategories={completedCategories}
              />
            ))
          )}

          {/* 빈 상태 */}
          {allCategories.length === 0 && !loading && (
            <div className="text-center py-12">
              <div className="text-4xl mb-4">📭</div>
              <p className="text-gray-500">아직 등록된 카테고리가 없습니다.</p>
            </div>
          )}
        </motion.div>
      </div>

      {/* AI 도움받기 바텀시트 */}
      <AIHelperBottomSheet
        isOpen={isCategoryGuideOpen}
        onClose={() => setIsCategoryGuideOpen(false)}
        questionType="category_selection"
        questionId="category_select"
        questionText="어떤 상품을 찾고 계신가요?"
        options={CATEGORY_GROUPS.flatMap(g => g.categories).map(c => ({
          value: c.id,
          label: c.name
        }))}
        category="all"
        categoryName="전체"
        onNaturalLanguageInput={(stage, input) => {
          // 카테고리 선택 단계의 자연어 입력 저장
          setInitialUserInput(input);
        }}
        onSelectOptions={(selectedCategoryIds) => {
          // 첫 번째 추천 카테고리로 바로 이동
          if (selectedCategoryIds.length > 0) {
            const categoryId = selectedCategoryIds[0];

            // 자연어 입력이 있으면 sessionStorage에 저장
            if (initialUserInput) {
              try {
                const naturalLanguageInput = {
                  stage: 'category_selection',
                  timestamp: new Date().toISOString(),
                  input: initialUserInput,
                };
                sessionStorage.setItem(
                  `v2_initial_context_${categoryId}`,
                  JSON.stringify(naturalLanguageInput)
                );
                console.log('✅ [categories-v2] Initial context saved:', naturalLanguageInput);
              } catch (e) {
                console.warn('[categories-v2] Failed to save initial context:', e);
              }
            }

            logButtonClick(`AI 추천 카테고리 선택: ${categoryId}`, 'categories-v2');
            router.push(`/recommend-v2/${categoryId}`);
          }
          setIsCategoryGuideOpen(false);
        }}
      />

      {/* 플로팅 AI 도움받기 버튼 */}
      <div className="fixed bottom-0 left-0 right-0 z-50 pointer-events-none">
        <div className="max-w-[480px] mx-auto px-4 pb-4 pointer-events-auto">
          <div className="bg-linear-to-t from-white via-white to-transparent pt-4">
            <AIHelperButton
              onClick={() => setIsCategoryGuideOpen(true)}
              label="뭘 사야 할지 모르겠어요"
              questionType="category_selection"
              questionId="category_select"
              questionText="어떤 상품을 찾고 계신가요?"
              category="all"
              categoryName="전체"
              variant="emphasized"
              className="h-14! rounded-2xl! border-2 shadow-lg [&>span]:text-base!"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
