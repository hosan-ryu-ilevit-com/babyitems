/**
 * A/B 테스트 결과 대시보드
 * /admin/ab-tests
 */

'use client';

import { useEffect, useState } from 'react';

interface VariantStats {
  variant: string;
  total: number;
  conversions: number;
  conversionRate: number;
}

interface TestStats {
  testName: string;
  stats: {
    variants: VariantStats[];
    totalSessions: number;
    totalConversions: number;
  };
}

interface TestSummary {
  testName: string;
  totalSessions: number;
  variants: string[];
  lastUpdated: string;
}

export default function ABTestDashboard() {
  const [tests, setTests] = useState<TestSummary[]>([]);
  const [selectedTest, setSelectedTest] = useState<string | null>(null);
  const [testDetail, setTestDetail] = useState<TestStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAllTests();
  }, []);

  useEffect(() => {
    if (selectedTest) {
      fetchTestDetail(selectedTest);
    }
  }, [selectedTest]);

  async function fetchAllTests() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/ab-tests');
      const data = await res.json();
      setTests(data.tests || []);
    } catch (error) {
      console.error('Failed to fetch tests:', error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchTestDetail(testName: string) {
    try {
      const res = await fetch(`/api/admin/ab-tests?testName=${encodeURIComponent(testName)}`);
      const data = await res.json();
      setTestDetail(data);
    } catch (error) {
      console.error('Failed to fetch test detail:', error);
    }
  }

  const getWinningVariant = (variants: VariantStats[]) => {
    return variants.reduce((prev, current) =>
      prev.conversionRate > current.conversionRate ? prev : current
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-3xl font-bold mb-8">A/B 테스트 대시보드</h1>
          <p>로딩 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">A/B 테스트 대시보드</h1>

        {/* 테스트 목록 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {tests.map(test => (
            <button
              key={test.testName}
              onClick={() => setSelectedTest(test.testName)}
              className={`p-4 rounded-lg border-2 transition-all text-left ${
                selectedTest === test.testName
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <h3 className="font-semibold mb-2">{test.testName}</h3>
              <div className="text-sm text-gray-600">
                <p>변형: {test.variants.join(', ')}</p>
                <p>세션: {test.totalSessions}개</p>
                <p className="text-xs mt-1">
                  최근 업데이트: {new Date(test.lastUpdated).toLocaleString('ko-KR')}
                </p>
              </div>
            </button>
          ))}
        </div>

        {/* 테스트 상세 결과 */}
        {testDetail && (
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-2xl font-bold mb-6">{testDetail.testName}</h2>

            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600 mb-1">총 세션</p>
                <p className="text-2xl font-bold">{testDetail.stats.totalSessions}</p>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600 mb-1">총 전환</p>
                <p className="text-2xl font-bold">{testDetail.stats.totalConversions}</p>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600 mb-1">전체 전환율</p>
                <p className="text-2xl font-bold">
                  {testDetail.stats.totalSessions > 0
                    ? ((testDetail.stats.totalConversions / testDetail.stats.totalSessions) * 100).toFixed(2)
                    : 0}%
                </p>
              </div>
            </div>

            {/* 변형별 결과 */}
            <h3 className="text-xl font-semibold mb-4">변형별 성과</h3>
            <div className="space-y-4">
              {testDetail.stats.variants
                .sort((a, b) => b.conversionRate - a.conversionRate)
                .map((variant, index) => {
                  const isWinner = variant === getWinningVariant(testDetail.stats.variants);
                  return (
                    <div
                      key={variant.variant}
                      className={`p-4 rounded-lg border-2 ${
                        isWinner ? 'border-green-500 bg-green-50' : 'border-gray-200'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl font-bold">변형 {variant.variant}</span>
                          {isWinner && (
                            <span className="px-2 py-1 bg-green-500 text-white text-xs rounded-full">
                              승자
                            </span>
                          )}
                        </div>
                        <span className="text-2xl font-bold text-blue-600">
                          {variant.conversionRate.toFixed(2)}%
                        </span>
                      </div>

                      {/* 진행률 바 */}
                      <div className="relative h-8 bg-gray-200 rounded-full overflow-hidden mb-2">
                        <div
                          className="absolute inset-y-0 left-0 bg-blue-500 transition-all"
                          style={{ width: `${variant.conversionRate}%` }}
                        />
                      </div>

                      <div className="flex justify-between text-sm text-gray-600">
                        <span>세션: {variant.total}개</span>
                        <span>전환: {variant.conversions}개</span>
                      </div>
                    </div>
                  );
                })}
            </div>

            {/* 통계적 유의성 노트 */}
            <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-800">
                <strong>주의:</strong> 통계적으로 유의미한 결과를 얻으려면 각 변형당 최소 100-200개 이상의 세션이 필요합니다.
                현재 데이터만으로 의사결정을 내리지 마세요.
              </p>
            </div>
          </div>
        )}

        {tests.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-600">진행 중인 A/B 테스트가 없습니다.</p>
          </div>
        )}
      </div>
    </div>
  );
}
