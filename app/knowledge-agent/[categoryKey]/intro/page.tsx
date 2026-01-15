'use client';

import { useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { logButtonClick, logPageView } from '@/lib/logging/clientLogger';

const INTRO_COPY = {
  baby: {
    title: '수천 개 아기용품 중\n아이에게 딱 맞는 하나 찾기',
    description: '광고 없는 AI 분석으로 고민하는 시간을 줄여보세요.',
    imageSrc: '/images/img-baby.png',
    imageAlt: '아기 이미지',
  },
  living: {
    title: '수천 개 생활·주방가전 중\n내게 딱 맞는 하나 찾기',
    description: '광고 없는 AI 분석으로 고민하는 시간을 줄여보세요.',
    imageSrc: '/images/img-baby.png',
    imageAlt: '가전 이미지',
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
    <div className="min-h-screen bg-[#FFFFFF] font-sans text-gray-900">
      <div className="max-w-[480px] mx-auto min-h-screen flex flex-col relative">
        <header className="h-[60px] flex items-center px-6 sticky top-0 z-50 bg-[#FFFFFF]">
          <div className="flex items-center">
            <Image
              src="/icons/logo.svg"
              alt="AI 쇼핑비서 로고"
              width={82}
              height={26}
              priority
              className="opacity-90"
            />
          </div>
        </header>

        <main className="flex-1 flex flex-col items-center px-6 pt-[24px] pb-48">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center mb-10"
          >
            <h1
              className="font-bold text-gray-900 tracking-tight whitespace-pre-line"
              style={{ fontSize: '26px', lineHeight: '1.35' }}
            >
              {content.title}
            </h1>
            <p
              className="text-gray-500 mt-3"
              style={{ fontSize: '15px', lineHeight: '1.5', fontWeight: 400 }}
            >
              {content.description}
            </p>
          </motion.div>

          <div className="relative w-full max-w-[340px] flex items-center justify-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="relative w-[280px] aspect-square flex items-center justify-center"
            >
              <Image
                src={content.imageSrc}
                alt={content.imageAlt}
                fill
                className="object-contain z-10"
                priority
              />
            </motion.div>
          </div>
        </main>

        <div className="fixed bottom-0 left-0 right-0 px-6 pb-8 pt-4 z-50 max-w-[480px] mx-auto bg-gradient-to-t from-[#FFFFFF] via-[#FFFFFF] to-transparent">
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleStart}
            className="w-full h-[58px] bg-[#1F2228] text-white rounded-[20px] text-[17px] font-bold flex items-center justify-center gap-2"
          >
            <span>시작하기</span>
            <span className="text-[12px] font-normal mt-0.5 ai-gradient-text-light">with AI</span>
          </motion.button>
        </div>
      </div>
    </div>
  );
}
