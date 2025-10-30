'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { loadSession, saveSession } from '@/lib/utils/session';
import { Recommendation } from '@/types';

export default function ResultPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);

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

        // API 호출
        const response = await fetch('/api/recommend', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: session.messages,
            attributeAssessments: session.attributeAssessments,
          }),
        });

        if (!response.ok) {
          throw new Error('Recommendation API failed');
        }

        const data = await response.json();
        console.log('Recommendation result:', data);

        // 세션에 저장
        const updatedSession = loadSession();
        updatedSession.persona = data.persona;
        updatedSession.recommendations = data.recommendations;
        saveSession(updatedSession);

        // 화면에 표시
        setRecommendations(data.recommendations);
        setLoading(false);
      } catch (error) {
        console.error('Failed to get recommendation:', error);
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
            // 로딩 상태
            <div className="flex flex-col items-center justify-center min-h-[400px]">
              <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-gray-600 text-center">
                고객님께 딱 맞는 분유포트를
                <br />
                찾고 있습니다...
              </p>
            </div>
          ) : recommendations.length === 0 ? (
            // 결과 없음
            <div className="flex flex-col items-center justify-center min-h-[400px]">
              <p className="text-gray-600 text-center mb-4">
                추천 결과를 생성하는 중 오류가 발생했습니다.
              </p>
              <button
                onClick={() => router.push('/chat')}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-full transition-colors"
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
                  className="bg-white border-2 border-gray-200 rounded-2xl p-4 shadow-md"
                >
                  {/* 순위 배지 */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-block px-3 py-1 rounded-full text-sm font-bold ${
                          rec.rank === 1
                            ? 'bg-yellow-500 text-white'
                            : rec.rank === 2
                            ? 'bg-gray-400 text-white'
                            : 'bg-orange-500 text-white'
                        }`}
                      >
                        {rec.rank}위
                      </span>
                      <span className="text-xs text-gray-500">
                        적합도 {rec.finalScore.toFixed(0)}점
                      </span>
                    </div>
                  </div>

                  {/* 제품 정보 */}
                  <div className="flex gap-3 mb-3">
                    <div className="w-20 h-20 bg-gray-200 rounded-lg flex-shrink-0" />
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 text-sm mb-1 line-clamp-2">
                        {rec.product.title}
                      </h3>
                      <p className="text-lg font-bold text-blue-600">
                        {rec.product.price.toLocaleString()}원
                      </p>
                      <p className="text-xs text-gray-500">
                        리뷰 {rec.product.reviewCount}개
                      </p>
                    </div>
                  </div>

                  {/* 추천 이유 */}
                  <div className="border-t border-gray-200 pt-3">
                    <h4 className="text-sm font-semibold text-gray-900 mb-2">
                      추천 이유
                    </h4>
                    <ul className="text-sm text-gray-700 space-y-1 mb-2">
                      {rec.personalizedReason.strengths.map((strength, i) => (
                        <li key={i} className="flex items-start gap-1">
                          <span className="text-green-500 flex-shrink-0">✓</span>
                          <span>{strength}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* 상세보기 버튼 */}
                  <button
                    onClick={() => window.open(rec.product.reviewUrl, '_blank')}
                    className="w-full mt-3 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-full text-sm transition-colors"
                  >
                    상세보기
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
