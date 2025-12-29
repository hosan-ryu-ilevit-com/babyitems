'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';
import { useState, useMemo, useEffect } from 'react';
import { useFavorites } from '@/hooks/useFavorites';
import { products } from '@/data/products';
import { ProductCategory, Product } from '@/types';
import { logFavoriteLowestPriceClick } from '@/lib/logging/clientLogger';

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
    '16349219': 'baby_bottle',
    '16349381': 'baby_formula_dispenser',
    '11427546': 'baby_monitor',
    '16349200': 'car_seat',
    '16349201': 'car_seat',
    '16349202': 'car_seat',
    '16353763': 'car_seat',
    '16330960': 'milk_powder_port',
    '16349248': 'nasal_aspirator',
    '17325941': 'thermometer',
    '16338152': 'baby_play_mat',
    '16338153': 'baby_play_mat',
    '16338154': 'baby_play_mat',
    '16338155': 'baby_play_mat',
    '16338156': 'baby_play_mat',
    '16349193': 'car_seat',
    '16349368': 'car_seat',
    '16349195': 'car_seat',
    '16349196': 'car_seat',
    '16349108': 'milk_powder_port',
    '16349109': 'milk_powder_port',
    '16349110': 'milk_powder_port',
    '16356038': 'milk_powder_port',
    '16356040': 'milk_powder_port',
    '16356042': 'milk_powder_port',
    '16349119': 'milk_powder_port',
    '16249091': 'milk_powder_port',
    '16349351': 'milk_powder_port',
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
        if (!map.has(productId)) {
          map.set(productId, specToProduct(spec, category as ProductCategory));
        }
      });
    });

    return map;
  }, []);

  // 모든 찜한 제품을 Supabase에서 가져오기
  useEffect(() => {
    if (favorites.length === 0) {
      setSupabaseProducts(new Map());
      setDanawaLinks(new Map());
      return;
    }

    const fetchAllProducts = async () => {
      setIsLoadingSupabase(true);
      try {
        const response = await fetch('/api/v2/products-by-ids', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pcodes: favorites }),
        });

        const data = await response.json();

        if (data.success && data.products) {
          const productMap = new Map<string, Product>();
          const linkMap = new Map<string, string>();

          data.products.forEach((item: SupabaseProduct) => {
            productMap.set(item.pcode, supabaseToProduct(item));
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

    fetchAllProducts();
  }, [favorites]);

  // Supabase + 로컬 데이터 합치기 (Supabase 데이터 우선)
  const allProductsMap = useMemo(() => {
    const combined = new Map(localProductsMap);
    supabaseProducts.forEach((product, id) => {
      combined.set(id, product);
    });
    return combined;
  }, [localProductsMap, supabaseProducts]);

  // 찜한 순서대로 제품 목록 생성
  const favoriteProducts = favorites
    .map(id => allProductsMap.get(id))
    .filter((p): p is Product => p !== undefined);

  // 로딩 중
  if (isLoadingSupabase && favorites.length > 0 && favoriteProducts.length === 0) {
    return (
      <motion.section
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="min-h-screen px-6 pt-4 pb-24 max-w-[480px] mx-auto bg-white"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900">찜한 상품</h2>
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

  // 찜한 상품 없음
  if (favorites.length === 0) {
    return (
      <motion.section
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="min-h-screen px-6 pt-4 pb-24 max-w-[480px] mx-auto bg-white"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900">찜한 상품</h2>
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
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="min-h-screen px-6 pt-4 pb-24 max-w-[480px] mx-auto bg-white"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900">
          찜한상품 <span style={{ color: '#0084FE' }}>{favorites.length}</span>
        </h2>
        <button onClick={onClose} className="p-2">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Product List - 찜한 순서대로 */}
      <div className="space-y-3">
        {favoriteProducts.map((product) => (
          <motion.div
            key={product.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl p-4 border-2 border-gray-100 relative"
          >
            {/* Delete Button */}
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
                <div className="relative w-24 h-24 shrink-0 rounded-lg overflow-hidden bg-gray-100">
                  {product.thumbnail ? (
                    <Image
                      src={product.thumbnail}
                      alt={product.title}
                      fill
                      className="object-cover"
                      sizes="96px"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <polyline points="21 15 16 10 5 21" />
                      </svg>
                    </div>
                  )}
                </div>

                {/* Product Info */}
                <div className="flex-1 pr-8">
                  <h3 className="font-medium text-gray-800 text-sm mb-1 line-clamp-2">{product.title}</h3>
                  {product.brand && (
                    <p className="text-[13px] text-gray-500 font-medium mb-1">{product.brand}</p>
                  )}
                  {((product.averageRating ?? 0) > 0 || product.reviewCount > 0) && (
                    <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                      {(product.averageRating ?? 0) > 0 && (
                        <div className="flex items-center gap-1">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="#FFC107" stroke="#FFC107" strokeWidth="2">
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
                  <p className="text-[16px] font-bold text-gray-900">{product.price.toLocaleString()}<span className="text-sm">원</span></p>
                </div>
              </div>

              {/* Button */}
              <button
                onClick={() => {
                  const lowestLink = danawaLinks.get(product.id);

                  logFavoriteLowestPriceClick(
                    product.id,
                    product.title,
                    product.brand || undefined,
                    product.price,
                    lowestLink ? '다나와 최저가' : '다나와 검색'
                  );

                  if (lowestLink) {
                    window.open(lowestLink, '_blank');
                  } else {
                    window.open(`https://search.danawa.com/mobile/dsearch.php?keyword=${encodeURIComponent(product.title)}&sort=priceASC`, '_blank');
                  }
                }}
                className="w-full py-2.5 text-center text-sm font-semibold rounded-lg transition-colors"
                style={{ backgroundColor: '#0084FE', color: '#FFFFFF' }}
              >
                최저가로 구매하기
              </button>
            </div>
          </motion.div>
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
  );
}
