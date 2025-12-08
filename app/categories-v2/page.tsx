'use client';

import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useState, useEffect, useMemo } from 'react';
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

interface CategoriesResponse {
  groups: unknown[];
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

// 카테고리 그룹핑 설정
const CATEGORY_GROUPS: DisplayGroup[] = [
  {
    id: 'mobility',
    name: '이동수단',
    categories: [
      {
        id: 'stroller',
        name: '유모차',
        subCategoryCodes: ['16349368', '16349193', '16349195', '16349196'], // 절충형, 디럭스형, 휴대용/트라이크, 쌍둥이용
      },
      {
        id: 'car_seat',
        name: '카시트',
        subCategoryCodes: ['16349200', '16349201', '16349202', '16353763'], // 일체형, 분리형, 바구니형, 부스터형
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
      { id: 'bottle', name: '젖병', subCategoryCodes: ['16349219'] },
      { id: 'nipple', name: '젖꼭지/노리개', subCategoryCodes: ['16349351'] },
    ],
  },
  {
    id: 'diaper',
    name: '기저귀/위생',
    categories: [
      {
        id: 'diaper',
        name: '기저귀',
        subCategoryCodes: ['16349108', '16349109', '16356038', '16349110', '16356040', '16356042'], // 하기스, 팸퍼스, 마미포코, 보솜이, 나비잠, 그외
      },
      { id: 'wet_tissue', name: '아기물티슈', subCategoryCodes: ['16349119'] },
    ],
  },
  {
    id: 'health',
    name: '건강/안전',
    categories: [
      { id: 'thermometer', name: '체온계', subCategoryCodes: ['17325941'] },
      { id: 'nasal', name: '코흡입/투약기', subCategoryCodes: ['16349248'] },
      { id: 'monitor', name: '베이비모니터', subCategoryCodes: ['11427546'] },
    ],
  },
  {
    id: 'furniture',
    name: '유아가구',
    categories: [
      { id: 'bed', name: '유아침대', subCategoryCodes: ['16338152'] },
      { id: 'chair', name: '유아의자', subCategoryCodes: ['16338153'] },
      { id: 'high_chair', name: '유아식탁의자', subCategoryCodes: ['16338154'] },
      { id: 'sofa', name: '유아소파', subCategoryCodes: ['16338155'] },
      { id: 'desk', name: '유아책상', subCategoryCodes: ['16338156'] },
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

// Category Card Component
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
      whileTap={{ scale: 0.96, opacity: 0.7 }}
      whileHover={{ scale: 1.02 }}
      animate={{ scale: isSelected ? 1.03 : 1 }}
      onClick={() => onSelect(category)}
      className={`rounded-2xl p-4 transition-all duration-200 relative overflow-hidden text-left ${
        isSelected
          ? 'bg-white ring-4 ring-inset ring-[#93C5FD]'
          : 'bg-white hover:bg-gray-50 shadow-sm'
      }`}
    >
      {/* 상품 수 뱃지 */}
      {productCount > 0 && (
        <div className="absolute top-2 right-2 z-20 px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-[10px] font-semibold">
          {productCount}개
        </div>
      )}

      <div className="relative z-10">
        {/* Category Name */}
        <div className="text-sm font-semibold text-gray-900 leading-snug">
          {category.name}
        </div>
      </div>
    </motion.button>
  );
}

// Group Section Component
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
      <h2 className="text-sm font-bold text-gray-700 mb-3 px-1">
        {group.name}
      </h2>
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

export default function CategoriesV2Page() {
  const router = useRouter();
  const [selectedCategory, setSelectedCategory] = useState<UnifiedCategory | null>(null);
  const [allCategories, setAllCategories] = useState<DanawaCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
          json.groups.forEach((group: { categories?: DanawaCategory[] }) => {
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

  // 총 상품 수 계산
  const totalProducts = useMemo(() => {
    return allCategories.reduce((sum, cat) => sum + (cat.crawled_product_count || 0), 0);
  }, [allCategories]);

  const handleCategorySelect = (category: UnifiedCategory) => {
    setSelectedCategory(category);

    // 카테고리 선택 로깅
    logButtonClick(`카테고리 v2 선택: ${category.name}`, 'categories-v2');

    // 약간의 delay 후 이동 (선택 feedback)
    // TODO: 다음 단계 페이지로 이동 (예: /tags-v2?category=xxx)
    setTimeout(() => {
      const productCount = getCategoryProductCount(category, allCategories);
      // 임시로 알림 표시 (추후 다음 단계 구현 시 이동)
      alert(`선택된 카테고리: ${category.name}\n상품 수: ${productCount}개\n포함 코드: ${category.subCategoryCodes.join(', ')}\n\n다음 단계는 추후 구현 예정입니다.`);
    }, 200);
  };

  // 로딩 상태
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F8F9FB' }}>
        <div className="max-w-[480px] w-full">
          <LoadingSpinner size="lg" message="카테고리 불러오는 중..." />
        </div>
      </div>
    );
  }

  // 에러 상태
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F8F9FB' }}>
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
    <div className="min-h-screen" style={{ backgroundColor: '#F8F9FB' }}>
      <div className="max-w-[480px] mx-auto min-h-screen">
        {/* Top Header with Back Button */}
        <header className="sticky top-0 bg-gray-50 z-50">
          <div className="px-5 py-3">
            <div className="flex items-center justify-between">
              <button
                onClick={() => router.push('/')}
                className="text-gray-600 hover:text-gray-900 transition-colors"
              >
                <CaretLeft size={20} weight="bold" />
              </button>
              <div className="absolute left-1/2 -translate-x-1/2">
                <h1 className="text-m font-semibold text-gray-900">
                  추천받을 상품을 골라주세요
                </h1>
              </div>
              <div className="w-6" /> {/* Spacer for alignment */}
            </div>
          </div>
          
          {/* V2 뱃지 */}
          <div className="px-5 pb-2">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs font-semibold">
              v2 테스트
            </span>
          </div>
        </header>

        <motion.div
          className="px-4 py-6 pb-24"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          {/* 데이터 요약 */}
          <div className="mb-6 p-3 bg-blue-50 rounded-xl text-sm text-blue-800">
            총 <strong>{totalProducts.toLocaleString()}</strong>개 상품
          </div>

          {/* 그룹별 카테고리 표시 */}
          {CATEGORY_GROUPS.map((group) => (
            <GroupSection
              key={group.id}
              group={group}
              allCategories={allCategories}
              selectedCategory={selectedCategory}
              onCategorySelect={handleCategorySelect}
            />
          ))}

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
