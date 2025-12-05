'use client';

import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { products } from '@/data/products';
import { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { logPageView, logButtonClick, logFavoriteAction } from '@/lib/logging/clientLogger';
import ProductBottomSheet from '@/components/ProductBottomSheet';
import FavoritesBottomSheet from '@/components/FavoritesBottomSheet';
import { GuideBottomSheet } from '@/components/GuideBottomSheet';
import { Product, ProductCategory } from '@/types';
import { useFavorites } from '@/hooks/useFavorites';
import { Playfair_Display } from 'next/font/google';

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

const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: ['600'],
});

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

export function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(false);
  const [isFavoritesSheetOpen, setIsFavoritesSheetOpen] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const { favorites, toggleFavorite, isFavorite, count } = useFavorites();

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

  // 페이지 뷰 로깅
  useEffect(() => {
    logPageView('home');
  }, []);

  const handleProductClick = (product: Product) => {
    setSelectedProduct(product);
    setIsBottomSheetOpen(true);
    logButtonClick(`제품 클릭: ${product.title}`, 'home');
  };

  const handleHeartClick = (e: React.MouseEvent, productId: string) => {
    e.stopPropagation(); // Prevent product click event
    const wasFavorite = isFavorite(productId);
    toggleFavorite(productId);

    // Log favorite action
    const product = allProductsMap.get(productId);
    if (product) {
      const action = wasFavorite ? 'removed' : 'added';
      const newCount = wasFavorite ? count - 1 : count + 1;
      logFavoriteAction(action, productId, product.title, newCount);
    }
  };

  const handleFavoritesClick = () => {
    setIsFavoritesSheetOpen(true);
    logButtonClick('찜 목록 열기', 'home');
  };

  const handleGuideOpen = () => {
    setIsGuideOpen(true);
    logButtonClick('아기용품 1분 가이드 열기', 'home');
  };

  const handleGuideClose = () => {
    setIsGuideOpen(false);
    // Mark guide as viewed
    localStorage.setItem('babyitem_guide_viewed', 'true');
  };

  const favoriteProducts = favorites
    .map(id => allProductsMap.get(id))
    .filter((p): p is Product => p !== undefined);

  return (
    <div className="flex min-h-screen items-start justify-center bg-gray-100">
      {/* 모바일 최적화 컨테이너 */}
      <div className="relative w-full max-w-[480px] min-h-screen shadow-lg" style={{ backgroundColor: '#FCFCFC' }}>
        {/* Header */}
        <header className="flex items-center justify-between px-6 py-4">
          <h1 className="text-xl font-bold text-gray-900"></h1>
          <button
            onClick={() => {
              router.push('/favorites');
              logButtonClick('찜한거 보기 아이콘 클릭', 'home');
            }}
            className="relative p-1"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="#FF6B6B"
              stroke="#FF6B6B"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
            
          </button>
        </header>

        {/* Main Content */}
        <section className="flex flex-col items-center justify-center px-6 pt-8 pb-24 min-h-[calc(100vh-180px)]">

            {/* Main Title */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-center mb-auto mt-0 w-full"
              suppressHydrationWarning
            >
              <h1 className="text-2xl font-bold text-gray-900 mb-2 leading-tight">
                수천 개 아기용품 중<br />
                <span style={{ color: '#0084FE' }}>내게 딱 맞는 하나</span> 찾기
              </h1>
              <p className="text-sm text-gray-500 mt-3 mb-8">고민하는 시간을 줄여보세요.</p>

              {/* Video Character Animation */}
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
                className="w-48 h-48 mx-auto"
              >
                <video
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="w-full h-full object-contain"
                >
                  <source src="/animations/character.mp4" type="video/mp4" />
                </video>
              </motion.div>


              {/* Guide Button with Floating Bubble */}
              {/* <div className="mt-12 flex flex-col items-center gap-3">
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4, delay: 0.5 }}
                  className="relative"
                >
                  <motion.div
                    animate={{ y: [0, -4, 0] }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: "easeInOut"
                    }}
                    className="relative"
                  >
                    <div className="text-xs font-semibold px-3 py-1.5 rounded-full whitespace-nowrap text-white flex items-center gap-1.5" style={{ backgroundColor: '#4B4B4B' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="#FCD34D">
                        <path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z"/>
                      </svg>
                      <span>첫 구매라면 필수!</span>

                    </div>
                    <div className="absolute left-1/2 -translate-x-1/2 -bottom-1 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px]" style={{ borderTopColor: '#4B4B4B' }}></div>
                  </motion.div>
                </motion.div>

                <button
                  onClick={handleGuideOpen}
                  className="px-4 py-2 bg-gray-100 text-gray-600 text-sm font-semibold rounded-lg hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
                >
                  아기용품 1분 가이드
                </button>
              </div> */}
            </motion.div>
        </section>

       

        {/* Bottom Fixed Container - CTA Button + Input Bar */}
        <div className="fixed bottom-0 left-0 right-0 px-4 py-4 border-t border-gray-200 z-40" style={{ maxWidth: '480px', margin: '0 auto', backgroundColor: '#FCFCFC' }}>
          {/* 1분만에 추천받기 Button */}
          <Link href="/categories">
            <button
              onClick={() => logButtonClick('1분만에 추천받기', 'home')}
              className="w-full h-14 text-white text-base font-semibold rounded-2xl transition-all flex items-center justify-center gap-2.5 mb-3"
              style={{ backgroundColor: '#0084FE' }}
            >
              <span>바로 추천받기</span>
              <span className="px-2 py-0.5 rounded-md text-xs font-bold flex items-center gap-1 text-white" style={{ background: 'linear-gradient(135deg, #9325FC, #C750FF, #C878F7)' }}>
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2L15.5 12L12 22L8.5 12Z M2 12L12 8.5L22 12L12 15.5Z" />
                </svg>
                <span>AI</span>
              </span>
            </button>
          </Link>
        </div>


        {/* Product Bottom Sheet */}
        <ProductBottomSheet
          isOpen={isBottomSheetOpen}
          product={selectedProduct}
          onClose={() => setIsBottomSheetOpen(false)}
          onAddToFavorites={(productId) => {
            toggleFavorite(productId);
          }}
          isFavorite={selectedProduct ? isFavorite(selectedProduct.id) : false}
          onOpenFavorites={() => {
            setIsBottomSheetOpen(false);
            setTimeout(() => setIsFavoritesSheetOpen(true), 300);
          }}
          favoritesCount={count}
        />

        {/* Favorites Bottom Sheet */}
        <FavoritesBottomSheet
          isOpen={isFavoritesSheetOpen}
          onClose={() => setIsFavoritesSheetOpen(false)}
          favorites={favoriteProducts}
          onRemove={(productId) => {
            toggleFavorite(productId);
            logButtonClick(`찜 취소: ${productId}`, 'home');
          }}
        />

        {/* Guide Bottom Sheet */}
        <GuideBottomSheet
          isOpen={isGuideOpen}
          onClose={handleGuideClose}
        />
      </div>
    </div>
  );
}
