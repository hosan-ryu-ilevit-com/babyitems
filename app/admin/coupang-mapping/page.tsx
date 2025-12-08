'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';

interface DanawaProduct {
  pcode: string;
  title: string;
  brand: string | null;
  price: number | null;
  thumbnail: string | null;
  category_code: string;
  coupang_pcode: string | null;
  danawa_categories: {
    category_name: string;
    group_id: string;
  };
}

interface CoupangProduct {
  index: number;
  product_id: string | null;
  name: string;
  thumbnail: string;
  price: string;
  rating: string | number;
  review_count: number;
  url: string;
}

interface DanawaCategory {
  category_code: string;
  category_name: string;
  group_id: string;
  crawled_product_count: number;
}

interface CategoryGroup {
  id: string;
  name: string;
  categories: DanawaCategory[];
}

interface PreloadedResult {
  pcode: string;
  danawaProduct: DanawaProduct;
  coupangProducts: CoupangProduct[];
  loading: boolean;
  error?: string;
}

const PRELOAD_COUNT = 5; // 미리 로딩할 개수

// 다나와 썸네일 URL 수정 (잘못된 &_v= → ?_v= 변환)
const fixThumbnailUrl = (url: string | null): string | null => {
  if (!url) return null;
  // &_v= 를 ?_v= 로 수정 (URL 형식 오류 수정)
  return url.replace('&_v=', '?_v=');
};

export default function CoupangMappingPage() {
  const [products, setProducts] = useState<DanawaProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [categoryGroups, setCategoryGroups] = useState<CategoryGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [onlyUnmapped, setOnlyUnmapped] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // 프로세스 모드
  const [processMode, setProcessMode] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [preloadedResults, setPreloadedResults] = useState<Map<string, PreloadedResult>>(new Map());
  const [completedCount, setCompletedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  
  // 로딩 중인 인덱스 추적
  const loadingIndexRef = useRef<Set<number>>(new Set());

  // 카테고리 목록 가져오기
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const res = await fetch('/api/admin/danawa-categories');
        const data = await res.json();
        setCategoryGroups(data.groups || []);
      } catch (error) {
        console.error('Failed to fetch categories:', error);
      }
    };
    fetchCategories();
  }, []);

  // 선택된 그룹의 카테고리 목록
  const currentGroupCategories = categoryGroups.find(g => g.id === selectedGroup)?.categories || [];

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '50', // 프로세스 모드를 위해 더 많이 가져옴
        unmapped: onlyUnmapped.toString(),
      });
      if (selectedCategory) {
        params.set('category', selectedCategory);
      } else if (selectedGroup) {
        params.set('group', selectedGroup);
      }

      const res = await fetch(`/api/admin/danawa-products?${params}`);
      const data = await res.json();

      setProducts(data.products || []);
      setTotalPages(data.totalPages || 1);
      setTotal(data.total || 0);
      setPreloadedResults(new Map());
      setCurrentIndex(0);
      setCompletedCount(0);
      setSkippedCount(0);
      loadingIndexRef.current = new Set();
    } catch (error) {
      console.error('Failed to fetch products:', error);
    } finally {
      setLoading(false);
    }
  }, [page, selectedGroup, selectedCategory, onlyUnmapped]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // 쿠팡 검색 함수
  const searchCoupang = async (product: DanawaProduct): Promise<CoupangProduct[]> => {
    try {
      const query = product.title;
      const res = await fetch(`/api/admin/coupang-search?q=${encodeURIComponent(query)}&limit=12`);
      const data = await res.json();
      return data.products || [];
    } catch (error) {
      console.error('Coupang search failed:', error);
      return [];
    }
  };

  // 백그라운드 프리로딩
  const preloadResults = useCallback(async (startIndex: number) => {
    for (let i = startIndex; i < Math.min(startIndex + PRELOAD_COUNT, products.length); i++) {
      const product = products[i];
      if (!product) continue;
      
      // 이미 로딩됨 or 로딩 중이면 스킵
      if (preloadedResults.has(product.pcode) || loadingIndexRef.current.has(i)) {
        continue;
      }

      // 로딩 시작 마킹
      loadingIndexRef.current.add(i);

      // 로딩 중 상태 설정
      setPreloadedResults(prev => {
        const next = new Map(prev);
        next.set(product.pcode, {
          pcode: product.pcode,
          danawaProduct: product,
          coupangProducts: [],
          loading: true,
        });
        return next;
      });

      // 비동기 검색
      searchCoupang(product).then(coupangProducts => {
        setPreloadedResults(prev => {
          const next = new Map(prev);
          next.set(product.pcode, {
            pcode: product.pcode,
            danawaProduct: product,
            coupangProducts,
            loading: false,
          });
          return next;
        });
        loadingIndexRef.current.delete(i);
      });
    }
  }, [products, preloadedResults]);

  // 프로세스 모드 시작 시 프리로딩
  useEffect(() => {
    if (processMode && products.length > 0) {
      preloadResults(currentIndex);
    }
  }, [processMode, currentIndex, products.length, preloadResults]);

  // 프로세스 모드 시작
  const startProcessMode = () => {
    setProcessMode(true);
    setCurrentIndex(0);
    setCompletedCount(0);
    setSkippedCount(0);
    setPreloadedResults(new Map());
    loadingIndexRef.current = new Set();
  };

  // 프로세스 모드 종료
  const exitProcessMode = () => {
    setProcessMode(false);
    setPreloadedResults(new Map());
    loadingIndexRef.current = new Set();
  };

  // 선택 처리
  const selectCoupangProduct = async (danawaCode: string, coupangProduct: CoupangProduct) => {
    try {
      const res = await fetch('/api/admin/update-coupang-pcode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pcode: danawaCode,
          coupang_pcode: coupangProduct.product_id,
          average_rating: typeof coupangProduct.rating === 'number' 
            ? coupangProduct.rating 
            : parseFloat(String(coupangProduct.rating)) || null,
          review_count: coupangProduct.review_count || 0,
          coupang_thumbnail: coupangProduct.thumbnail || null,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setCompletedCount(c => c + 1);
        goToNext();
      }
    } catch (error) {
      console.error('Update failed:', error);
    }
  };

  // 스킵
  const skipCurrent = () => {
    setSkippedCount(c => c + 1);
    goToNext();
  };

  // 다음으로 이동
  const goToNext = () => {
    if (currentIndex < products.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      // 모든 제품 처리 완료
      exitProcessMode();
      fetchProducts(); // 새로고침
    }
  };

  // 현재 제품 데이터
  const currentProduct = products[currentIndex];
  const currentResult = currentProduct ? preloadedResults.get(currentProduct.pcode) : null;

  // 키보드 단축키 (1-9, 0=10, q=11, w=12)
  useEffect(() => {
    if (!processMode || !currentResult || currentResult.loading) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      
      let idx = -1;
      if (key >= '1' && key <= '9') {
        idx = parseInt(key) - 1;
      } else if (key === '0') {
        idx = 9; // 10번째
      } else if (key === 'q') {
        idx = 10; // 11번째
      } else if (key === 'w') {
        idx = 11; // 12번째
      } else if (key === 's' || key === 'Escape') {
        skipCurrent();
        return;
      }

      if (idx >= 0) {
        const cp = currentResult.coupangProducts[idx];
        if (cp?.product_id && currentProduct) {
          selectCoupangProduct(currentProduct.pcode, cp);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [processMode, currentResult, currentProduct]);

  // 일반 모드 UI
  if (!processMode) {
    return (
      <div className="min-h-screen bg-gray-100 p-6">
        <div className="max-w-4xl mx-auto">
          {/* 헤더 */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-2xl font-bold text-gray-800">
                🛒 쿠팡 Product ID 매핑
              </h1>
              <Link 
                href="/admin"
                className="text-blue-600 hover:text-blue-800 text-sm"
              >
                ← Admin 홈으로
              </Link>
            </div>

            {/* 필터 */}
            <div className="flex flex-wrap gap-4 items-center mb-6">
              {/* 그룹 선택 */}
              <select
                value={selectedGroup}
                onChange={(e) => { 
                  setSelectedGroup(e.target.value); 
                  setSelectedCategory(''); 
                  setPage(1); 
                }}
                className="border rounded-lg px-4 py-2 bg-white"
              >
                <option value="">전체 그룹</option>
                {categoryGroups.map(group => (
                  <option key={group.id} value={group.id}>
                    {group.name} ({group.categories?.reduce((sum, c) => sum + (c.crawled_product_count || 0), 0)})
                  </option>
                ))}
              </select>

              {/* 상세 카테고리 선택 */}
              <select
                value={selectedCategory}
                onChange={(e) => { setSelectedCategory(e.target.value); setPage(1); }}
                className="border rounded-lg px-4 py-2 bg-white"
                disabled={!selectedGroup}
              >
                <option value="">
                  {selectedGroup ? '전체 (그룹 내)' : '그룹 먼저 선택'}
                </option>
                {currentGroupCategories.map(cat => (
                  <option key={cat.category_code} value={cat.category_code}>
                    {cat.category_name} ({cat.crawled_product_count || 0})
                  </option>
                ))}
              </select>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={onlyUnmapped}
                  onChange={(e) => { setOnlyUnmapped(e.target.checked); setPage(1); }}
                  className="w-4 h-4"
                />
                <span className="text-gray-700">미매핑만 보기</span>
              </label>

              <div className="text-gray-600">
                총 <span className="font-bold text-blue-600">{total}</span>개
              </div>
            </div>

            {/* 프로세스 시작 버튼 */}
            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
                <p className="mt-4 text-gray-600">로딩 중...</p>
              </div>
            ) : products.length > 0 ? (
              <div className="text-center py-8">
                <button
                  onClick={startProcessMode}
                  className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white text-xl font-bold px-8 py-4 rounded-xl shadow-lg transform hover:scale-105 transition-all"
                >
                  🚀 매핑 프로세스 시작하기
                </button>
                <p className="mt-4 text-gray-500">
                  {products.length}개 제품을 순차적으로 매핑합니다
                </p>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                매핑할 제품이 없습니다
              </div>
            )}
          </div>

          {/* 페이지네이션 */}
          {totalPages > 1 && (
            <div className="flex justify-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 bg-white rounded-lg shadow disabled:opacity-50"
              >
                ← 이전
              </button>
              <span className="px-4 py-2 bg-white rounded-lg shadow">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-4 py-2 bg-white rounded-lg shadow disabled:opacity-50"
              >
                다음 →
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 프로세스 모드 UI
  return (
    <div className="min-h-screen bg-gray-900 p-6">
      <div className="max-w-6xl mx-auto">
        {/* 상단 상태바 */}
        <div className="bg-gray-800 rounded-lg p-4 mb-6 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <button
              onClick={exitProcessMode}
              className="text-gray-400 hover:text-white"
            >
              ✕ 종료
            </button>
            <div className="text-white">
              <span className="text-2xl font-bold">{currentIndex + 1}</span>
              <span className="text-gray-400"> / {products.length}</span>
            </div>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-green-400">✅ 완료: {completedCount}</span>
            <span className="text-yellow-400">⏭️ 스킵: {skippedCount}</span>
          </div>
        </div>

        {/* 진행률 바 */}
        <div className="bg-gray-700 rounded-full h-2 mb-6">
          <div 
            className="bg-gradient-to-r from-orange-500 to-red-500 h-2 rounded-full transition-all duration-300"
            style={{ width: `${((currentIndex + 1) / products.length) * 100}%` }}
          />
        </div>

        {/* 단축키 안내 */}
        <div className="bg-gray-800 rounded-lg p-3 mb-6 text-center">
          <span className="text-gray-400 text-sm">
            ⌨️ 단축키: 
            <kbd className="bg-gray-700 text-white px-1.5 py-0.5 rounded mx-0.5 text-xs">1</kbd>-
            <kbd className="bg-gray-700 text-white px-1.5 py-0.5 rounded mx-0.5 text-xs">9</kbd>
            <kbd className="bg-gray-700 text-white px-1.5 py-0.5 rounded mx-0.5 text-xs">0</kbd>=10
            <kbd className="bg-gray-700 text-white px-1.5 py-0.5 rounded mx-0.5 text-xs">Q</kbd>=11
            <kbd className="bg-gray-700 text-white px-1.5 py-0.5 rounded mx-0.5 text-xs">W</kbd>=12
            | 
            <kbd className="bg-gray-700 text-white px-1.5 py-0.5 rounded mx-0.5 text-xs">S</kbd> 스킵
          </span>
        </div>

        {/* 현재 다나와 제품 */}
        {currentProduct && (
          <div className="bg-gray-800 rounded-xl p-6 mb-6">
            <div className="flex items-center gap-6">
              {currentProduct.thumbnail && (
                <img
                  src={fixThumbnailUrl(currentProduct.thumbnail) || ''}
                  alt={currentProduct.title}
                  className="w-32 h-32 object-contain bg-white rounded-lg"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              )}
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs bg-blue-600 text-white px-2 py-1 rounded">
                    {currentProduct.danawa_categories?.category_name}
                  </span>
                  {currentProduct.brand && (
                    <span className="text-xs text-gray-400">{currentProduct.brand}</span>
                  )}
                </div>
                <h2 className="text-xl font-bold text-white mb-2">{currentProduct.title}</h2>
                <p className="text-gray-400">
                  다나와: {currentProduct.pcode} | {currentProduct.price?.toLocaleString()}원
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 쿠팡 검색 결과 */}
        {currentResult?.loading ? (
          <div className="text-center py-16">
            <div className="animate-spin w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full mx-auto"></div>
            <p className="mt-4 text-gray-400">쿠팡 검색 중...</p>
          </div>
        ) : currentResult?.coupangProducts && currentResult.coupangProducts.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
            {currentResult.coupangProducts.map((cp, idx) => {
              // 단축키 표시 (1-9, 0, Q, W)
              const keyLabel = idx < 9 ? String(idx + 1) : idx === 9 ? '0' : idx === 10 ? 'Q' : 'W';
              
              return (
              <div
                key={cp.index}
                onClick={() => cp.product_id && currentProduct && selectCoupangProduct(currentProduct.pcode, cp)}
                className="bg-gray-800 hover:bg-gray-700 border-2 border-gray-700 hover:border-orange-500 rounded-xl p-3 cursor-pointer transition-all group"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="w-7 h-7 bg-orange-500 text-white rounded-full flex items-center justify-center font-bold text-sm">
                    {keyLabel}
                  </span>
                  <span className="text-xs text-gray-500 group-hover:text-orange-400">
                    {keyLabel}키
                  </span>
                </div>
                {cp.thumbnail && (
                  <img
                    src={cp.thumbnail}
                    alt={cp.name}
                    className="w-full h-36 object-contain bg-white rounded-lg mb-3"
                  />
                )}
                <h4 className="text-sm text-gray-200 line-clamp-2 mb-2 min-h-[2.5rem]">
                  {cp.name}
                </h4>
                <p className="text-xl font-bold text-orange-400 mb-2">{cp.price}</p>
                <div className="flex gap-2">
                  <span className="text-xs bg-orange-900 text-orange-300 px-2 py-1 rounded">
                    ★ {cp.rating}
                  </span>
                  <span className="text-xs bg-blue-900 text-blue-300 px-2 py-1 rounded">
                    리뷰 {cp.review_count.toLocaleString()}
                  </span>
                </div>
              </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-16 text-gray-500">
            검색 결과가 없습니다
          </div>
        )}

        {/* 스킵 버튼 */}
        <div className="flex justify-center">
          <button
            onClick={skipCurrent}
            className="bg-gray-700 hover:bg-gray-600 text-white px-8 py-3 rounded-lg text-lg"
          >
            ⏭️ 스킵 (S)
          </button>
        </div>

        {/* 프리로딩 상태 표시 */}
        <div className="mt-6 text-center text-gray-500 text-sm">
          {Array.from(preloadedResults.values()).filter(r => r.loading).length > 0 && (
            <span>🔄 다음 제품 미리 로딩 중...</span>
          )}
        </div>
      </div>
    </div>
  );
}
