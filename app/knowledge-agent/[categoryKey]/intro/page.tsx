'use client';

import { useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { logButtonClick, logPageView } from '@/lib/logging/clientLogger';
import FeedbackButton from '@/components/FeedbackButton';

const INTRO_COPY = {
  baby: {
    title: <>수천 개 아기용품 중<br /><span className="text-blue-500">아이에게 딱 맞는 하나</span> 찾기</>,
    description: <>인기 아기용품들의 후기를 분석해서<br />나와 딱 맞는 상품을 찾아드려요</>,
    imageSrc: '/images/img-baby.png',
    imageAlt: 'Baby Product',
    buttonText: '바로 추천 받기',
  },
  living: {
    title: <>수천 개 가전제품 중<br /><span className="text-blue-500">내게 딱 맞는 하나</span> 찾기</>,
    description: <>인기 가전제품들의 후기를 분석해서<br />나와 딱 맞는 상품을 찾아드려요</>,
    imageSrc: '/images/img-appliances.png',
    imageAlt: '가전 이미지',
    buttonText: '바로 추천 받기',
  },
} as const;

export default function KnowledgeAgentIntroPage() {
  const router = useRouter();
  const params = useParams<{ categoryKey?: string }>();

  const categoryKey = useMemo(() => {
    if (params?.categoryKey === 'baby' || params?.categoryKey === 'living') {
      return params.categoryKey;
    }
    return null;
  }, [params?.categoryKey]);

  useEffect(() => {
    if (!categoryKey) {
      router.replace('/knowledge-agent');
      return;
    }

    logPageView(`knowledge-agent-intro-${categoryKey}`);

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
  }, [categoryKey, router]);

  if (!categoryKey) {
    return null;
  }

  const content = INTRO_COPY[categoryKey];

  const handleStart = () => {
    logButtonClick('시작하기', `knowledge-agent-intro-${categoryKey}`);
    router.push(`/knowledge-agent/${categoryKey}`);
  };

  return (
    <div className="min-h-screen bg-white font-sans text-gray-900">
      <div className="max-w-[480px] mx-auto min-h-screen flex flex-col relative">
        {/* 헤더 */}
        <header className="h-[54px] flex items-center justify-between px-5 sticky top-0 z-50 bg-[#FBFBFD]">
          <button
            onClick={() => window.location.href = 'https://alwayz-pmf.ilevit.com/integration'}
            className="p-2 -ml-2"
          >
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
              src={categoryKey === 'baby' ? "/icons/logo.svg" : "/images/img-logo2-ai3.svg"}
              alt={categoryKey === 'baby' ? "아기용품 AI 로고" : "가전제품 AI 로고"}
              width={categoryKey === 'baby' ? 79 : 47}
              height={25}
              priority
            />
          </div>
          <div className="w-10" /> {/* Spacer to keep logo centered */}
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
              {content.title}
            </h1>
            <p
              className="text-gray-600"
              style={{ fontSize: '16px', lineHeight: '1.4', marginTop: '16px', fontFamily: 'Abel', fontWeight: 400 }}
            >
              {content.description}
            </p>
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
                src={content.imageSrc}
                alt={content.imageAlt}
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
        
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={handleStart}
            className="w-full h-[50px] bg-[#1F2228] text-white rounded-xl text-[16px] font-semibold"
          >
            {content.buttonText}
          </motion.button>
        </div>
      </div>
    </div>
  );
}
