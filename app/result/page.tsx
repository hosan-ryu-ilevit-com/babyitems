'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { loadSession, saveSession } from '@/lib/utils/session';
import { Recommendation, UserContextSummary } from '@/types';
import UserContextSummaryComponent from '@/components/UserContextSummary';
import ComparisonTable from '@/components/ComparisonTable';
import { logPageView, logButtonClick } from '@/lib/logging/clientLogger';

// 마크다운 볼드 처리 함수
function parseMarkdownBold(text: string) {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      const boldText = part.slice(2, -2);
      return <strong key={index} className="font-bold">{boldText}</strong>;
    }
    return <span key={index}>{part}</span>;
  });
}

export default function ResultPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [contextSummary, setContextSummary] = useState<UserContextSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [currentPhaseIndex, setCurrentPhaseIndex] = useState(0);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [selectedRecommendation, setSelectedRecommendation] = useState<Recommendation | null>(null);
  const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(false);

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  // Top 3 섹션으로 스크롤
  const scrollToTop3 = () => {
    const top3Element = document.getElementById('top3-section');
    if (top3Element) {
      top3Element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // 순차적으로 보여줄 상태 메시지들
  const phaseMessages = [
    '대표 상품 랭킹 확인 중...',
    '선호도 분석 중...',
    '딱 맞는 상품 고르는 중...',
  ];

  useEffect(() => {
    setMounted(true);
  }, []);

  // 페이지 뷰 로깅
  useEffect(() => {
    if (!mounted) return;
    logPageView('result');
  }, [mounted]);

  // 타이머 효과
  useEffect(() => {
    if (!loading) return;

    const timer = setInterval(() => {
      setElapsedTime((prev) => prev + 0.01);
    }, 10); // 10ms마다 업데이트 (0.01초씩 증가)

    return () => clearInterval(timer);
  }, [loading]);

  // 상태 메시지 자동 교체 (progress 기반)
  useEffect(() => {
    if (progress < 33) {
      setCurrentPhaseIndex(0); // 랭킹 상품 확인 중...
    } else if (progress < 66) {
      setCurrentPhaseIndex(1); // 고객님 선호도 분석 중...
    } else {
      setCurrentPhaseIndex(2); // 꼭 맞는 상품 분석 중...
    }
  }, [progress]);

  const fetchRecommendations = async () => {
    try {
      // 상태 초기화
      setLoading(true);
      setProgress(0);
      setError(null);
      setRecommendations([]);
      setContextSummary(null);

      const session = loadSession();

      // API 호출 (스트리밍)
      console.log('🚀 Starting recommendation API call...');
      console.log('📨 Request payload:', {
        messagesCount: session.messages.length,
        attributeAssessments: session.attributeAssessments,
        prioritySettings: session.prioritySettings,
        budget: session.budget,
        isQuickRecommendation: session.isQuickRecommendation,
        chatConversations: session.chatConversations,
      });

      const response = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: session.messages,
          attributeAssessments: session.attributeAssessments,
          prioritySettings: session.prioritySettings,
          budget: session.budget,
          isQuickRecommendation: session.isQuickRecommendation,
          chatConversations: session.chatConversations,
        }),
      });

      console.log('📡 Response status:', response.status, response.statusText);

      if (!response.ok) {
        throw new Error(`Recommendation API failed: ${response.status} ${response.statusText}`);
      }

      // 스트리밍 응답 처리
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body');
      }

      let buffer = '';
      console.log('📖 Starting to read SSE stream...');

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          console.log('✓ Stream reading completed');
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        console.log('📡 Received chunk:', chunk.substring(0, 200));
        buffer += chunk;

        // SSE 메시지 파싱 (data: {...}\n\n 형식)
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || ''; // 마지막 불완전한 줄은 버퍼에 보관

        console.log(`🔍 Processing ${lines.length} lines from buffer`);

        for (const line of lines) {
          console.log('📄 Processing line:', line.substring(0, 150));

          if (line.startsWith('data: ')) {
            const jsonStr = line.substring(6);
            console.log('📦 Extracted JSON:', jsonStr.substring(0, 100) + '...');

            try {
              const data = JSON.parse(jsonStr);

              if (data.error) {
                console.error('❌ API error:', data.error);
                setError(data.error);
                setLoading(false);
                return;
              }

              if (data.type === 'complete') {
                // 최종 결과
                console.log('✅ Recommendation complete!');
                console.log('  Recommendations count:', data.recommendations?.length);
                console.log('  Persona summary:', data.persona?.summary?.substring(0, 50) + '...');
                console.log('  Context summary:', data.contextSummary);

                // 세션에 저장
                const updatedSession = loadSession();
                updatedSession.persona = data.persona;
                updatedSession.recommendations = data.recommendations;
                updatedSession.contextSummary = data.contextSummary;
                saveSession(updatedSession);

                // 추천 결과 로깅 (전체 리포트 포함)
                if (data.recommendations && data.recommendations.length > 0) {
                  const productIds = data.recommendations.map((r: Recommendation) => r.product.id);
                  const fullReport = {
                    userContext: data.contextSummary ? {
                      priorityAttributes: data.contextSummary.priorityAttributes,
                      additionalContext: data.contextSummary.additionalContext,
                      budget: data.contextSummary.budget,
                    } : undefined,
                    recommendations: data.recommendations.map((r: Recommendation) => ({
                      rank: r.rank,
                      productId: r.product.id,
                      productTitle: r.product.title,
                      price: r.product.price,
                      finalScore: r.finalScore,
                      strengths: r.personalizedReason.strengths,
                      weaknesses: r.personalizedReason.weaknesses,
                      comparison: r.comparison,
                      additionalConsiderations: r.additionalConsiderations,
                    })),
                  };

                  // 전체 리포트를 포함하여 로깅
                  fetch('/api/log', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      sessionId: localStorage.getItem('baby_item_session_id'),
                      eventType: 'recommendation_received',
                      recommendations: {
                        productIds,
                        persona: data.persona?.summary || '',
                        isQuickRecommendation: updatedSession.isQuickRecommendation || false,
                        fullReport,
                      },
                    }),
                  }).catch(console.error);
                }

                // 화면에 표시
                if (!data.recommendations || data.recommendations.length === 0) {
                  console.error('⚠️ No recommendations in response!');
                  setError('추천 결과가 없습니다');
                  setLoading(false);
                  return;
                }

                console.log('🎯 Setting recommendations to state:', data.recommendations.length);
                console.log('📦 First recommendation:', {
                  rank: data.recommendations[0]?.rank,
                  hasProduct: !!data.recommendations[0]?.product,
                  hasReason: !!data.recommendations[0]?.personalizedReason,
                  hasComparison: !!data.recommendations[0]?.comparison,
                  hasAdditional: !!data.recommendations[0]?.additionalConsiderations,
                });

                setRecommendations(data.recommendations);
                if (data.contextSummary) {
                  setContextSummary(data.contextSummary);
                }
                setProgress(100);
                setLoading(false);
              } else if (data.progress !== undefined) {
                // 진행 상황 업데이트
                console.log(`📊 Progress: [${data.progress}%] ${data.phase} - ${data.message}`);
                setProgress(data.progress);
              }
            } catch (e) {
              console.error('❌ Failed to parse SSE message:', e);
              console.error('   Raw message:', jsonStr);
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to get recommendation:', error);
      setError(error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다');
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!mounted) return;

    const session = loadSession();

    // Quick Recommendation 플로우는 항상 새로 생성
    if (session.isQuickRecommendation) {
      console.log('🚀 Quick Recommendation flow - generating new recommendations');
      fetchRecommendations();
      return;
    }

    // forceRegenerate 플래그가 있으면 캐시 무시하고 새로 생성 (채팅 후 추천받기)
    if (session.forceRegenerate) {
      console.log('🚀 Force regenerate - generating new recommendations (from chat)');
      // 플래그 리셋
      session.forceRegenerate = false;
      saveSession(session);
      fetchRecommendations();
      return;
    }

    // 일반 플로우: 이미 추천 결과가 있으면 바로 표시
    if (session.recommendations && session.recommendations.length > 0) {
      console.log('✓ Using cached recommendations from session');
      setRecommendations(session.recommendations);
      if (session.contextSummary) {
        setContextSummary(session.contextSummary);
      }
      setLoading(false);
      return;
    }

    // 추천 결과가 없으면 API 호출
    console.log('🚀 No cached recommendations - fetching new ones');
    fetchRecommendations();
  }, [mounted]);

  if (!mounted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="relative w-full max-w-[480px] min-h-screen bg-gray-50" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="relative w-full max-w-[480px] min-h-screen bg-gray-50 flex flex-col">
        {/* Header */}
        <header className="sticky top-0 left-0 right-0 bg-white border-b border-gray-200 px-4 py-3 z-20">
          <div className="flex items-center justify-between">
            <h1 className="text-base font-semibold text-gray-900">추천 결과</h1>
            <button
              onClick={() => router.push('/')}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              처음으로
            </button>
          </div>
        </header>

      

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto px-4 py-6">
          <AnimatePresence mode="wait">
            {loading ? (
              // 로딩 상태 - 심플한 디자인
              <motion.div
                key="loading"
                initial={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="flex flex-col items-center justify-center min-h-[calc(100vh-180px)] px-8"
              >
              {/* 캐릭터 이미지 - 통통 튀는 애니메이션 */}
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{
                  opacity: 1,
                  y: [0, -15, 0]
                }}
                transition={{
                  opacity: { duration: 0.5 },
                  y: {
                    duration: 1.2,
                    repeat: Infinity,
                    ease: "easeInOut"
                  }
                }}
                className="mb-8"
              >
                <Image
                  src="/images/mainchartrans.png"
                  alt="분석 중"
                  width={120}
                  height={120}
                  className="w-[120px] h-[120px] object-contain"
                  priority
                  quality={90}
                  sizes="120px"
                />
              </motion.div>

              {/* 로딩 퍼센트 */}
              <div className="mb-4">
                <p className="text-xl font-medium text-gray-900">
                  {progress}%
                </p>
              </div>

              {/* 실시간 타이머 */}
              <p className="text-sm text-gray-500 mb-8 font-mono">
                {elapsedTime.toFixed(2)}s
              </p>

              {/* 순차적 상태 메시지 */}
              <motion.div
                key={currentPhaseIndex}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.5 }}
                className="text-center"
              >
                <p className="text-base font-medium text-gray-700">
                  {phaseMessages[currentPhaseIndex]}
                </p>
              </motion.div>
              </motion.div>
            ) : error || (!recommendations || recommendations.length === 0) ? (
            // 결과 없음 또는 에러
            <div className="flex flex-col items-center justify-center min-h-[400px]">
              <div className="text-6xl mb-4">😔</div>
              <p className="text-gray-900 font-semibold text-lg mb-2">
                추천 결과가 없습니다
              </p>
              <p className="text-gray-600 text-center mb-4 text-sm">
                {error || '추천 결과를 생성하는 중 오류가 발생했습니다.'}
                <br />
                다시 시도해 주세요.
              </p>
              <button
                onClick={fetchRecommendations}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-full transition-colors font-semibold"
              >
                다시 시도하기
              </button>
            </div>
          ) : (
            // 추천 결과 표시
            <div className="space-y-4">
              {/* Top 3 섹션 시작 - 스크롤 타겟 */}
              <div id="top3-section" />

              {/* 안내 문구 컨테이너 */}
              <div className="bg-white rounded-xl flex flex-col items-center gap-0 shadow-m pt-4 pb-4">
                {/* 이미지와 말풍선 그룹 */}
                <div className="relative flex items-center justify-center gap-3 mb-2">
                  {/* 캐릭터 이미지 */}
                  <Image
                    src="/images/compairimg.png"
                    alt="비교 분석"
                    width={120}
                    height={120}
                    className="w-[120px] h-[120px] object-contain"
                    priority
                    quality={90}
                    sizes="120px"
                  />

                  {/* 말풍선 */}
                  <motion.div
                    animate={{ y: [0, -4, 0] }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: "easeInOut"
                    }}
                    className="relative"
                  >
                    <div className="bg-gray-900 text-yellow-300 text-xs font-bold px-3 py-2 rounded-xl whitespace-nowrap shadow-2xs">
                      광고 아닌 실구매자 리뷰만<br />분석했어요!
                    </div>
                    {/* 말풍선 꼬리 (왼쪽) */}
                    <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-0 h-0 border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent border-r-[6px] border-r-gray-900"></div>
                  </motion.div>
                </div>

                {/* 추가 설명 텍스트 */}
                <div className="flex flex-col items-center justify-center gap-1 px-4">
                  <div className="flex items-center justify-center gap-1">
                    <svg className="w-4 h-4 text-green-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <p className="text-s text-gray-600 leading-relaxed text-center">
                      <span className="font-bold text-gray-700">실시간 인기상품 중에서 골랐어요</span> 
                    </p>
                  </div>
                  <div className="flex items-center justify-center gap-1">
                    <span className="text-[12px] text-gray-400">Powered by</span>
                    <Image
                      src="/images/naverstorelogo.png"
                      alt="네이버 스토어"
                      width={40}
                      height={14}
                      className="h-2.5 w-auto object-contain"
                    />
                  </div>
                </div>
              </div>

              {/* 추천 상품 3개 */}
              {recommendations.map((rec, index) => (
                <motion.div
                  key={rec.product.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: index * 0.2 }}
                  className={`relative bg-white rounded-2xl p-5 ${
                    rec.rank === 1
                      ? 'border-2 border-yellow-400'
                      : 'border border-white'
                  }`}
                >
                  {/* 순위 배지 */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${
                          rec.rank === 1
                            ? 'bg-yellow-400 text-white'
                            : 'bg-gray-600 text-white'
                        }`}
                      >
                        {rec.rank}
                      </span>
                      {rec.rank === 1 && (
                        <span className="text-xs font-bold text-yellow-600 bg-yellow-50 px-2 py-1 rounded-full">
                          BEST
                        </span>
                      )}
                      <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-full">
                        적합도 {rec.finalScore}%
                      </span>
                    </div>
                  </div>

                  {/* 제품 정보 */}
                  <div className="flex gap-4 mb-4">
                    {/* 제품 썸네일 */}
                    <div className="w-28 h-28 rounded-xl overflow-hidden shrink-0 bg-gray-100">
                      {rec.product.thumbnail ? (
                        <Image
                          src={rec.product.thumbnail}
                          alt={rec.product.title}
                          width={112}
                          height={112}
                          className="w-full h-full object-cover"
                          priority={index === 0}
                          quality={90}
                          sizes="112px"
                        />
                      ) : (
                        <div className="w-full h-full bg-linear-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                          <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                      )}
                    </div>

                    {/* 제품 상세 정보 */}
                    <div className="flex-1 min-w-0 flex flex-col justify-between py-1">
                      <h3 className="font-bold text-gray-900 text-base mb-1 leading-tight">
                        {rec.product.title}
                      </h3>
                      <div className="space-y-1">
                        <p className="text-base font-bold text-gray-900">
                          {rec.product.price.toLocaleString()}원
                        </p>
                        <div className="flex items-center gap-1 text-xs text-gray-600">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="#FCD34D" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
                          </svg>
                          <span className="font-medium">리뷰 {rec.product.reviewCount.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 버튼 2개 (가로 배치) */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => {
                        logButtonClick(`쿠팡에서 보기: ${rec.product.title}`, 'result');
                        window.open(rec.product.reviewUrl, '_blank');
                      }}
                      className="py-3 font-semibold rounded-xl text-sm transition-all bg-gray-100 hover:bg-gray-200 text-gray-700"
                    >
                      쿠팡에서 보기
                    </button>
                    <button
                      onClick={() => {
                        logButtonClick(`추천 이유 보기: ${rec.product.title}`, 'result');
                        setSelectedRecommendation(rec);
                        setIsBottomSheetOpen(true);
                      }}
                      className="py-3 font-bold rounded-xl text-sm transition-all bg-blue-500 hover:bg-blue-300 text-white flex items-center justify-center gap-1.5"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 22l-.394-1.433a2.25 2.25 0 00-1.423-1.423L13.25 19l1.433-.394a2.25 2.25 0 001.423-1.423L16.5 16l.394 1.433a2.25 2.25 0 001.423 1.423L19.75 19l-1.433.394a2.25 2.25 0 00-1.423 1.423z" />
                      </svg>
                      추천 이유 보기
                    </button>
                  </div>
                </motion.div>
              ))}

              {/* 비교표 */}
              <ComparisonTable recommendations={recommendations} />

              {/* 사용자 맥락 요약 (최하단으로 이동) */}
              {contextSummary && <UserContextSummaryComponent summary={contextSummary} />}
            </div>
          )}
          </AnimatePresence>
        </main>

        {/* 바텀시트 */}
        <AnimatePresence>
          {isBottomSheetOpen && selectedRecommendation && (
            <>
              {/* 배경 오버레이 */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsBottomSheetOpen(false)}
                className="fixed inset-0 bg-black/50 z-40"
              />

              {/* 바텀시트 */}
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                className="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl z-50 max-h-[85vh] overflow-y-auto"
              >
                <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between rounded-t-3xl">
                  <h3 className="text-lg font-bold text-gray-900">상세 정보</h3>
                  <button
                    onClick={() => setIsBottomSheetOpen(false)}
                    className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                  >
                    <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="p-4 space-y-4 pb-6">
                  {/* 제품 정보 요약 */}
                  <div className="flex items-center gap-3 pb-4 border-b border-gray-200">
                    <div className="w-16 h-16 rounded-lg overflow-hidden shrink-0 bg-gray-100">
                      {selectedRecommendation.product.thumbnail && (
                        <Image
                          src={selectedRecommendation.product.thumbnail}
                          alt={selectedRecommendation.product.title}
                          width={64}
                          height={64}
                          className="w-full h-full object-cover"
                          quality={85}
                          sizes="64px"
                        />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-gray-900 text-sm mb-1 leading-tight">
                        {selectedRecommendation.product.title}
                      </h4>
                      <p className="text-sm font-bold text-gray-900">
                        {selectedRecommendation.product.price.toLocaleString()}원
                      </p>
                    </div>
                  </div>

                  {/* 추천 이유 */}
                  <div className="bg-blue-50 rounded-xl p-4">
                    <h4 className="text-sm font-bold text-blue-900 mb-3 flex items-center gap-1">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      추천 이유
                    </h4>
                    <ul className="space-y-2">
                      {selectedRecommendation.personalizedReason.strengths.map((strength, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                          <span className="text-green-500 shrink-0 mt-0.5">✓</span>
                          <span className="leading-relaxed">{parseMarkdownBold(strength)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* 주의점 */}
                  {selectedRecommendation.personalizedReason.weaknesses &&
                   selectedRecommendation.personalizedReason.weaknesses.length > 0 && (
                    <div className="bg-gray-50 rounded-xl p-4">
                      <h4 className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-1.5">
                        <svg className="w-4 h-4 text-orange-500" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        주의점
                      </h4>
                      <ul className="space-y-1">
                        {selectedRecommendation.personalizedReason.weaknesses.map((weakness, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                            <span className="shrink-0 mt-0.5">•</span>
                            <span>{parseMarkdownBold(weakness)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* 비교하기 */}
                  {selectedRecommendation.comparison && (
                    <div className="bg-gray-50 rounded-xl p-4">
                      <h4 className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-1.5">
                        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                        </svg>
                        비교하기
                      </h4>
                      <p className="text-sm text-gray-600 leading-relaxed">
                        {parseMarkdownBold(selectedRecommendation.comparison)}
                      </p>
                    </div>
                  )}

                  {/* 구매 Tip */}
                  {selectedRecommendation.additionalConsiderations && (
                    <div className="bg-gray-50 rounded-xl p-4">
                      <h4 className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-1.5">
                        <svg className="w-4 h-4 text-gray-500" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                        </svg>
                        구매 Tip
                      </h4>
                      <p className="text-sm text-gray-600 leading-relaxed">
                        {parseMarkdownBold(selectedRecommendation.additionalConsiderations)}
                      </p>
                    </div>
                  )}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
