'use client';

import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { useState, useMemo, useEffect } from 'react';
import { useFavorites } from '@/hooks/useFavorites';
import { products } from '@/data/products';
import { CATEGORY_LABELS } from '@/data/categories';
import { ProductCategory, Product } from '@/types';

// Import all category specs
import babyBottleSpecs from '@/data/specs/baby_bottle.json';
import babySterilizerSpecs from '@/data/specs/baby_bottle_sterilizer.json';
import babyDispenserSpecs from '@/data/specs/baby_formula_dispenser.json';
import babyMonitorSpecs from '@/data/specs/baby_monitor.json';
import babyPlayMatSpecs from '@/data/specs/baby_play_mat.json';
import carSeatSpecs from '@/data/specs/car_seat.json';
import milkPowderPortSpecs from '@/data/specs/milk_powder_port.json';
import nasalAspiratorSpecs from '@/data/specs/nasal_aspirator.json';
import thermometerSpecs from '@/data/specs/thermometer.json';

interface FavoritesViewProps {
  onClose: () => void;
}

// Supabase에서 가져온 제품 타입
interface SupabaseProduct {
  pcode: string;
  title: string;
  brand: string | null;
  price: number | null;
  thumbnail: string | null;
  category_code: string;
  review_count?: number;
  average_rating?: number;
  danawa_price?: {
    lowest_price: number;
    lowest_mall: string;
    lowest_link: string;
    mall_prices: Array<{ mall: string; price: number; delivery: string; link?: string }>;
  } | null;
}


// category_code를 ProductCategory로 매핑
function mapCategoryCodeToCategory(categoryCode: string): ProductCategory {
  const mapping: Record<string, ProductCategory> = {
    // 젖병 관련
    '104051003': 'baby_bottle',
    '104051': 'baby_bottle',
    // 젖병소독기
    '104051007': 'baby_bottle_sterilizer',
    // 분유케이스
    '104051010': 'baby_formula_dispenser',
    // 베이비모니터
    '104047': 'baby_monitor',
    '104047003': 'baby_monitor',
    // 플레이매트
    '104045': 'baby_play_mat',
    '104045001': 'baby_play_mat',
    // 카시트
    '104052': 'car_seat',
    '104052001': 'car_seat',
    '104052002': 'car_seat',
    '104052003': 'car_seat',
    // 분유포트
    '1041033': 'milk_powder_port',
    '10410331': 'milk_powder_port',
    // 코흡입기
    '104051022': 'nasal_aspirator',
    // 체온계
    '104046': 'thermometer',
    '104046001': 'thermometer',
    '104046002': 'thermometer',
  };
  return mapping[categoryCode] || 'milk_powder_port';
}

// Convert spec to Product format
function specToProduct(spec: Record<string, unknown>, category: ProductCategory): Product {
  return {
    id: String(spec.productId),
    title: (spec.모델명 as string) || (spec.제품명 as string) || '',
    brand: (spec.브랜드 as string) || '',
    price: (spec.최저가 as number) || 0,
    reviewCount: (spec.reviewCount as number) || 0,
    reviewUrl: (spec.쿠팡URL as string) || '',
    ranking: (spec.순위 as number) || 0,
    thumbnail: (spec.썸네일 as string) || '',
    category: category,
    averageRating: (spec.averageRating as number) || 0,
    coreValues: {
      temperatureControl: 0,
      hygiene: 0,
      material: 0,
      usability: 0,
      portability: 0,
      priceValue: 0,
      durability: 0,
      additionalFeatures: 0,
    },
  };
}

// Convert Supabase product to Product format
function supabaseToProduct(item: SupabaseProduct): Product {
  return {
    id: item.pcode,
    title: item.title,
    brand: item.brand || '',
    price: item.price || 0,
    reviewCount: item.review_count || 0,
    reviewUrl: '',
    ranking: 0,
    thumbnail: item.thumbnail || '',
    category: mapCategoryCodeToCategory(item.category_code),
    averageRating: item.average_rating || 0,
    coreValues: {
      temperatureControl: 0,
      hygiene: 0,
      material: 0,
      usability: 0,
      portability: 0,
      priceValue: 0,
      durability: 0,
      additionalFeatures: 0,
    },
  };
}

export function FavoritesView({ onClose }: FavoritesViewProps) {
  const { favorites, toggleFavorite } = useFavorites();
  const [selectedCategory, setSelectedCategory] = useState<ProductCategory | null>(null);
  const [productToDelete, setProductToDelete] = useState<{ id: string; title: string } | null>(null);

  // Supabase에서 가져온 제품들
  const [supabaseProducts, setSupabaseProducts] = useState<Map<string, Product>>(new Map());
  const [isLoadingSupabase, setIsLoadingSupabase] = useState(false);
  // 다나와 최저가 링크 정보 (productId -> link)
  const [danawaLinks, setDanawaLinks] = useState<Map<string, string>>(new Map());

  // Combine all specs into a single lookup map (로컬 데이터만)
  const localProductsMap = useMemo(() => {
    const map = new Map<string, Product>();

    // Add products from data/products.ts (milk powder ports with coreValues)
    products.forEach(p => map.set(p.id, p));

    // Add products from specs (other categories)
    const specsByCategory: Record<ProductCategory, Record<string, unknown>[]> = {
      baby_bottle: babyBottleSpecs as Record<string, unknown>[],
      baby_bottle_sterilizer: babySterilizerSpecs as Record<string, unknown>[],
      baby_formula_dispenser: babyDispenserSpecs as Record<string, unknown>[],
      baby_monitor: babyMonitorSpecs as Record<string, unknown>[],
      baby_play_mat: babyPlayMatSpecs as Record<string, unknown>[],
      car_seat: carSeatSpecs as Record<string, unknown>[],
      milk_powder_port: milkPowderPortSpecs as Record<string, unknown>[],
      nasal_aspirator: nasalAspiratorSpecs as Record<string, unknown>[],
      thermometer: thermometerSpecs as Record<string, unknown>[],
    };

    Object.entries(specsByCategory).forEach(([category, specs]) => {
      specs.forEach((spec) => {
        const productId = String(spec.productId);
        // Only add if not already in map (products.ts takes precedence)
        if (!map.has(productId)) {
          map.set(productId, specToProduct(spec, category as ProductCategory));
        }
      });
    });

    return map;
  }, []);

  // 로컬에서 찾지 못한 제품들을 Supabase에서 가져오기
  useEffect(() => {
    const missingIds = favorites.filter(id => !localProductsMap.has(id));

    if (missingIds.length === 0) {
      setSupabaseProducts(new Map());
      setDanawaLinks(new Map());
      return;
    }

    const fetchMissingProducts = async () => {
      setIsLoadingSupabase(true);
      try {
        const response = await fetch('/api/v2/products-by-ids', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pcodes: missingIds }),
        });

        const data = await response.json();

        if (data.success && data.products) {
          const productMap = new Map<string, Product>();
          const linkMap = new Map<string, string>();

          data.products.forEach((item: SupabaseProduct) => {
            productMap.set(item.pcode, supabaseToProduct(item));
            // 다나와 최저가 링크 저장
            if (item.danawa_price?.lowest_link) {
              linkMap.set(item.pcode, item.danawa_price.lowest_link);
            }
          });

          setSupabaseProducts(productMap);
          setDanawaLinks(linkMap);
        }
      } catch (error) {
        console.error('Failed to fetch products from Supabase:', error);
      } finally {
        setIsLoadingSupabase(false);
      }
    };

    fetchMissingProducts();
  }, [favorites, localProductsMap]);

  // 로컬 + Supabase 데이터 합치기
  const allProductsMap = useMemo(() => {
    const combined = new Map(localProductsMap);
    supabaseProducts.forEach((product, id) => {
      if (!combined.has(id)) {
        combined.set(id, product);
      }
    });
    return combined;
  }, [localProductsMap, supabaseProducts]);

  // Group favorites by category
  const favoritesByCategory = favorites.reduce((acc, productId) => {
    const product = allProductsMap.get(productId);
    if (product) {
      if (!acc[product.category]) {
        acc[product.category] = [];
      }
      acc[product.category].push(product);
    }
    return acc;
  }, {} as Record<ProductCategory, Product[]>);

  // Get categories that have favorites
  const categoriesWithFavorites = Object.keys(favoritesByCategory) as ProductCategory[];

  // Handle back from category detail
  const handleBackToFolders = () => {
    setSelectedCategory(null);
  };

  // If viewing a specific category, show product list
  if (selectedCategory) {
    const categoryProducts = favoritesByCategory[selectedCategory] || [];
    const categoryLabel = CATEGORY_LABELS[selectedCategory];

    return (
      <AnimatePresence mode="wait">
        <motion.section
          key={`category-${selectedCategory}`}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="min-h-screen px-6 pt-4 pb-24 max-w-[480px] mx-auto bg-white"
        >
        {/* Header */}
        <div className="flex items-center mb-6">
          <div className="flex items-center gap-2">
            <button onClick={handleBackToFolders} className="p-1">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6"></polyline>
              </svg>
            </button>
            <h2 className="text-base font-bold text-gray-900">
              {categoryLabel} <span className="font-bold" style={{ color: '#0084FE' }}>{categoryProducts.length}</span>
            </h2>
          </div>
        </div>

        {/* Product List */}
        <div className="space-y-3">
          {categoryProducts.map((product) => (
            <div
              key={product.id}
              className="bg-white rounded-2xl p-4 border-2 border-gray-100 relative"
            >
              {/* Delete Icon (Remove from Favorites) */}
              <button
                onClick={() => setProductToDelete({ id: product.id, title: product.title })}
                className="absolute top-3 right-3 z-10 w-6 h-6 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>

              <div className="flex flex-col gap-3">
                <div className="flex gap-4">
                  {/* Product Image */}
                  <div className="relative w-24 h-24 flex-shrink-0 rounded-lg overflow-hidden">
                    <Image
                      src={product.thumbnail}
                      alt={product.title}
                      fill
                      className="object-cover"
                      sizes="96px"
                    />
                  </div>

                  {/* Product Info */}
                  <div className="flex-1 pr-8">
                    {product.brand && (
                      <p className="text-xs text-gray-500 mb-0.5">{product.brand}</p>
                    )}
                    <h3 className="font-semibold text-gray-900 text-sm mb-1 line-clamp-2">{product.title}</h3>
                    <p className="text-lg font-bold text-gray-900 mb-1">{product.price.toLocaleString()}원</p>
                    {/* 리뷰 개수나 평균 별점이 있을 때만 표시 */}
                    {((product.averageRating ?? 0) > 0 || product.reviewCount > 0) && (
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        {(product.averageRating ?? 0) > 0 && (
                          <div className="flex items-center gap-1">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="#FFC107" stroke="#FFC107" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                            </svg>
                            <span>{(product.averageRating ?? 0).toFixed(1)}</span>
                          </div>
                        )}
                        {product.reviewCount > 0 && (
                          <span>리뷰 {product.reviewCount.toLocaleString()}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      // Supabase에서 가져온 다나와 최저가 링크가 있으면 사용, 없으면 다나와 검색
                      const lowestLink = danawaLinks.get(product.id);
                      if (lowestLink) {
                        window.open(lowestLink, '_blank');
                      } else {
                        window.open(`https://search.danawa.com/mobile/dsearch.php?keyword=${encodeURIComponent(product.title)}&sort=priceASC`, '_blank');
                      }
                    }}
                    className="flex-1 py-2.5 text-center text-sm font-semibold rounded-lg transition-colors"
                    style={{ backgroundColor: '#0084FE', color: '#FFFFFF' }}
                  >
                    최저가로 구매하기
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Delete Confirmation Modal */}
        {productToDelete && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-6">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-2xl p-6 max-w-sm w-full"
            >
              <h3 className="text-lg font-bold text-gray-900 mb-2">찜한 목록에서 삭제하시겠어요?</h3>
              <p className="text-sm text-gray-600 mb-6 line-clamp-2">{productToDelete.title}</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setProductToDelete(null)}
                  className="flex-1 py-3 text-sm font-semibold rounded-lg transition-colors"
                  style={{ backgroundColor: '#F0F0F0', color: '#333' }}
                >
                  취소
                </button>
                <button
                  onClick={() => {
                    toggleFavorite(productToDelete.id);
                    setProductToDelete(null);
                  }}
                  className="flex-1 py-3 text-sm font-semibold rounded-lg transition-colors"
                  style={{ backgroundColor: '#FF6B6B', color: '#FFFFFF' }}
                >
                  삭제
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </motion.section>
      </AnimatePresence>
    );
  }

  // 로딩 중일 때 (찜한 상품은 있지만 Supabase에서 가져오는 중)
  if (isLoadingSupabase && favorites.length > 0 && categoriesWithFavorites.length === 0) {
    return (
      <motion.section
        key="loading-favorites"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="min-h-screen px-6 pt-4 pb-24 max-w-[480px] mx-auto bg-white"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-sm font-bold text-gray-900">찜한 상품</h2>
          <button onClick={onClose} className="p-2">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="flex gap-1 mb-4">
            <div className="w-3 h-3 bg-blue-400 rounded-full animate-bounce" />
            <div className="w-3 h-3 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-3 h-3 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
          <p className="text-sm text-gray-500">찜한 상품을 불러오는 중...</p>
        </div>
      </motion.section>
    );
  }

  if (favorites.length === 0) {
    return (
      <motion.section
        key="empty-favorites"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="min-h-screen px-6 pt-4 pb-24 max-w-[480px] mx-auto bg-white"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-m font-bold text-gray-900">찜한 상품</h2>
          <button onClick={onClose} className="p-2">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="flex flex-col items-center justify-center py-24 text-center">
          <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-4">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
          <h3 className="text-lg font-semibold text-gray-700 mb-2">찜한 상품이 없어요</h3>
          <p className="text-sm text-gray-500">AI 추천 받고 마음에 드는 상품을 찜해보세요</p>
        </div>
      </motion.section>
    );
  }

  return (
    <motion.section
      key="folder-grid"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className="min-h-screen px-6 pt-4 pb-24 max-w-[480px] mx-auto bg-white"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900">
          찜한상품 <span className="font-bold" style={{ color: '#0084FE' }}>{favorites.length}</span>
        </h2>
        <button onClick={onClose} className="p-2">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Category Folders - 2 Column Grid */}
      <div className="grid grid-cols-2 gap-4">
        {categoriesWithFavorites.map((category) => {
          const categoryProducts = favoritesByCategory[category];
          const categoryLabel = CATEGORY_LABELS[category];

          return (
            <motion.div
              key={category}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={() => setSelectedCategory(category)}
              className="cursor-pointer transition-colors"
            >
              {/* Folder Icon Container with 2x2 Thumbnails */}
              <div className="aspect-square bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl mb-2 relative overflow-hidden">
                {/* 2x2 Thumbnail Grid - Using absolute positioning to avoid padding issues */}
                <div className="absolute inset-3 grid grid-cols-2 gap-1.5">
                  {categoryProducts.slice(0, 4).map((product) => (
                    <div key={product.id} className="relative rounded-md overflow-hidden bg-white">
                      <Image
                        src={product.thumbnail}
                        alt={product.title}
                        fill
                        className="object-cover"
                        sizes="80px"
                      />
                    </div>
                  ))}
                  {/* Fill empty slots with placeholder */}
                  {[...Array(Math.max(0, 4 - categoryProducts.length))].map((_, idx) => (
                    <div key={`placeholder-${idx}`} className="rounded-md bg-gray-100" />
                  ))}
                </div>
              </div>

              {/* Category Label - Two Lines */}
              <div className="text-left">
                <p className="text-sm font-medium text-gray-900">
                  {categoryLabel}
                </p>
                <p className="text-sm font-medium text-gray-400">
                  저장된 항목 {categoryProducts.length}개
                </p>
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.section>
  );
}
