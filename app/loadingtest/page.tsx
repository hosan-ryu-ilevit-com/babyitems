'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { LoadingAnimation } from '@/components/recommend-v2/LoadingAnimation';
import type { TimelineStep } from '@/types/recommend-v2';

export default function LoadingTestPage() {
  const [progress, setProgress] = useState(0);
  const progressRef = useRef(0);
  const [isRunning, setIsRunning] = useState(false);
  const [timelineSteps, setTimelineSteps] = useState<TimelineStep[]>([]);
  const [cycleCount, setCycleCount] = useState(0);

  // 단계별 메시지 (상태 정보 표시용)
  const getStageMessage = (progress: number) => {
    if (progress < 12) return '📦 상품 데이터 준비 중...';
    if (progress < 20) return '📚 카테고리 전문 지식 로드 중...';
    if (progress < 35) return '📝 실사용 리뷰 수집 중...';
    if (progress < 55) return '🤖 AI 종합 분석 중...';
    if (progress < 95) return '🏆 Top 3 최종 선정 중...';
    return '✨ 최종 결과 준비 중...';
  };

  // 타임라인 스텝 생성
  const generateTimelineSteps = () => {
    const steps: TimelineStep[] = [
      {
        id: 'step-1',
        title: '📦 상품 데이터 준비',
        icon: '',
        details: [
          '다나와 제품 정보 수집',
          '최저가 정보 확인',
          '제품 스펙 정규화',
        ],
        timestamp: Date.now(),
        status: 'completed',
      },
      {
        id: 'step-2',
        title: '📚 카테고리 전문 지식 로드',
        icon: '',
        details: [
          '분유포트 카테고리 분석 기준 로드',
          '중요 평가 항목 확인',
        ],
        timestamp: Date.now() + 1000,
        status: 'completed',
      },
      {
        id: 'step-3',
        title: '📝 실사용 리뷰 수집',
        icon: '',
        details: [
          '실제 구매자 리뷰 분석 중...',
          '긍정/부정 의견 추출',
        ],
        timestamp: Date.now() + 2000,
        status: 'in_progress',
      },
      {
        id: 'step-4',
        title: '🤖 AI 종합 분석',
        icon: '',
        details: [
          '사용자 선택 조건 매칭',
          '각 제품의 장단점 평가',
          '추천 점수 계산',
        ],
        subDetails: [
          {
            label: '사용자가 중요하게 생각하는 조건',
            items: ['세척 편의성', '온도 정확도', '내구성'],
          },
        ],
        timestamp: Date.now() + 3000,
        status: 'pending',
      },
      {
        id: 'step-5',
        title: '🏆 Top 3 최종 선정',
        icon: '',
        details: [
          'AI 분석 결과와 사용자 선호도를 종합',
          '가장 적합한 상위 3개 제품 선정',
          '각 제품별 추천 이유 생성',
        ],
        timestamp: Date.now() + 4000,
        status: 'pending',
      },
    ];

    return steps;
  };

  // 프로그레스 증가 로직 (실제 로딩과 동일)
  useEffect(() => {
    if (!isRunning) return;

    let isCancelled = false;

    (async () => {
      while (!isCancelled && isRunning) {
        // 초기화
        setProgress(0);
        progressRef.current = 0;
        setTimelineSteps([]);

        // 0~99%: Tick으로 천천히 증가
        let tickCount = 0;
        const tickInterval = setInterval(() => {
          tickCount++;
          setProgress((prev) => {
            if (prev < 40) {
              // 0-40%: 100ms(10틱)당 1% (4초)
              if (tickCount % 10 === 0) {
                const newProgress = prev + 1;
                progressRef.current = newProgress;
                return newProgress;
              }
            } else if (prev < 90) {
              // 40-90%: 120ms(12틱)당 1% (6초)
              if (tickCount % 12 === 0) {
                const newProgress = prev + 1;
                progressRef.current = newProgress;
                return newProgress;
              }
            } else if (prev < 99) {
              // 90-99%: 300ms(30틱)당 1% (2.7초)
              if (tickCount % 30 === 0) {
                const newProgress = prev + 1;
                progressRef.current = newProgress;
                return newProgress;
              }
            }
            return prev;
          });
        }, 10);

        // API 완료 시뮬레이션 (약 35초 후)
        await new Promise(resolve => setTimeout(resolve, 35000));
        if (isCancelled) {
          clearInterval(tickInterval);
          break;
        }

        clearInterval(tickInterval);

        // API 완료 → 현재 progress에서 100%까지 빠르게 (10ms당 1%)
        const currentProgress = progressRef.current;
        for (let i = currentProgress + 1; i <= 100; i++) {
          if (isCancelled) break;
          setProgress(i);
          progressRef.current = i;
          await new Promise(resolve => setTimeout(resolve, 10));
        }

        if (isCancelled) break;

        // 100% 유지 (0.3초)
        await new Promise(resolve => setTimeout(resolve, 300));

        // 사이클 증가 후 다시 시작
        setCycleCount((c) => c + 1);
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [isRunning, cycleCount]);

  // 타임라인 스텝 순차 추가
  useEffect(() => {
    if (!isRunning) return;

    const timeouts: NodeJS.Timeout[] = [];

    // Step 1: 0.5초 후
    timeouts.push(setTimeout(() => {
      setTimelineSteps((prev) => {
        const steps = generateTimelineSteps();
        return [steps[0]];
      });
    }, 500));

    // Step 2: 2초 후
    timeouts.push(setTimeout(() => {
      setTimelineSteps((prev) => {
        const steps = generateTimelineSteps();
        return [steps[0], steps[1]];
      });
    }, 2000));

    // Step 3: 3.5초 후
    timeouts.push(setTimeout(() => {
      setTimelineSteps((prev) => {
        const steps = generateTimelineSteps();
        return [steps[0], steps[1], steps[2]];
      });
    }, 3500));

    // Step 4: 5초 후
    timeouts.push(setTimeout(() => {
      setTimelineSteps((prev) => {
        const steps = generateTimelineSteps();
        steps[2].status = 'completed';
        steps[3].status = 'in_progress';
        return [steps[0], steps[1], steps[2], steps[3]];
      });
    }, 5000));

    // Step 5: 7초 후
    timeouts.push(setTimeout(() => {
      setTimelineSteps((prev) => {
        const steps = generateTimelineSteps();
        steps[2].status = 'completed';
        steps[3].status = 'completed';
        steps[4].status = 'in_progress';
        return steps;
      });
    }, 7000));

    return () => {
      timeouts.forEach(clearTimeout);
    };
  }, [isRunning, cycleCount]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#FBFCFC]">
      <div className="relative w-full max-w-[480px] min-h-screen bg-[#FBFCFC] flex flex-col">
        {/* Header */}
        <header className="px-4 py-4 bg-white border-b border-gray-200 sticky top-0 z-20">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold text-gray-900">로딩 테스트</h1>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">사이클: {cycleCount}</span>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto px-4 pb-24">
          {/* 컨트롤 패널 */}
          <div className="py-6 space-y-4">
            <div className="bg-white rounded-2xl p-4 border border-gray-200">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">테스트 컨트롤</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setIsRunning(true);
                    setProgress(0);
                    setTimelineSteps([]);
                  }}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-sm transition-colors"
                >
                  {isRunning ? '재시작' : '시작'}
                </button>
                <button
                  onClick={() => setIsRunning(false)}
                  className="flex-1 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl font-semibold text-sm transition-colors"
                >
                  일시정지
                </button>
                <button
                  onClick={() => {
                    setIsRunning(false);
                    setProgress(0);
                    setTimelineSteps([]);
                    setCycleCount(0);
                  }}
                  className="flex-1 py-2.5 bg-red-100 hover:bg-red-200 text-red-700 rounded-xl font-semibold text-sm transition-colors"
                >
                  리셋
                </button>
              </div>
            </div>

            {/* 상태 정보 */}
            <div className="bg-white rounded-2xl p-4 border border-gray-200">
              <h2 className="text-sm font-semibold text-gray-900 mb-2">현재 상태</h2>
              <div className="space-y-1 text-xs text-gray-600">
                <p>• 진행률: <strong className="text-gray-900">{progress.toFixed(1)}%</strong></p>
                <p>• 현재 단계: <strong className="text-gray-900">{getStageMessage(progress)}</strong></p>
                <p>• 타임라인 스텝: <strong className="text-gray-900">{timelineSteps.length}/5</strong></p>
                <p>• 실행 중: <strong className={isRunning ? 'text-green-600' : 'text-red-600'}>{isRunning ? 'YES' : 'NO'}</strong></p>
              </div>
            </div>
          </div>

          {/* 로딩 화면 (실제 컴포넌트) */}
          {isRunning && (
            <LoadingAnimation
              progress={progress}
              timelineSteps={timelineSteps}
            />
          )}

          {/* 안내 메시지 */}
          {!isRunning && progress === 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mt-12 text-center"
            >
              <div className="text-6xl mb-4">🚀</div>
              <p className="text-gray-600 text-sm mb-2">로딩 애니메이션을 테스트해보세요</p>
              <p className="text-gray-400 text-xs">시작 버튼을 눌러 무한 반복 모드로 실행됩니다</p>
            </motion.div>
          )}
        </main>
      </div>
    </div>
  );
}
