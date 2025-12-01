'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';
import { useState } from 'react';
import { useFavorites } from '@/hooks/useFavorites';
import { products } from '@/data/products';
import { CATEGORY_LABELS } from '@/data/categories';
import { ProductCategory, Product } from '@/types';

interface FavoritesViewProps {
  onClose: () => void;
}

export function FavoritesView({ onClose }: FavoritesViewProps) {
  const { favorites, toggleFavorite } = useFavorites();
  const [selectedCategory, setSelectedCategory] = useState<ProductCategory | null>(null);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);

  // Group favorites by category
  const favoritesByCategory = favorites.reduce((acc, productId) => {
    const product = products.find(p => p.id === productId);
    if (product) {
      if (!acc[product.category]) {
        acc[product.category] = [];
      }
      acc[product.category].push(product);
    }
    return acc;
  }, {} as Record<ProductCategory, typeof products>);

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
      window.location.href = `/compare?products=${productIds}`;
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
      <section className="min-h-screen px-6 pt-4 pb-24" style={{ backgroundColor: '#FCFCFC' }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button onClick={handleBackToFolders} className="p-2">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6"></polyline>
              </svg>
            </button>
            <div>
              <h2 className="text-xl font-bold text-gray-900">{categoryLabel}</h2>
              <p className="text-sm text-gray-500 mt-1">{categoryProducts.length}개의 상품</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Product List */}
        <div className="space-y-3">
          {categoryProducts.map((product) => (
            <motion.div
              key={product.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-2xl p-4 border border-gray-200 relative"
            >
              {/* Checkbox */}
              <div className="absolute top-4 left-4 z-10">
                <input
                  type="checkbox"
                  checked={selectedProducts.includes(product.id)}
                  onChange={() => handleCheckboxToggle(product.id)}
                  disabled={!selectedProducts.includes(product.id) && selectedProducts.length >= 4}
                  className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
              </div>

              {/* Heart Icon (Remove Favorite) */}
              <button
                onClick={() => toggleFavorite(product.id)}
                className="absolute top-4 right-4 z-10 p-2"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="#FF6B6B" stroke="#FF6B6B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
              </button>

              <div className="flex gap-4 pl-7">
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
                  <h3 className="font-semibold text-gray-900 text-sm mb-1 line-clamp-2">{product.title}</h3>
                  <p className="text-lg font-bold text-gray-900 mb-1">{product.price.toLocaleString()}원</p>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span>⭐ {product.averageRating || 4.5}</span>
                    <span>리뷰 {product.reviewCount.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </motion.div>
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
      </section>
    );
  }

  if (favorites.length === 0) {
    return (
      <section className="min-h-screen px-6 pt-4 pb-24" style={{ backgroundColor: '#FCFCFC' }}>
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
      </section>
    );
  }

  return (
    <section className="min-h-screen px-6 pt-4 pb-24" style={{ backgroundColor: '#FCFCFC' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">찜한 상품</h2>
          <p className="text-sm text-gray-500 mt-1">{favorites.length}개의 상품</p>
        </div>
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
              className="bg-white rounded-2xl p-3 border border-gray-200 cursor-pointer hover:border-gray-300 transition-colors"
            >
              {/* Folder Icon Container with 2x2 Thumbnails */}
              <div className="aspect-square bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-3 mb-3 relative overflow-hidden">
                {/* 2x2 Thumbnail Grid */}
                <div className="grid grid-cols-2 gap-1.5 h-full">
                  {categoryProducts.slice(0, 4).map((product, idx) => (
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

              {/* Category Label */}
              <div className="text-center">
                <h3 className="font-semibold text-gray-900 text-sm mb-0.5">{categoryLabel}</h3>
                <p className="text-xs text-gray-500">{categoryProducts.length}개</p>
              </div>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
