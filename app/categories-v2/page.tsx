'use client';

import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { CaretLeft } from '@phosphor-icons/react/dist/ssr';
import { logPageView, logButtonClick } from '@/lib/logging/clientLogger';
import { LoadingSpinner } from '@/components/LoadingSpinner';

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
    categoryIds: ['stroller', 'car_seat', 'baby_bottle', 'formula_pot', 'diaper', 'baby_wipes', 'thermometer', 'ip_camera', 'baby_bed'],
    groups: [
      { name: '이동수단', description: '유모차랑 카시트는 미리 준비해두세요', categoryIds: ['stroller', 'car_seat'] },
      { name: '수유용품', description: '젖병이랑 분유포트는 필수예요', categoryIds: ['baby_bottle', 'formula_pot'] },
      { name: '기저귀/위생', description: '신생아용 기저귀랑 물티슈 챙기세요', categoryIds: ['diaper', 'baby_wipes'] },
      { name: '건강/안전', description: '체온계는 꼭 챙기시고, 홈캠도 있으면 안심돼요', categoryIds: ['thermometer', 'ip_camera'] },
      { name: '유아가구', description: '아기 침대 미리 봐두세요', categoryIds: ['baby_bed'] },
    ],
  },
  {
    id: '0-3m',
    label: '0~3개월',
    emoji: '👶',
    description: '육아템이 본격적으로 필요한 시기예요',
    categoryIds: ['formula', 'formula_maker', 'pacifier', 'nasal_aspirator', 'diaper', 'baby_wipes'],
    groups: [
      { name: '수유용품', description: '분유랑 분유제조기 있으면 편해요. 쪽쪽이도 수면에 도움돼요', categoryIds: ['formula', 'formula_maker', 'pacifier'] },
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
        subCategoryCodes: ['16349368', '16349193', '16349195', '16349196'],
      },
      {
        id: 'car_seat',
        name: '카시트',
        subCategoryCodes: ['16349200', '16349201', '16349202', '16353763'],
      },
    ],
  },
  {
    id: 'feeding',
    name: '수유용품',
    categories: [
      { id: 'formula', name: '분유', subCategoryCodes: ['16249091'] },
      { id: 'formula_maker', name: '분유제조기', subCategoryCodes: ['16349381'] },
      { id: 'formula_pot', name: '분유포트', subCategoryCodes: ['16330960'] },
      { id: 'baby_bottle', name: '젖병', subCategoryCodes: ['16349219'] },
      { id: 'pacifier', name: '쪽쪽이/노리개', subCategoryCodes: ['16349351'] },
    ],
  },
  {
    id: 'diaper',
    name: '기저귀/위생',
    categories: [
      {
        id: 'diaper',
        name: '기저귀',
        subCategoryCodes: ['16349108', '16349109', '16356038', '16349110', '16356040', '16356042'],
      },
      { id: 'baby_wipes', name: '아기물티슈', subCategoryCodes: ['16349119'] },
    ],
  },
  {
    id: 'health',
    name: '건강/안전',
    categories: [
      { id: 'thermometer', name: '체온계', subCategoryCodes: ['17325941'] },
      { id: 'nasal_aspirator', name: '코흡입기', subCategoryCodes: ['16349248'] },
      { id: 'ip_camera', name: '홈캠', subCategoryCodes: ['11427546'] },
    ],
  },
  {
    id: 'furniture',
    name: '유아가구',
    categories: [
      { id: 'baby_bed', name: '유아침대', subCategoryCodes: ['16338152'] },
      { id: 'high_chair', name: '유아의자/식탁의자', subCategoryCodes: ['16338153', '16338154'] },
      { id: 'baby_sofa', name: '유아소파', subCategoryCodes: ['16338155'] },
      { id: 'baby_desk', name: '유아책상', subCategoryCodes: ['16338156'] },
    ],
  },
];

// 카테고리별 상품 수 계산
function getCategoryProductCount(
  unifiedCategory: UnifiedCategory,
  allCategories: DanawaCategory[]
): number {
  return unifiedCategory.subCategoryCodes.reduce((sum, code) => {
    const cat = allCategories.find(c => c.category_code === code);
    return sum + (cat?.crawled_product_count || 0);
  }, 0);
}

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
  productCount,
  isSelected,
  onSelect,
}: {
  category: UnifiedCategory;
  productCount: number;
  isSelected: boolean;
  onSelect: (category: UnifiedCategory) => void;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={() => onSelect(category)}
      className={`rounded-2xl p-4 transition-all duration-200 text-left border ${
        isSelected
          ? 'bg-blue-50 border-transparent'
          : 'bg-gray-50 border-transparent hover:bg-gray-100'
      }`}
    >
      {/* Category Name + 상품 수 (세로 가운데 정렬) */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-900">
          {category.name}
        </span>
        {productCount > 0 && (
          <span className="text-xs text-gray-400">
            {productCount}개
          </span>
        )}
      </div>
    </motion.button>
  );
}

// Group Section Component (for "모두" filter)
function GroupSection({
  group,
  allCategories,
  selectedCategory,
  onCategorySelect,
}: {
  group: DisplayGroup;
  allCategories: DanawaCategory[];
  selectedCategory: UnifiedCategory | null;
  onCategorySelect: (category: UnifiedCategory) => void;
}) {
  if (group.categories.length === 0) return null;

  return (
    <div className="mb-6">
      {/* 그룹 타이틀 - 태그 스타일 (초록색) */}
      <div className="mb-3">
        <span className="inline-block px-3 py-1.5 bg-green-50 text-green-600 text-xs font-semibold rounded-full">
          {group.name}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {group.categories.map((category) => {
          const productCount = getCategoryProductCount(category, allCategories);
          return (
            <CategoryCard
              key={category.id}
              category={category}
              productCount={productCount}
              isSelected={selectedCategory?.id === category.id}
              onSelect={onCategorySelect}
            />
          );
        })}
      </div>
    </div>
  );
}

// Age Group Section Component (for age-specific filters)
function AgeGroupSection({
  groupName,
  description,
  categoryIds,
  allCategories,
  selectedCategory,
  onCategorySelect,
}: {
  groupName: string;
  description?: string;
  categoryIds: string[];
  allCategories: DanawaCategory[];
  selectedCategory: UnifiedCategory | null;
  onCategorySelect: (category: UnifiedCategory) => void;
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
    <div className="mb-6">
      {/* 그룹 타이틀 - 태그 스타일 (초록색) */}
      <div className="mb-3">
        <span className="inline-block px-3 py-1.5 bg-green-50 text-green-600 text-xs font-medium rounded-full">
          {groupName}
        </span>
        {description && (
          <p className="text-sm text-gray-500 mt-2 ml-2">{description}</p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {categories.map((category) => {
          const productCount = getCategoryProductCount(category, allCategories);
          return (
            <CategoryCard
              key={category.id}
              category={category}
              productCount={productCount}
              isSelected={selectedCategory?.id === category.id}
              onSelect={onCategorySelect}
            />
          );
        })}
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

  // 현재 선택된 연령대 필터
  const selectedAgeFilter = AGE_FILTERS.find((f) => f.id === selectedAgeId) || AGE_FILTERS[0];

  // 페이지뷰 로깅
  useEffect(() => {
    logPageView('categories-v2');
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

    // 카테고리 선택 로깅
    logButtonClick(`카테고리 v2 선택: ${category.name}`, 'categories-v2');

    // 약간의 delay 후 추천 페이지로 이동
    setTimeout(() => {
      router.push(`/recommend-v2/${category.id}`);
    }, 200);
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
                  추천받을 상품을 골라주세요
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
          <div className="mb-4">
            <AgeFilterBar
              selectedAgeId={selectedAgeId}
              onSelect={setSelectedAgeId}
            />
          </div>

          {/* 연령대별 설명 카드 - CheckpointVisual 스타일 */}
          {selectedAgeFilter.id !== 'all' && selectedAgeFilter.description && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 bg-white rounded-2xl border border-blue-100 p-5"
            >
              <div className="flex items-center gap-3 mb-2">
                <span className="text-2xl">{selectedAgeFilter.emoji}</span>
                <h3 className="font-bold text-gray-900 text-[15px]">{selectedAgeFilter.label}</h3>
              </div>
              <p className="text-[15px] text-gray-600 leading-relaxed">{selectedAgeFilter.description}</p>
            </motion.div>
          )}

          {/* 그룹별 카테고리 표시 */}
          {selectedAgeFilter.id === 'all' ? (
            // "모두" 선택 시 기존 그룹핑
            CATEGORY_GROUPS.map((group) => (
              <GroupSection
                key={group.id}
                group={group}
                allCategories={allCategories}
                selectedCategory={selectedCategory}
                onCategorySelect={handleCategorySelect}
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
                allCategories={allCategories}
                selectedCategory={selectedCategory}
                onCategorySelect={handleCategorySelect}
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
    </div>
  );
}
