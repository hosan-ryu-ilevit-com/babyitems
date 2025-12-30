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
import FeedbackButton from '@/components/FeedbackButton';
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

  // 채널톡 스크립트 초기화
  useEffect(() => {
    if (typeof window !== 'undefined' && !(window as Window & { ChannelIO?: unknown }).ChannelIO) {
      const w = window as Window & { ChannelIO?: ((...args: unknown[]) => void) & { c?: (args: unknown[]) => void; q?: unknown[] }; ChannelIOInitialized?: boolean };
      const ch = function(...args: unknown[]) {
        ch.c?.(args);
      };
      ch.q = [] as unknown[];
      ch.c = function(args: unknown[]) {
        ch.q?.push(args);
      };
      w.ChannelIO = ch;

      const loadChannelIO = () => {
        if (w.ChannelIOInitialized) return;
        w.ChannelIOInitialized = true;
        const s = document.createElement('script');
        s.type = 'text/javascript';
        s.async = true;
        s.src = 'https://cdn.channel.io/plugin/ch-plugin-web.js';
        const x = document.getElementsByTagName('script')[0];
        if (x.parentNode) {
          x.parentNode.insertBefore(s, x);
        }
      };

      if (document.readyState === 'complete') {
        loadChannelIO();
      } else {
        window.addEventListener('DOMContentLoaded', loadChannelIO);
        window.addEventListener('load', loadChannelIO);
      }

      // 채널톡 부트
      setTimeout(() => {
        if (w.ChannelIO) {
          // URL에서 UTM 파라미터 및 phone 파싱
          const urlParams = new URLSearchParams(window.location.search);
          const phone = urlParams.get('phone');
          const utmSource = urlParams.get('utm_source');
          const utmMedium = urlParams.get('utm_medium');
          const utmCampaign = urlParams.get('utm_campaign');

          // 고유 방문자 ID 생성/조회
          let visitorId = localStorage.getItem('babyitem_visitor_id');
          if (!visitorId) {
            visitorId = `visitor_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
            localStorage.setItem('babyitem_visitor_id', visitorId);
          }

          w.ChannelIO('boot', {
            pluginKey: '81ef1201-79c7-4b62-b021-c571fe06f935',
            hideChannelButtonOnBoot: true,
            profile: {
              visitorId,
              ...(phone && { mobileNumber: phone }),
              ...(utmSource && { utm_source: utmSource }),
              ...(utmMedium && { utm_medium: utmMedium }),
              ...(utmCampaign && { utm_campaign: utmCampaign }),
              referrer: document.referrer || 'direct',
              landingPage: window.location.pathname
            }
          });
        }
      }, 100);
    }
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
      <div className="relative w-full max-w-[480px] min-h-screen shadow-lg" style={{ backgroundColor: '#FDFDFD' }}>
        {/* Header */}
        <header className="flex items-center justify-between px-5 h-[54px]">
          <h1 className="text-[17px] font-bold tracking-tight flex items-center gap-1.5">
            <span className="text-gray-800">아기용품</span>
            <span
              className="px-2 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-700"
            >
              AI
            </span>
          </h1>
          <FeedbackButton source="home" />
        </header>

        {/* Main Content */}
        <section className="flex flex-col items-center justify-center px-6 pt-1 pb-24 min-h-[calc(100vh-180px)]">

            {/* Main Title */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-center mb-auto mt-0 w-full"
              suppressHydrationWarning
            >
              <h1 className="text-[26px] font-bold text-gray-900 mb-8 mt-4 leading-[1.3] tracking-tight">
                <span className="font-semibold text-gray-800">수천 개 아기용품 중</span><br />
                <span className="text-purple-600">내게 딱 맞는 하나</span> 찾기
              </h1>

              {/* Video Character Animation with Soft Glow */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
                className="w-56 h-56 mx-auto relative"
              >
                <div className="absolute inset-0 bg-purple-200/20 blur-3xl rounded-full" />
                <video
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="w-full h-full object-contain relative z-10"
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

       

        {/* Speech bubble tooltip - positioned above the floating bar */}
        <div className="fixed bottom-24 left-0 right-0 flex justify-center z-50 pointer-events-none" style={{ maxWidth: '480px', margin: '0 auto' }}>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, y: [0, -3, 0] }}
            transition={{
              opacity: { duration: 0.3, delay: 0.5 },
              y: { duration: 2, repeat: Infinity, ease: "easeInOut" }
            }}
            className="relative"
          >
            <div className="text-[13px] font-semibold px-4 py-2 rounded-full whitespace-nowrap shadow-md flex items-center gap-1.5" 
              style={{ backgroundColor: '#2D2D2D', color: '#FFFFFF' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M21 21L15 15M17 10C17 13.866 13.866 17 10 17C6.13401 17 3 13.866 3 10C3 6.13401 6.13401 3 10 3C13.866 3 17 6.13401 17 10Z" stroke="#f97316" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span>어떤 상품을 찾으시나요?</span>
            </div>
            <div className="absolute left-1/2 -translate-x-1/2 -bottom-1.5 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px]" style={{ borderTopColor: '#2D2D2D' }}></div>
          </motion.div>
        </div>

        {/* Bottom Fixed Container - CTA Button */}
        <div className="fixed bottom-0 left-0 right-0 px-4 py-4 border-t border-gray-200 z-40" style={{ maxWidth: '480px', margin: '0 auto', backgroundColor: '#FDFDFD' }}>
          {/* 1분만에 추천받기 Button → categories-v2로 이동 */}
          <Link href="/categories-v2">
            <button
              onClick={() => logButtonClick('1분만에 추천받기', 'home')}
              className="w-full h-14 text-white text-[17px] font-bold rounded-2xl transition-all flex items-center justify-center mb-3 shadow-lg hover:shadow-xl active:scale-[0.98] shadow-purple-200"
              style={{ 
                background: 'linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)'
              }}
            >
              <span className="flex items-center gap-2">
                <span>1분 만에 추천받기</span>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="opacity-80">
                  <path d="M9 18L15 12L9 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
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
