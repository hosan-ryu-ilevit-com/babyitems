'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { logButtonClick, logPageView } from '@/lib/logging/clientLogger';

const MALL_ICONS = [
  '/icons/malls/name=coupang.png',
  '/icons/malls/name=11.png',
  '/icons/malls/name=gmarket.png',
  '/icons/malls/name=naver.png',
  '/icons/malls/name=auction.png',
  '/icons/malls/name=ssg.png',
  '/icons/malls/name=lotteon.png',
  '/icons/malls/name=hmall.png',
  '/icons/malls/name=emart.png',
];

function RotatingMallIcons() {
  const [indices, setIndices] = useState([0, 1, 2]);
  const [slotToSwap, setSlotToSwap] = useState(0);

  const getNextIndex = useCallback((current: number[]) => {
    const used = new Set(current);
    const available = MALL_ICONS.map((_, i) => i).filter(i => !used.has(i));
    return available[Math.floor(Math.random() * available.length)];
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setIndices(prev => {
        const next = [...prev];
        next[slotToSwap] = getNextIndex(prev);
        return next;
      });
      setSlotToSwap(prev => (prev + 1) % 3);
    }, 1800);
    return () => clearInterval(interval);
  }, [slotToSwap, getNextIndex]);

  return (
    <div className="flex items-center justify-center gap-2 mt-5">
      <div className="flex items-center -space-x-1.5">
        {indices.map((iconIdx, slot) => (
          <div
            key={slot}
            className="w-6 h-6 rounded-full overflow-hidden border-2 border-white relative"
            style={{ zIndex: 3 - slot }}
          >
            <AnimatePresence mode="popLayout">
              <motion.div
                key={iconIdx}
                initial={{ y: -24, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 24, opacity: 0 }}
                transition={{ duration: 0.35, ease: 'easeInOut' }}
                className="w-full h-full"
              >
                <Image
                  src={MALL_ICONS[iconIdx]}
                  alt="mall"
                  width={22}
                  height={22}
                  className="w-full h-full object-cover"
                />
              </motion.div>
            </AnimatePresence>
          </div>
        ))}
      </div>
      <span
        className="text-gray-400 font-medium"
        style={{ fontSize: '14px' }}
      >
        다양한 플랫폼에서 상품을 찾아드려요
      </span>
    </div>
  );
}

export default function LivingHome() {
  const router = useRouter();

  useEffect(() => {
    logPageView('living_home');

    // 채널톡 스크립트 초기화
    if (typeof window !== 'undefined' && !(window as any).ChannelIO) {
      const w = window as any;
      const ch = function(...args: any[]) {
        ch.c?.(args);
      };
      ch.q = [] as any[];
      ch.c = function(args: any[]) {
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

      setTimeout(() => {
        if (w.ChannelIO) {
          w.ChannelIO('boot', {
            pluginKey: '81ef1201-79c7-4b62-b021-c571fe06f935',
            hideChannelButtonOnBoot: true,
          });
        }
      }, 100);
    }
  }, []);

  const handleStart = () => {
    logButtonClick('시작하기', 'living_home');
    router.push('/knowledge-agent/living');
  };

  const handleBack = () => {
    router.back();
  };

  return (
    <div className="min-h-screen bg-white font-sans text-gray-900">
      <div className="max-w-[480px] mx-auto min-h-screen flex flex-col relative">
        {/* 헤더 */}
        <header className="h-[54px] flex items-center justify-between px-5 sticky top-0 z-50 bg-[#FBFBFD]">
          <button onClick={handleBack} className="p-2 -ml-2">
            <Image
              src="/icons/back.png"
              alt="뒤로가기"
              width={20}
              height={20}
              priority
            />
          </button>
          <div className="flex items-center">
            <Image
              src="/images/img-logo2-ai3.svg"
              alt="가전 AI 로고"
              width={47}
              height={25}
              priority
            />
          </div>
          <div className="w-10" />
        </header>

        {/* 메인 컨텐츠 */}
        <main className="flex-1 flex flex-col items-center px-4 pt-[36px] pb-48">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center"
          >
            <h1
              className="font-bold text-gray-800"
              style={{ fontSize: '25px', lineHeight: '1.3' }}
            >
              수천 개 가전제품 중<br /><span className="text-blue-500">나에게 딱 맞는 하나</span> 찾기
            </h1>

            {/* 플랫폼 아이콘 + 안내 */}
            <RotatingMallIcons />
          </motion.div>

          {/* 메인 이미지 영역 */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="flex items-center justify-center w-full max-w-[380px] relative"
            style={{ marginTop: '45px' }}
          >
            <div className="relative w-full aspect-[326/330]">
              <Image
                src="/images/img-appliances.png"
                alt="Home Appliances"
                fill
                className="object-contain"
                priority
              />
              {/* 하단 그라데이션 오버레이 */}
              <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-white to-transparent pointer-events-none" />
            </div>
          </motion.div>

        </main>

        {/* 하단 고정 버튼 및 의견 영역 */}
        <div className="fixed bottom-0 left-0 right-0 px-4 pb-4 pt-5 z-50 max-w-[480px] mx-auto flex flex-col items-center bg-gradient-to-t from-white via-white to-transparent">

          {/* 꼬리 말풍선 */}
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: [0, -3, 0] }}
            transition={{
              opacity: { delay: 0.3, duration: 0.25 },
              y: { delay: 0.3, duration: 2.4, repeat: Infinity, ease: 'easeInOut' },
            }}
            className="mb-2 relative"
          >
            <div className="bg-gray-800 text-[#f9e000] text-[12px] font-medium px-3.5 py-1.5 rounded-lg">
              광고 100% 제거
            </div>
            {/* 꼬리 삼각형 */}
            <div className="absolute left-1/2 -translate-x-1/2 -bottom-[5px] w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-gray-800" />
          </motion.div>

          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={handleStart}
            className="w-full h-[50px] bg-[#1F2228] text-white rounded-xl text-[16px] font-semibold"
          >
            바로 추천 받기
          </motion.button>
        </div>
      </div>
    </div>
  );
}
