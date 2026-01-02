'use client';

import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useEffect } from 'react';
import { logPageView, logButtonClick } from '@/lib/logging/clientLogger';
import FeedbackButton from '@/components/FeedbackButton';
import Image from 'next/image';

// 플로팅 고민 버블 컴포넌트 삭제됨

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    logPageView('home');
    
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

      // 채널톡 부트
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
    logButtonClick('바로 추천 받기', 'home');
    router.push('/categories');
  };

  return (
    <div className="min-h-screen bg-[#FFFFFF] font-sans text-gray-900">
      <div className="max-w-[480px] mx-auto min-h-screen flex flex-col relative">
        {/* 헤더 */}
        <header className="h-[60px] flex items-center px-6 sticky top-0 z-50 bg-[#FFFFFF]">
          <div className="flex items-center">
            <Image
              src="/icons/logo.svg"
              alt="아기용품 AI 로고"
              width={82}
              height={26}
              priority
              className="opacity-90"
            />
          </div>
        </header>

        {/* 메인 컨텐츠 */}
        <main className="flex-1 flex flex-col items-center px-6 pt-[24px] pb-48">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center mb-10"
          >
            <h1 
              className="font-bold text-gray-900 tracking-tight"
              style={{ fontSize: '26px', lineHeight: '1.35' }}
            >
              수천 개 아기용품 중<br />
              <span className="ai-gradient-text">아이에게 딱 맞는 하나</span> 찾기
            </h1>
            <p
              className="text-gray-500 mt-3"
              style={{ fontSize: '17px', lineHeight: '1.5', fontWeight: 400 }}
            >
              광고는 거르고 객관적으로만 비교했어요
            </p>
          </motion.div>

          {/* 메인 비주얼 영역 (동영상) */}
          <div className="relative w-full max-w-[340px] flex items-center justify-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="relative w-[220px] aspect-square flex items-center justify-center"
            >
              <video
                autoPlay
                loop
                muted
                playsInline
                className="w-full h-full object-contain z-10"
              >
                <source src="/animations/character.mp4" type="video/mp4" />
              </video>
              {/* 경계선을 부드럽게 만드는 화이트 그라데이션 마스크 */}
              <div 
                className="absolute inset-0 z-20 pointer-events-none" 
                style={{ 
                  background: 'radial-gradient(circle, transparent 65%, #FFFFFF 100%)',
                  transform: 'scale(1.05)'
                }} 
              />
              {/* 소프트 글로우 효과 */}
              <div className="absolute inset-0 bg-indigo-100/30 blur-3xl rounded-full scale-110" />
            </motion.div>
          </div>
        </main>

        {/* 하단 고정 버튼 */}
        <div className="fixed bottom-0 left-0 right-0 px-6 pb-8 pt-4 z-50 max-w-[480px] mx-auto bg-gradient-to-t from-[#FFFFFF] via-[#FFFFFF] to-transparent">
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleStart}
            className="w-full h-[58px] bg-[#1F2228] text-white rounded-[20px] text-[17px] font-bold shadow-xl flex items-center justify-center gap-2"
          >
            <span>시작하기</span>
            <span className="text-[12px] font-normal mt-0.5 ai-gradient-text">with AI</span>
          </motion.button>
        </div>
      </div>
    </div>
  );
}
