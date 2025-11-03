'use client';

import { useState} from 'react';
import type { SessionSummary } from '@/types/logging';

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
      }
    } catch (err) {
      setError('날짜 목록을 불러오는데 실패했습니다.');
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
    } catch (err) {
      setError('로그를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 날짜 선택 시
  const handleDateChange = (date: string) => {
    setSelectedDate(date);
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
      } else {
        setError('세션 삭제에 실패했습니다.');
      }
    } catch (err) {
      setError('세션 삭제 중 오류가 발생했습니다.');
    }
  };

  // 새로고침
  const handleRefresh = () => {
    if (selectedDate) {
      fetchLogs(selectedDate);
    }
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

    // 추천 받기 버튼
    if (label === '추천 받기') {
      return (
        <span className="inline-flex items-center gap-2">
          <span className="px-3 py-1 bg-gray-900 text-white text-xs font-medium rounded-full">
            추천 받기
          </span>
        </span>
      );
    }

    // 1분만에 추천받기 버튼
    if (label.includes('1분만에 추천받기')) {
      return (
        <span className="inline-flex items-center gap-2">
          <span className="px-4 py-2 bg-linear-to-r from-gray-900 to-gray-700 text-white text-xs font-semibold rounded-xl">
            💬 1분만에 추천받기
          </span>
        </span>
      );
    }

    // 대표상품 랭킹보기 버튼
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
            <h1 className="text-2xl font-bold">육아용품 MVP (v0.2.1) - 사용자 로그</h1>
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

          {/* 날짜 선택 및 새로고침 */}
          <div className="flex gap-4 items-center">
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
                  <div className="flex justify-between items-start">
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
                      <p className="font-mono text-sm text-gray-600 mb-1">
                        Session: {session.sessionId.slice(0, 8)}...
                      </p>
                      <p className="text-sm text-gray-500">
                        IP: {session.ip || 'unknown'} | 시작:{' '}
                        {formatTime(session.firstSeen)} | 종료:{' '}
                        {formatTime(session.lastSeen)}
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
                        <span
                          className={`inline-block px-3 py-1 rounded-full text-sm ${
                            session.completed
                              ? 'bg-green-100 text-green-700'
                              : 'bg-yellow-100 text-yellow-700'
                          }`}
                        >
                          {session.completed ? '완료' : '미완료'}
                        </span>
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
                              {!event.buttonLabel && !event.userInput && !event.aiResponse && !event.recommendations && event.eventType !== 'page_view' && (
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
                                        <p className="text-gray-700 whitespace-pre-wrap bg-white p-2 rounded">
                                          {event.recommendations.persona || '정보 없음'}
                                        </p>
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
