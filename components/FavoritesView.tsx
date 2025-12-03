'use client';

import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { useState, useMemo } from 'react';
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

export function FavoritesView({ onClose }: FavoritesViewProps) {
  const { favorites, toggleFavorite } = useFavorites();
  const [selectedCategory, setSelectedCategory] = useState<ProductCategory | null>(null);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [productToDelete, setProductToDelete] = useState<{ id: string; title: string } | null>(null);

  // Combine all specs into a single lookup map
  const allProductsMap = useMemo(() => {
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

  // Handle checkbox toggle (2-4 items)
  const handleCheckboxToggle = (productId: string) => {
    setSelectedProducts(prev => {
      if (prev.includes(productId)) {
        return prev.filter(id => id !== productId);
      } else if (prev.length < 4) {
        return [...prev, productId];
      }
      return prev;
    });
  };

  // Handle compare button click
  const handleCompare = () => {
    if (selectedProducts.length >= 2) {
      const productIds = selectedProducts.join(',');
      window.location.href = `/compare?products=${productIds}&fromFavorites=true`;
    }
  };

  // Handle back from category detail
  const handleBackToFolders = () => {
    setSelectedCategory(null);
    setSelectedProducts([]);
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
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button onClick={handleBackToFolders} className="p-2">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6"></polyline>
              </svg>
            </button>
            <h2 className="text-xl font-bold text-gray-900">
              {categoryLabel} <span className="font-bold" style={{ color: '#0084FE' }}>{categoryProducts.length}</span>
            </h2>
          </div>
          <button onClick={onClose} className="p-2">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Info Text */}
        <div className="mb-4 px-4 py-3 bg-blue-50 rounded-lg">
          <p className="text-sm text-blue-900 font-medium">2~4개 선택해서 바로 비교하실 수 있어요!</p>
        </div>

        {/* Product List */}
        <div className="space-y-3">
          {categoryProducts.map((product) => (
            <div
              key={product.id}
              onClick={() => handleCheckboxToggle(product.id)}
              className={`bg-white rounded-2xl p-4 border-2 relative cursor-pointer transition-all ${
                selectedProducts.includes(product.id)
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-100'
              } ${!selectedProducts.includes(product.id) && selectedProducts.length >= 4 ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {/* Checkbox */}
              <div className="absolute top-4 left-4 z-10" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={selectedProducts.includes(product.id)}
                  onChange={() => handleCheckboxToggle(product.id)}
                  disabled={!selectedProducts.includes(product.id) && selectedProducts.length >= 4}
                  className="w-5 h-5 rounded border-gray-200 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
              </div>

              {/* Delete Icon (Remove from Favorites) */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setProductToDelete({ id: product.id, title: product.title });
                }}
                className="absolute top-3 right-3 z-10 w-6 h-6 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>

              <div className="flex flex-col gap-3 pl-7">
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
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <div className="flex items-center gap-1">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="#FFC107" stroke="#FFC107" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                        </svg>
                        <span>{product.averageRating || 4.5}</span>
                      </div>
                      <span>리뷰 {product.reviewCount.toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                {/* Buttons */}
                <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => {
                      window.open(`https://search.danawa.com/mobile/dsearch.php?keyword=${encodeURIComponent(product.title)}&sort=priceASC`, '_blank');
                    }}
                    className="flex-1 py-2.5 text-center text-sm font-semibold rounded-lg transition-colors"
                    style={{ backgroundColor: '#F0F0F0', color: '#333' }}
                  >
                    최저가 보기
                  </button>
                  <a
                    href={product.reviewUrl || `https://www.coupang.com/vp/products/${product.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 py-2.5 text-center text-sm font-semibold rounded-lg transition-colors"
                    style={{ backgroundColor: '#0084FE', color: '#FFFFFF' }}
                  >
                    쿠팡에서 보기
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Floating Compare Button - Bottom Right */}
        {selectedProducts.length >= 2 && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={handleCompare}
            className="fixed bottom-6 right-6 px-6 py-4 text-white text-base font-semibold rounded-full shadow-lg z-40 flex items-center gap-2"
            style={{ backgroundColor: '#0084FE', maxWidth: '480px' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 11l3 3L22 4"></path>
              <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"></path>
            </svg>
            <span>{selectedProducts.length}개 비교하기</span>
          </motion.button>
        )}

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
          <h2 className="text-xl font-bold text-gray-900">찜한 상품</h2>
          <button onClick={onClose} className="p-2">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="flex flex-col items-center justify-center py-24 text-center">
          <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-4">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
          <h3 className="text-lg font-semibold text-gray-700 mb-2">찜한 상품이 없어요</h3>
          <p className="text-sm text-gray-500">마음에 드는 상품을 찜해보세요</p>
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
