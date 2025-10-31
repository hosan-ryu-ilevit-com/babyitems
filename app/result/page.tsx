'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { loadSession, saveSession } from '@/lib/utils/session';
import { Recommendation } from '@/types';

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

// 진행 단계 컴포넌트
function ProgressStep({
  label,
  completed,
  active,
}: {
  label: string;
  completed: boolean;
  active: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-colors ${
          completed
            ? 'bg-green-500 text-white'
            : active
            ? 'bg-blue-500 text-white animate-pulse'
            : 'bg-gray-300 text-gray-500'
        }`}
      >
        {completed ? (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
        ) : (
          <div className="w-2 h-2 rounded-full bg-current" />
        )}
      </div>
      <p
        className={`text-sm ${
          completed
            ? 'text-green-600 font-medium'
            : active
            ? 'text-blue-600 font-medium'
            : 'text-gray-500'
        }`}
      >
        {label}
      </p>
    </div>
  );
}

export default function ResultPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('시작 중...');

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const fetchRecommendations = async () => {
      try {
        const session = loadSession();

        // 이미 추천 결과가 있으면 바로 표시
        if (session.recommendations && session.recommendations.length > 0) {
          setRecommendations(session.recommendations);
          setLoading(false);
          return;
        }

        // API 호출 (스트리밍)
        console.log('🚀 Starting recommendation API call...');
        console.log('📨 Request payload:', {
          messagesCount: session.messages.length,
          attributeAssessments: session.attributeAssessments,
        });

        const response = await fetch('/api/recommend', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: session.messages,
            attributeAssessments: session.attributeAssessments,
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
                  setProgressMessage('오류: ' + data.error);
                  setLoading(false);
                  return;
                }

                if (data.type === 'complete') {
                  // 최종 결과
                  console.log('✅ Recommendation complete!');
                  console.log('  Recommendations count:', data.recommendations?.length);
                  console.log('  Persona summary:', data.persona?.summary?.substring(0, 50) + '...');

                  // 세션에 저장
                  const updatedSession = loadSession();
                  updatedSession.persona = data.persona;
                  updatedSession.recommendations = data.recommendations;
                  saveSession(updatedSession);

                  // 화면에 표시
                  if (!data.recommendations || data.recommendations.length === 0) {
                    console.error('⚠️ No recommendations in response!');
                    setProgressMessage('추천 결과가 없습니다');
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
                  setProgress(100);
                  setProgressMessage('완료!');
                  setLoading(false);
                } else if (data.progress !== undefined) {
                  // 진행 상황 업데이트
                  console.log(`📊 Progress: [${data.progress}%] ${data.phase} - ${data.message}`);
                  setProgress(data.progress);
                  setProgressMessage(data.message);
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
        setProgressMessage('오류가 발생했습니다');
        setLoading(false);
      }
    };

    fetchRecommendations();
  }, [mounted]);

  if (!mounted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100">
        <div className="relative w-full max-w-[480px] min-h-screen bg-white shadow-lg" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100">
      <div className="relative w-full max-w-[480px] min-h-screen bg-white shadow-lg flex flex-col">
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
          {loading ? (
            // 로딩 상태 with 프로그레스 바
            <div className="flex flex-col items-center justify-center min-h-[400px] px-8">
              {/* 프로그레스 바 */}
              <div className="w-full max-w-md mb-8">
                <div className="relative w-full h-3 bg-gray-200 rounded-full overflow-hidden">
                  <motion.div
                    className="absolute top-0 left-0 h-full bg-linear-to-r from-blue-500 to-blue-600 rounded-full"
                    initial={{ width: '0%' }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.3, ease: 'easeOut' }}
                  />
                </div>
                <div className="flex items-center justify-between mt-2">
                  <p className="text-sm font-medium text-gray-700">
                    {progressMessage}
                  </p>
                  <p className="text-sm font-bold text-blue-600">
                    {progress}%
                  </p>
                </div>
              </div>

              {/* 스피너 */}
              <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />

              {/* 메시지 */}
              <p className="text-gray-600 text-center">
                고객님께 딱 맞는 분유포트를
                <br />
                찾고 있습니다...
              </p>

              {/* 진행 단계 설명 */}
              <div className="mt-6 w-full max-w-md space-y-2">
                <ProgressStep
                  label="페르소나 생성"
                  completed={progress >= 20}
                  active={progress < 20}
                />
                <ProgressStep
                  label="Top 5 제품 선정"
                  completed={progress >= 35}
                  active={progress >= 20 && progress < 35}
                />
                <ProgressStep
                  label="5개 제품 동시 평가"
                  completed={progress >= 60}
                  active={progress >= 35 && progress < 60}
                />
                <ProgressStep
                  label="최종 점수 계산"
                  completed={progress >= 70}
                  active={progress >= 60 && progress < 70}
                />
                <ProgressStep
                  label="맞춤 추천 생성"
                  completed={progress >= 100}
                  active={progress >= 70 && progress < 100}
                />
              </div>
            </div>
          ) : !recommendations || recommendations.length === 0 ? (
            // 결과 없음
            <div className="flex flex-col items-center justify-center min-h-[400px]">
              <div className="text-6xl mb-4">😔</div>
              <p className="text-gray-900 font-semibold text-lg mb-2">
                추천 결과가 없습니다
              </p>
              <p className="text-gray-600 text-center mb-4 text-sm">
                추천 결과를 생성하는 중 오류가 발생했습니다.
                <br />
                다시 시도해 주세요.
              </p>
              <button
                onClick={() => router.push('/chat')}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-full transition-colors font-semibold"
              >
                다시 시도하기
              </button>
            </div>
          ) : (
            // 추천 결과 표시
            <div className="space-y-6">
              <div className="text-center mb-6">
                <h2 className="text-xl font-bold text-gray-900 mb-2">
                  고객님을 위한 TOP 3
                </h2>
                <p className="text-sm text-gray-600">
                  고객님의 선호도에 맞춰 선정된 제품입니다
                </p>
              </div>

              {recommendations.map((rec, index) => (
                <motion.div
                  key={rec.product.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: index * 0.2 }}
                  className={`relative bg-white rounded-2xl p-5 shadow-lg ${
                    rec.rank === 1
                      ? 'border-2 border-yellow-400'
                      : 'border border-gray-200'
                  }`}
                >
                  {/* 순위 배지 */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center justify-center w-10 h-10 rounded-full text-base font-bold shadow-md ${
                          rec.rank === 1
                            ? 'bg-linear-to-br from-yellow-400 to-yellow-500 text-white'
                            : rec.rank === 2
                            ? 'bg-linear-to-br from-gray-300 to-gray-400 text-white'
                            : 'bg-linear-to-br from-orange-400 to-orange-500 text-white'
                        }`}
                      >
                        {rec.rank}
                      </span>
                      {rec.rank === 1 && (
                        <span className="text-xs font-bold text-yellow-600 bg-yellow-50 px-2 py-1 rounded-full">
                          BEST
                        </span>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-500">적합도</p>
                      <p className="text-lg font-bold text-blue-600">
                        {rec.finalScore}%
                      </p>
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
                      <h3 className="font-bold text-gray-900 text-base mb-1 line-clamp-2 leading-tight">
                        {rec.product.title}
                      </h3>
                      <div className="space-y-1">
                        <p className="text-xl font-bold text-gray-900">
                          {rec.product.price.toLocaleString()}
                          <span className="text-sm font-normal text-gray-600 ml-0.5">원</span>
                        </p>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <span className="inline-flex items-center gap-1 bg-gray-100 px-2 py-0.5 rounded-md">
                            <span className="font-medium text-gray-700">리뷰 {rec.product.reviewCount.toLocaleString()}</span>
                          </span>
                          <span className="text-gray-400">•</span>
                          <span className="font-medium text-blue-600">판매량 랭킹 {rec.product.ranking}위</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 추천 이유 */}
                  <div className="bg-blue-50 rounded-xl p-4 mb-3">
                    <h4 className="text-sm font-bold text-blue-900 mb-3 flex items-center gap-1">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      고객님께 추천하는 이유
                    </h4>
                    <ul className="space-y-2">
                      {rec.personalizedReason.strengths.map((strength, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                          <span className="text-green-500 shrink-0 mt-0.5">✓</span>
                          <span className="leading-relaxed">{parseMarkdownBold(strength)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* 단점 (있으면 표시) */}
                  {rec.personalizedReason.weaknesses && rec.personalizedReason.weaknesses.length > 0 && (
                    <div className="bg-gray-50 rounded-xl p-4 mb-3">
                      <h4 className="text-sm font-bold text-gray-700 mb-2">
                        주의하세요
                      </h4>
                      <ul className="space-y-1">
                        {rec.personalizedReason.weaknesses.map((weakness, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                            <span className="shrink-0 mt-0.5">•</span>
                            <span>{parseMarkdownBold(weakness)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* 비교 정보 */}
                  {rec.comparison && (
                    <div className="border-t border-gray-200 pt-3 mb-3">
                      <p className="text-xs text-gray-600 leading-relaxed">
                        <span className="font-semibold text-gray-700">💡 비교: </span>
                        {parseMarkdownBold(rec.comparison)}
                      </p>
                    </div>
                  )}

                  {/* 추가 고려사항 */}
                  {rec.additionalConsiderations && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3">
                      <p className="text-xs text-amber-900 leading-relaxed">
                        <span className="font-semibold">💡 참고: </span>
                        {parseMarkdownBold(rec.additionalConsiderations)}
                      </p>
                    </div>
                  )}

                  {/* 상세보기 버튼 */}
                  <button
                    onClick={() => window.open(rec.product.reviewUrl, '_blank')}
                    className={`w-full py-3 font-semibold rounded-xl text-sm transition-all ${
                      rec.rank === 1
                        ? 'bg-linear-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white shadow-md'
                        : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                    }`}
                  >
                    쿠팡에서 상세보기 →
                  </button>
                </motion.div>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
