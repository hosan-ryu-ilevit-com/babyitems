'use client';

import { useState } from 'react';
import type { SessionSummary, DashboardStats } from '@/types/logging';
import { ChatCircleDots, Lightning } from '@phosphor-icons/react/dist/ssr';

// 액션 통계 타입
interface ActionStats {
  action: string;
  todayCount: number;
  totalCount: number;
}

export default function AdminPage() {
  const [password, setPassword] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [dates, setDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [expandedRecommendation, setExpandedRecommendation] = useState<string | null>(null);
  const [selectedSessions, setSelectedSessions] = useState<Set<string>>(new Set());
  const [isDashboardExpanded, setIsDashboardExpanded] = useState(false);
  const [allSessions, setAllSessions] = useState<SessionSummary[]>([]); // 전체 날짜 세션
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // 비밀번호 검증
  const handleLogin = () => {
    if (password === '1545') {
      setIsAuthenticated(true);
      setError('');
      fetchDates();
    } else {
      setError('비밀번호가 올바르지 않습니다.');
    }
  };

  // 날짜 목록 가져오기
  const fetchDates = async () => {
    try {
      const response = await fetch('/api/admin/logs', {
        headers: {
          'x-admin-password': '1545',
        },
      });
      const data = await response.json();
      setDates(data.dates || []);
      if (data.dates && data.dates.length > 0) {
        setSelectedDate(data.dates[0]);
        fetchLogs(data.dates[0]);
        // 전체 날짜의 로그를 가져와서 누적 통계 계산
        fetchAllLogs(data.dates);
        // 통계 대시보드 가져오기
        fetchDashboardStats();
      }
    } catch {
      setError('날짜 목록을 불러오는데 실패했습니다.');
    }
  };

  // 통계 대시보드 가져오기
  const fetchDashboardStats = async () => {
    setStatsLoading(true);
    try {
      const response = await fetch('/api/admin/stats', {
        headers: {
          'x-admin-password': '1545',
        },
      });
      const data = await response.json();
      setDashboardStats(data);
    } catch (error) {
      console.error('Failed to fetch dashboard stats:', error);
    } finally {
      setStatsLoading(false);
    }
  };

  // 전체 날짜의 로그 가져오기 (누적 통계용)
  const fetchAllLogs = async (dates: string[]) => {
    try {
      const promises = dates.map(date =>
        fetch(`/api/admin/logs?date=${date}`, {
          headers: { 'x-admin-password': '1545' },
        }).then(res => res.json())
      );
      const results = await Promise.all(promises);
      const allSessionsData = results.flatMap(data => data.sessions || []);
      setAllSessions(allSessionsData);
    } catch {
      console.error('전체 로그를 불러오는데 실패했습니다.');
    }
  };

  // 특정 날짜의 로그 가져오기
  const fetchLogs = async (date: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/logs?date=${date}`, {
        headers: {
          'x-admin-password': '1545',
        },
      });
      const data = await response.json();
      setSessions(data.sessions || []);
    } catch {
      setError('로그를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 날짜 선택 시
  const handleDateChange = (date: string) => {
    setSelectedDate(date);
    setSelectedSessions(new Set()); // 선택 초기화
    fetchLogs(date);
  };

  // 이벤트 타입 한글 변환
  const getEventTypeLabel = (type: string): string => {
    const labels: Record<string, string> = {
      page_view: '페이지 뷰',
      button_click: '버튼 클릭',
      user_input: '사용자 입력',
      ai_response: 'AI 응답',
      recommendation_received: '추천 결과',
      product_chat_message: '상품 채팅',
      favorite_added: '찜 추가',
      favorite_removed: '찜 제거',
      favorites_compare_clicked: '찜 비교하기',
      comparison_chat_message: '비교 채팅',
      comparison_product_action: '비교표 액션',
    };
    return labels[type] || type;
  };

  // 페이지 이름 한글 변환
  const getPageLabel = (page?: string): string => {
    const labels: Record<string, string> = {
      home: '홈',
      ranking: '랭킹',
      'chat/structured': '구조화 챗',
      'chat/open': '자유 챗',
      result: '결과',
      compare: '비교',
    };
    return page ? labels[page] || page : '-';
  };

  // 시간 포맷팅
  const formatTime = (timestamp: string): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  // 체크박스 토글
  const toggleSessionSelection = (sessionId: string) => {
    const newSelected = new Set(selectedSessions);
    if (newSelected.has(sessionId)) {
      newSelected.delete(sessionId);
    } else {
      newSelected.add(sessionId);
    }
    setSelectedSessions(newSelected);
  };

  // 전체 선택/해제
  const toggleSelectAll = () => {
    if (selectedSessions.size === sessions.length) {
      setSelectedSessions(new Set());
    } else {
      setSelectedSessions(new Set(sessions.map(s => s.sessionId)));
    }
  };

  // 세션 삭제
  const handleDeleteSession = async (sessionId: string) => {
    if (!window.confirm('이 세션을 삭제하시겠습니까?')) {
      return;
    }

    try {
      const response = await fetch(
        `/api/admin/logs?date=${selectedDate}&sessionId=${sessionId}`,
        {
          method: 'DELETE',
          headers: {
            'x-admin-password': '1545',
          },
        }
      );

      if (response.ok) {
        // 삭제 성공 시 로그 다시 불러오기
        fetchLogs(selectedDate);
        // 선택 목록에서 제거
        const newSelected = new Set(selectedSessions);
        newSelected.delete(sessionId);
        setSelectedSessions(newSelected);
      } else {
        setError('세션 삭제에 실패했습니다.');
      }
    } catch {
      setError('세션 삭제 중 오류가 발생했습니다.');
    }
  };

  // 선택된 세션 일괄 삭제
  const handleDeleteSelectedSessions = async () => {
    if (selectedSessions.size === 0) {
      alert('삭제할 세션을 선택해주세요.');
      return;
    }

    if (!window.confirm(`선택한 ${selectedSessions.size}개의 세션을 삭제하시겠습니까?`)) {
      return;
    }

    try {
      const deletePromises = Array.from(selectedSessions).map(sessionId =>
        fetch(`/api/admin/logs?date=${selectedDate}&sessionId=${sessionId}`, {
          method: 'DELETE',
          headers: {
            'x-admin-password': '1545',
          },
        })
      );

      await Promise.all(deletePromises);

      // 삭제 성공 시 로그 다시 불러오기
      fetchLogs(selectedDate);
      setSelectedSessions(new Set());
    } catch {
      setError('세션 삭제 중 오류가 발생했습니다.');
    }
  };

  // 새로고침
  const handleRefresh = () => {
    if (selectedDate) {
      fetchLogs(selectedDate);
    }
  };

  // IP 주소 포맷팅
  const formatIpAddress = (ip: string | undefined) => {
    if (!ip) return 'unknown';
    if (ip === '211.53.92.162') {
      return (
        <span className="inline-flex items-center px-2 py-1 bg-blue-100 text-blue-800 text-xs font-semibold rounded">
          [레브잇 테크]
        </span>
      );
    }
    if (ip === '::1') {
      return (
        <span className="inline-flex items-center px-2 py-1 bg-green-100 text-green-800 text-xs font-semibold rounded">
          [로컬 테스트]
        </span>
      );
    }
    return ip;
  };

  // 추천 방식에 따른 태그 렌더링 (여러 개 가능)
  const renderRecommendationTags = (session: SessionSummary) => {
    const methods = session.recommendationMethods || [];
    if (methods.length === 0) return null;

    return (
      <>
        {methods.includes('quick') && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm bg-white border-2 border-gray-300 text-gray-700 font-medium">
            <Lightning weight="fill" className="w-4 h-4" />
            바로 추천받기
          </span>
        )}
        {methods.includes('chat') && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm bg-gray-900 text-white font-medium">
            <ChatCircleDots weight="fill" className="w-4 h-4" />
            채팅하고 추천받기
          </span>
        )}
      </>
    );
  };

  // 버튼 라벨 포맷팅 (실제 채팅 디자인 반영)
  const formatButtonLabel = (label: string) => {
    // 중요도 버튼
    if (label.includes('중요도: 중요함')) {
      return (
        <span className="inline-flex items-center gap-2">
          <span className="px-3 py-1 bg-blue-200 text-gray-900 text-xs font-medium rounded-full">
            중요함
          </span>
          <span className="text-gray-500 text-xs">(중요도)</span>
        </span>
      );
    }
    if (label.includes('중요도: 보통')) {
      return (
        <span className="inline-flex items-center gap-2">
          <span className="px-3 py-1 bg-blue-50 text-gray-900 text-xs font-medium rounded-full">
            보통
          </span>
          <span className="text-gray-500 text-xs">(중요도)</span>
        </span>
      );
    }
    if (label.includes('중요도: 중요하지 않음')) {
      return (
        <span className="inline-flex items-center gap-2">
          <span className="px-3 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded-full">
            중요하지 않음
          </span>
          <span className="text-gray-500 text-xs">(중요도)</span>
        </span>
      );
    }

    // 넘어가기 버튼
    if (label.includes('넘어가기')) {
      return (
        <span className="inline-flex items-center gap-2">
          <span className="px-3 py-1 bg-blue-200 text-gray-900 text-xs font-medium rounded-full">
            넘어가기
          </span>
        </span>
      );
    }

    // 없어요 버튼
    if (label.includes('없어요')) {
      return (
        <span className="inline-flex items-center gap-2">
          <span className="px-3 py-1 bg-blue-200 text-gray-900 text-xs font-medium rounded-full">
            없어요
          </span>
        </span>
      );
    }

    // 바로 추천받기 버튼 - 하얀 버튼 스타일 (Priority 페이지)
    if (label === '바로 추천받기') {
      return (
        <span className="inline-flex items-center gap-2">
          <span className="px-4 py-2 bg-white border-2 border-gray-300 text-gray-700 text-xs font-semibold rounded-xl inline-flex items-center gap-1.5">
            <Lightning weight="fill" className="w-3.5 h-3.5" />
            바로 추천받기
          </span>
        </span>
      );
    }

    // 채팅으로 더 자세히 추천받기 버튼 - 검은 버튼 스타일 (Priority 페이지)
    if (label === '채팅으로 더 자세히 추천받기') {
      return (
        <span className="inline-flex items-center gap-2">
          <span className="px-4 py-2 bg-gray-900 text-white text-xs font-semibold rounded-xl inline-flex items-center gap-1.5">
            <ChatCircleDots weight="fill" className="w-3.5 h-3.5" />
            채팅으로 더 자세히
          </span>
        </span>
      );
    }

    // 추천 받기 버튼 (Chat 페이지)
    if (label === '추천 받기') {
      return (
        <span className="inline-flex items-center gap-2">
          <span className="px-3 py-1 bg-gray-900 text-white text-xs font-medium rounded-full">
            추천 받기
          </span>
        </span>
      );
    }

    // 1분만에 추천받기 버튼 (Home 페이지)
    if (label.includes('1분만에 추천받기')) {
      return (
        <span className="inline-flex items-center gap-2">
          <span className="px-4 py-2 bg-linear-to-r from-gray-900 to-gray-700 text-white text-xs font-semibold rounded-xl">
            💬 1분만에 추천받기
          </span>
        </span>
      );
    }

    // 대표상품 랭킹보기 버튼 (Home 페이지)
    if (label.includes('대표상품 랭킹보기')) {
      return (
        <span className="inline-flex items-center gap-2">
          <span className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-xs font-medium rounded-xl">
            📊 대표상품 랭킹보기
          </span>
        </span>
      );
    }

    // 기타 버튼
    return <span className="text-blue-600 text-xs">{label}</span>;
  };

  // 액션 통계 계산
  const calculateActionStats = (): ActionStats[] => {
    const today = new Date().toISOString().split('T')[0];
    const actionMap = new Map<string, { today: number; total: number }>();

    // 오늘 날짜의 세션들
    const todaySessions = sessions.filter(s =>
      s.firstSeen.startsWith(today)
    );

    // 전체 세션에서 통계 수집
    allSessions.forEach(session => {
      const isToday = session.firstSeen.startsWith(today);

      session.events.forEach(event => {
        let actionKey = '';

        // 버튼 클릭 이벤트
        if (event.eventType === 'button_click' && event.buttonLabel) {
          actionKey = event.buttonLabel;
        }
        // 페이지 뷰
        else if (event.eventType === 'page_view' && event.page) {
          actionKey = `페이지 방문: ${event.page}`;
        }

        if (actionKey) {
          const current = actionMap.get(actionKey) || { today: 0, total: 0 };
          actionMap.set(actionKey, {
            today: isToday ? current.today + 1 : current.today,
            total: current.total + 1,
          });
        }
      });
    });

    // 오늘 날짜 세션들도 체크 (혹시 전체에 포함 안된 경우 대비)
    todaySessions.forEach(session => {
      session.events.forEach(event => {
        let actionKey = '';

        if (event.eventType === 'button_click' && event.buttonLabel) {
          actionKey = event.buttonLabel;
        } else if (event.eventType === 'page_view' && event.page) {
          actionKey = `페이지 방문: ${event.page}`;
        }

        if (actionKey) {
          const current = actionMap.get(actionKey) || { today: 0, total: 0 };
          // 전체 세션에 이미 카운트되지 않았다면 추가
          if (!allSessions.some(s => s.sessionId === session.sessionId)) {
            actionMap.set(actionKey, {
              today: current.today + 1,
              total: current.total + 1,
            });
          }
        }
      });
    });

    // 배열로 변환하고 총 횟수 기준 정렬
    return Array.from(actionMap.entries())
      .map(([action, counts]) => ({
        action,
        todayCount: counts.today,
        totalCount: counts.total,
      }))
      .sort((a, b) => b.totalCount - a.totalCount);
  };

  // 로그인 화면
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg p-8 w-full max-w-md">
          <h1 className="text-2xl font-bold mb-6 text-center">🛍️ 관리자 로그인</h1>
          <div className="space-y-4">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
              placeholder="비밀번호를 입력하세요"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button
              onClick={handleLogin}
              className="w-full bg-blue-500 text-white py-3 rounded-lg hover:bg-blue-600 transition-colors"
            >
              로그인
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 메인 화면
  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-lg p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-2xl font-bold">아기용품 MVP - 사용자 로그 (v0.4: 13일 18시 배포)</h1>
            <div className="flex gap-3">
              <button
                onClick={() => window.location.href = '/admin/upload'}
                className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                상품 추가
              </button>
              <button
                onClick={() => setIsAuthenticated(false)}
                className="text-gray-600 hover:text-gray-800"
              >
                로그아웃
              </button>
            </div>
          </div>

          {/* 신규 통계 대시보드 */}
          <div className="border-t pt-4 mt-4">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">📊 통계 대시보드</h2>

            {statsLoading ? (
              <div className="text-center py-8">
                <p className="text-gray-600">통계 로딩 중...</p>
              </div>
            ) : dashboardStats ? (
              <div className="space-y-6">
                {/* 1. 홈 페이지 통계 */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                    🏠 홈 페이지
                  </h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-white rounded-lg p-3 text-center">
                      <p className="text-xs text-gray-600 mb-1">총 방문</p>
                      <p className="text-2xl font-bold text-gray-900">{dashboardStats.home.totalVisits}</p>
                    </div>
                    <div className="bg-white rounded-lg p-3 text-center">
                      <p className="text-xs text-gray-600 mb-1">1분만에 추천받기</p>
                      <p className="text-2xl font-bold text-blue-600">{dashboardStats.home.quickStartClicks}</p>
                    </div>
                    <div className="bg-white rounded-lg p-3 text-center">
                      <p className="text-xs text-gray-600 mb-1">랭킹보기</p>
                      <p className="text-2xl font-bold text-purple-600">{dashboardStats.home.rankingPageClicks}</p>
                    </div>
                  </div>
                </div>

                {/* 2. 홈 랭킹 페이지 전체 통계 */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                    📊 홈 랭킹 페이지 전체
                  </h3>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="bg-white rounded-lg p-3 text-center">
                      <p className="text-xs text-gray-600 mb-1">쿠팡 클릭</p>
                      <p className="text-2xl font-bold text-orange-600">{dashboardStats.ranking.coupangClicks}</p>
                    </div>
                    <div className="bg-white rounded-lg p-3 text-center">
                      <p className="text-xs text-gray-600 mb-1">질문하기</p>
                      <p className="text-2xl font-bold text-green-600">{dashboardStats.ranking.chatClicks}</p>
                    </div>
                  </div>

                  {/* 상품별 클릭 통계 */}
                  {dashboardStats.ranking.productClicks.length > 0 && (
                    <div className="mt-4">
                      <p className="text-sm font-semibold text-gray-700 mb-2">상품별 클릭 통계</p>
                      <div className="bg-white rounded-lg overflow-hidden">
                        <table className="w-full text-xs">
                          <thead className="bg-gray-100">
                            <tr>
                              <th className="px-3 py-2 text-center font-semibold">클릭<br/>순위</th>
                              <th className="px-3 py-2 text-center font-semibold">랭킹</th>
                              <th className="px-3 py-2 text-left font-semibold">상품명</th>
                              <th className="px-3 py-2 text-center font-semibold">총 클릭</th>
                              <th className="px-3 py-2 text-center font-semibold">쿠팡</th>
                              <th className="px-3 py-2 text-center font-semibold">질문</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200">
                            {dashboardStats.ranking.productClicks.slice(0, 10).map((product, idx) => (
                              <tr key={product.productId} className="hover:bg-gray-50">
                                <td className="px-3 py-2 text-center">
                                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-500 text-white text-xs font-bold">
                                    {idx + 1}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-center">
                                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-900 text-white text-xs font-bold">
                                    {product.ranking}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-gray-900 font-medium">{product.productTitle}</td>
                                <td className="px-3 py-2 text-center">
                                  <span className="px-2 py-1 bg-gray-100 text-gray-900 rounded-full font-semibold">
                                    {product.totalClicks}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-center text-orange-600 font-medium">{product.coupangClicks}</td>
                                <td className="px-3 py-2 text-center text-green-600 font-medium">{product.chatClicks}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>

                {/* 3. Priority 페이지 통계 */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                    🎯 Priority 페이지
                  </h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-white rounded-lg p-3 text-center">
                      <p className="text-xs text-gray-600 mb-1">총 방문</p>
                      <p className="text-2xl font-bold text-gray-900">{dashboardStats.priority.totalVisits}</p>
                    </div>
                    <div className="bg-white rounded-lg p-3 text-center">
                      <p className="text-xs text-gray-600 mb-1">바로 추천받기</p>
                      <p className="text-2xl font-bold text-yellow-600">{dashboardStats.priority.quickRecommendations}</p>
                    </div>
                    <div className="bg-white rounded-lg p-3 text-center">
                      <p className="text-xs text-gray-600 mb-1">채팅으로 추천</p>
                      <p className="text-2xl font-bold text-blue-600">{dashboardStats.priority.chatRecommendations}</p>
                    </div>
                  </div>
                </div>

                {/* 4. Result 페이지 통계 */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                    🏆 Result 페이지
                  </h3>
                  <div className="grid grid-cols-4 gap-4 mb-4">
                    <div className="bg-white rounded-lg p-3 text-center">
                      <p className="text-xs text-gray-600 mb-1">총 방문</p>
                      <p className="text-2xl font-bold text-gray-900">{dashboardStats.result.totalVisits}</p>
                    </div>
                    <div className="bg-white rounded-lg p-3 text-center">
                      <p className="text-xs text-gray-600 mb-1">상세 채팅</p>
                      <p className="text-2xl font-bold text-blue-600">{dashboardStats.result.detailChatClicks}</p>
                    </div>
                    <div className="bg-white rounded-lg p-3 text-center">
                      <p className="text-xs text-gray-600 mb-1">쿠팡 클릭</p>
                      <p className="text-2xl font-bold text-orange-600">{dashboardStats.result.totalCoupangClicks}</p>
                    </div>
                    <div className="bg-white rounded-lg p-3 text-center">
                      <p className="text-xs text-gray-600 mb-1">질문하기</p>
                      <p className="text-2xl font-bold text-green-600">{dashboardStats.result.totalProductChatClicks}</p>
                    </div>
                  </div>

                  {/* 추천 상품 통계 */}
                  {dashboardStats.result.recommendations.length > 0 && (
                    <div className="mt-4">
                      <p className="text-sm font-semibold text-gray-700 mb-2">추천된 상품 통계</p>
                      <div className="bg-white rounded-lg overflow-hidden">
                        <table className="w-full text-xs">
                          <thead className="bg-gray-100">
                            <tr>
                              <th className="px-3 py-2 text-left font-semibold">상품명</th>
                              <th className="px-3 py-2 text-center font-semibold">총 추천</th>
                              <th className="px-3 py-2 text-center font-semibold">1위</th>
                              <th className="px-3 py-2 text-center font-semibold">2위</th>
                              <th className="px-3 py-2 text-center font-semibold">3위</th>
                              <th className="px-3 py-2 text-center font-semibold">쿠팡</th>
                              <th className="px-3 py-2 text-center font-semibold">질문</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200">
                            {dashboardStats.result.recommendations.slice(0, 10).map((product) => (
                              <tr key={product.productId} className="hover:bg-gray-50">
                                <td className="px-3 py-2 text-gray-900 font-medium">{product.productTitle}</td>
                                <td className="px-3 py-2 text-center">
                                  <span className="px-2 py-1 bg-purple-100 text-purple-900 rounded-full font-semibold">
                                    {product.recommendCount}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-center">
                                  <span className="px-2 py-1 bg-yellow-100 text-yellow-900 rounded-full font-semibold">
                                    {product.rank1Count}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-center text-gray-600 font-medium">{product.rank2Count}</td>
                                <td className="px-3 py-2 text-center text-gray-600 font-medium">{product.rank3Count}</td>
                                <td className="px-3 py-2 text-center text-orange-600 font-medium">{product.coupangClicks}</td>
                                <td className="px-3 py-2 text-center text-green-600 font-medium">{product.chatClicks}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-600">통계 데이터가 없습니다.</p>
              </div>
            )}
          </div>

          {/* 기존 액션 통계 대시보드 */}
          <div className="border-t pt-4 mt-4">
            <button
              onClick={() => setIsDashboardExpanded(!isDashboardExpanded)}
              className="flex items-center gap-2 text-lg font-semibold text-gray-800 hover:text-gray-900 transition-colors"
            >
              <svg
                className={`w-5 h-5 transition-transform ${isDashboardExpanded ? 'rotate-90' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <span>📋 상세 액션 로그</span>
            </button>

            {isDashboardExpanded && (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 border">액션</th>
                      <th className="px-4 py-3 text-center font-semibold text-gray-700 border">오늘</th>
                      <th className="px-4 py-3 text-center font-semibold text-gray-700 border">누적</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calculateActionStats().map((stat, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-4 py-2 border text-gray-800">{stat.action}</td>
                        <td className="px-4 py-2 border text-center">
                          <span className="inline-block px-3 py-1 bg-blue-100 text-blue-800 rounded-full font-medium">
                            {stat.todayCount}
                          </span>
                        </td>
                        <td className="px-4 py-2 border text-center">
                          <span className="inline-block px-3 py-1 bg-gray-100 text-gray-800 rounded-full font-medium">
                            {stat.totalCount}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {calculateActionStats().length === 0 && (
                  <p className="text-center text-gray-500 py-4">통계 데이터가 없습니다.</p>
                )}
              </div>
            )}
          </div>

          {/* 날짜 선택 및 새로고침 */}
          <div className="flex gap-4 items-center mb-4">
            <label className="font-semibold">날짜:</label>
            <select
              value={selectedDate}
              onChange={(e) => handleDateChange(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {dates.map((date) => (
                <option key={date} value={date}>
                  {date}
                </option>
              ))}
            </select>
            <span className="text-gray-600">
              총 {sessions.length}개 세션
            </span>
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="ml-auto px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              새로고침
            </button>
          </div>

          {/* 일괄 작업 컨트롤 */}
          {!loading && sessions.length > 0 && (
            <div className="flex gap-3 items-center pt-4 border-t">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedSessions.size === sessions.length && sessions.length > 0}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 cursor-pointer"
                />
                <span className="text-sm font-medium">전체 선택</span>
              </label>
              {selectedSessions.size > 0 && (
                <>
                  <span className="text-sm text-gray-600">
                    {selectedSessions.size}개 선택됨
                  </span>
                  <button
                    onClick={handleDeleteSelectedSessions}
                    className="px-4 py-2 bg-red-500 text-white text-sm rounded-lg hover:bg-red-600 transition-colors flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    선택 삭제
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* 로딩 상태 */}
        {loading && (
          <div className="text-center py-8">
            <p className="text-gray-600">로딩 중...</p>
          </div>
        )}

        {/* 세션 목록 */}
        {!loading && sessions.length === 0 && (
          <div className="bg-white rounded-lg p-8 text-center">
            <p className="text-gray-600">해당 날짜에 기록된 로그가 없습니다.</p>
          </div>
        )}

        {!loading && sessions.length > 0 && (
          <div className="space-y-4">
            {sessions.map((session) => (
              <div
                key={session.sessionId}
                className="bg-white rounded-lg overflow-hidden"
              >
                {/* 세션 헤더 */}
                <div className="p-4 bg-gray-50">
                  <div className="flex gap-3 items-start">
                    {/* 체크박스 */}
                    <input
                      type="checkbox"
                      checked={selectedSessions.has(session.sessionId)}
                      onChange={(e) => {
                        e.stopPropagation();
                        toggleSessionSelection(session.sessionId);
                      }}
                      className="mt-1 w-4 h-4 cursor-pointer shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    />

                    {/* 세션 정보 */}
                    <div
                      className="flex-1 cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() =>
                        setExpandedSession(
                          expandedSession === session.sessionId
                            ? null
                            : session.sessionId
                        )
                      }
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {session.phone && (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 font-bold text-sm rounded">
                            📱 {session.phone}
                          </span>
                        )}
                        <p className="font-mono text-sm text-gray-600">
                          Session: {session.sessionId.slice(0, 8)}...
                        </p>
                      </div>
                      <p className="text-sm text-gray-500 flex items-center gap-2">
                        <span>IP: {formatIpAddress(session.ip)}</span>
                        <span>|</span>
                        <span>시작: {formatTime(session.firstSeen)}</span>
                        <span>|</span>
                        <span>종료: {formatTime(session.lastSeen)}</span>
                      </p>
                      <div className="mt-2">
                        <p className="text-sm font-semibold text-gray-700">
                          이동 경로:
                        </p>
                        <p className="text-sm text-gray-600">
                          {session.journey.map(getPageLabel).join(' → ')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="text-right">
                        <div className="flex items-center gap-2 justify-end">
                          {renderRecommendationTags(session)}
                          <span
                            className={`inline-block px-3 py-1 rounded-full text-sm ${
                              session.completed
                                ? 'bg-green-100 text-green-700'
                                : 'bg-yellow-100 text-yellow-700'
                            }`}
                          >
                            {session.completed ? '완료' : '미완료'}
                          </span>
                        </div>
                        <p className="text-sm text-gray-500 mt-1">
                          {session.events.length}개 이벤트
                        </p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteSession(session.sessionId);
                        }}
                        className="px-3 py-2 bg-red-500 text-white text-sm rounded-lg hover:bg-red-600 transition-colors"
                        title="세션 삭제"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>

                {/* 세션 상세 (확장 시) */}
                {expandedSession === session.sessionId && (
                  <div className="p-4 border-t">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left">시간</th>
                          <th className="px-3 py-2 text-left">속성</th>
                          <th className="px-3 py-2 text-left">이벤트</th>
                          <th className="px-3 py-2 text-left">페이지</th>
                          <th className="px-3 py-2 text-left">상세</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {session.events.map((event, idx) => {
                          // 디버깅: AI 응답이 있는지 확인
                          if (event.eventType === 'ai_response') {
                            console.log('AI Response Event:', event);
                          }
                          return (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="px-3 py-2 whitespace-nowrap">
                              {formatTime(event.timestamp)}
                            </td>
                            <td className="px-3 py-2">
                              {event.attribute ? (
                                <div className="flex items-center gap-1">
                                  <span className="text-base">{event.attributeIcon}</span>
                                  <span className="text-xs text-gray-700 font-medium">
                                    {event.attribute}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-xs text-gray-400">-</span>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              {getEventTypeLabel(event.eventType)}
                            </td>
                            <td className="px-3 py-2">
                              {getPageLabel(event.page)}
                            </td>
                            <td className="px-3 py-2">
                              {event.buttonLabel && (
                                <div className="mb-2">{formatButtonLabel(event.buttonLabel)}</div>
                              )}
                              {event.userInput && (
                                <div className="bg-green-50 border-l-4 border-green-500 p-2 rounded text-sm mb-2">
                                  <span className="text-green-700 font-semibold">사용자</span>
                                  <p className="text-gray-800 mt-1">{event.userInput}</p>
                                </div>
                              )}
                              {event.eventType === 'ai_response' && 'aiResponse' in event && (
                                <div className="bg-blue-50 border-l-4 border-blue-500 p-2 rounded text-sm mb-2">
                                  <span className="text-blue-700 font-semibold">AI</span>
                                  <p className="text-gray-800 mt-1 whitespace-pre-wrap">
                                    {event.aiResponse || '(내용 없음)'}
                                  </p>
                                </div>
                              )}
                              {event.eventType === 'product_chat_message' && 'chatData' in event && event.chatData && (
                                <div className="space-y-2">
                                  <div className="bg-gray-50 p-2 rounded text-xs">
                                    <p className="font-semibold text-gray-700 mb-1">
                                      📦 제품: {event.chatData.productTitle || event.chatData.productId}
                                    </p>
                                    {event.chatData.isInitialMessage && (
                                      <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                                        초기 메시지
                                      </span>
                                    )}
                                    {event.chatData.isExampleQuestion && (
                                      <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs font-medium ml-1">
                                        예시 질문
                                      </span>
                                    )}
                                  </div>
                                  <div className="bg-green-50 border-l-4 border-green-500 p-2 rounded text-sm">
                                    <span className="text-green-700 font-semibold">사용자</span>
                                    <p className="text-gray-800 mt-1">{event.chatData.userMessage}</p>
                                  </div>
                                  <div className="bg-blue-50 border-l-4 border-blue-500 p-2 rounded text-sm">
                                    <span className="text-blue-700 font-semibold">AI</span>
                                    <p className="text-gray-800 mt-1 whitespace-pre-wrap">
                                      {event.chatData.aiResponse}
                                    </p>
                                  </div>
                                  {event.chatData.hasRecommendation && event.chatData.recommendedProductId && (
                                    <div className="bg-purple-50 p-2 rounded text-xs">
                                      <span className="text-purple-700 font-semibold">
                                        🔗 추천 제품: {event.chatData.recommendedProductId}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              )}
                              {event.eventType === 'favorite_added' && 'favoriteData' in event && event.favoriteData && (
                                <div className="bg-pink-50 p-2 rounded text-xs">
                                  <p className="font-semibold text-pink-700 mb-1">
                                    ❤️ 찜 추가: {event.favoriteData.productTitle}
                                  </p>
                                  <p className="text-gray-600">상품 ID: {event.favoriteData.productId}</p>
                                  <p className="text-gray-600">현재 찜 개수: {event.favoriteData.currentFavoritesCount}/3</p>
                                </div>
                              )}
                              {event.eventType === 'favorite_removed' && 'favoriteData' in event && event.favoriteData && (
                                <div className="bg-gray-50 p-2 rounded text-xs">
                                  <p className="font-semibold text-gray-700 mb-1">
                                    💔 찜 제거: {event.favoriteData.productTitle}
                                  </p>
                                  <p className="text-gray-600">상품 ID: {event.favoriteData.productId}</p>
                                  <p className="text-gray-600">현재 찜 개수: {event.favoriteData.currentFavoritesCount}/3</p>
                                </div>
                              )}
                              {event.eventType === 'favorites_compare_clicked' && 'comparisonData' in event && event.comparisonData && (
                                <div className="bg-blue-50 p-2 rounded text-xs">
                                  <p className="font-semibold text-blue-700 mb-1">
                                    🔄 찜 비교하기 클릭 ({event.comparisonData.source === 'home' ? '홈' : '결과'})
                                  </p>
                                  <p className="text-gray-600">비교 제품 수: {event.comparisonData.productIds?.length || 0}개</p>
                                  {event.comparisonData.productIds && (
                                    <p className="text-gray-500 text-xs mt-1">
                                      {event.comparisonData.productIds.join(', ')}
                                    </p>
                                  )}
                                </div>
                              )}
                              {event.eventType === 'comparison_chat_message' && 'comparisonData' in event && event.comparisonData && (
                                <div className="space-y-2">
                                  <div className="bg-gray-50 p-2 rounded text-xs">
                                    <p className="font-semibold text-gray-700 mb-1">
                                      💬 비교 채팅 ({event.comparisonData.source === 'home' ? '홈-비교표' : '결과-비교표'})
                                    </p>
                                    {event.comparisonData.productIds && (
                                      <p className="text-gray-500 text-xs">
                                        비교 중인 제품: {event.comparisonData.productIds.length}개
                                      </p>
                                    )}
                                  </div>
                                  {event.comparisonData.userMessage && (
                                    <div className="bg-green-50 border-l-4 border-green-500 p-2 rounded text-sm">
                                      <span className="text-green-700 font-semibold">사용자</span>
                                      <p className="text-gray-800 mt-1">{event.comparisonData.userMessage}</p>
                                    </div>
                                  )}
                                  {event.comparisonData.aiResponse && (
                                    <div className="bg-blue-50 border-l-4 border-blue-500 p-2 rounded text-sm">
                                      <span className="text-blue-700 font-semibold">AI</span>
                                      <p className="text-gray-800 mt-1 whitespace-pre-wrap">
                                        {event.comparisonData.aiResponse}
                                      </p>
                                    </div>
                                  )}
                                </div>
                              )}
                              {event.eventType === 'comparison_product_action' && 'comparisonData' in event && event.comparisonData && (
                                <div className="bg-purple-50 p-2 rounded text-xs">
                                  <p className="font-semibold text-purple-700 mb-1">
                                    {event.comparisonData.actionType === 'coupang_clicked' && '🛒 쿠팡 링크 클릭'}
                                    {event.comparisonData.actionType === 'product_chat_clicked' && '💭 상품 질문하기 클릭'}
                                    {' '}({event.comparisonData.source === 'home' ? '홈-비교표' : '결과-비교표'})
                                  </p>
                                  <p className="text-gray-600">제품: {event.comparisonData.productTitle}</p>
                                  <p className="text-gray-500 text-xs">상품 ID: {event.comparisonData.productId}</p>
                                </div>
                              )}
                              {!event.buttonLabel && !event.userInput && !event.aiResponse && !event.recommendations && !event.chatData && !event.favoriteData && !event.comparisonData && event.eventType !== 'page_view' && (
                                <span className="text-xs text-gray-400">-</span>
                              )}
                              {event.recommendations && (
                                <div className="space-y-1">
                                  <button
                                    onClick={() => {
                                      const key = `${session.sessionId}-${idx}`;
                                      setExpandedRecommendation(
                                        expandedRecommendation === key ? null : key
                                      );
                                    }}
                                    className="text-purple-600 hover:text-purple-800 underline text-left font-medium"
                                  >
                                    📋 추천 리포트 펼쳐보기 ({event.recommendations.productIds.length}개 제품)
                                  </button>
                                  {expandedRecommendation === `${session.sessionId}-${idx}` && event.recommendations.fullReport && (
                                    <div className="mt-2 p-4 bg-purple-50 rounded-lg text-xs space-y-4">
                                      {/* 페르소나 요약 */}
                                      <div>
                                        <p className="font-bold text-purple-900 mb-2 text-sm">
                                          👤 페르소나 요약
                                        </p>
                                        {typeof event.recommendations.persona === 'object' && event.recommendations.persona ? (
                                          <div className="bg-white p-3 rounded space-y-2">
                                            {/* Summary */}
                                            {event.recommendations.persona.summary && (
                                              <div>
                                                <p className="text-xs font-semibold text-gray-600 mb-1">요약:</p>
                                                <p className="text-gray-800 text-xs">{event.recommendations.persona.summary}</p>
                                              </div>
                                            )}

                                            {/* Core Value Weights */}
                                            {event.recommendations.persona.coreValueWeights && (
                                              <div>
                                                <p className="text-xs font-semibold text-gray-600 mb-1">속성 가중치:</p>
                                                <div className="grid grid-cols-2 gap-1">
                                                  {Object.entries(event.recommendations.persona.coreValueWeights).map(([key, value]) => (
                                                    <div key={key} className="text-xs text-gray-700">
                                                      <span className="font-medium">{key}:</span> {value as number}
                                                    </div>
                                                  ))}
                                                </div>
                                              </div>
                                            )}

                                            {/* Contextual Needs */}
                                            {event.recommendations.persona.contextualNeeds && event.recommendations.persona.contextualNeeds.length > 0 && (
                                              <div>
                                                <p className="text-xs font-semibold text-gray-600 mb-1">구체적 니즈:</p>
                                                <ul className="list-disc list-inside text-xs text-gray-700">
                                                  {event.recommendations.persona.contextualNeeds.map((need: string, i: number) => (
                                                    <li key={i}>{need}</li>
                                                  ))}
                                                </ul>
                                              </div>
                                            )}

                                            {/* Budget */}
                                            {event.recommendations.persona.budget && (
                                              <div>
                                                <p className="text-xs font-semibold text-gray-600">
                                                  예산: <span className="font-normal text-gray-800">{(event.recommendations.persona.budget as number).toLocaleString()}원</span>
                                                </p>
                                              </div>
                                            )}
                                          </div>
                                        ) : (
                                          <p className="text-gray-700 whitespace-pre-wrap bg-white p-2 rounded text-xs">
                                            {typeof event.recommendations.persona === 'string' ? event.recommendations.persona : '정보 없음'}
                                          </p>
                                        )}
                                      </div>

                                      {/* 사용자 선택 기준 */}
                                      {event.recommendations.fullReport.userContext && (
                                        <div>
                                          <p className="font-bold text-purple-900 mb-2 text-sm">
                                            🎯 사용자 선택 기준
                                          </p>
                                          <div className="bg-white p-3 rounded space-y-2">
                                            {event.recommendations.fullReport.userContext.priorityAttributes?.map((attr, i) => (
                                              <div key={i} className="border-l-4 border-purple-400 pl-3 py-1">
                                                <div className="flex items-center gap-2 mb-1">
                                                  <span className="font-semibold text-gray-900">{attr.name}</span>
                                                  <span className={`px-2 py-0.5 rounded-full text-xs ${
                                                    attr.level === '중요함' ? 'bg-blue-200 text-gray-900' :
                                                    attr.level === '보통' ? 'bg-blue-50 text-gray-900' :
                                                    'bg-gray-100 text-gray-700'
                                                  }`}>
                                                    {attr.level}
                                                  </span>
                                                </div>
                                                <p className="text-gray-600 text-xs">{attr.reason}</p>
                                              </div>
                                            ))}
                                            {event.recommendations.fullReport.userContext.additionalContext &&
                                             event.recommendations.fullReport.userContext.additionalContext.length > 0 && (
                                              <div className="mt-2 pt-2 border-t border-gray-200">
                                                <p className="font-medium text-gray-700 mb-1">추가 맥락:</p>
                                                <ul className="list-disc list-inside text-gray-600">
                                                  {event.recommendations.fullReport.userContext.additionalContext.map((ctx, i) => (
                                                    <li key={i}>{ctx}</li>
                                                  ))}
                                                </ul>
                                              </div>
                                            )}
                                            {event.recommendations.fullReport.userContext.budget && (
                                              <div className="mt-2 pt-2 border-t border-gray-200">
                                                <p className="font-medium text-gray-700">
                                                  💰 예산: {event.recommendations.fullReport.userContext.budget}
                                                </p>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      )}

                                      {/* 추천 제품 Top 3 */}
                                      {event.recommendations.fullReport.recommendations && (
                                        <div>
                                          <p className="font-bold text-purple-900 mb-2 text-sm">
                                            🏆 추천 제품 Top 3
                                          </p>
                                          <div className="space-y-3">
                                            {event.recommendations.fullReport.recommendations.map((rec, i) => (
                                              <div key={i} className="bg-white p-3 rounded border-l-4 border-purple-400">
                                                <div className="flex items-start justify-between mb-2">
                                                  <div>
                                                    <p className="font-bold text-gray-900">
                                                      #{rec.rank} {rec.productTitle}
                                                    </p>
                                                    <p className="text-gray-600 text-xs">
                                                      제품 ID: {rec.productId} | 가격: {rec.price.toLocaleString()}원
                                                    </p>
                                                  </div>
                                                  <span className="px-2 py-1 bg-purple-100 text-purple-900 text-xs font-bold rounded">
                                                    {rec.finalScore.toFixed(1)}점
                                                  </span>
                                                </div>

                                                <div className="space-y-2 mt-3">
                                                  <div>
                                                    <p className="font-semibold text-green-700 text-xs mb-1">✅ 장점</p>
                                                    <ul className="list-disc list-inside text-gray-700 text-xs space-y-0.5">
                                                      {rec.strengths.map((s, j) => (
                                                        <li key={j}>{s}</li>
                                                      ))}
                                                    </ul>
                                                  </div>

                                                  {rec.weaknesses.length > 0 && (
                                                    <div>
                                                      <p className="font-semibold text-orange-700 text-xs mb-1">⚠️ 단점</p>
                                                      <ul className="list-disc list-inside text-gray-700 text-xs space-y-0.5">
                                                        {rec.weaknesses.map((w, j) => (
                                                          <li key={j}>{w}</li>
                                                        ))}
                                                      </ul>
                                                    </div>
                                                  )}

                                                  {rec.comparison && (
                                                    <div>
                                                      <p className="font-semibold text-blue-700 text-xs mb-1">🔄 비교</p>
                                                      <p className="text-gray-700 text-xs">{rec.comparison}</p>
                                                    </div>
                                                  )}

                                                  {rec.additionalConsiderations && (
                                                    <div>
                                                      <p className="font-semibold text-gray-700 text-xs mb-1">💡 추가 고려사항</p>
                                                      <p className="text-gray-700 text-xs">{rec.additionalConsiderations}</p>
                                                    </div>
                                                  )}
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
