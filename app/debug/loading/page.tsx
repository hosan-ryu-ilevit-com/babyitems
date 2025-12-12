'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function LoadingDebugPage() {
  const [progress, setProgress] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [speed, setSpeed] = useState(100); // ms per 1%

  // 자동 진행
  useEffect(() => {
    if (!isRunning) return;

    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          setIsRunning(false);
          return 100;
        }
        return prev + 1;
      });
    }, speed);

    return () => clearInterval(interval);
  }, [isRunning, speed]);

  const getStageMessage = () => {
    if (progress < 3) return '데이터 준비 중...';
    if (progress < 8) return '제품 데이터 수집 중...';
    if (progress < 12) return '점수 계산 중...';
    if (progress < 15) return '추천 후보 선정 중...';
    if (progress < 55) return 'AI가 최적의 제품 분석 중...';
    if (progress < 95) return '추천 태그 정리 중...';
    return '최종 결과 준비 중...';
  };

  const getStageIndex = () => {
    if (progress < 3) return 0;
    if (progress < 8) return 1;
    if (progress < 12) return 2;
    if (progress < 15) return 3;
    if (progress < 55) return 4;
    if (progress < 95) return 5;
    return 6;
  };

  const currentMessage = getStageMessage();

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-md mx-auto">
        <h1 className="text-xl font-bold mb-4">로딩 UI 디버그</h1>

        {/* 컨트롤 패널 */}
        <div className="bg-white rounded-xl p-4 mb-4 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              Progress: {progress}%
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={progress}
              onChange={(e) => setProgress(Number(e.target.value))}
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              속도: {speed}ms per 1%
            </label>
            <input
              type="range"
              min="10"
              max="500"
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              className="w-full"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => { setProgress(0); setIsRunning(true); }}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg"
            >
              처음부터 시작
            </button>
            <button
              onClick={() => setIsRunning(!isRunning)}
              className="px-4 py-2 bg-gray-500 text-white rounded-lg"
            >
              {isRunning ? '일시정지' : '재생'}
            </button>
            <button
              onClick={() => setProgress(0)}
              className="px-4 py-2 bg-red-500 text-white rounded-lg"
            >
              리셋
            </button>
          </div>

          {/* 단계별 점프 버튼 */}
          <div className="flex flex-wrap gap-2">
            {[0, 3, 8, 12, 15, 55, 95, 100].map(val => (
              <button
                key={val}
                onClick={() => setProgress(val)}
                className={`px-3 py-1 text-sm rounded ${
                  progress >= val ? 'bg-green-100 text-green-700' : 'bg-gray-100'
                }`}
              >
                {val}%
              </button>
            ))}
          </div>
        </div>

        {/* 실제 로딩 UI 미리보기 */}
        <div className="bg-[#FFF8F0] rounded-xl p-4">
          <h2 className="text-sm font-medium text-gray-500 mb-4">로딩 UI 미리보기</h2>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full py-8 flex items-start gap-4"
          >
            {/* 비디오 영역 */}
            <div className="rounded-2xl overflow-hidden bg-white shrink-0">
              <video
                style={{ width: 80, height: 80 }}
                autoPlay
                loop
                muted
                playsInline
              >
                <source src="/videos/loading_animation.mp4" type="video/mp4" />
              </video>
            </div>

            {/* 텍스트 영역 */}
            <div className="flex flex-col justify-center pt-2">
              <span className="text-base font-semibold text-gray-700 tabular-nums">
                {progress}%
              </span>
              <div className="mt-1 h-6 overflow-hidden">
                <AnimatePresence mode="wait">
                  <motion.span
                    key={getStageIndex()}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.4, ease: 'easeOut' }}
                    className="text-sm font-medium text-gray-500 block"
                  >
                    {currentMessage}
                  </motion.span>
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        </div>

        {/* 단계 정보 */}
        <div className="mt-4 bg-white rounded-xl p-4">
          <h3 className="font-medium mb-2">단계 구간</h3>
          <ul className="text-sm space-y-1 text-gray-600">
            <li className={progress < 3 ? 'font-bold text-blue-600' : ''}>0-3%: 데이터 준비 중</li>
            <li className={progress >= 3 && progress < 8 ? 'font-bold text-blue-600' : ''}>3-8%: 제품 데이터 수집 중</li>
            <li className={progress >= 8 && progress < 12 ? 'font-bold text-blue-600' : ''}>8-12%: 점수 계산 중</li>
            <li className={progress >= 12 && progress < 15 ? 'font-bold text-blue-600' : ''}>12-15%: 추천 후보 선정 중</li>
            <li className={progress >= 15 && progress < 55 ? 'font-bold text-blue-600' : ''}>15-55%: AI 분석 중 (LLM API)</li>
            <li className={progress >= 55 && progress < 95 ? 'font-bold text-blue-600' : ''}>55-95%: 태그 정리 중</li>
            <li className={progress >= 95 ? 'font-bold text-blue-600' : ''}>95-100%: 최종 결과 준비</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
