'use client';

import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Baby, CookingPot, ArrowRight, Sparkle } from '@phosphor-icons/react';

export default function KnowledgeAgentPage() {
  const router = useRouter();

  const categories = [
    {
      key: 'baby',
      title: '출산 · 육아',
      subtitle: 'Baby & Kids',
      description: '소중한 우리 아이를 위한\n가장 안전한 선택',
      icon: Baby,
      // Color theme: Warm terracotta/rose
      hoverBorder: 'group-hover:border-rose-200',
      hoverBg: 'group-hover:bg-rose-50/50',
      iconColor: 'text-rose-500',
      iconBg: 'bg-rose-50',
    },
    {
      key: 'living',
      title: '생활 · 주방',
      subtitle: 'Living & Kitchen',
      description: '더 나은 일상을 위한\n스마트한 가전 큐레이션',
      icon: CookingPot,
      // Color theme: Sophisticated teal/slate
      hoverBorder: 'group-hover:border-teal-200',
      hoverBg: 'group-hover:bg-teal-50/50',
      iconColor: 'text-teal-600',
      iconBg: 'bg-teal-50',
    }
  ];

  return (
    <div className="min-h-screen bg-[#FDFBF9] flex items-center justify-center p-6 relative overflow-hidden">
       {/* Ambient Background - Grid & Mesh Gradients */}
       <div className="absolute inset-0 w-full h-full bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-[size:24px_24px]" />
       <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-white/0 via-white/80 to-[#FDFBF9]" />
       
       <div className="absolute -top-[20%] -right-[10%] w-[600px] h-[600px] bg-rose-100/40 rounded-full blur-[100px] mix-blend-multiply opacity-60 animate-pulse-slow" />
       <div className="absolute top-[20%] -left-[10%] w-[500px] h-[500px] bg-teal-100/40 rounded-full blur-[80px] mix-blend-multiply opacity-60 animate-pulse-slow" style={{ animationDelay: '2s' }} />

       <div className="w-full max-w-[400px] relative z-10 flex flex-col gap-10">
          {/* Header */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="space-y-5 text-center sm:text-left"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/80 border border-gray-200 backdrop-blur-sm">
              <Sparkle weight="fill" className="text-amber-400 w-3.5 h-3.5" />
              <span className="text-[11px] font-bold text-gray-500 tracking-wider uppercase">AI 쇼핑비서</span>
            </div>
            
            <div className="space-y-2">
              <h1 className="text-[32px] sm:text-[36px] leading-[1.15] font-bold text-gray-900 tracking-tight">
                무엇을 
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-gray-900 via-gray-700 to-gray-500"> 찾고 계신가요?</span>
              </h1>
              <p className="text-[15px] sm:text-[16px] text-gray-500 font-medium leading-relaxed">
                복잡한 비교는 AI에게 맡기세요.<br></br>
                실시간 인기템들의 수천 개의 리뷰를 분석해 <br></br>딱 맞는 제품을 골라드립니다.
              </p>
            </div>
          </motion.div>

          {/* Cards */}
          <div className="grid gap-5">
            {categories.map((category, index) => (
              <motion.button
                key={category.key}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.3 + (index * 0.15), ease: [0.16, 1, 0.3, 1] }}
                whileHover={{ y: -4 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => router.push(`/knowledge-agent/${category.key}`)}
                className={`
                  group relative w-full text-left p-7 rounded-[32px] bg-white
                  border border-gray-100 transition-all duration-500 ease-out
                  ${category.hoverBorder}
                `}
              >
                {/* Background Hover Effect */}
                <div className={`absolute inset-0 rounded-[32px] opacity-0 transition-opacity duration-500 ${category.hoverBg}`} />
                
                <div className="relative flex items-start justify-between z-10 gap-4">
                  <div className="flex-1 space-y-3">
                    <span className="inline-block text-[11px] font-bold text-gray-400 tracking-widest uppercase">
                      {category.subtitle}
                    </span>
                    <div>
                      <h3 className="text-[20px] font-bold text-gray-900 mb-1.5">
                        {category.title}
                      </h3>
                      <p className="text-[14px] text-gray-500 leading-snug whitespace-pre-line font-medium opacity-80 group-hover:opacity-100 transition-opacity">
                        {category.description}
                      </p>
                    </div>
                  </div>
                  
                  <div className={`
                    w-14 h-14 rounded-2xl flex items-center justify-center text-2xl
                    ${category.iconBg} ${category.iconColor}
                    group-hover:scale-110 group-hover:rotate-3 transition-transform duration-500 ease-out
                  `}>
                    <category.icon weight="fill" />
                  </div>
                </div>

                <div className="relative z-10 mt-6 flex items-center text-[13px] font-bold text-gray-900 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300 delay-75">
                  <span>시작하기</span>
                  <ArrowRight className="ml-2 w-4 h-4" weight="bold" />
                </div>
              </motion.button>
            ))}
          </div>
       </div>
    </div>
  );
}
